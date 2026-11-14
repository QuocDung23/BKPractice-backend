import {
  describeFrameworkError,
  respondWithError,
  respondWithGlobalFilter,
} from '@learning/presentation/http/learning-error';
import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';

import { describeCourseError } from '@/modules/courses/presentation/http/filters/course-errors';

@Catch()
export class CourseExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(CourseExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const descriptor = describeCourseError(exception) ?? describeFrameworkError(exception);
    // Lỗi không nhận diện (kể cả 5xx) đi qua bộ lọc toàn cục: không bị nuốt, không lộ chi tiết nội bộ.
    if (!descriptor) return respondWithGlobalFilter(exception, host);
    respondWithError(host, descriptor, this.logger);
  }
}
