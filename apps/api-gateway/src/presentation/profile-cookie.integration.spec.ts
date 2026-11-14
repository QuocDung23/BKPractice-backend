import { issueCsrfToken, RequestIdMiddleware } from '@app/common';
import type { GatewaySessionService } from '@gateway/application/auth/gateway-session.service';
import { GatewayProxyService } from '@gateway/application/proxy/gateway-proxy.service';
import type { HttpService } from '@nestjs/axios';
import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { AxiosRequestConfig } from 'axios';
import type { Request, Response } from 'express';
import { of, throwError } from 'rxjs';

import { GatewayAuthMiddleware } from './middleware/gateway-auth.middleware';

describe('Profile access through the browser cookie', () => {
  const config = new ConfigService({
    JWT_ACCESS_SECRET: 'a'.repeat(32),
    CORS_ORIGINS: 'https://app.example',
    IDENTITY_SERVICE_URL: 'http://identity:3001',
    LEARNING_SERVICE_URL: 'http://learning:3002',
    SUBMISSION_SERVICE_URL: 'http://submission:3003',
    COMMUNITY_SERVICE_URL: 'http://community:3005',
  });
  const jwt = new JwtService();
  const sessions = {
    isActive: jest.fn().mockResolvedValue(true),
  } as unknown as GatewaySessionService;
  const middleware = new GatewayAuthMiddleware(jwt, config, sessions);
  const http = {
    request: jest.fn((_options: AxiosRequestConfig) => of({ status: 200, headers: {}, data: {} })),
  };
  const proxy = new GatewayProxyService(http as unknown as HttpService, config);
  const response = {
    setHeader: jest.fn(),
    status: jest.fn().mockReturnThis(),
    send: jest.fn(),
  } as unknown as Response;
  const next = jest.fn();
  const userPath = '/api/users/00000000-0000-0000-0000-000000000001/profile';

  function request(method: string, path: string, cookie?: string, origin?: string): Request {
    const headers: Record<string, string> = {};
    if (cookie) headers.cookie = cookie;
    if (origin) headers.origin = origin;
    return {
      method,
      path,
      originalUrl: path,
      headers,
      body: {},
      header: (name: string) => headers[name],
    } as unknown as Request;
  }

  beforeEach(() => jest.clearAllMocks());

  it('authenticates owner and Admin Profile requests without a client Authorization header', async () => {
    const routes: Array<[string, string, string]> = [
      ['STUDENT', 'GET', '/api/profile/me'],
      ['STUDENT', 'PATCH', '/api/profile/me'],
      ['STUDENT', 'POST', '/api/profile/me/avatar/upload-url'],
      ['ADMIN', 'GET', userPath],
      ['ADMIN', 'PATCH', userPath],
    ];
    for (const [role, method, path] of routes) {
      const token = await jwt.signAsync(
        { sub: 'user-1', sid: 'session-1', jti: 'access-1', roles: [role], type: 'access' },
        { secret: 'a'.repeat(32), expiresIn: '15m' },
      );
      const csrf = issueCsrfToken('session-1', 'a'.repeat(32));
      const incoming = request(
        method,
        path,
        `__Host-bk_access=${token}; __Host-bk_csrf=${csrf}`,
        method === 'GET' ? undefined : 'https://app.example',
      );
      if (method !== 'GET') incoming.headers['x-csrf-token'] = csrf;
      await middleware.use(incoming, response, next);
      expect(next).toHaveBeenCalled();
      expect(incoming.headers.cookie).toBeUndefined();
      expect(incoming.headers.authorization).toBe(`Bearer ${token}`);
      await proxy.forward(incoming, response);
      const forwarded = http.request.mock.lastCall?.[0];
      expect(forwarded?.url).toBe(`http://identity:3001${path}`);
      expect(forwarded?.headers).toMatchObject({
        authorization: `Bearer ${token}`,
        'x-auth-user-id': 'user-1',
        'x-auth-roles': role,
      });
      expect(forwarded?.headers).not.toHaveProperty('cookie');
    }
  });

  it('keeps public Profile GET open and rejects cookie writes from an untrusted origin', async () => {
    const publicRead = request('GET', userPath);
    await middleware.use(publicRead, response, next);
    expect(publicRead.headers.authorization).toBeUndefined();

    const token = await jwt.signAsync(
      { sub: 'user-1', sid: 'session-1', jti: 'access-1', roles: ['STUDENT'], type: 'access' },
      { secret: 'a'.repeat(32), expiresIn: '15m' },
    );
    const denied = request('PATCH', '/api/profile/me', `__Host-bk_access=${token}`);
    await expect(middleware.use(denied, response, next)).rejects.toMatchObject({
      status: 403,
      code: 'ORIGIN_NOT_ALLOWED',
    });
  });
});

