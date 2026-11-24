import { sendApiError } from '@app/common';
import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';

import { PasswordResetFailure } from '@/modules/auth/domain';

/**
 * Giữ nguyên tắc không tiết lộ của ID-007: không nói email có tồn tại hay không, OTP sai hay hết hạn.
 * Trình bày riêng bước xác minh OTP và bước dùng phiên đặt lại mật khẩu.
 */
export function describePasswordResetFailure(error: PasswordResetFailure): {
  status: number;
  code: string;
  message: string;
} {
  if (error.code === 'dependency_unavailable')
    return {
      status: 503,
      code: 'PASSWORD_RESET_UNAVAILABLE',
      message: 'Dịch vụ đặt lại mật khẩu tạm thời không khả dụng. Vui lòng thử lại sau ít phút.',
    };
  if (error.reason === 'password_length')
    return {
      status: 400,
      code: 'PASSWORD_RESET_PASSWORD_INVALID',
      message: 'Mật khẩu mới phải có từ 8 đến 128 ký tự.',
    };
  return {
    status: 400,
    code: 'PASSWORD_RESET_REQUEST_INVALID',
    message:
      error.reason === 'reset_session_invalid'
        ? 'Phiên đặt lại mật khẩu không hợp lệ hoặc đã hết hạn. Hãy yêu cầu mã xác minh mới.'
        : 'Mã xác minh không đúng hoặc đã hết hạn. Hãy kiểm tra lại mã hoặc yêu cầu gửi mã mới.',
  };
}

@Catch(PasswordResetFailure)
export class PasswordResetFailureFilter implements ExceptionFilter {
  private readonly logger = new Logger(PasswordResetFailureFilter.name);

  catch(error: PasswordResetFailure, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const described = describePasswordResetFailure(error);
    const body = sendApiError({ request, response: http.getResponse<Response>() }, described);
    this.logger.warn({
      requestId: body.requestId,
      status: described.status,
      code: described.code,
      method: request.method,
    });
  }
}
