import { createFakeHttpHost } from '@learning/presentation/http/testing/fake-http-host';
import { Logger } from '@nestjs/common';

import { CourseProgressNotFoundError } from '@/modules/progress/application/errors';
import { CourseReportNotFoundError } from '@/modules/progress/application/reports/get-student-course-report.use-case';
import { ProgressExceptionFilter } from '@/modules/progress/presentation/http/filters/progress-exception.filter';
import { CourseReportExceptionFilter } from '@/modules/progress/presentation/http/student-course-report.filter';

describe.each([
  [
    'ProgressExceptionFilter',
    new ProgressExceptionFilter(),
    new CourseProgressNotFoundError(),
    'PROGRESS_COURSE_NOT_FOUND',
    'Unexpected error while reading personal progress',
  ],
  [
    'CourseReportExceptionFilter',
    new CourseReportExceptionFilter(),
    new CourseReportNotFoundError(),
    'PROGRESS_REPORT_COURSE_NOT_FOUND',
    'Unable to build course report',
  ],
])('%s', (_name, filter, known, code, fixedLog) => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('answers a known error with the shared body and its own code', () => {
    const fake = createFakeHttpHost({ 'x-request-id': '123e4567-e89b-42d3-a456-426614174000' });

    filter.catch(known, fake.host);

    expect(fake.status()).toBe(404);
    expect(fake.body()).toMatchObject({
      statusCode: 404,
      code,
      requestId: '123e4567-e89b-42d3-a456-426614174000',
    });
  });

  it('logs only a fixed sentence and answers 500 for an unexpected error', () => {
    const errorLog = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const fake = createFakeHttpHost();

    filter.catch(new Error('postgres://private-secret'), fake.host);

    expect(fake.status()).toBe(500);
    expect(fake.body().code).toBe('INTERNAL_ERROR');
    expect(errorLog).toHaveBeenCalledWith(fixedLog);
    expect(JSON.stringify([fake.body(), errorLog.mock.calls])).not.toContain('private-secret');
  });
});
