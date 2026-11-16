import type { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { of } from 'rxjs';

import { GatewayProxyService } from './gateway-proxy.service';

describe('GatewayProxyService', () => {
  const request = {
    method: 'GET',
    path: '/api/auth/microsoft',
    originalUrl: '/api/auth/microsoft',
    headers: { host: 'localhost' },
  } as unknown as Request;
  const headers: Record<string, string> = {};
  const response = {
    setHeader: jest.fn((key: string, value: string) => {
      headers[key] = value;
    }),
    status: jest.fn().mockReturnThis(),
    send: jest.fn(),
  } as unknown as Response;
  const config = new ConfigService({
    IDENTITY_SERVICE_URL: 'http://localhost:3001',
    LEARNING_SERVICE_URL: 'http://localhost:3002',
    SUBMISSION_SERVICE_URL: 'http://localhost:3003',
    COMMUNITY_SERVICE_URL: 'http://localhost:3005',
    AUTH_MOBILE_LOGIN_REDIRECT_URL: 'bkpracticemobile:///auth/callback',
  });

  beforeEach(() => {
    Object.keys(headers).forEach((key) => delete headers[key]);
    jest.clearAllMocks();
  });

  it('forwards profile search and its query string to Identity', async () => {
    const upstream = {
      request: jest.fn().mockReturnValue(of({ status: 200, headers: {}, data: { items: [] } })),
    };
    await new GatewayProxyService(upstream as unknown as HttpService, config).forward(
      {
        method: 'GET',
        path: '/api/profiles/search',
        originalUrl: '/api/profiles/search?q=Nguy%E1%BB%85n&page=2',
        headers: { authorization: 'Bearer verified-access', host: 'localhost' },
      } as unknown as Request,
      response,
    );
    expect(upstream.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'http://localhost:3001/api/profiles/search?q=Nguy%E1%BB%85n&page=2',
        headers: { authorization: 'Bearer verified-access' },
      }),
    );
  });

  it('routes User administration to Identity without exposing client cookies', async () => {
    const upstream = {
      request: jest.fn().mockReturnValue(of({ status: 204, headers: {}, data: '' })),
    };
    const path = '/api/admin/users/00000000-0000-0000-0000-000000000001';
    await new GatewayProxyService(upstream as unknown as HttpService, config).forward(
      {
        method: 'DELETE',
        path,
        originalUrl: path,
        headers: { authorization: 'Bearer access', cookie: 'private=value' },
      } as unknown as Request,
      response,
    );
    expect(upstream.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: `http://localhost:3001${path}`,
        headers: { authorization: 'Bearer access' },
      }),
    );
  });

  it.each(['GET', 'POST', 'DELETE'])(
    'forwards %s role management to Identity and preserves Authorization',
    async (method) => {
      const path = `/api/roles/users/user-1${method === 'DELETE' ? '/LECTURER' : ''}`;
      const upstream = {
        request: jest
          .fn()
          .mockReturnValue(
            of({ status: 200, headers: {}, data: { userId: 'user-1', roles: ['LECTURER'] } }),
          ),
      };
      await new GatewayProxyService(upstream as unknown as HttpService, config).forward(
        {
          method,
          path,
          originalUrl: path,
          headers: { authorization: 'Bearer test-access', 'x-auth-user-id': 'admin' },
          body: method === 'POST' ? { role: 'LECTURER' } : undefined,
        } as unknown as Request,
        response,
      );
      expect(upstream.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method,
          url: `http://localhost:3001${path}`,
          headers: {
            authorization: 'Bearer test-access',
            'x-auth-user-id': 'admin',
          },
        }),
      );
    },
  );

  it('forwards a safe OAuth Location without forwarding set-cookie', async () => {
    const http = {
      request: jest.fn().mockReturnValue(
        of({
          status: 302,
          headers: {
            location: 'https://login.microsoftonline.com/tenant/oauth?state=abc',
            'set-cookie': 'session=secret',
          },
          data: '',
        }),
      ),
    } as unknown as HttpService;
    await new GatewayProxyService(http, config).forward(request, response);
    expect(headers.location).toBe('https://login.microsoftonline.com/tenant/oauth?state=abc');
    expect(headers['set-cookie']).toBeUndefined();
    expect(response.status).toHaveBeenCalledWith(302);
  });

  it('allows only the configured mobile deep link for the OAuth callback', async () => {
    const callbackRequest = {
      method: 'GET',
      path: '/api/auth/microsoft/callback',
      originalUrl: '/api/auth/microsoft/callback?code=code&state=state',
      headers: { host: 'localhost' },
    } as unknown as Request;
    const mobileConfig = new ConfigService({
      IDENTITY_SERVICE_URL: 'http://localhost:3001',
      LEARNING_SERVICE_URL: 'http://localhost:3002',
      SUBMISSION_SERVICE_URL: 'http://localhost:3003',
      COMMUNITY_SERVICE_URL: 'http://localhost:3005',
      AUTH_MOBILE_LOGIN_REDIRECT_URL: 'bkpracticemobile://auth/callback',
    });
    const allowedHttp = {
      request: jest.fn().mockReturnValue(
        of({
          status: 302,
          headers: { location: 'bkpracticemobile://auth/callback?loginCode=once' },
          data: '',
        }),
      ),
    } as unknown as HttpService;
    await new GatewayProxyService(allowedHttp, mobileConfig).forward(callbackRequest, response);
    expect(headers.location).toBe('bkpracticemobile://auth/callback?loginCode=once');

    const otherScheme = {
      request: jest.fn().mockReturnValue(
        of({
          status: 302,
          headers: { location: 'otherscheme://auth/callback?loginCode=once' },
          data: '',
        }),
      ),
    } as unknown as HttpService;
    await expect(
      new GatewayProxyService(otherScheme, mobileConfig).forward(callbackRequest, response),
    ).rejects.toThrow();

    const mobileDisabled = {
      request: jest.fn().mockReturnValue(
        of({
          status: 302,
          headers: { location: 'bkpracticemobile://auth/callback?loginCode=once' },
          data: '',
        }),
      ),
    } as unknown as HttpService;
    await expect(
      new GatewayProxyService(mobileDisabled, config).forward(callbackRequest, response),
    ).rejects.toThrow();
  });

  it('rejects an OAuth redirect containing bearer tokens', async () => {
    const http = {
      request: jest.fn().mockReturnValue(
        of({
          status: 302,
          headers: { location: 'https://app.example/callback?access_token=secret' },
          data: '',
        }),
      ),
    } as unknown as HttpService;
    await expect(
      new GatewayProxyService(http, config).forward(request, response),
    ).rejects.toThrow();
  });

  it('forwards the configured mobile deep link after the Microsoft callback', async () => {
    const location = 'bkpracticemobile:///auth/callback?loginCode=opaque';
    const http = {
      request: jest.fn().mockReturnValue(of({ status: 302, headers: { location }, data: '' })),
    } as unknown as HttpService;
    await new GatewayProxyService(http, config).forward(
      {
        method: 'GET',
        path: '/api/auth/microsoft/callback',
        originalUrl: '/api/auth/microsoft/callback',
        headers: {},
      } as unknown as Request,
      response,
    );
    expect(headers.location).toBe(location);
    expect(response.status).toHaveBeenCalledWith(302);
  });

  it('rejects a mobile redirect outside the configured deep link', async () => {
    for (const location of [
      'bkpracticemobile://evil/auth/callback?loginCode=opaque',
      'bkpracticemobile:///auth/other?loginCode=opaque',
    ]) {
      const http = {
        request: jest.fn().mockReturnValue(of({ status: 302, headers: { location }, data: '' })),
      } as unknown as HttpService;
      await expect(
        new GatewayProxyService(http, config).forward(
          {
            method: 'GET',
            path: '/api/auth/microsoft/callback',
            originalUrl: '/api/auth/microsoft/callback',
            headers: {},
          } as unknown as Request,
          response,
        ),
      ).rejects.toThrow();
    }
  });

  it('forwards only the approved auth cookies on a successful web login', async () => {
    const cookies = [
      '__Host-bk_access=access; Path=/; HttpOnly; Secure; SameSite=Lax',
      '__Secure-bk_refresh=refresh; Path=/api/auth; HttpOnly; Secure; SameSite=Lax',
      '__Host-bk_csrf=csrf; Path=/; Secure; SameSite=Lax',
    ];
    const upstream = {
      request: jest.fn().mockReturnValue(
        of({
          status: 200,
          headers: { 'set-cookie': cookies },
          data: { userId: 'user-1' },
        }),
      ),
    };
    await new GatewayProxyService(upstream as unknown as HttpService, config).forward(
      {
        method: 'POST',
        path: '/api/auth/login',
        originalUrl: '/api/auth/login',
        headers: { cookie: 'other=secret', origin: 'https://app.example' },
        body: { identifier: '2210001', password: 'password' },
      } as unknown as Request,
      response,
    );
    expect(headers['set-cookie']).toEqual(cookies);
    expect(upstream.request).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: { origin: 'https://app.example' },
      }),
    );
  });

  it('forwards the cleared auth cookies after logout through Gateway', async () => {
    const cookies = [
      '__Host-bk_access=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax',
      '__Secure-bk_refresh=; Path=/api/auth; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax',
      '__Host-bk_csrf=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure; SameSite=Lax',
    ];
    const upstream = {
      request: jest
        .fn()
        .mockReturnValue(of({ status: 204, headers: { 'set-cookie': cookies }, data: '' })),
    };
    await new GatewayProxyService(upstream as unknown as HttpService, config).forward(
      {
        method: 'POST',
        path: '/api/auth/logout',
        originalUrl: '/api/auth/logout',
        headers: { authorization: 'Bearer verified-access', 'x-auth-user-id': 'user-1' },
        body: { refreshToken: 'refresh' },
      } as unknown as Request,
      response,
    );
    expect(headers['set-cookie']).toEqual(cookies);
    expect(response.status).toHaveBeenCalledWith(204);
    expect(upstream.request).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: { authorization: 'Bearer verified-access', 'x-auth-user-id': 'user-1' },
      }),
    );
  });

  it('rejects a successful auth response that exposes an access token or sets another cookie', async () => {
    const authRequest = {
      method: 'POST',
      path: '/api/auth/login',
      originalUrl: '/api/auth/login',
      headers: {},
      body: {},
    } as unknown as Request;
    for (const upstreamResponse of [
      {
        status: 200,
        headers: {
          'set-cookie': ['__Host-bk_access=access; Path=/; HttpOnly; Secure; SameSite=Lax'],
        },
        data: { accessToken: 'access' },
      },
      {
        status: 200,
        headers: { 'set-cookie': ['session=secret; Path=/; HttpOnly; Secure; SameSite=Lax'] },
        data: {},
      },
    ]) {
      const http = { request: jest.fn().mockReturnValue(of(upstreamResponse)) };
      await expect(
        new GatewayProxyService(http as unknown as HttpService, config).forward(
          authRequest,
          response,
        ),
      ).rejects.toThrow();
    }
  });

  it('returns mobile tokens in JSON without forwarding cookies', async () => {
    const data = { userId: 'user-1', accessToken: 'access', refreshToken: 'refresh' };
    const upstream = { request: jest.fn().mockReturnValue(of({ status: 200, headers: {}, data })) };
    await new GatewayProxyService(upstream as unknown as HttpService, config).forward(
      {
        method: 'POST',
        path: '/api/auth/login',
        originalUrl: '/api/auth/login',
        headers: { 'x-client-type': 'mobile' },
        body: { identifier: '2210001', password: 'password' },
      } as unknown as Request,
      response,
    );
    expect(headers['set-cookie']).toBeUndefined();
    expect(response.send).toHaveBeenCalledWith(data);
  });
});

