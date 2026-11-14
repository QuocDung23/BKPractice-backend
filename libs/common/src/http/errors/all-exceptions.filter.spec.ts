import type { ApiErrorBody } from '@app/contracts';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';

import { AllExceptionsFilter } from './all-exceptions.filter';
import { AppHttpException } from './api-error';

function run(exception: unknown, headers: Record<string, string> = {}) {
  let status = 0;
  let body: ApiErrorBody | undefined;
  const response = {
    setHeader: jest.fn(),
    status(code: number) {
      status = code;
      return { json: (payload: ApiErrorBody) => (body = payload) };
    },
  };
  const request = { method: 'POST', headers };
  const host = {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  } as unknown as ArgumentsHost;
  new AllExceptionsFilter().catch(exception, host);
  return { status, body: body as ApiErrorBody };
}

describe('AllExceptionsFilter', () => {
  beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  it('giữ nguyên code, message và details của AppHttpException (FR-001)', () => {
    const { status, body } = run(
      new AppHttpException(409, 'USER_EMAIL_ALREADY_EXISTS', 'Email đã được dùng.', [
        { field: 'email', code: 'ALREADY_EXISTS', message: 'Trùng email.' },
      ]),
      { 'x-request-id': 'req-12345678' },
    );
    expect(status).toBe(409);
    expect(body).toEqual({
      statusCode: 409,
      code: 'USER_EMAIL_ALREADY_EXISTS',
      message: 'Email đã được dùng.',
      details: [{ field: 'email', code: 'ALREADY_EXISTS', message: 'Trùng email.' }],
      requestId: 'req-12345678',
    });
  });

  it('sinh requestId khi header thiếu hoặc không an toàn (FR-012)', () => {
    const missing = run(new NotFoundException('Post not found'));
    const unsafe = run(new NotFoundException('Post not found'), { 'x-request-id': '<script>' });
    expect(missing.body.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(unsafe.body.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('Việt hóa lỗi route không tồn tại của Nest', () => {
    const { status, body } = run(new NotFoundException('Cannot GET /api/xyz'));
    expect(status).toBe(404);
    expect(body.code).toBe('NOT_FOUND');
    expect(body.message).toBe('Không tìm thấy đường dẫn: GET /api/xyz.');
  });

  it('đưa message dạng mảng của ValidationPipe mặc định vào details, message luôn là chuỗi', () => {
    const { body } = run(new BadRequestException(['a must be a string', 'b should not exist']));
    expect(body.code).toBe('VALIDATION_FAILED');
    expect(typeof body.message).toBe('string');
    expect(body.details).toHaveLength(2);
  });

  it('JSON sai định dạng trả INVALID_JSON', () => {
    const { status, body } = run(
      Object.assign(new SyntaxError('Unexpected token'), { type: 'entity.parse.failed' }),
    );
    expect(status).toBe(400);
    expect(body.code).toBe('INVALID_JSON');
  });

  it('vi phạm unique của Postgres trả 409 mà không lộ tên constraint (AC-010)', () => {
    const error = Object.assign(
      new Error('duplicate key value violates unique constraint "users_email_key"'),
      {
        name: 'QueryFailedError',
        driverError: { code: '23505', constraint: 'users_email_key' },
      },
    );
    const { status, body } = run(error);
    expect(status).toBe(409);
    expect(body.code).toBe('CONFLICT_DUPLICATE');
    expect(JSON.stringify(body)).not.toMatch(/users_email_key|duplicate key/);
  });

  it('mất kết nối DB trả 503 DEPENDENCY_UNAVAILABLE', () => {
    const { status, body } = run(
      Object.assign(new Error('connect ECONNREFUSED 10.0.0.5:5432'), { code: 'ECONNREFUSED' }),
    );
    expect(status).toBe(503);
    expect(body.code).toBe('DEPENDENCY_UNAVAILABLE');
    expect(JSON.stringify(body)).not.toMatch(/10\.0\.0\.5|5432/);
  });

  it('lỗi không lường trước trả 500 không lộ nội bộ nhưng kèm requestId (AC-007)', () => {
    const { status, body } = run(
      new Error('SELECT * FROM users WHERE password_hash = x at /home/app/src/secret.ts:10'),
      { 'x-request-id': 'req-abcdefgh' },
    );
    expect(status).toBe(500);
    expect(body.code).toBe('INTERNAL_ERROR');
    expect(body.message).toContain('req-abcdefgh');
    expect(JSON.stringify(body)).not.toMatch(/SELECT|password_hash|\/home\/|secret\.ts/);
  });
});
