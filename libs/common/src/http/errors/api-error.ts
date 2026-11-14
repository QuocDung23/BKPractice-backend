import { randomUUID } from 'node:crypto';

import type { ApiErrorBody, ApiErrorDetail } from '@app/contracts';
import { HttpException } from '@nestjs/common';
import type { Request, Response } from 'express';

const SAFE_REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/;

/** Lỗi HTTP có `code` ổn định và message tiếng Việt (spec ERR-001 FR-002, FR-003). */
export class AppHttpException extends HttpException {
  constructor(
    status: number,
    readonly code: string,
    message: string,
    readonly details?: ApiErrorDetail[],
  ) {
    super({ code, message, ...(details ? { details } : {}) }, status);
  }
}

/** Lấy `x-request-id` do Gateway cấp; sinh mới nếu thiếu hoặc không an toàn để phản chiếu lại. */
export function resolveRequestId(request: Pick<Request, 'headers'> | undefined): string {
  const raw = request?.headers?.['x-request-id'];
  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim();
  return value && SAFE_REQUEST_ID.test(value) ? value : randomUUID();
}

export interface BuildApiErrorInput {
  status: number;
  code: string;
  message: string;
  details?: ApiErrorDetail[];
  requestId: string;
}

export function buildApiError(input: BuildApiErrorInput): ApiErrorBody {
  return {
    statusCode: input.status,
    code: input.code,
    message: input.message,
    ...(input.details?.length ? { details: input.details } : {}),
    requestId: input.requestId,
  };
}

/**
 * Ghi body lỗi chuẩn ra response. Bộ lọc riêng của từng module gọi hàm này để dùng chung một định dạng.
 * Trả về body để module có thể ghi log cùng `requestId`.
 */
export function sendApiError(
  http: { request: Request; response: Response },
  input: Omit<BuildApiErrorInput, 'requestId'>,
): ApiErrorBody {
  const requestId = resolveRequestId(http.request);
  const body = buildApiError({ ...input, requestId });
  http.response.setHeader('x-request-id', requestId);
  http.response.status(input.status).json(body);
  return body;
}
