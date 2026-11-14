import type { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import type { Request, Response } from 'express';
import { of, throwError } from 'rxjs';
import type { Observable } from 'rxjs';

import { GatewayProxyService } from '@/application/proxy/gateway-proxy.service';

const config = new ConfigService({
  IDENTITY_SERVICE_URL: 'http://identity.internal:3001',
  LEARNING_SERVICE_URL: 'http://learning.internal:3002',
  SUBMISSION_SERVICE_URL: 'http://submission.internal:3003',
  COMMUNITY_SERVICE_URL: 'http://community.internal:3005',
});

function createRequest(method: string, path: string): Request {
  return {
    method,
    path,
    originalUrl: path,
    headers: { 'x-request-id': '5f2b1c3e-1a2b-4c3d-8e4f-5a6b7c8d9e0f' },
  } as unknown as Request;
}

function createResponse() {
  const headers: Record<string, string> = {};
  const response = {
    setHeader: jest.fn((key: string, value: string) => {
      headers[key] = value;
    }),
    status: jest.fn().mockReturnThis(),
    send: jest.fn(),
  };
  return { headers, response, asResponse: response as unknown as Response };
}

function createProxy(result: Observable<unknown>) {
  const http = { request: jest.fn().mockReturnValue(result) };
  return { http, proxy: new GatewayProxyService(http as unknown as HttpService, config) };
}

describe('Gateway upstream error bodies (ERR-001 FR-011)', () => {
  it('keeps the exact body of a service error that already uses the shared format', async () => {
    const body = {
      statusCode: 403,
      code: 'USER_FORBIDDEN',
      message: 'Bạn cần quyền USER_MANAGE.',
      requestId: 'svc-1',
    };
    const { proxy } = createProxy(of({ status: 403, headers: {}, data: body }));
    const { response, asResponse } = createResponse();
    await proxy.forward(createRequest('GET', '/api/users'), asResponse);
    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.send).toHaveBeenCalledWith(body);
  });

  it.each([
    ['nginx HTML', 502, '<html><body>502 Bad Gateway nginx/1.24</body></html>'],
    ['empty body', 500, ''],
    ['plain text', 503, 'upstream timed out'],
  ])('replaces a %s error with 502 UPSTREAM_INVALID_RESPONSE', async (_name, status, data) => {
    const { proxy } = createProxy(of({ status, headers: { 'content-type': 'text/html' }, data }));
    const { headers, response, asResponse } = createResponse();
    await proxy.forward(createRequest('GET', '/api/problems'), asResponse);
    expect(response.status).toHaveBeenCalledWith(502);
    const [sent] = response.send.mock.calls[0] as [Record<string, unknown>];
    expect(sent).toMatchObject({
      statusCode: 502,
      code: 'UPSTREAM_INVALID_RESPONSE',
      requestId: '5f2b1c3e-1a2b-4c3d-8e4f-5a6b7c8d9e0f',
    });
    expect(sent.message).toMatch(/dịch vụ Learning/i);
    expect(sent.message).toContain(String(status));
    expect(sent).not.toHaveProperty('details');
    expect(JSON.stringify(sent)).not.toMatch(/nginx|<html>|timed out|internal:/);
    expect(headers['content-type']).toBe('application/json; charset=utf-8');
    expect(headers['x-request-id']).toBe('5f2b1c3e-1a2b-4c3d-8e4f-5a6b7c8d9e0f');
  });

  it('turns an upstream 404 HTML page into 502, not 404 (spec: sai định dạng thì 502)', async () => {
    const { proxy } = createProxy(of({ status: 404, headers: {}, data: '<html>Not Found</html>' }));
    const { response, asResponse } = createResponse();
    await proxy.forward(createRequest('GET', '/api/problems'), asResponse);
    expect(response.status).toHaveBeenCalledWith(502);
  });

  it('never copies upstream text, even from a legacy {statusCode,message} body', async () => {
    const hostile =
      'connect ECONNREFUSED postgres://admin:S3cret@db.internal:5432/identity at /srv/app/dist/main.js:1';
    const { proxy } = createProxy(
      of({ status: 500, headers: {}, data: { statusCode: 500, message: hostile } }),
    );
    const { response, asResponse } = createResponse();
    await proxy.forward(createRequest('POST', '/api/auth/login'), asResponse);
    expect(response.status).toHaveBeenCalledWith(502);
    const [sent] = response.send.mock.calls[0] as [Record<string, unknown>];
    expect(sent).toMatchObject({ statusCode: 502, code: 'UPSTREAM_INVALID_RESPONSE' });
    expect(sent).not.toHaveProperty('details');
    expect(JSON.stringify(sent)).not.toMatch(
      /postgres|S3cret|db\.internal|\/srv\/app|ECONNREFUSED/,
    );
  });

  it.each([
    ['thiếu requestId', { statusCode: 403, code: 'USER_FORBIDDEN', message: 'Bạn cần quyền.' }],
    ['thiếu statusCode', { code: 'USER_FORBIDDEN', message: 'Bạn cần quyền.', requestId: 'svc-1' }],
    [
      'statusCode lệch status HTTP',
      { statusCode: 200, code: 'USER_FORBIDDEN', message: 'Bạn cần quyền.', requestId: 'svc-1' },
    ],
  ])('wraps an incomplete envelope (%s) instead of forwarding it', async (_name, data) => {
    const { proxy } = createProxy(of({ status: 403, headers: {}, data }));
    const { response, asResponse } = createResponse();
    await proxy.forward(createRequest('GET', '/api/users'), asResponse);
    expect(response.status).toHaveBeenCalledWith(502);
    expect(response.send).not.toHaveBeenCalledWith(data);
  });

  it.each([200, 201, 204, 302, 304])('does not touch a %s response', async (status) => {
    const data = { anything: 'goes' };
    const { proxy } = createProxy(of({ status, headers: {}, data }));
    const { response, asResponse } = createResponse();
    await proxy.forward(createRequest('GET', '/api/problems'), asResponse);
    expect(response.status).toHaveBeenCalledWith(status);
    expect(response.send).toHaveBeenCalledWith(data);
  });
});

