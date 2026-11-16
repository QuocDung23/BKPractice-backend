import { ApplicationError } from '@learning/modules/problems/application/errors/application.error';
import { ConcurrentModificationError } from '@learning/modules/problems/application/errors/concurrent-modification.error';
import { ForbiddenError } from '@learning/modules/problems/application/errors/forbidden.error';
import { HarnessNotFoundError } from '@learning/modules/problems/application/errors/harness-not-found.error';
import { ProblemNotFoundError } from '@learning/modules/problems/application/errors/problem-not-found.error';
import { PublishNotReadyError } from '@learning/modules/problems/application/errors/publish-not-ready.error';
import { TestCaseNotFoundError } from '@learning/modules/problems/application/errors/test-case-not-found.error';
import { UnauthorizedError } from '@learning/modules/problems/application/errors/unauthorized.error';
import { UnknownReferenceError } from '@learning/modules/problems/application/errors/unknown-reference.error';
import { DomainValidationError } from '@learning/modules/problems/domain/errors/domain-validation.error';
import { DuplicateSlugError } from '@learning/modules/problems/domain/errors/duplicate-slug.error';
import { InvalidProblemState } from '@learning/modules/problems/domain/errors/invalid-problem-state.error';
import { createFakeHttpHost } from '@learning/presentation/http/testing/fake-http-host';
import { HttpStatus, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { ProblemExceptionFilter } from './problem-exception.filter';

describe('ProblemExceptionFilter', () => {
  let filter: ProblemExceptionFilter;

  beforeEach(async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const moduleRef = await Test.createTestingModule({
      providers: [ProblemExceptionFilter],
    }).compile();

    filter = moduleRef.get(ProblemExceptionFilter);
  });

  afterEach(() => jest.restoreAllMocks());

  it.each([
    [
      new DomainValidationError('title', 'title must not be empty'),
      HttpStatus.BAD_REQUEST,
      'PROBLEM_FIELD_INVALID',
    ],
    [
      new UnknownReferenceError([{ kind: 'topic', id: '1' }]),
      HttpStatus.BAD_REQUEST,
      'PROBLEM_REFERENCE_UNKNOWN',
    ],
    [new PublishNotReadyError([]), HttpStatus.BAD_REQUEST, 'PROBLEM_NOT_READY_TO_PUBLISH'],
    [new UnauthorizedError(), HttpStatus.UNAUTHORIZED, 'AUTH_PRINCIPAL_INVALID'],
    [new ForbiddenError(), HttpStatus.FORBIDDEN, 'PROBLEM_FORBIDDEN'],
    [new ProblemNotFoundError('id'), HttpStatus.NOT_FOUND, 'PROBLEM_NOT_FOUND'],
    [new TestCaseNotFoundError('case-1'), HttpStatus.NOT_FOUND, 'TEST_CASE_NOT_FOUND'],
    [new HarnessNotFoundError('problem-1', 'python'), HttpStatus.NOT_FOUND, 'HARNESS_NOT_FOUND'],
    [new DuplicateSlugError('slug'), HttpStatus.CONFLICT, 'PROBLEM_SLUG_ALREADY_EXISTS'],
    [new InvalidProblemState('field', 'message'), HttpStatus.CONFLICT, 'PROBLEM_STATE_INVALID'],
    [new ConcurrentModificationError(), HttpStatus.CONFLICT, 'PROBLEM_CONCURRENT_MODIFICATION'],
  ])('maps %s to HTTP %d with code %s and the shared body', (exception, status, code) => {
    const fake = createFakeHttpHost({ 'x-request-id': '123e4567-e89b-42d3-a456-426614174000' });

    filter.catch(exception, fake.host);

    expect(fake.status()).toBe(status);
    expect(fake.body()).toMatchObject({
      statusCode: status,
      code,
      requestId: '123e4567-e89b-42d3-a456-426614174000',
    });
    expect(typeof fake.body().message).toBe('string');
    expect(fake.body().message).not.toMatch(/\b(not found|forbidden|required|invalid)\b/i);
  });

  it('turns PublishNotReadyError issues into Vietnamese details', () => {
    const exception = new PublishNotReadyError([
      { code: 'TITLE_REQUIRED', field: 'title', message: 'A problem title is required' },
      { code: 'ENABLED_LANGUAGE_REQUIRED', message: 'At least one language must be enabled' },
    ]);
    const fake = createFakeHttpHost();

    filter.catch(exception, fake.host);

    expect(fake.status()).toBe(HttpStatus.BAD_REQUEST);
    expect(fake.body()).toMatchObject({
      message: 'Bài tập chưa đủ điều kiện xuất bản: còn 2 mục cần hoàn thiện.',
      details: [
        {
          field: 'title',
          code: 'TITLE_REQUIRED',
          message: 'Bài tập cần có tiêu đề. (trường "title")',
        },
        { code: 'ENABLED_LANGUAGE_REQUIRED', message: 'Cần bật ít nhất một ngôn ngữ lập trình.' },
      ],
    });
  });

  it('unknown ApplicationError subclass maps to 500 without leaking its message', () => {
    class UnknownError extends ApplicationError {
      readonly code = 'UNKNOWN';
      constructor() {
        super('postgres://private-secret');
      }
    }

    const fake = createFakeHttpHost({ 'x-request-id': '9b2c7d1e-5f3a-4c8b-8d6e-0a1b2c3d4e5f' });
    filter.catch(new UnknownError(), fake.host);

    expect(fake.status()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(fake.body().code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(fake.body())).not.toContain('private-secret');
  });
});
