import { AppHttpException } from '@app/common';
import { LEARNING_AUTH_ERROR_CODES } from '@learning/presentation/http/learning-error';
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

@Injectable()
export class InternalServiceGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (
      request.header('x-internal-service-secret') !==
      this.config.getOrThrow('INTERNAL_SERVICE_SECRET')
    ) {
      throw new AppHttpException(
        401,
        LEARNING_AUTH_ERROR_CODES.internalCredentialInvalid,
        'Thiếu hoặc sai khóa xác thực nội bộ giữa các dịch vụ. Endpoint này chỉ dành cho dịch vụ nội bộ, không gọi từ trình duyệt.',
      );
    }
    return true;
  }
}