describe('Gateway transport failures (ERR-001 FR-006)', () => {
  it.each([
    ['/api/auth/me', 'Identity'],
    ['/api/problems', 'Learning'],
    ['/api/community/posts', 'Community'],
  ])('names the logical service for %s without leaking the host', async (path, service) => {
    const { proxy } = createProxy(
      throwError(() => new Error('connect ECONNREFUSED 10.0.0.9:3001')),
    );
    const error: unknown = await proxy
      .forward(createRequest('GET', path), createResponse().asResponse)
      .then(
        () => undefined,
        (reason: unknown) => reason,
      );
    expect(error).toMatchObject({
      status: 502,
      code: 'UPSTREAM_UNAVAILABLE',
      message: `Không kết nối được tới dịch vụ ${service}. Vui lòng thử lại sau ít phút.`,
    });
  });

  it('says the service was too slow when axios reports a timeout', async () => {
    const timeout = new AxiosError('timeout of 15000ms exceeded', 'ECONNABORTED');
    const { proxy } = createProxy(throwError(() => timeout));
    await expect(
      proxy.forward(createRequest('GET', '/api/auth/me'), createResponse().asResponse),
    ).rejects.toMatchObject({
      status: 502,
      code: 'UPSTREAM_UNAVAILABLE',
      message: 'Dịch vụ Identity không phản hồi trong 15 giây. Vui lòng thử lại sau ít phút.',
    });
  });

  it('reports a route that no upstream handles', async () => {
    const { proxy, http } = createProxy(of({ status: 200, headers: {}, data: {} }));
    await expect(
      proxy.forward(createRequest('GET', '/api/khong-ton-tai'), createResponse().asResponse),
    ).rejects.toMatchObject({
      status: 502,
      code: 'UPSTREAM_NOT_CONFIGURED',
      message: expect.stringContaining('GET /api/khong-ton-tai') as string,
    });
    expect(http.request).not.toHaveBeenCalled();
  });

  it('reports an unsafe path with its own code', async () => {
    const { proxy, http } = createProxy(of({ status: 200, headers: {}, data: {} }));
    const request = createRequest('GET', '/api/problems');
    request.originalUrl = '/api/problems/../../internal';
    await expect(proxy.forward(request, createResponse().asResponse)).rejects.toMatchObject({
      status: 400,
      code: 'UNSAFE_REQUEST_PATH',
    });
    expect(http.request).not.toHaveBeenCalled();
  });

  it('rejects an Identity login response that carries tokens in the body', async () => {
    const { proxy } = createProxy(
      of({ status: 200, headers: {}, data: { userId: 'u', accessToken: 'secret' } }),
    );
    await expect(
      proxy.forward(createRequest('POST', '/api/auth/login'), createResponse().asResponse),
    ).rejects.toMatchObject({ status: 502, code: 'UPSTREAM_INVALID_RESPONSE' });
  });
});
