import { BadRequestException, createParamDecorator, ParseUUIDPipe } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export const IdempotencyKey = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string | undefined =>
    context.switchToHttp().getRequest<Request>().get('Idempotency-Key'),
);

/** Pipe kiểm Idempotency-Key là UUID, trả lỗi 400 dễ hiểu thay vì "Validation failed (uuid is expected)". */
export const idempotencyKeyPipe = (): ParseUUIDPipe =>
  new ParseUUIDPipe({
    exceptionFactory: () =>
      new BadRequestException('Header Idempotency-Key là bắt buộc và phải là một UUID hợp lệ.'),
  });
