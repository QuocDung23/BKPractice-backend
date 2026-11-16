import {
  describeFrameworkError,
  respondWithError,
  respondWithSanitizedFallback,
} from '@learning/presentation/http/learning-error';
import type { ExceptionFilter } from '@nestjs/common';
import { ArgumentsHost, Catch, Logger } from '@nestjs/common';

import { describeQuizException } from '@/modules/quizzes/presentation/http/quiz-errors';

@Catch()
export class QuizExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(QuizExceptionFilter.name);

  catch(error: unknown, host: ArgumentsHost): void {
    const descriptor = describeQuizException(error) ?? describeFrameworkError(error);
    // Lỗi không nhận diện (kể cả 5xx) đi qua bộ lọc toàn cục: không bị nuốt, không lộ chi tiết nội bộ.
    if (!descriptor) {
      return respondWithSanitizedFallback(error, host, this.logger, 'Quiz operation failed');
    }
    respondWithError(host, descriptor, this.logger);
  }
}
