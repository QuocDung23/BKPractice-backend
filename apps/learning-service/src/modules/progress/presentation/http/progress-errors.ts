import {
  describePrincipalError,
  LEARNING_AUTH_ERROR_CODES,
} from '@learning/presentation/http/learning-error';
import type { ErrorDescriptor } from '@learning/presentation/http/learning-error';

import { UnauthorizedError } from '@/modules/problems/application/errors/unauthorized.error';
import { CourseProgressNotFoundError } from '@/modules/progress/application/errors';
import {
  CourseReportForbiddenError,
  CourseReportNotFoundError,
} from '@/modules/progress/application/reports/get-student-course-report.use-case';
import { RemoteReportUnavailableError } from '@/modules/progress/infrastructure/reports/remote-course-report.reader';

/** Mã lỗi ổn định của module progress và báo cáo khóa học (spec ERR-001 FR-002, FR-009). */
export const PROGRESS_ERROR_CODES = {
  courseNotFound: 'PROGRESS_COURSE_NOT_FOUND',
  reportForbidden: 'PROGRESS_REPORT_FORBIDDEN',
  reportCourseNotFound: 'PROGRESS_REPORT_COURSE_NOT_FOUND',
  reportDependencyUnavailable: 'PROGRESS_REPORT_DEPENDENCY_UNAVAILABLE',
  principalInvalid: LEARNING_AUTH_ERROR_CODES.principalInvalid,
} as const;

/** Trả về `null` khi không phải lỗi của module progress để bộ lọc toàn cục xử lý. */
export function describeProgressError(exception: unknown): ErrorDescriptor | null {
  if (exception instanceof UnauthorizedError) return describePrincipalError();
  if (exception instanceof CourseProgressNotFoundError) {
    return {
      status: 404,
      code: PROGRESS_ERROR_CODES.courseNotFound,
      message:
        'Không tìm thấy khóa học này, hoặc khóa học chưa được xuất bản nên chưa có tiến độ học.',
    };
  }
  if (exception instanceof CourseReportForbiddenError) {
    return {
      status: 403,
      code: PROGRESS_ERROR_CODES.reportForbidden,
      message:
        'Bạn không có quyền xem báo cáo khóa học này. Báo cáo chỉ dành cho quản trị viên hoặc giảng viên tạo khóa học và có quyền "course:read-managed".',
    };
  }
  if (exception instanceof CourseReportNotFoundError) {
    return {
      status: 404,
      code: PROGRESS_ERROR_CODES.reportCourseNotFound,
      message: 'Không tìm thấy khóa học cần lập báo cáo.',
    };
  }
  if (exception instanceof RemoteReportUnavailableError) {
    return {
      status: 503,
      code: PROGRESS_ERROR_CODES.reportDependencyUnavailable,
      message:
        'Không lấy được dữ liệu báo cáo vì một dịch vụ phụ trợ (danh sách sinh viên hoặc số lượt nộp bài) tạm thời không phản hồi. Vui lòng thử lại sau.',
    };
  }
  return null;
}