// GW-002–GW-007: every approved method/path; no business DTO validation.
describe('Learning route transport', () => {
  const routes: Array<[string, string]> = [
    ['GET', '/api/problems'],
    ['POST', '/api/problems'],
    ['GET', '/api/problems/two-sum'],
    ['GET', '/api/problems/managed'],
    ['GET', '/api/problems/managed/id-1'],
    ['PATCH', '/api/problems/id-1'],
    ['DELETE', '/api/problems/id-1'],
    ['POST', '/api/problems/id-1/publish'],
    ['POST', '/api/problems/id-1/hold'],
    ['POST', '/api/problems/id-1/republish'],
    ['POST', '/api/problems/id-1/restore'],
    ['POST', '/api/problems/id-1/preview'],
    ['GET', '/api/problems/managed/id-1/test-cases'],
    ['GET', '/api/problems/managed/id-1/test-cases/testCaseId-1'],
    ['POST', '/api/problems/id-1/test-cases'],
    ['PUT', '/api/problems/id-1/test-cases/order'],
    ['PATCH', '/api/problems/id-1/test-cases/testCaseId-1'],
    ['DELETE', '/api/problems/id-1/test-cases/testCaseId-1'],
    ['GET', '/api/problems/managed/id-1/harnesses/cpp'],
    ['PUT', '/api/problems/id-1/harnesses/cpp'],
    ['DELETE', '/api/problems/id-1/harnesses/cpp'],
    ['GET', '/api/courses'],
    ['GET', '/api/courses/managed'],
    ['GET', '/api/courses/managed/id-1'],
    ['GET', '/api/courses/two-sum'],
    ['POST', '/api/courses'],
    ['PATCH', '/api/courses/id-1'],
    ['POST', '/api/courses/id-1/publish'],
    ['POST', '/api/courses/id-1/hold'],
    ['POST', '/api/courses/id-1/republish'],
    ['DELETE', '/api/courses/id-1'],
    ['POST', '/api/courses/id-1/restore'],
    ['POST', '/api/courses/id-1/chapters'],
    ['PUT', '/api/courses/id-1/chapters/order'],
    ['PATCH', '/api/courses/id-1/chapters/chapterId-1'],
    ['DELETE', '/api/courses/id-1/chapters/chapterId-1'],
    ['POST', '/api/courses/id-1/chapters/chapterId-1/problems'],
    ['PUT', '/api/courses/id-1/chapters/chapterId-1/problems/order'],
    ['DELETE', '/api/courses/id-1/chapters/chapterId-1/problems/problemId-1'],
    ['GET', '/api/progress/me/problems'],
    ['GET', '/api/progress/me/problems/status'],
    ['GET', '/api/progress/me/courses/courseId-1'],
    ['GET', '/api/progress/courses/courseId-1/students'],
    ['GET', '/api/recommendations'],
  ];
  const config = new ConfigService({
    IDENTITY_SERVICE_URL: 'http://identity:3001',
    LEARNING_SERVICE_URL: 'http://learning:3002',
    SUBMISSION_SERVICE_URL: 'http://submission:3003',
    COMMUNITY_SERVICE_URL: 'http://community:3005',
  });
  const upstream = { request: jest.fn() };
  const response = {
    setHeader: jest.fn(),
    status: jest.fn().mockReturnThis(),
    send: jest.fn(),
  } as unknown as Response;
  const proxy = new GatewayProxyService(upstream as unknown as HttpService, config);
  function createRequest(method: string, path: string): Request {
    return {
      method,
      path,
      originalUrl: path + '?q=a%2Fb&q=&includeDeleted=true',
      headers: {},
      body: { z: 1, a: ['opaque'] },
    } as unknown as Request;
  }
  beforeEach(() => {
    jest.clearAllMocks();
    upstream.request.mockReturnValue(of({ status: 200, headers: {}, data: { opaque: true } }));
  });
  it.each(routes)('forwards %s %s unchanged to Learning', async (method, path) => {
    const request = createRequest(method, path);
    await proxy.forward(request, response);
    expect(upstream.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method,
        url: 'http://learning:3002' + request.originalUrl,
        data: request.body as unknown,
        maxRedirects: 0,
        timeout: 15000,
      }),
    );
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.send).toHaveBeenCalledWith({ opaque: true });
  });
  it.each([
    ['GET', '/api/problemsX'],
    ['POST', '/api/problems-old'],
    ['GET', '/api/coursesX'],
    ['GET', '/api/classes-old'],
    ['GET', '/api/assignmentsX'],
    ['GET', '/api/progressX'],
    ['GET', '/api/recommendationsX'],
    ['GET', '/api/classes/enrolled'],
    ['GET', '/api/assignments/id'],
    ['GET', '/api/progress/me/assignments/id'],
    ['GET', '/api/progress/classes/id/course'],
    ['DELETE', '/api/classes/class-1'],
    ['POST', '/api/progress/me/problems'],
    ['POST', '/api/recommendations'],
    ['GET', '/api/recommendations/other'],
    ['GET', '/api/problems/id/judge-package/cpp'],
    ['POST', '/api/problems/id/unknown'],
    ['GET', '/internal/problems/id/judge-package/cpp'],
    ['GET', '/api/internal/problems/id/judge-package/cpp'],
  ])('blocks unapproved %s %s without upstream', async (method, path) => {
    await expect(proxy.forward(createRequest(method, path), response)).rejects.toMatchObject({
      status: 502,
    });
    expect(upstream.request).not.toHaveBeenCalled();
  });
  it.each(['problems', 'courses', 'progress', 'recommendations'])(
    'blocks unsafe %s paths',
    async (prefix) => {
      for (const suffix of [
        '/../../internal/problems/id/judge-package/cpp',
        '/%2e%2e/other',
        '/.%2e/other',
        '/..%2finternal',
        '/%252e%252e%252finternal',
        '/..\\internal',
        '/%5c..%5cinternal',
        '/id/../other',
      ]) {
        await expect(
          proxy.forward(createRequest('GET', '/api/' + prefix + suffix), response),
        ).rejects.toMatchObject({ status: 400 });
        expect(upstream.request).not.toHaveBeenCalled();
      }
    },
  );
  it('rejects a mismatch between matched and forwarded paths', async () => {
    const request = createRequest('GET', '/api/problems');
    request.originalUrl = '/api/problems/../../internal/problems/id/judge-package/cpp';
    await expect(proxy.forward(request, response)).rejects.toMatchObject({ status: 400 });
    expect(upstream.request).not.toHaveBeenCalled();
  });
  it.each([200, 302, 400, 401, 403, 404, 409, 500, 503])(
    'preserves status/body %s and filters response headers',
    async (status) => {
      // Lỗi đúng định dạng chuẩn thì giữ nguyên (ERR-001 FR-011); 200/302 không bị đụng tới.
      const data =
        status >= 400
          ? {
              statusCode: status,
              code: 'LEARNING_ERROR',
              message: 'Learning response',
              requestId: 'r-1',
            }
          : { message: 'Learning response' };
      upstream.request.mockReturnValue(
        of({
          status,
          data,
          headers: {
            'content-type': 'application/json',
            'content-length': '31',
            etag: 'v1',
            'last-modified': 'today',
            'set-cookie': 'private=value',
            location: 'http://internal',
            'x-private': 'hidden',
          },
        }),
      );
      await proxy.forward(createRequest('GET', '/api/problems'), response);
      expect(response.status).toHaveBeenCalledWith(status);
      expect(response.send).toHaveBeenCalledWith(data);
      expect(jest.mocked(response.setHeader).mock.calls).toEqual([
        ['content-type', 'application/json'],
        ['content-length', '31'],
        ['etag', 'v1'],
        ['last-modified', 'today'],
      ]);
    },
  );
  it('accepts a trailing slash without changing the query encoding', async () => {
    await proxy.forward(createRequest('GET', '/api/problems/'), response);
    expect(upstream.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'http://learning:3002/api/problems/?q=a%2Fb&q=&includeDeleted=true',
      }),
    );
  });
});

