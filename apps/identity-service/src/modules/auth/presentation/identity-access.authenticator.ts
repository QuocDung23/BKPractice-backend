import { isAllowedBrowserOrigin, readCookie, verifyCsrfToken } from '@app/common';
import { BK_ACCESS_COOKIE_NAME, BK_CSRF_COOKIE_NAME } from '@app/contracts';
import type { BkAccessClaims } from '@app/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

import {
  BK_TOKEN_SERVICE,
  REFRESH_SESSION_REPOSITORY,
  type BkTokenService,
  type RefreshSessionRepository,
} from '@/modules/auth/application';
import { AuthFailure } from '@/modules/auth/domain';
import { AUTH_HTTP_ERRORS } from '@/modules/auth/presentation/auth-http-errors';
import { isRoleName, type RoleName } from '@/modules/rbac/domain';

const unsafeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
type IdentityAccessClaims = Omit<BkAccessClaims, 'roles'> & { roles: RoleName[] };

@Injectable()
export class IdentityAccessAuthenticator {
  constructor(
    @Inject(BK_TOKEN_SERVICE) private readonly tokens: BkTokenService,
    @Inject(REFRESH_SESSION_REPOSITORY) private readonly sessions: RefreshSessionRepository,
    private readonly config: ConfigService,
  ) {}

  async verify(request: Request): Promise<IdentityAccessClaims> {
    const authorization = request.header('authorization');
    if (authorization !== undefined && !/^Bearer [^\s]+$/.test(authorization))
      throw new AuthFailure('invalid_token');
    const fromCookie = authorization === undefined;
    const token = fromCookie
      ? readCookie(request.header('cookie'), BK_ACCESS_COOKIE_NAME)
      : authorization.slice(7);
    if (!token) throw new AuthFailure('invalid_token');
    const claims = await this.tokens.verifyAccessClaims(token);
    const roles = claims.roles.filter(isRoleName);
    if (
      roles.length !== claims.roles.length ||
      !(await this.sessions.isActive(claims.sub, claims.sid))
    )
      throw new AuthFailure('invalid_token');
    if (fromCookie && unsafeMethods.has(request.method)) {
      if (
        !isAllowedBrowserOrigin(
          request.header('origin'),
          request.header('referer'),
          this.config.getOrThrow<string>('CORS_ORIGINS'),
        )
      )
        throw AUTH_HTTP_ERRORS.originNotAllowed();
      if (
        !verifyCsrfToken(
          claims.sid,
          readCookie(request.header('cookie'), BK_CSRF_COOKIE_NAME),
          request.header('x-csrf-token'),
          this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        )
      )
        throw AUTH_HTTP_ERRORS.csrfInvalid();
    }
    return { ...claims, roles };
  }
}
