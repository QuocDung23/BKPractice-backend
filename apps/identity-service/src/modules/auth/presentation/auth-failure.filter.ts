import { sendApiError } from '@app/common';
import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';

import { AuthFailure } from '@/modules/auth/domain';
import type { AuthFailureCode } from '@/modules/auth/domain';

interface AuthErrorResponse {
  status: HttpStatus;
  code: string;
  message: string;
}

/**
 * Chỉ đăng nhập bằng mật khẩu mới có mã chi tiết (ERR-001 FR-007). Microsoft, refresh và exchange dùng
 * `invalid_credentials` / `invalid_token` nên message cố ý không cho biết tài khoản có tồn tại hay không.
 */
export const AUTH_ERROR_RESPONSES: Record<AuthFailureCode, AuthErrorResponse> = {
  account_not_found: {
    status: HttpStatus.UNAUTHORIZED,
    code: 'AUTH_ACCOUNT_NOT_FOUND',
    message:
      'Không tìm thấy tài khoản với MSSV hoặc email này. Hãy kiểm tra lại thông tin đã nhập.',
  },
  wrong_password: {
    status: HttpStatus.UNAUTHORIZED,
    code: 'AUTH_WRONG_PASSWORD',
    message: 'Mật khẩu không đúng. Hãy kiểm tra lại hoặc chọn "Quên mật khẩu" để đặt lại.',
  },
  identifier_ambiguous: {
    status: HttpStatus.CONFLICT,
    code: 'AUTH_IDENTIFIER_AMBIGUOUS',
    message:
      'MSSV hoặc email này khớp với nhiều hơn một tài khoản. Hãy liên hệ quản trị viên để được hỗ trợ.',
  },
  account_deleted: {
    status: HttpStatus.FORBIDDEN,
    code: 'AUTH_ACCOUNT_DELETED',
    message: 'Tài khoản này đã bị xóa. Hãy liên hệ quản trị viên để được khôi phục.',
  },
  account_locked: {
    status: HttpStatus.FORBIDDEN,
    code: 'AUTH_ACCOUNT_LOCKED',
    message: 'Tài khoản đang bị khóa. Hãy liên hệ quản trị viên để được mở khóa.',
  },
  account_pending: {
    status: HttpStatus.FORBIDDEN,
    code: 'AUTH_ACCOUNT_PENDING',
    message: 'Tài khoản chưa được kích hoạt. Hãy liên hệ quản trị viên để được kích hoạt.',
  },
  invalid_credentials: {
    status: HttpStatus.UNAUTHORIZED,
    code: 'AUTH_CREDENTIALS_INVALID',
    message:
      'Đăng nhập không thành công. Hãy thử lại hoặc liên hệ quản trị viên nếu lỗi vẫn tiếp diễn.',
  },
  invalid_token: {
    status: HttpStatus.UNAUTHORIZED,
    code: 'AUTH_SESSION_INVALID',
    message: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Hãy đăng nhập lại.',
  },
  dependency_unavailable: {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    code: 'AUTH_SERVICE_UNAVAILABLE',
    message: 'Dịch vụ xác thực tạm thời không khả dụng. Vui lòng thử lại sau ít phút.',
  },
};

@Catch(AuthFailure)
export class AuthFailureFilter implements ExceptionFilter {
  private readonly logger = new Logger(AuthFailureFilter.name);

  catch(error: AuthFailure, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const { status, code, message } = AUTH_ERROR_RESPONSES[error.code];
    const body = sendApiError(
      { request, response: http.getResponse<Response>() },
      { status, code, message },
    );
    // Log không chứa MSSV/email/mật khẩu đã nhập (ERR-001 Quy tắc nghiệp vụ).
    this.logger.warn({ requestId: body.requestId, status, code, method: request.method });
  }
}