describe('Submission HTTP boundary (GW-008–010)', () => {
  const http = { request: jest.fn() };
  const proxy = new GatewayProxyService(
    http as unknown as HttpService,
    new ConfigService({
      IDENTITY_SERVICE_URL: 'http://identity',
      LEARNING_SERVICE_URL: 'http://learning',
      SUBMISSION_SERVICE_URL: 'http://submission',
      COMMUNITY_SERVICE_URL: 'http://community',
    }),
  );
  const response = {
    setHeader: jest.fn(),
    status: jest.fn().mockReturnThis(),
    send: jest.fn(),
  } as unknown as Response;
  beforeEach(() => jest.clearAllMocks());

  it.each([
    ['POST', '/api/run', 202],
    ['POST', '/api/submissions', 202],
    ['GET', '/api/submissions', 200],
    ['GET', '/api/submissions/public-id', 200],
  ])('preserves %s %s and its upstream response', async (method, path, status) => {
    const body = { sourceCode: 'opaque', language: 'cpp' };
    const data = { opaque: true };
    http.request.mockReturnValue(
      of({
        status,
        data,
        headers: { 'set-cookie': 'private=value', 'content-type': 'application/json' },
      }),
    );
    const originalUrl = path + '?kind=RUN&cursor=a%2Fb&cursorId=id&limit=5';
    await proxy.forward(
      {
        method,
        path,
        originalUrl,
        body,
        headers: {
          'x-auth-user-id': 'verified',
          'x-internal-secret': 'forged',
          cookie: 'private=value',
          'x-request-id': 'correlation',
        },
      } as unknown as Request,
      response,
    );
    expect(http.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method,
        url: 'http://submission' + originalUrl,
        data: body,
        headers: { 'x-auth-user-id': 'verified', 'x-request-id': 'correlation' },
      }),
    );
    expect(response.status).toHaveBeenCalledWith(status);
    expect(response.send).toHaveBeenCalledWith(data);
    expect(response.setHeader).not.toHaveBeenCalledWith('set-cookie', expect.anything());
  });

  it.each([
    ['GET', '/api/run'],
    ['POST', '/api/run-extra'],
    ['DELETE', '/api/submissions/id'],
    ['GET', '/api/submissions/id/internal'],
    ['GET', '/api/submissions-extra'],
    ['GET', '/api/submissions/%252e%252e%252finternal'],
    ['GET', '/api/submissions/id/../../internal'],
  ])('rejects unapproved or unsafe %s %s', async (method, path) => {
    await expect(
      proxy.forward({ method, path, originalUrl: path, headers: {} } as Request, response),
    ).rejects.toThrow();
    expect(http.request).not.toHaveBeenCalled();
  });

  it.each([400, 403, 404, 409, 422, 500])('preserves Submission error %s', async (status) => {
    const data = {
      statusCode: status,
      code: 'SUBMISSION_ERROR',
      message: 'Submission error',
      requestId: 'r-2',
    };
    http.request.mockReturnValue(of({ status, data, headers: {} }));
    await proxy.forward(
      {
        method: 'GET',
        path: '/api/submissions/id',
        originalUrl: '/api/submissions/id',
        headers: {},
      } as Request,
      response,
    );
    expect(response.status).toHaveBeenCalledWith(status);
    expect(response.send).toHaveBeenCalledWith(data);
  });
});
