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
  readLegacyUpstreamMessage,
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

  it('recognises only the shared error envelope', () => {
    expect(isApiErrorEnvelope({ code: 'X', message: 'm', statusCode: 400 })).toBe(true);
    for (const body of [
      { message: 'm' },
      { code: 'X' },
      { code: '', message: 'm' },
      { code: 'X', message: ['a'] },
      '<html>502 Bad Gateway</html>',
      '',
      null,
      undefined,
      ['x'],
    ]) {
      expect(isApiErrorEnvelope(body)).toBe(false);
    }
  });

  it('reads a legacy upstream message only from a plain object', () => {
    expect(readLegacyUpstreamMessage({ message: 'Authentication failed' })).toBe(
      'Authentication failed',
    );
    expect(readLegacyUpstreamMessage({ message: ['a'] })).toBeUndefined();
    expect(readLegacyUpstreamMessage('<html>')).toBeUndefined();
  });
});
