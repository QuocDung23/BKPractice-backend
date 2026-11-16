import {
  describeFrameworkError,
  respondWithError,
  respondWithSanitizedFallback,
} from '@learning/presentation/http/learning-error';
import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';

import { describeProgressError } from '@/modules/progress/presentation/http/progress-errors';

@Catch()
export class CourseReportExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(CourseReportExceptionFilter.name);

  catch(error: unknown, host: ArgumentsHost): void {
    const descriptor = describeProgressError(error) ?? describeFrameworkError(error);
    // Lỗi không nhận diện (kể cả 5xx) đi qua bộ lọc toàn cục: không bị nuốt, không lộ chi tiết nội bộ.
    if (!descriptor) {
      return respondWithSanitizedFallback(
        error,
        host,
        this.logger,
        'Unable to build course report',
      );
    }
    respondWithError(host, descriptor, this.logger);
  }
}
