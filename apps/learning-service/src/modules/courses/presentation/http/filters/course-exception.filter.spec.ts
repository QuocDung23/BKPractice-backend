import { AppHttpException } from '@app/common';
import { createFakeHttpHost } from '@learning/presentation/http/testing/fake-http-host';
import { BadRequestException, Logger } from '@nestjs/common';

import { CourseNotFoundError } from '@/modules/courses/application/errors';
import { CourseExceptionFilter } from '@/modules/courses/presentation/http/filters/course-exception.filter';

describe('CourseExceptionFilter', () => {
  const filter = new CourseExceptionFilter();

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('answers a course error with the shared body and its own code', () => {
    const fake = createFakeHttpHost({ 'x-request-id': '123e4567-e89b-42d3-a456-426614174000' });

    filter.catch(new CourseNotFoundError('Course not found'), fake.host);

    expect(fake.status()).toBe(404);
    expect(fake.body()).toEqual({
      statusCode: 404,
      code: 'COURSE_NOT_FOUND',
      message: 'Không tìm thấy khóa học này, hoặc khóa học không khả dụng.',
      requestId: '123e4567-e89b-42d3-a456-426614174000',
    });
  });

  it('keeps the code, message and details of a validation error from the global pipe', () => {
    const fake = createFakeHttpHost();
    const error = new AppHttpException(
      400,
      'VALIDATION_FAILED',
      'Dữ liệu gửi lên chưa hợp lệ: 1 trường cần sửa.',
      [{ field: 'title', code: 'REQUIRED', message: 'Trường "title" là bắt buộc.' }],
    );

    filter.catch(error, fake.host);

    expect(fake.status()).toBe(400);
    expect(fake.body()).toMatchObject({
      code: 'VALIDATION_FAILED',
      details: [{ field: 'title', code: 'REQUIRED' }],
    });
  });

  it('turns the array message of a plain ValidationPipe into details with a string message', () => {
    const fake = createFakeHttpHost();

    filter.catch(new BadRequestException(['title must be a string']), fake.host);

    expect(fake.body().code).toBe('VALIDATION_FAILED');
    expect(typeof fake.body().message).toBe('string');
    expect(fake.body().details).toHaveLength(1);
  });

  it('explains a malformed UUID in the path', () => {
    const fake = createFakeHttpHost();

    filter.catch(new BadRequestException('Validation failed (uuid is expected)'), fake.host);

    expect(fake.status()).toBe(400);
    expect(fake.body().code).toBe('INVALID_PATH_PARAMETER');
  });

  it('answers an unexpected error with 500, a reference code and no internal detail', () => {
    const fake = createFakeHttpHost({ 'x-request-id': '9b2c7d1e-5f3a-4c8b-8d6e-0a1b2c3d4e5f' });

    filter.catch(new Error('connection string secret'), fake.host);

    expect(fake.status()).toBe(500);
    expect(fake.body().code).toBe('INTERNAL_ERROR');
    expect(fake.body().message).toContain('9b2c7d1e-5f3a-4c8b-8d6e-0a1b2c3d4e5f');
    expect(JSON.stringify(fake.body())).not.toContain('connection string secret');
  });
});
