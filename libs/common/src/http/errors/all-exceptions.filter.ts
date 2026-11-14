import type { ApiErrorDetail } from '@app/contracts';
import { COMMON_ERROR_CODES } from '@app/contracts';
import { Catch, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';

import { AppHttpException, resolveRequestId, sendApiError } from './api-error';

const STATUS_CODES: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: COMMON_ERROR_CODES.badRequest,
  [HttpStatus.UNAUTHORIZED]: COMMON_ERROR_CODES.unauthorized,
  [HttpStatus.FORBIDDEN]: COMMON_ERROR_CODES.forbidden,
  [HttpStatus.NOT_FOUND]: COMMON_ERROR_CODES.notFound,
  [HttpStatus.METHOD_NOT_ALLOWED]: COMMON_ERROR_CODES.methodNotAllowed,
  [HttpStatus.CONFLICT]: COMMON_ERROR_CODES.conflictDuplicate,
  [HttpStatus.PAYLOAD_TOO_LARGE]: COMMON_ERROR_CODES.payloadTooLarge,
  [HttpStatus.UNPROCESSABLE_ENTITY]: COMMON_ERROR_CODES.unprocessableEntity,
  [HttpStatus.TOO_MANY_REQUESTS]: COMMON_ERROR_CODES.tooManyRequests,
  [HttpStatus.BAD_GATEWAY]: COMMON_ERROR_CODES.upstreamUnavailable,
  [HttpStatus.SERVICE_UNAVAILABLE]: COMMON_ERROR_CODES.serviceUnavailable,
};

/** Thông báo dự phòng theo status khi exception không mang thông báo chuỗi dùng được. */
const STATUS_MESSAGES: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'Yêu cầu gửi lên không hợp lệ.',
  [HttpStatus.UNAUTHORIZED]: 'Bạn chưa đăng nhập hoặc phiên đăng nhập đã hết hạn.',
  [HttpStatus.FORBIDDEN]: 'Bạn không có quyền thực hiện thao tác này.',
  [HttpStatus.NOT_FOUND]: 'Không tìm thấy tài nguyên được yêu cầu.',
  [HttpStatus.METHOD_NOT_ALLOWED]: 'Phương thức HTTP này không được hỗ trợ cho đường dẫn đã gọi.',
  [HttpStatus.CONFLICT]: 'Yêu cầu xung đột với dữ liệu hiện có.',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'Dữ liệu gửi lên vượt quá kích thước cho phép.',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'Dữ liệu gửi lên không thể xử lý.',
  [HttpStatus.TOO_MANY_REQUESTS]: 'Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.',
  [HttpStatus.BAD_GATEWAY]: 'Không kết nối được tới dịch vụ phía sau. Vui lòng thử lại sau.',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'Dịch vụ tạm thời không khả dụng. Vui lòng thử lại sau.',
};

/** Mã lỗi hệ điều hành/driver cho biết thành phần phụ thuộc (DB, Redis, AMQP) không kết nối được. */
const DEPENDENCY_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EPIPE',
  '57P01', // Postgres: admin_shutdown
  '57P03', // Postgres: cannot_connect_now
  '08000',
  '08003',
  '08006',
]);

interface Normalized {
  status: number;
  code: string;
  message: string;
  details?: ApiErrorDetail[];
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function driverCodeOf(exception: unknown): string | undefined {
  const error = asRecord(exception);
  const driver = asRecord(error?.driverError);
  const code = driver?.code ?? error?.code;
  return typeof code === 'string' ? code : undefined;
}

function normalizeHttpException(exception: HttpException): Normalized {
  const status = exception.getStatus();
  const body = asRecord(exception.getResponse());
  const rawMessage = body?.message;
  const fallbackCode = STATUS_CODES[status] ?? COMMON_ERROR_CODES.httpError;
  const fallbackMessage = STATUS_MESSAGES[status] ?? 'Yêu cầu không thể hoàn tất.';

  if (Array.isArray(rawMessage)) {
    // Pipe tự dựng bằng ValidationPipe mặc định: đưa từng dòng vào `details`.
    return {
      status,
      code: COMMON_ERROR_CODES.validationFailed,
      message: 'Dữ liệu gửi lên chưa hợp lệ.',
      details: rawMessage.map((item) => ({ code: 'INVALID', message: String(item) })),
    };
  }

  const text = typeof rawMessage === 'string' && rawMessage.trim() ? rawMessage : fallbackMessage;
  const routeNotFound = status === 404 && /^Cannot [A-Z]+ /.test(text);
  return {
    status,
    code: fallbackCode,
    message: routeNotFound ? `Không tìm thấy đường dẫn: ${text.replace('Cannot ', '')}.` : text,
  };
}

export function normalizeException(exception: unknown): Normalized {
  if (exception instanceof AppHttpException) {
    return {
      status: exception.getStatus(),
      code: exception.code,
      message: exception.message,
      details: exception.details,
    };
  }
  if (exception instanceof HttpException) return normalizeHttpException(exception);

  const error = asRecord(exception);
  // Lỗi của body-parser (http-errors) không phải HttpException của Nest.
  if (error?.type === 'entity.parse.failed') {
    return {
      status: HttpStatus.BAD_REQUEST,
      code: COMMON_ERROR_CODES.invalidJson,
      message: 'Nội dung JSON gửi lên không hợp lệ. Hãy kiểm tra dấu ngoặc, dấu phẩy và dấu nháy.',
    };
  }
  if (error?.type === 'entity.too.large') {
    return {
      status: HttpStatus.PAYLOAD_TOO_LARGE,
      code: COMMON_ERROR_CODES.payloadTooLarge,
      message: STATUS_MESSAGES[HttpStatus.PAYLOAD_TOO_LARGE] ?? '',
    };
  }

  const driverCode = driverCodeOf(exception);
  if (error?.name === 'QueryFailedError' && driverCode === '23505') {
    return {
      status: HttpStatus.CONFLICT,
      code: COMMON_ERROR_CODES.conflictDuplicate,
      message: 'Dữ liệu bị trùng với một bản ghi đã có.',
    };
  }
  if (driverCode && DEPENDENCY_ERROR_CODES.has(driverCode)) {
    return {
      status: HttpStatus.SERVICE_UNAVAILABLE,
      code: COMMON_ERROR_CODES.dependencyUnavailable,
      message:
        'Hệ thống không kết nối được tới cơ sở dữ liệu hoặc dịch vụ phụ trợ. Vui lòng thử lại sau.',
    };
  }
  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    code: COMMON_ERROR_CODES.internalError,
    message: '',
  };
}

/**
 * Lưới an toàn toàn cục (spec ERR-001 FR-001, FR-005). Bộ lọc `@UseFilters` của từng module vẫn chạy trước;
 * bộ lọc này xử lý mọi lỗi còn lại và không bao giờ đưa chi tiết nội bộ vào body.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') return;
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const normalized = normalizeException(exception);
    const requestId = resolveRequestId(request);
    request.headers['x-request-id'] = requestId;

    const isServerError = normalized.status >= 500;
    const message =
      normalized.code === COMMON_ERROR_CODES.internalError
        ? `Hệ thống gặp lỗi không mong muốn. Vui lòng báo mã tham chiếu ${requestId} cho quản trị viên.`
        : normalized.message;

    const summary = {
      requestId,
      status: normalized.status,
      code: normalized.code,
      method: request.method,
    };
    if (isServerError) {
      this.logger.error(summary, exception instanceof Error ? exception.stack : String(exception));
    } else {
      this.logger.warn(summary);
    }

    sendApiError({ request, response }, { ...normalized, message });
  }
}
