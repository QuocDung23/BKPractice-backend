import { timingSafeEqual } from 'node:crypto';

import { AppHttpException } from '@app/common';
import { HttpStatus, Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isUUID } from 'class-validator';
import type { Request } from 'express';

import type { Principal } from '@/common/auth/principal';

export type TrustedRequest = Request & { communityPrincipal?: Principal };

@Injectable()
export class TrustedUserGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<TrustedRequest>();
    delete request.communityPrincipal;
    const credential = request.headers['x-internal-community-secret'];
    const expected = Buffer.from(this.config.getOrThrow<string>('COMMUNITY_GATEWAY_SECRET'));
    const actual = typeof credential === 'string' ? Buffer.from(credential) : Buffer.alloc(0);
    const userId = request.headers['x-auth-user-id'];
    const permissions = request.headers['x-auth-permissions'];
    if (
      expected.length < 32 ||
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected) ||
      typeof userId !== 'string' ||
      !isUUID(userId) ||
      (permissions !== undefined && typeof permissions !== 'string')
    ) {
      throw new AppHttpException(
        HttpStatus.UNAUTHORIZED,
        'COMMUNITY_AUTH_REQUIRED',
        'Yeu cau xac thuc qua API Gateway.',
      );
    }
    request.communityPrincipal = {
      userId,
      permissions: new Set(
        (permissions ?? '')
          .split(',')
          .map((permission) => permission.trim())
          .filter(Boolean),
      ),
    };
    return true;
  }
}
