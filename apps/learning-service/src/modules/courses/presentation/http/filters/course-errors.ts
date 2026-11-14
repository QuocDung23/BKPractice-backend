import type { ApiErrorDetail } from '@app/contracts';
import { UnauthorizedError as TrustedPrincipalUnauthorizedError } from '@learning/modules/problems/application/errors/unauthorized.error';
import {
  describePrincipalError,
  labelAction,
  labelPublishStatus,
  LEARNING_AUTH_ERROR_CODES,
  translateDomainMessage,
} from '@learning/presentation/http/learning-error';
import type { ErrorDescriptor } from '@learning/presentation/http/learning-error';

import {
  ConcurrentModificationError,
  CourseNotFoundError,
  CourseNotReadyError,
  DuplicateCourseSlugError,
  ForbiddenError,
  ProblemNotAttachableError,
  UnauthorizedError,
} from '@/modules/courses/application/errors';
import {
  ChapterNotFound,
  DomainValidationError,
  InvalidCourseState,
  ProblemAlreadyInCourse,
} from '@/modules/courses/domain/errors';

/** Mã lỗi ổn định của module courses và chapters (spec ERR-001 FR-002, FR-009). */
export const COURSE_ERROR_CODES = {
  fieldInvalid: 'COURSE_FIELD_INVALID',
  orderInvalid: 'COURSE_ORDER_INVALID',
  slugReserved: 'COURSE_SLUG_RESERVED',
  notReady: 'COURSE_NOT_READY',
  problemNotAttachable: 'COURSE_PROBLEM_NOT_ATTACHABLE',
  problemNotInChapter: 'COURSE_PROBLEM_NOT_IN_CHAPTER',
  problemAlreadyAttached: 'COURSE_PROBLEM_ALREADY_ATTACHED',
  notFound: 'COURSE_NOT_FOUND',
  quizNotAvailable: 'COURSE_QUIZ_NOT_AVAILABLE',
  chapterNotFound: 'CHAPTER_NOT_FOUND',
  slugAlreadyExists: 'COURSE_SLUG_ALREADY_EXISTS',
  concurrentModification: 'COURSE_CONCURRENT_MODIFICATION',
  forbidden: 'COURSE_FORBIDDEN',
  notOwner: 'COURSE_NOT_OWNER',
  deletedCannotModify: 'COURSE_DELETED_CANNOT_MODIFY',
  onHoldCannotModify: 'COURSE_ON_HOLD_CANNOT_MODIFY',
  notEditable: 'COURSE_NOT_EDITABLE',
  statusTransitionInvalid: 'COURSE_STATUS_TRANSITION_INVALID',
  alreadyDeleted: 'COURSE_ALREADY_DELETED',
  notDeleted: 'COURSE_NOT_DELETED',
  deleteStateInvalid: 'COURSE_DELETE_STATE_INVALID',
  stateInvalid: 'COURSE_STATE_INVALID',
} as const;

/** Thông báo tiếng Việt cho từng mã vấn đề khi kiểm tra điều kiện xuất bản khóa học. */
const READINESS_MESSAGES: Readonly<Record<string, string>> = {
  TITLE_REQUIRED: 'Khóa học cần có tiêu đề.',
  CHAPTER_REQUIRED: 'Khóa học cần có ít nhất một chương.',
  PUBLISHED_CONTENT_REQUIRED:
    'Khóa học cần có ít nhất một bài tập hoặc bài kiểm tra đã xuất bản (và chưa bị xóa hay tạm ngưng).',
};

export function describeReadinessIssue(issue: string): ApiErrorDetail {
  return {
    code: issue,
    message: READINESS_MESSAGES[issue] ?? 'Khóa học chưa đạt điều kiện xuất bản.',
  };
}

const ORDER_FIELDS: ReadonlySet<string> = new Set(['chapterOrder', 'problemOrder', 'ids']);

function describeDomainValidation(exception: DomainValidationError): ErrorDescriptor {
  const detail = translateDomainMessage(exception.field, exception.message);
  const reserved = exception.message === 'This slug is reserved for course management';
  const notInChapter = exception.message === 'Problem not in chapter';
  const notAttachable = exception.message === 'Problem is not attachable';
  const code = reserved
    ? COURSE_ERROR_CODES.slugReserved
    : notInChapter
      ? COURSE_ERROR_CODES.problemNotInChapter
      : notAttachable
        ? COURSE_ERROR_CODES.problemNotAttachable
        : ORDER_FIELDS.has(exception.field)
          ? COURSE_ERROR_CODES.orderInvalid
          : COURSE_ERROR_CODES.fieldInvalid;
  return { status: 400, code, message: detail.message, details: [detail] };
}

