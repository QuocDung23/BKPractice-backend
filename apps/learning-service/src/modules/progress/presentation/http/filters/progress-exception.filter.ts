import {
  describeFrameworkError,
  respondWithError,
  respondWithSanitizedFallback,
} from '@learning/presentation/http/learning-error';
import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';

import { describeProgressError } from '@/modules/progress/presentation/http/progress-errors';

@Catch()
export class ProgressExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProgressExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const descriptor = describeProgressError(exception) ?? describeFrameworkError(exception);
    // Lỗi không nhận diện (kể cả 5xx) đi qua bộ lọc toàn cục: không bị nuốt, không lộ chi tiết nội bộ.
    if (!descriptor) {
      return respondWithSanitizedFallback(
        exception,
        host,
        this.logger,
        'Unexpected error while reading personal progress',
      );
    }
    respondWithError(host, descriptor, this.logger);
  }
}
