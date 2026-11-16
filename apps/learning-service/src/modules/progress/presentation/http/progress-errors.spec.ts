import { UnauthorizedError } from '@/modules/problems/application/errors/unauthorized.error';
import { CourseProgressNotFoundError } from '@/modules/progress/application/errors';
import {
  CourseReportForbiddenError,
  CourseReportNotFoundError,
} from '@/modules/progress/application/reports/get-student-course-report.use-case';
import { RemoteReportUnavailableError } from '@/modules/progress/infrastructure/reports/remote-course-report.reader';
import {
  PROGRESS_ERROR_CODES,
  describeProgressError,
} from '@/modules/progress/presentation/http/progress-errors';

describe('progress error catalog', () => {
  it('uses a unique code for every error', () => {
    const codes = Object.values(PROGRESS_ERROR_CODES);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it.each([
    [new UnauthorizedError(), 401, 'AUTH_PRINCIPAL_INVALID'],
    [new CourseProgressNotFoundError(), 404, 'PROGRESS_COURSE_NOT_FOUND'],
    [new CourseReportForbiddenError(), 403, 'PROGRESS_REPORT_FORBIDDEN'],
    [new CourseReportNotFoundError(), 404, 'PROGRESS_REPORT_COURSE_NOT_FOUND'],
    [new RemoteReportUnavailableError(), 503, 'PROGRESS_REPORT_DEPENDENCY_UNAVAILABLE'],
  ])('maps %s to %i %s with a Vietnamese message', (exception, status, code) => {
    const descriptor = describeProgressError(exception);

    expect(descriptor).toMatchObject({ status, code });
    expect(descriptor?.message).toMatch(/[ăâđêôơưáàảãạéèẻẽẹíìỉĩịóòỏõọúùủũụýỳỷỹỵ]/i);
  });

  it('returns null for errors that are not progress errors', () => {
    expect(describeProgressError(new Error('boom'))).toBeNull();
  });
});
