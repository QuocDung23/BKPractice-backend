import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ThrottlerLimitDetail, ThrottlerStorage } from '@nestjs/throttler';

import { GatewayThrottlerGuard } from './gateway-throttler.guard';

function detail(
  key: string,
  timeToExpire: number,
  timeToBlockExpire: number,
): ThrottlerLimitDetail {
  return {
    key,
    tracker: 'ip',
    ttl: 60,
    limit: 5,
    totalHits: 6,
    timeToExpire,
    isBlocked: true,
    timeToBlockExpire,
  };
}

describe('GatewayThrottlerGuard', () => {
  const guard = new GatewayThrottlerGuard(
    { throttlers: [] },
    {} as ThrottlerStorage,
    new Reflector(),
  );
  const reject = (info: ThrottlerLimitDetail): Promise<void> =>
    (
      guard as unknown as {
        throwThrottlingException(
          context: ExecutionContext,
          info: ThrottlerLimitDetail,
        ): Promise<void>;
      }
    ).throwThrottlingException({} as ExecutionContext, info);

  it('answers 429 with a code and the real wait time for failed logins', async () => {
    await expect(reject(detail('password:POST:/api/auth/login:ip', 40, 25))).rejects.toMatchObject({
      status: 429,
      code: 'TOO_MANY_REQUESTS',
      message: 'Bạn đã thử đăng nhập quá nhiều lần. Hãy đợi khoảng 25 giây rồi thử lại.',
    });
  });

  it('falls back to the window time when there is no block time', async () => {
    await expect(reject(detail('default:GET:/api/problems:ip', 12, 0))).rejects.toMatchObject({
      status: 429,
      message: 'Bạn gửi yêu cầu quá nhanh. Hãy đợi khoảng 12 giây rồi thử lại.',
    });
  });
});
