import { createFakeHttpHost } from '@learning/presentation/http/testing/fake-http-host';
import { BadRequestException, Logger } from '@nestjs/common';

import { QuizError } from '@/modules/quizzes/domain';
import { QuizExceptionFilter } from '@/modules/quizzes/presentation/http/quiz-exception.filter';

describe('QuizExceptionFilter', () => {
  const filter = new QuizExceptionFilter();

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('answers a quiz error with the shared body, its status and its own code', () => {
    const fake = createFakeHttpHost({ 'x-request-id': '123e4567-e89b-42d3-a456-426614174000' });

    filter.catch(new QuizError('CONFLICT', 'Attempt is finished'), fake.host);

    expect(fake.status()).toBe(409);
    expect(fake.body()).toEqual({
      statusCode: 409,
      code: 'QUIZ_ATTEMPT_FINISHED',
      message: 'Lượt làm bài này đã kết thúc nên không thể trả lời thêm.',
      requestId: '123e4567-e89b-42d3-a456-426614174000',
    });
  });

  it('explains a malformed UUID in the path', () => {
    const fake = createFakeHttpHost();

    filter.catch(new BadRequestException('Validation failed (uuid is expected)'), fake.host);

    expect(fake.body().code).toBe('INVALID_PATH_PARAMETER');
  });

  it('logs only a fixed sentence and answers 500 for an unexpected error', () => {
    const errorLog = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const fake = createFakeHttpHost();

    filter.catch(new Error('postgres://private-secret'), fake.host);

    expect(fake.status()).toBe(500);
    expect(fake.body().code).toBe('INTERNAL_ERROR');
    expect(errorLog).toHaveBeenCalledWith('Quiz operation failed');
    expect(JSON.stringify([fake.body(), errorLog.mock.calls])).not.toContain('private-secret');
  });
});
