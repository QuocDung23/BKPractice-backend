import { sendApiError } from '@app/common';
import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';

import { PasswordResetFailure } from '@/modules/auth/domain';

/**
 * Giữ nguyên tắc không tiết lộ của ID-007: không nói email có tồn tại hay không, OTP sai hay hết hạn.
 * Chỉ lỗi độ dài mật khẩu mới là thông tin an toàn để nêu rõ.
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
      'Yêu cầu đặt lại mật khẩu không hợp lệ: mã OTP sai hoặc đã hết hạn, hoặc phiên đặt lại đã hết hạn. Hãy yêu cầu mã mới rồi thử lại.',
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
