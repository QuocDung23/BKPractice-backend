import { buildApiError } from '@app/common';
import type { AppHttpException } from '@app/common';

import {
  createAuthResponseRejectedError,
  createBearerMalformedError,
  createCsrfTokenInvalidError,
  createOriginNotAllowedError,
  createSessionUnavailableError,
  createTokenInvalidOrExpiredError,
  createTokenMissingError,
  createTooManyRequestsError,
  createUnsafeRequestPathError,
  createUpstreamNotConfiguredError,
  createUpstreamUnavailableError,
  isApiErrorEnvelope,
} from './gateway-errors';

describe('gateway errors (ERR-001)', () => {
  const cases: Array<[string, AppHttpException, number, string]> = [
    ['token missing', createTokenMissingError(), 401, 'AUTH_TOKEN_MISSING'],
    ['bearer malformed', createBearerMalformedError(), 401, 'AUTH_BEARER_MALFORMED'],
    ['token invalid', createTokenInvalidOrExpiredError(), 401, 'AUTH_TOKEN_INVALID_OR_EXPIRED'],
    ['session unavailable', createSessionUnavailableError(), 503, 'AUTH_SESSION_UNAVAILABLE'],
    ['origin', createOriginNotAllowedError(), 403, 'ORIGIN_NOT_ALLOWED'],
    ['csrf', createCsrfTokenInvalidError(), 403, 'CSRF_TOKEN_INVALID'],
    ['unsafe mismatch', createUnsafeRequestPathError('mismatch'), 400, 'UNSAFE_REQUEST_PATH'],
    [
      'unsafe sequence',
      createUnsafeRequestPathError('forbidden-sequence'),
      400,
      'UNSAFE_REQUEST_PATH',
    ],
    ['unsafe encoding', createUnsafeRequestPathError('bad-encoding'), 400, 'UNSAFE_REQUEST_PATH'],
    [
      'not configured',
      createUpstreamNotConfiguredError('GET', '/api/x'),
      502,
      'UPSTREAM_NOT_CONFIGURED',
    ],
    ['upstream down', createUpstreamUnavailableError('Learning'), 502, 'UPSTREAM_UNAVAILABLE'],
    [
      'upstream slow',
      createUpstreamUnavailableError('Identity', 15_000),
      502,
      'UPSTREAM_UNAVAILABLE',
    ],
    ['auth body', createAuthResponseRejectedError('body'), 502, 'UPSTREAM_INVALID_RESPONSE'],
    ['auth cookie', createAuthResponseRejectedError('cookie'), 502, 'UPSTREAM_INVALID_RESPONSE'],
    [
      'auth redirect',
      createAuthResponseRejectedError('redirect'),
      502,
      'UPSTREAM_INVALID_RESPONSE',
    ],
    ['throttle', createTooManyRequestsError('password', 30), 429, 'TOO_MANY_REQUESTS'],
  ];

  it.each(cases)('%s keeps its status and has a stable code', (_name, error, status, code) => {
    expect(error.getStatus()).toBe(status);
    expect(error.code).toBe(code);
    expect(error.message.length).toBeGreaterThan(10);
  });

  it('never leaks hosts, ports or connection details in a message', () => {
    for (const [, error] of cases) {
      expect(error.message).not.toMatch(
        /localhost|127\.0\.0\.1|https?:\/\/|:\d{4}\b|ECONN|ETIMEDOUT/i,
      );
    }
  });

  it('writes every message except CSRF in Vietnamese', () => {
    for (const [name, error] of cases) {
      if (name === 'csrf') continue;
      expect(error.message).toMatch(/[ăâđêôơưáàảãạéèíóòúùý]/i);
    }
  });

  it('keeps the exact CSRF text that the frontend still matches on', () => {
    expect(createCsrfTokenInvalidError().message).toBe('Invalid CSRF token');
  });

  it('names the logical service, and the wait time, when the upstream is slow', () => {
    expect(createUpstreamUnavailableError('Identity', 15_000).message).toMatch(/dịch vụ Identity/i);
    expect(createUpstreamUnavailableError('Identity', 15_000).message).toContain('15 giây');
    expect(createUpstreamUnavailableError('Community').message).toMatch(/dịch vụ Community/i);
  });

  it('tells the caller how long to wait, in seconds or minutes', () => {
    expect(createTooManyRequestsError('password', 30).message).toContain('30 giây');
    expect(createTooManyRequestsError('password', 0.2).message).toContain('1 giây');
    expect(createTooManyRequestsError('password', 600).message).toContain('10 phút');
    expect(createTooManyRequestsError('password', 30).message).toContain('đăng nhập');
    expect(createTooManyRequestsError('password-reset', 30).message).toContain('đặt lại mật khẩu');
    expect(createTooManyRequestsError('default', 30).message).toContain('quá nhanh');
  });

  it('truncates a very long reflected path', () => {
    const error = createUpstreamNotConfiguredError('GET', `/api/${'a'.repeat(5000)}`);
    expect(error.message.length).toBeLessThan(400);
  });

  describe('isApiErrorEnvelope (ERR-001 FR-001: đủ schema và khớp status)', () => {
    const valid = { statusCode: 403, code: 'X', message: 'm', requestId: 'req-1' };

    it('chấp nhận body đủ trường, có hoặc không có details', () => {
      expect(isApiErrorEnvelope(valid, 403)).toBe(true);
      expect(
        isApiErrorEnvelope(
          {
            ...valid,
            details: [
              { field: 'email', code: 'INVALID', message: 'sai' },
              { code: 'A', message: 'b' },
            ],
          },
          403,
        ),
      ).toBe(true);
    });

    it.each([
      ['thiếu statusCode', { code: 'X', message: 'm', requestId: 'r' }],
      ['thiếu requestId', { statusCode: 403, code: 'X', message: 'm' }],
      ['thiếu code', { statusCode: 403, message: 'm', requestId: 'r' }],
      ['thiếu message', { statusCode: 403, code: 'X', requestId: 'r' }],
      ['code rỗng', { ...valid, code: '' }],
      ['message là mảng', { ...valid, message: ['a'] }],
      ['statusCode không phải số', { ...valid, statusCode: '403' }],
      ['statusCode lệch status HTTP', { ...valid, statusCode: 404 }],
      ['details không phải mảng', { ...valid, details: 'x' }],
      ['details thiếu message', { ...valid, details: [{ code: 'A' }] }],
      ['details.field sai kiểu', { ...valid, details: [{ field: 1, code: 'A', message: 'b' }] }],
      ['định dạng cũ', { statusCode: 403, message: 'Forbidden' }],
      ['HTML', '<html>502 Bad Gateway</html>'],
      ['chuỗi rỗng', ''],
      ['null', null],
      ['undefined', undefined],
      ['mảng', ['x']],
    ])('từ chối body %s', (_name, body) => {
      expect(isApiErrorEnvelope(body, 403)).toBe(false);
    });
  });

  it('chấp nhận đúng body mà sendApiError/buildApiError của libs sinh ra (tương thích service thật)', () => {
    const requestId = '0b8f3a52-6c1d-4e7a-9b2f-3d5e8a1c4f70';
    const plain = buildApiError({ status: 409, code: 'USER_LAST_ADMIN', message: 'm', requestId });
    const withDetails = buildApiError({
      status: 400,
      code: 'VALIDATION_FAILED',
      message: 'm',
      details: [{ field: 'email', code: 'INVALID_FORMAT', message: 'sai' }],
      requestId,
    });
    expect(isApiErrorEnvelope(plain, 409)).toBe(true);
    expect(isApiErrorEnvelope(withDetails, 400)).toBe(true);
  });
});
