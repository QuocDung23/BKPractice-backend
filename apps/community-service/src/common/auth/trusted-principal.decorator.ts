import { AppHttpException } from '@app/common';
import { createParamDecorator, HttpStatus } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';

import type { Principal } from '@/common/auth/principal';
import type { TrustedRequest } from '@/common/auth/trusted-user.guard';

export const TrustedPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Principal => {
    const principal = context.switchToHttp().getRequest<TrustedRequest>().communityPrincipal;
    if (!principal) {
      throw new AppHttpException(
        HttpStatus.UNAUTHORIZED,
        'COMMUNITY_AUTH_REQUIRED',
        'Yeu cau xac thuc qua API Gateway.',
      );
    }
    return principal;
  },
);
