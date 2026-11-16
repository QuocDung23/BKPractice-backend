import { ApplicationError } from '@learning/modules/problems/application/errors/application.error';
import { DomainValidationError } from '@learning/modules/problems/domain/errors/domain-validation.error';
import { DuplicateSlugError } from '@learning/modules/problems/domain/errors/duplicate-slug.error';
import { InvalidProblemState } from '@learning/modules/problems/domain/errors/invalid-problem-state.error';
import { describeProblemError } from '@learning/modules/problems/presentation/http/filters/problem-errors';
import {
  respondWithError,
  respondWithGlobalFilter,
} from '@learning/presentation/http/learning-error';
import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';

@Catch(DomainValidationError, InvalidProblemState, DuplicateSlugError, ApplicationError)
export class ProblemExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemExceptionFilter.name);

  catch(
    exception: DomainValidationError | InvalidProblemState | DuplicateSlugError | ApplicationError,
    host: ArgumentsHost,
  ): void {
    const descriptor = describeProblemError(exception);
    // Lỗi không nhận diện (ví dụ ApplicationError mới chưa có mã) đi qua bộ lọc toàn cục thành 500.
    if (!descriptor) return respondWithGlobalFilter(exception, host);
    respondWithError(host, descriptor, this.logger);
  }
}
