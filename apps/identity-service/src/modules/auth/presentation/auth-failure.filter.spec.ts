import type { ApiErrorBody } from '@app/contracts';
import { Logger } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';

import { AuthFailure } from '@/modules/auth/domain';
import type { AuthFailureCode } from '@/modules/auth/domain';
import {
  AUTH_ERROR_RESPONSES,
  AuthFailureFilter,
} from '@/modules/auth/presentation/auth-failure.filter';

function run(code: AuthFailureCode) {
  let status = 0;
  let body: ApiErrorBody | undefined;
  const response = {
    setHeader: jest.fn(),
    status(value: number) {
      status = value;
      return { json: (payload: ApiErrorBody) => (body = payload) };
    },
  };
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({
        method: 'POST',
        headers: { 'x-request-id': '0b8f3a52-6c1d-4e7a-9b2f-3d5e8a1c4f70' },
      }),
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;
  new AuthFailureFilter().catch(new AuthFailure(code), host);
  return { status, body: body as ApiErrorBody };
}

describe('AuthFailureFilter', () => {
  beforeEach(() => jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  it.each([
    ['account_not_found', 401, 'AUTH_ACCOUNT_NOT_FOUND'],
    ['wrong_password', 401, 'AUTH_WRONG_PASSWORD'],
    ['identifier_ambiguous', 409, 'AUTH_IDENTIFIER_AMBIGUOUS'],
    ['account_deleted', 403, 'AUTH_ACCOUNT_DELETED'],
    ['account_locked', 403, 'AUTH_ACCOUNT_LOCKED'],
    ['account_pending', 403, 'AUTH_ACCOUNT_PENDING'],
    ['invalid_credentials', 401, 'AUTH_CREDENTIALS_INVALID'],
    ['invalid_token', 401, 'AUTH_SESSION_INVALID'],
    ['dependency_unavailable', 503, 'AUTH_SERVICE_UNAVAILABLE'],
  ] as const)(
    '%s trả %i %s theo định dạng chung (ERR-001 FR-001, FR-007)',
    (failure, status, code) => {
      const result = run(failure);
      expect(result.status).toBe(status);
      expect(result.body).toEqual({
        statusCode: status,
        code,
        message: expect.any(String) as string,
        requestId: '0b8f3a52-6c1d-4e7a-9b2f-3d5e8a1c4f70',
      });
    },
  );

  it('mọi mã lỗi có code riêng, không trùng nhau', () => {
    const codes = Object.values(AUTH_ERROR_RESPONSES).map((item) => item.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('luồng chung (Microsoft, refresh) không nêu tài khoản có tồn tại hay không (FR-008)', () => {
    for (const failure of ['invalid_credentials', 'invalid_token'] as const) {
      expect(run(failure).body.message).not.toMatch(
        /không tìm thấy tài khoản|đã bị xóa|bị khóa|chưa được kích hoạt/i,
      );
    }
  });
});
