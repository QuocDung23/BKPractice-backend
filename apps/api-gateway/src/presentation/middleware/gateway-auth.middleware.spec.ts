import { issueCsrfToken } from '@app/common';
import type { GatewaySessionService } from '@gateway/application/auth/gateway-session.service';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request, Response } from 'express';

import { GatewayAuthMiddleware } from './gateway-auth.middleware';

describe('GatewayAuthMiddleware', () => {
  const jwt = new JwtService();
  const config = new ConfigService({
    JWT_ACCESS_SECRET: 'a'.repeat(32),
    CORS_ORIGINS: 'http://localhost:3006,https://app.example',
  });
  const sessions = {
    isActive: jest.fn().mockResolvedValue(true),
  } as unknown as GatewaySessionService;
  const middleware = new GatewayAuthMiddleware(jwt, config, sessions);
  const response = {} as Response;
  const next = jest.fn();

  function createRequest(
    method: string,
    path: string,
    authorization?: string,
    cookie?: string,
  ): Request {
    const headers: Record<string, string> = {
      'x-auth-user-id': 'forged',
      'x-auth-roles': 'ADMIN',
      'x-auth-permissions': 'problem:delete',
    };
    if (authorization) headers.authorization = authorization;
    if (cookie) headers.cookie = cookie;
    if (
      method === 'POST' &&
      [
        '/api/auth/login',
        '/api/auth/microsoft/exchange',
        '/api/auth/refresh',
        '/api/auth/logout',
        '/api/auth/password/send-otp',
        '/api/auth/password/verify-otp',
        '/api/auth/password/reset',
      ].includes(path)
    )
      headers.origin = 'http://localhost:3006';
    return { method, path, headers, header: (key: string) => headers[key] } as unknown as Request;
  }

  beforeEach(() => next.mockClear());

  it.each([
    ['POST', '/api/run'],
    ['POST', '/api/submissions'],
    ['GET', '/api/submissions'],
    ['GET', '/api/submissions/id'],
  ])('protects Submission %s %s and replaces spoofed identity', async (method, path) => {
    for (const token of [undefined, 'Bearer invalid']) {
      next.mockClear();
      await expect(
        middleware.use(createRequest(method, path, token), response, next),
      ).rejects.toThrow();
      expect(next).not.toHaveBeenCalled();
    }
    const token = await jwt.signAsync(
      { sub: 'owner', sid: 'session', jti: 'access', roles: ['LECTURER'], type: 'access' },
      { secret: 'a'.repeat(32), expiresIn: '15m' },
    );
    const request = createRequest(method, path, `Bearer ${token}`);
    await middleware.use(request, response, next);
    expect(request.headers['x-auth-user-id']).toBe('owner');
    expect(request.headers['x-auth-roles']).toBe('LECTURER');
    expect(request.headers['x-auth-permissions']).toBe('');
  });

  it.each(['GET', 'POST', 'DELETE'])(
    'protects %s role management and strips forged metadata',
    async (method) => {
      const path = `/api/roles/users/user-1${method === 'DELETE' ? '/LECTURER' : ''}`;
      const request = createRequest(method, path);
      await expect(middleware.use(request, response, next)).rejects.toMatchObject({
        status: 401,
        code: 'AUTH_TOKEN_MISSING',
      });
      expect(request.headers['x-auth-user-id']).toBeUndefined();
      expect(request.headers['x-auth-roles']).toBeUndefined();
      expect(request.headers['x-auth-permissions']).toBeUndefined();
      expect(next).not.toHaveBeenCalled();
    },
  );

  it('opens exactly the supported public authentication routes and strips forged headers', async () => {
    const publicRoutes: Array<[string, string]> = [
      ['POST', '/api/auth/login'],
      ['GET', '/api/auth/microsoft'],
      ['GET', '/api/auth/microsoft/callback'],
      ['POST', '/api/auth/microsoft/exchange'],
      ['POST', '/api/auth/refresh'],
      ['POST', '/api/auth/logout'],
      ['GET', '/api/auth/csrf'],
      ['POST', '/api/auth/password/send-otp'],
      ['POST', '/api/auth/password/verify-otp'],
      ['POST', '/api/auth/password/reset'],
    ];
    for (const [method, path] of publicRoutes) {
      const request = createRequest(method, path);
      await middleware.use(request, response, next);
      expect(request.headers['x-auth-user-id']).toBeUndefined();
      expect(request.headers['x-auth-roles']).toBeUndefined();
      expect(request.headers['x-auth-permissions']).toBeUndefined();
    }
    expect(next).toHaveBeenCalledTimes(10);
    await expect(
      middleware.use(createRequest('POST', '/api/auth/register'), response, next),
    ).rejects.toThrow();
    await expect(
      middleware.use(createRequest('GET', '/api/auth/me'), response, next),
    ).rejects.toThrow();
  });

  it('uses only verified access claims and treats old tokens as having no permissions', async () => {
    const access = await jwt.signAsync(
      {
        sub: 'user-1',
        sid: 'session-1',
        jti: 'access-1',
        roles: ['STUDENT'],
        permissions: ['problem:read-managed'],
        type: 'access',
      },
      { secret: 'a'.repeat(32), expiresIn: '15m' },
    );
    const request = createRequest('GET', '/api/auth/me', `Bearer ${access}`);
    await middleware.use(request, response, next);
    expect(request.headers['x-auth-user-id']).toBe('user-1');
    expect(request.headers['x-auth-roles']).toBe('STUDENT');
    expect(request.headers['x-auth-permissions']).toBe('problem:read-managed');
    const oldAccess = await jwt.signAsync(
      { sub: 'user-1', sid: 'session-1', jti: 'access-1', roles: ['STUDENT'], type: 'access' },
      { secret: 'a'.repeat(32), expiresIn: '15m' },
    );
    const oldRequest = createRequest('GET', '/api/auth/me', `Bearer ${oldAccess}`);
    await middleware.use(oldRequest, response, next);
    expect(oldRequest.headers['x-auth-permissions']).toBe('');
    const refresh = await jwt.signAsync(
      { sub: 'user-1', jti: 'token-1', fid: 'family-1', type: 'refresh' },
      { secret: 'a'.repeat(32), expiresIn: '7d' },
    );
    await expect(
      middleware.use(createRequest('GET', '/api/auth/me', `Bearer ${refresh}`), response, next),
    ).rejects.toThrow();
  });

  it('opens only GET public profile and keeps profile mutations protected', async () => {
    const path = '/api/users/00000000-0000-0000-0000-000000000001/profile';
    const publicRequest = createRequest('GET', path);
    await middleware.use(publicRequest, response, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(publicRequest.headers['x-auth-user-id']).toBeUndefined();
    for (const [method, privatePath] of [
      ['PATCH', path],
      ['GET', '/api/profile/me'],
      ['GET', '/api/admin/users'],
      ['DELETE', '/api/admin/users/00000000-0000-0000-0000-000000000001'],
      ['GET', '/api/profiles/search'],
      ['POST', '/api/profile/me/avatar/upload-url'],
      ['GET', '/api/users/00000000-0000-0000-0000-000000000001'],
    ] as Array<[string, string]>) {
      await expect(
        middleware.use(createRequest(method, privatePath), response, next),
      ).rejects.toThrow();
    }
  });

  it('authenticates access cookies, strips raw cookies, and requires a trusted origin for writes', async () => {
    const token = await jwt.signAsync(
      { sub: 'user-1', sid: 'session-1', jti: 'access-1', roles: ['STUDENT'], type: 'access' },
      { secret: 'a'.repeat(32), expiresIn: '15m' },
    );
    const csrf = issueCsrfToken('session-1', 'a'.repeat(32));
    const cookie = `__Host-bk_access=${token}; __Host-bk_csrf=${csrf}; other=private`;
    const read = createRequest('GET', '/api/auth/me', undefined, cookie);
    await middleware.use(read, response, next);
    expect(read.headers.cookie).toBeUndefined();
    expect(read.headers.authorization).toBe(`Bearer ${token}`);
    expect(read.headers['x-auth-user-id']).toBe('user-1');

    const search = createRequest('GET', '/api/profiles/search', undefined, cookie);
    await middleware.use(search, response, next);
    expect(search.headers.authorization).toBe(`Bearer ${token}`);
    expect(search.headers.cookie).toBeUndefined();

    const write = createRequest('PATCH', '/api/profile/me', undefined, cookie);
    await expect(middleware.use(write, response, next)).rejects.toMatchObject({
      status: 403,
      code: 'ORIGIN_NOT_ALLOWED',
    });
    const trustedWrite = createRequest('PATCH', '/api/profile/me', undefined, cookie);
    trustedWrite.headers.origin = 'http://localhost:3006';
    trustedWrite.headers['x-csrf-token'] = csrf;
    await middleware.use(trustedWrite, response, next);
    expect(trustedWrite.headers.authorization).toBe(`Bearer ${token}`);

    const missingCsrf = createRequest('PATCH', '/api/profile/me', undefined, cookie);
    missingCsrf.headers.origin = 'http://localhost:3006';
    // Frontend còn nhận diện CSRF bằng đúng chuỗi này (ERR-001: đổi sau khi frontend dùng `code`).
    await expect(middleware.use(missingCsrf, response, next)).rejects.toMatchObject({
      status: 403,
      code: 'CSRF_TOKEN_INVALID',
      message: 'Invalid CSRF token',
    });

    const explicitInvalid = createRequest('GET', '/api/auth/me', 'Bearer invalid', cookie);
    await expect(middleware.use(explicitInvalid, response, next)).rejects.toThrow();
    expect(explicitInvalid.headers.cookie).toBeUndefined();
  });

  it('forwards logout cookies without requiring a valid access token', async () => {
    const token = await jwt.signAsync(
      { sub: 'user-1', sid: 'session-1', jti: 'access-1', roles: ['STUDENT'], type: 'access' },
      { secret: 'a'.repeat(32), expiresIn: '15m' },
    );
    const request = createRequest(
      'POST',
      '/api/auth/logout',
      undefined,
      `__Host-bk_access=${token}`,
    );
    request.headers.origin = 'http://localhost:3006';
    await middleware.use(request, response, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(request.headers.authorization).toBeUndefined();
    expect(request.headers.cookie).toBe(`__Host-bk_access=${token}`);
    expect(request.headers['x-auth-user-id']).toBeUndefined();
  });

  it('requires a trusted origin before issuing an access cookie', async () => {
    const request = createRequest('POST', '/api/auth/login');
    delete request.headers.origin;
    await expect(middleware.use(request, response, next)).rejects.toMatchObject({
      status: 403,
      code: 'ORIGIN_NOT_ALLOWED',
    });
    const refererRequest = createRequest('POST', '/api/auth/refresh');
    delete refererRequest.headers.origin;
    refererRequest.headers.referer = 'https://app.example/account';
    await middleware.use(refererRequest, response, next);
  });

  it('forwards only refresh and CSRF cookies to the Identity refresh endpoint', async () => {
    const request = createRequest(
      'POST',
      '/api/auth/refresh',
      undefined,
      '__Secure-bk_refresh=refresh.jwt; __Host-bk_csrf=nonce.mac; other=private',
    );
    await middleware.use(request, response, next);
    expect(request.headers.cookie).toBe(
      '__Secure-bk_refresh=refresh.jwt; __Host-bk_csrf=nonce.mac',
    );
  });

  it('rejects expired, wrong-type and duplicate access cookies', async () => {
    const expired = await jwt.signAsync(
      {
        sub: 'user-1',
        sid: 'session-1',
        jti: 'access-1',
        roles: ['STUDENT'],
        type: 'access',
        exp: 1,
      },
      { secret: 'a'.repeat(32) },
    );
    const refresh = await jwt.signAsync(
      { sub: 'user-1', roles: ['STUDENT'], type: 'refresh' },
      { secret: 'a'.repeat(32) },
    );
    for (const cookie of [
      `__Host-bk_access=${expired}`,
      `__Host-bk_access=${refresh}`,
      '__Host-bk_access=one; __Host-bk_access=two',
    ]) {
      const request = createRequest('GET', '/api/auth/me', undefined, cookie);
      await expect(middleware.use(request, response, next)).rejects.toThrow();
      expect(request.headers.cookie).toBeUndefined();
    }
  });

  it('rejects an otherwise valid JWT after its session is revoked', async () => {
    const token = await jwt.signAsync(
      { sub: 'user-1', sid: 'session-1', jti: 'access-1', roles: ['STUDENT'], type: 'access' },
      { secret: 'a'.repeat(32), expiresIn: '15m' },
    );
    jest.mocked(sessions.isActive).mockResolvedValueOnce(false);
    await expect(
      middleware.use(createRequest('GET', '/api/auth/me', `Bearer ${token}`), response, next),
    ).rejects.toMatchObject({ status: 401, code: 'AUTH_TOKEN_INVALID_OR_EXPIRED' });
    expect(next).not.toHaveBeenCalled();
  });
});