// GW-002 AC-004–010 / GW-003–007 AC-003–008: composed public boundary.
describe('Learning authenticated transport', () => {
  const secret = 'a'.repeat(32);
  const config = new ConfigService({
    JWT_ACCESS_SECRET: secret,
    CORS_ORIGINS: 'https://app.example',
    IDENTITY_SERVICE_URL: 'http://identity:3001',
    LEARNING_SERVICE_URL: 'http://learning:3002',
    SUBMISSION_SERVICE_URL: 'http://submission:3003',
    COMMUNITY_SERVICE_URL: 'http://community:3005',
  });
  const jwt = new JwtService();
  const sessions = { isActive: jest.fn() };
  const middleware = new GatewayAuthMiddleware(
    jwt,
    config,
    sessions as unknown as GatewaySessionService,
  );
  const http = {
    request: jest.fn((_options: AxiosRequestConfig) => of({ status: 200, headers: {}, data: {} })),
  };
  const proxy = new GatewayProxyService(http as unknown as HttpService, config);
  const response = {
    setHeader: jest.fn(),
    status: jest.fn().mockReturnThis(),
    send: jest.fn(),
  } as unknown as Response;
  const routes: Array<[string, string]> = [
    ['GET', '/api/problems'],
    ['GET', '/api/problems/two-sum'],
    ['POST', '/api/problems'],
    ['PATCH', '/api/problems/id'],
    ['DELETE', '/api/problems/id'],
    ['PUT', '/api/problems/id/harnesses/cpp'],
    ['POST', '/api/problems/id/test-cases'],
    ['GET', '/api/courses'],
    ['GET', '/api/progress/me/problems'],
    ['GET', '/api/recommendations'],
  ];
  function createRequest(method: string, path: string): Request {
    const headers: Record<string, string> = {
      'x-auth-user-id': 'forged',
      'x-auth-roles': 'ADMIN',
      'x-auth-permissions': '*',
      'x-auth-other': 'forged',
      'x-client-ip': 'forged',
      'x-internal-service-secret': 'private',
      'x-internal-other': 'private',
    };
    return {
      method,
      path,
      originalUrl: path + '?q=a%2Fb&q=',
      headers,
      ip: '127.0.0.1',
      body: { opaque: true },
      header: (name: string) => headers[name],
    } as unknown as Request;
  }
  function issueAccess(claims: Record<string, unknown> = {}): Promise<string> {
    return jwt.signAsync(
      {
        sub: 'user-1',
        sid: 'session-1',
        jti: 'access-1',
        roles: ['STUDENT'],
        type: 'access',
        ...claims,
      },
      { secret, expiresIn: '15m' },
    );
  }
  async function forward(request: Request): Promise<void> {
    new RequestIdMiddleware().use(request, response, () => {});
    await middleware.use(request, response, () => {});
    await proxy.forward(request, response);
  }
  const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  afterAll(() => log.mockRestore());
  beforeEach(() => {
    jest.clearAllMocks();
    sessions.isActive.mockResolvedValue(true);
    http.request.mockReturnValue(
      of({ status: 200, headers: { 'set-cookie': 'private=value' }, data: { opaque: true } }),
    );
  });
  it.each(routes)(
    'authenticates %s %s and forwards only verified metadata',
    async (method, path) => {
      const request = createRequest(method, path);
      const token = await issueAccess();
      request.headers.authorization = `Bearer ${token}`;
      request.headers.cookie = 'other=private';
      await forward(request);
      const options = http.request.mock.lastCall?.[0] as AxiosRequestConfig;
      expect(options.url).toBe('http://learning:3002' + request.originalUrl);
      expect(options.headers).toEqual(
        expect.objectContaining({
          authorization: `Bearer ${token}`,
          'x-auth-user-id': 'user-1',
          'x-auth-roles': 'STUDENT',
          'x-auth-permissions': '',
          'x-client-ip': '127.0.0.1',
          'x-request-id': expect.any(String) as unknown,
        }),
      );
      for (const header of [
        'cookie',
        'x-internal-service-secret',
        'x-internal-other',
        'x-auth-other',
      ])
        expect(options.headers).not.toHaveProperty(header);
      expect(response.setHeader).toHaveBeenCalledWith(
        'x-request-id',
        request.headers['x-request-id'],
      );
      expect(log).toHaveBeenCalledWith({ requestId: request.headers['x-request-id'], status: 200 });
      expect(response.setHeader).not.toHaveBeenCalledWith('set-cookie', expect.anything());
    },
  );
  it.each(routes)('requires authentication on %s %s', async (method, path) => {
    await expect(forward(createRequest(method, path))).rejects.toMatchObject({ status: 401 });
    expect(http.request).not.toHaveBeenCalled();
  });
  it.each(['invalid', 'expired', 'revoked', 'unavailable', 'wrong-type', 'missing-sid'])(
    'stops %s tokens before Learning',
    async (kind) => {
      const request = createRequest('GET', '/api/problems');
      const claims =
        kind === 'wrong-type' ? { type: 'refresh' } : kind === 'missing-sid' ? { sid: '' } : {};
      const token =
        kind === 'expired'
          ? await jwt.signAsync(
              { sub: 'user-1', sid: 'session-1', jti: 'jti', roles: [], type: 'access', exp: 1 },
              { secret },
            )
          : kind === 'invalid'
            ? 'invalid'
            : await issueAccess(claims);
      request.headers.authorization = `Bearer ${token}`;
      if (kind === 'revoked') sessions.isActive.mockResolvedValueOnce(false);
      if (kind === 'unavailable')
        sessions.isActive.mockRejectedValueOnce(new ServiceUnavailableException());
      await expect(forward(request)).rejects.toMatchObject({
        status: kind === 'unavailable' ? 503 : 401,
      });
      expect(http.request).not.toHaveBeenCalled();
    },
  );
  it.each([{ sub: 42 }, { sid: ['session'] }, { jti: {} }, { roles: 'ADMIN' }, { roles: [1] }])(
    'rejects malformed mandatory claims %j',
    async (claims) => {
      const request = createRequest('GET', '/api/problems');
      request.headers.authorization = `Bearer ${await issueAccess(claims)}`;
      await expect(forward(request)).rejects.toMatchObject({ status: 401 });
      expect(http.request).not.toHaveBeenCalled();
    },
  );
  it('rejects an access token without expiry', async () => {
    const request = createRequest('GET', '/api/problems');
    const token = await jwt.signAsync(
      { sub: 'user-1', sid: 'session-1', jti: 'jti', roles: [], type: 'access' },
      { secret },
    );
    request.headers.authorization = `Bearer ${token}`;
    await expect(forward(request)).rejects.toMatchObject({ status: 401 });
    expect(http.request).not.toHaveBeenCalled();
  });
  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
    'enforces cookie Origin and CSRF for %s',
    async (method) => {
      const token = await issueAccess();
      const csrf = issueCsrfToken('session-1', secret);
      const path =
        method === 'PUT'
          ? '/api/problems/id/harnesses/cpp'
          : method === 'POST'
            ? '/api/problems'
            : '/api/problems/id';
      for (const mode of ['origin', 'csrf', 'valid']) {
        const request = createRequest(method, path);
        request.headers.cookie = `__Host-bk_access=${token}; __Host-bk_csrf=${csrf}`;
        request.headers.origin = mode === 'origin' ? 'https://evil.example' : 'https://app.example';
        request.headers['x-csrf-token'] = mode === 'csrf' ? 'wrong' : csrf;
        if (mode !== 'valid') {
          await expect(forward(request)).rejects.toMatchObject({ status: 403 });
          expect(http.request).not.toHaveBeenCalled();
        } else {
          await forward(request);
          expect(http.request).toHaveBeenCalledWith(
            expect.objectContaining({
              headers: expect.objectContaining({ authorization: `Bearer ${token}` }) as unknown,
            }),
          );
        }
      }
    },
  );
  it.each([undefined, 'wrong', [1]])(
    'does not infer permissions from roles or malformed claim %j',
    async (permissions) => {
      const request = createRequest('GET', '/api/recommendations');
      request.headers.authorization = `Bearer ${await issueAccess({ roles: ['ADMIN'], permissions })}`;
      await forward(request);
      expect(request.headers['x-auth-permissions']).toBe('');
    },
  );
  it('keeps verified permissions and a supplied request ID', async () => {
    const request = createRequest('GET', '/api/progress/me/problems');
    request.headers.authorization = `Bearer ${await issueAccess({ permissions: ['class:read-managed'] })}`;
    request.headers['x-request-id'] = 'request-123';
    await forward(request);
    expect(request.headers['x-auth-permissions']).toBe('class:read-managed');
    expect(response.setHeader).toHaveBeenCalledWith('x-request-id', 'request-123');
  });
  it.each(['ECONNREFUSED', 'ETIMEDOUT'])('returns a sanitized 502 on %s', async (reason) => {
    http.request.mockReturnValue(throwError(() => new Error(reason + ' private internal host')));
    const request = createRequest('GET', '/api/problems');
    request.headers.authorization = `Bearer ${await issueAccess()}`;
    const error: unknown = await forward(request).then(
      () => undefined,
      (reason: unknown) => reason,
    );
    expect(error).toMatchObject({
      status: 502,
      code: 'UPSTREAM_UNAVAILABLE',
      message: 'Không kết nối được tới dịch vụ Learning. Vui lòng thử lại sau ít phút.',
    });
    // Không lộ host hay chi tiết nội bộ của lỗi gốc.
    expect(JSON.stringify((error as { getResponse(): unknown }).getResponse())).not.toMatch(
      /private internal host|ECONN|ETIMEDOUT/,
    );
  });
});