function describeInvalidState(exception: InvalidCourseState): ErrorDescriptor {
  const message = exception.message;
  const base = { status: 409 } as const;
  const deleted = /^A deleted course cannot be (\w+)$/.exec(message);
  if (deleted) {
    return {
      ...base,
      code: COURSE_ERROR_CODES.deletedCannotModify,
      message: `Khóa học đã bị xóa nên không thể ${labelAction(deleted[1] ?? '')}. Hãy khôi phục khóa học trước.`,
    };
  }
  if (message === 'A course on hold cannot be updated') {
    return {
      ...base,
      code: COURSE_ERROR_CODES.onHoldCannotModify,
      message: 'Khóa học đang tạm ngưng nên không thể cập nhật. Hãy xuất bản lại khóa học trước.',
    };
  }
  if (message === 'Course is not editable') {
    return {
      ...base,
      code: COURSE_ERROR_CODES.notEditable,
      message:
        'Khóa học đã bị xóa hoặc đang tạm ngưng nên không thể chỉnh sửa. Hãy khôi phục hoặc xuất bản lại khóa học trước.',
    };
  }
  const transition = /^Cannot (publish|hold|republish) a course with status (\w+)$/.exec(message);
  if (transition) {
    return {
      ...base,
      code: COURSE_ERROR_CODES.statusTransitionInvalid,
      message: `Không thể ${labelAction(transition[1] ?? '')} khóa học đang ở trạng thái "${labelPublishStatus(transition[2] ?? '')}".`,
    };
  }
  if (message === 'The course is already deleted') {
    return {
      ...base,
      code: COURSE_ERROR_CODES.alreadyDeleted,
      message: 'Khóa học này đã bị xóa từ trước.',
    };
  }
  if (message === 'The course is not deleted') {
    return {
      ...base,
      code: COURSE_ERROR_CODES.notDeleted,
      message: 'Khóa học này chưa bị xóa nên không cần khôi phục.',
    };
  }
  if (message === 'Only a published or on-hold course can be deleted') {
    return {
      ...base,
      code: COURSE_ERROR_CODES.deleteStateInvalid,
      message:
        'Chỉ xóa mềm được khóa học đã xuất bản hoặc đang tạm ngưng. Khóa học nháp sẽ được xóa hẳn.',
    };
  }
  return {
    ...base,
    code: COURSE_ERROR_CODES.stateInvalid,
    message: 'Trạng thái hiện tại của khóa học không cho phép thao tác này.',
  };
}

function describeForbidden(exception: ForbiddenError): ErrorDescriptor {
  const message = exception.message;
  if (message === 'Not the owner' || message === 'Content belongs to another lecturer') {
    return {
      status: 403,
      code: COURSE_ERROR_CODES.notOwner,
      message: 'Khóa học này do giảng viên khác tạo. Chỉ người tạo mới thao tác được.',
    };
  }
  if (message === 'Missing content manager role') {
    return {
      status: 403,
      code: LEARNING_AUTH_ERROR_CODES.roleRequired,
      message: 'Thao tác này chỉ dành cho giảng viên hoặc quản trị viên.',
    };
  }
  const permission = /^Missing (\S+)$/.exec(message);
  if (permission) {
    return {
      status: 403,
      code: LEARNING_AUTH_ERROR_CODES.permissionMissing,
      message: `Tài khoản của bạn chưa có quyền "${permission[1]}" để thực hiện thao tác này. Hãy liên hệ quản trị viên.`,
    };
  }
  return {
    status: 403,
    code: COURSE_ERROR_CODES.forbidden,
    message: 'Bạn không có quyền thực hiện thao tác này trên khóa học.',
  };
}

/** Trả về `null` khi không phải lỗi của module courses để bộ lọc toàn cục xử lý. */
export function describeCourseError(exception: unknown): ErrorDescriptor | null {
  if (
    exception instanceof UnauthorizedError ||
    exception instanceof TrustedPrincipalUnauthorizedError
  ) {
    return describePrincipalError();
  }
  if (exception instanceof ForbiddenError) return describeForbidden(exception);
  if (exception instanceof CourseNotFoundError) {
    return exception.message === 'Quiz not available'
      ? {
          status: 404,
          code: COURSE_ERROR_CODES.quizNotAvailable,
          message:
            'Bài kiểm tra không tồn tại hoặc chưa được xuất bản nên chưa thêm được vào chương.',
        }
      : {
          status: 404,
          code: COURSE_ERROR_CODES.notFound,
          message: 'Không tìm thấy khóa học này, hoặc khóa học không khả dụng.',
        };
  }
  if (exception instanceof ChapterNotFound) {
    return {
      status: 404,
      code: COURSE_ERROR_CODES.chapterNotFound,
      message: 'Không tìm thấy chương này trong khóa học.',
    };
  }
  if (exception instanceof DomainValidationError) return describeDomainValidation(exception);
  if (exception instanceof CourseNotReadyError) {
    return {
      status: 400,
      code: COURSE_ERROR_CODES.notReady,
      message: `Khóa học chưa đủ điều kiện xuất bản: còn ${exception.issues.length} mục cần hoàn thiện.`,
      details: exception.issues.map(describeReadinessIssue),
    };
  }
  if (exception instanceof ProblemNotAttachableError) {
    return {
      status: 400,
      code: COURSE_ERROR_CODES.problemNotAttachable,
      message:
        'Bài tập này không thể thêm vào khóa học: bài tập chưa xuất bản, đã bị xóa hoặc không tồn tại.',
    };
  }
  if (exception instanceof DuplicateCourseSlugError) {
    return {
      status: 409,
      code: COURSE_ERROR_CODES.slugAlreadyExists,
      message: 'Slug này đã được khóa học khác sử dụng. Hãy chọn slug khác.',
      details: [{ field: 'slug', code: 'ALREADY_EXISTS', message: 'Slug này đã tồn tại.' }],
    };
  }
  if (exception instanceof ProblemAlreadyInCourse) {
    return {
      status: 409,
      code: COURSE_ERROR_CODES.problemAlreadyAttached,
      message: 'Bài tập này đã nằm trong khóa học. Mỗi bài tập chỉ được thêm một lần.',
    };
  }
  if (exception instanceof ConcurrentModificationError) {
    return {
      status: 409,
      code: COURSE_ERROR_CODES.concurrentModification,
      message: 'Khóa học vừa được thay đổi bởi một yêu cầu khác. Hãy tải lại khóa học rồi thử lại.',
    };
  }
  if (exception instanceof InvalidCourseState) return describeInvalidState(exception);
  return null;
}
