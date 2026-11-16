import {
  describeFrameworkError,
  respondWithSanitizedFallback,
  translateDomainMessage,
} from '@learning/presentation/http/learning-error';
import { createFakeHttpHost } from '@learning/presentation/http/testing/fake-http-host';
import { BadRequestException, HttpStatus, Logger, ParseUUIDPipe } from '@nestjs/common';

describe('translateDomainMessage', () => {
  it.each([
    ['title', 'title must not be empty', 'REQUIRED', 'Trường "title" không được để trống.'],
    [
      'title',
      'title must be at most 200 characters',
      'TOO_LONG',
      'Trường "title" chỉ được có tối đa 200 ký tự.',
    ],
    [
      'id',
      'id must be a canonical UUID',
      'INVALID_FORMAT',
      'Trường "id" phải là mã UUID viết thường, đúng định dạng.',
    ],
    [
      'limit',
      'limit must be an integer between 1 and 50',
      'OUT_OF_RANGE',
      'Trường "limit" phải là số nguyên từ 1 đến 50.',
    ],
    [
      'tags',
      'tags must not contain duplicates',
      'DUPLICATE_VALUE',
      'Trường "tags" không được chứa giá trị trùng nhau.',
    ],
    [
      'level',
      'level must be one of: EASY, HARD',
      'NOT_ALLOWED',
      'Trường "level" chỉ nhận một trong các giá trị: EASY, HARD.',
    ],
    ['description', 'description contains unsafe content', 'UNSAFE_CONTENT', undefined],
    [
      'starterCodes.language',
      'starter code language rust is not enabled',
      'NOT_ALLOWED',
      undefined,
    ],
    ['chapterOrder', 'Reorder must include all chapters', 'INCONSISTENT', undefined],
  ])('%s: "%s" becomes a Vietnamese %s detail', (field, message, code, expected) => {
    const detail = translateDomainMessage(field, message);

    expect(detail.field).toBe(field);
    expect(detail.code).toBe(code);
    if (expected) expect(detail.message).toBe(expected);
    expect(detail.message).not.toMatch(/\bmust\b|\bnot\b.*\bis\b/i);
  });

  it('falls back to a Vietnamese sentence naming the field, never to the English text', () => {
    const detail = translateDomainMessage('mystery', 'something odd happened internally');

    expect(detail).toEqual({
      field: 'mystery',
      code: 'INVALID',
      message: 'Trường "mystery" không hợp lệ.',
    });
  });
});

describe('describeFrameworkError', () => {
  it('explains a malformed path UUID', async () => {
    const error = await new ParseUUIDPipe()
      .transform('not-a-uuid', { type: 'param', data: 'id' })
      .catch((cause: unknown) => cause);

    expect(describeFrameworkError(error)).toEqual({
      status: 400,
      code: 'INVALID_PATH_PARAMETER',
      message: 'Tham số trên đường dẫn không đúng định dạng: cần mã định danh dạng UUID.',
    });
  });

  it('ignores other HTTP errors so the global filter handles them', () => {
    expect(describeFrameworkError(new BadRequestException('other'))).toBeNull();
    expect(describeFrameworkError(new Error('boom'))).toBeNull();
  });
});

describe('respondWithSanitizedFallback', () => {
  afterEach(() => jest.restoreAllMocks());

  it('logs only the fixed sentence and answers 500 with the shared body for an unknown error', () => {
    const logger = new Logger('test');
    const errorLog = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const fake = createFakeHttpHost({ 'x-request-id': '123e4567-e89b-42d3-a456-426614174000' });

    respondWithSanitizedFallback(
      new Error('postgres://private-secret'),
      fake.host,
      logger,
      'Fixed log',
    );

    expect(fake.status()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(fake.body()).toMatchObject({
      code: 'INTERNAL_ERROR',
      requestId: '123e4567-e89b-42d3-a456-426614174000',
    });
    expect(errorLog).toHaveBeenCalledWith('Fixed log');
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain('private-secret');
  });

  it('keeps classified errors (dependency down) on the global filter path', () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const fake = createFakeHttpHost();

    respondWithSanitizedFallback(
      Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }),
      fake.host,
      new Logger('test'),
      'Fixed log',
    );

    expect(fake.status()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    expect(fake.body().code).toBe('DEPENDENCY_UNAVAILABLE');
  });
});
