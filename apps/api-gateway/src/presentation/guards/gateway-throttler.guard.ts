import { createTooManyRequestsError } from '@gateway/application/errors/gateway-errors';
import { Injectable } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { ThrottlerLimitDetail } from '@nestjs/throttler';

/** Dùng chung cơ chế giới hạn của ThrottlerGuard, chỉ đổi lỗi 429 thành lỗi chuẩn nói rõ phải đợi bao lâu. */
@Injectable()
export class GatewayThrottlerGuard extends ThrottlerGuard {
  protected override throwThrottlingException(
    _context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    // Khóa có dạng `${tên bộ giới hạn}:${method}:${path}:${tracker}` (xem createGatewayThrottlers).
    const throttlerName = detail.key.split(':')[0] ?? 'default';
    const retryAfter =
      detail.timeToBlockExpire > 0 ? detail.timeToBlockExpire : detail.timeToExpire;
    return Promise.reject(createTooManyRequestsError(throttlerName, retryAfter));
  }
}
