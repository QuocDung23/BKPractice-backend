import { isAllowedBrowserOrigin, readCookie, verifyCsrfToken } from '@app/common';
import {
  AUTH_COOKIE_NAMES,
  AUTH_COOKIE_REQUEST_ROUTES,
  AUTH_ORIGIN_CHECKED_ROUTES,
  AUTH_PUBLIC_ROUTES,
  PUBLIC_PROFILE_ROUTE,
  UNSAFE_METHODS,
} from '@gateway/application/auth/auth-constants';
import { GatewaySessionService } from '@gateway/application/auth/gateway-session.service';
import {
  createBearerMalformedError,
  createCsrfTokenInvalidError,
  createOriginNotAllowedError,
  createTokenInvalidOrExpiredError,
  createTokenMissingError,
} from '@gateway/application/errors/gateway-errors';
import { HttpException, Injectable } from '@nestjs/common';
import type { NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { NextFunction, Request, Response } from 'express';

interface AccessTokenPayload {
  sub: string;
  sid: string;
  jti: string;
  roles: string[];
  permissions?: string[];
  type: 'access';
  exp: number;
}

@Injectable()
export class GatewayAuthMiddleware implements NestMiddleware {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly sessions: GatewaySessionService,
  ) {}

  async use(request: Request, _response: Response, next: NextFunction): Promise<void> {
    const accessCookie = this.readTokenCookie(request, AUTH_COOKIE_NAMES.access);
    const refreshCookie = this.readTokenCookie(request, AUTH_COOKIE_NAMES.refresh);
    const csrfCookie = this.readTokenCookie(request, AUTH_COOKIE_NAMES.csrf);
    delete request.headers.cookie;
    for (const header of Object.keys(request.headers)) {
      if (header.startsWith('x-auth-')) delete request.headers[header];
    }
    delete request.headers['x-client-ip'];
    if (request.ip) request.headers['x-client-ip'] = request.ip;

    if (!request.path.startsWith('/api/')) {
      next();
      return;
    }

    const route = `${request.method} ${request.path}`;
    if (AUTH_COOKIE_REQUEST_ROUTES.has(route)) {
      request.headers.cookie = [
        refreshCookie && `${AUTH_COOKIE_NAMES.refresh}=${refreshCookie}`,
        csrfCookie && `${AUTH_COOKIE_NAMES.csrf}=${csrfCookie}`,
        accessCookie && `${AUTH_COOKIE_NAMES.access}=${accessCookie}`,
      ]
        .filter(Boolean)
        .join('; ');
    }

    if (AUTH_ORIGIN_CHECKED_ROUTES.has(route)) {
      if (request.header('x-client-type') !== 'mobile') this.requireAllowedOrigin(request);
      next();
      return;
    }

    if (AUTH_PUBLIC_ROUTES.has(route)) {
      next();
      return;
    }

    const authorization = request.header('authorization');
    const publicProfile = request.method === 'GET' && PUBLIC_PROFILE_ROUTE.test(request.path);
    if (authorization === undefined && !accessCookie && publicProfile) {
      next();
      return;
    }
    const fromCookie = authorization === undefined;
    if (authorization !== undefined && !/^Bearer [^\s]+$/.test(authorization))
      throw createBearerMalformedError();
    const token = fromCookie ? accessCookie : authorization?.slice(7);
    if (!token) throw createTokenMissingError();

    try {
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
      if (
        payload.type !== 'access' ||
        typeof payload.sub !== 'string' ||
        !payload.sub ||
        typeof payload.sid !== 'string' ||
        !payload.sid ||
        typeof payload.jti !== 'string' ||
        !payload.jti ||
        typeof payload.exp !== 'number' ||
        !Array.isArray(payload.roles) ||
        !payload.roles.every((role) => typeof role === 'string')
      ) {
        throw new Error('Invalid access token');
      }
      if (!(await this.sessions.isActive(token))) throw new Error('Revoked session');
      if (fromCookie && UNSAFE_METHODS.has(request.method)) {
        this.requireAllowedOrigin(request);
        if (
          !verifyCsrfToken(
            payload.sid,
            csrfCookie,
            request.header('x-csrf-token'),
            this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
          )
        )
          throw createCsrfTokenInvalidError();
      }
      request.headers.authorization = `Bearer ${token}`;
      request.headers['x-auth-user-id'] = payload.sub;
      request.headers['x-auth-roles'] = payload.roles.join(',');
      request.headers['x-auth-permissions'] =
        Array.isArray(payload.permissions) &&
        payload.permissions.every((permission) => typeof permission === 'string')
          ? payload.permissions.join(',')
          : '';
      next();
    } catch (error) {
      // 403 (origin/CSRF) và 503 (không kiểm tra được phiên) phải giữ nguyên, không đổi thành 401.
      if (error instanceof HttpException && [403, 503].includes(error.getStatus())) throw error;
      if (publicProfile && fromCookie) {
        next();
        return;
      }
      throw createTokenInvalidOrExpiredError();
    }
  }

  private requireAllowedOrigin(request: Request): void {
    if (
      !isAllowedBrowserOrigin(
        request.header('origin'),
        request.header('referer'),
        this.config.getOrThrow<string>('CORS_ORIGINS'),
      )
    ) {
      throw createOriginNotAllowedError();
    }
  }

  private readTokenCookie(request: Request, name: string): string | null {
    const value = readCookie(request.header('cookie'), name);
    return value && /^[A-Za-z0-9._-]+$/.test(value) ? value : null;
  }
}
