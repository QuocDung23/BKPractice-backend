import type { ApiErrorDetail } from '@app/contracts';
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
import type { PublishIssue } from '@learning/modules/problems/domain/services/problem-contract.validator';
import {
  LEARNING_AUTH_ERROR_CODES,
  describePrincipalError,
  labelAction,
  labelPublishStatus,
  translateDomainMessage,
} from '@learning/presentation/http/learning-error';
import type { ErrorDescriptor } from '@learning/presentation/http/learning-error';

/** Mã lỗi ổn định của module problems (spec ERR-001 FR-002, FR-009). */
export const PROBLEM_ERROR_CODES = {
  fieldInvalid: 'PROBLEM_FIELD_INVALID',
  referenceUnknown: 'PROBLEM_REFERENCE_UNKNOWN',
  notReadyToPublish: 'PROBLEM_NOT_READY_TO_PUBLISH',
  notFound: 'PROBLEM_NOT_FOUND',
  testCaseNotFound: 'TEST_CASE_NOT_FOUND',
  harnessNotFound: 'HARNESS_NOT_FOUND',
  slugAlreadyExists: 'PROBLEM_SLUG_ALREADY_EXISTS',
  concurrentModification: 'PROBLEM_CONCURRENT_MODIFICATION',
  forbidden: 'PROBLEM_FORBIDDEN',
  notOwner: 'PROBLEM_NOT_OWNER',
  deletedCannotModify: 'PROBLEM_DELETED_CANNOT_MODIFY',
  onHoldCannotModify: 'PROBLEM_ON_HOLD_CANNOT_MODIFY',
  typeLocked: 'PROBLEM_TYPE_LOCKED',
  alreadyDeleted: 'PROBLEM_ALREADY_DELETED',
  notDeleted: 'PROBLEM_NOT_DELETED',
  deleteStateInvalid: 'PROBLEM_DELETE_STATE_INVALID',
  statusTransitionInvalid: 'PROBLEM_STATUS_TRANSITION_INVALID',
  harnessRequired: 'PROBLEM_HARNESS_REQUIRED',
  stateInvalid: 'PROBLEM_STATE_INVALID',
} as const;

/** Thông báo tiếng Việt cho từng mã vấn đề khi kiểm tra điều kiện xuất bản. */
const PUBLISH_ISSUE_MESSAGES: Readonly<Record<string, string>> = {
  PROBLEM_DELETED: 'Bài tập đã bị xóa nên không thể xuất bản.',
  TITLE_REQUIRED: 'Bài tập cần có tiêu đề.',
  STATEMENT_REQUIRED: 'Bài tập cần có đề bài.',
  SLUG_INVALID: 'Slug của bài tập không hợp lệ (chỉ gồm chữ thường, số và dấu gạch ngang).',
  SLUG_TAKEN: 'Slug này đã được bài tập khác sử dụng.',
  ENABLED_LANGUAGE_REQUIRED: 'Cần bật ít nhất một ngôn ngữ lập trình.',
  EXECUTION_LIMITS_INVALID: 'Giới hạn thời gian hoặc bộ nhớ khi chạy chưa hợp lệ.',
  TEST_CASE_HIDDEN_REQUIRED: 'Cần có ít nhất một test case ẩn.',
  TEST_CASE_SCORE_REQUIRED: 'Các test case cần có tổng điểm lớn hơn 0.',
  HARNESS_REQUIRED: 'Cần có harness cho ngôn ngữ đã bật.',
  STANDARD_IO_REQUIRED: 'Bài tập loại STANDARD cần mô tả đầu vào và đầu ra.',
  STANDARD_CONTRACT_NOT_ALLOWED: 'Bài tập loại STANDARD không được có function hoặc OOP contract.',
  OOP_CONTRACT_NOT_ALLOWED: 'Loại bài tập hiện tại không cho phép OOP contract.',
  FUNCTION_CONTRACT_MISSING: 'Thiếu function contract cho ngôn ngữ đã bật.',
  FUNCTION_CONTRACT_NOT_ALLOWED: 'Loại bài tập hiện tại không cho phép function contract.',
  OOP_CONTRACT_MISSING: 'Thiếu OOP contract cho ngôn ngữ đã bật.',
  STARTER_CODE_MISSING: 'Thiếu mã khởi tạo (starter code) cho ngôn ngữ đã bật.',
  CONTRACT_LANGUAGE_DISABLED: 'Contract được khai báo cho một ngôn ngữ chưa bật.',
  STARTER_CODE_LANGUAGE_DISABLED: 'Mã khởi tạo được khai báo cho một ngôn ngữ chưa bật.',
  PROBLEM_TYPE_CONFIG_MISMATCH: 'Cấu hình contract không khớp với loại bài tập.',
};

export function describePublishIssue(issue: PublishIssue): ApiErrorDetail {
  const base = PUBLISH_ISSUE_MESSAGES[issue.code] ?? 'Bài tập chưa đạt điều kiện xuất bản.';
  return {
    ...(issue.field ? { field: issue.field } : {}),
    code: issue.code,
    message: issue.field ? `${base} (trường "${issue.field}")` : base,
  };
}

function describeInvalidState(exception: InvalidProblemState): ErrorDescriptor {
  const message = exception.message;
  const base = { status: 409 } as const;
  const deleted = /^A deleted problem cannot (.+)$/.exec(message);
  if (deleted) {
    return {
      ...base,
      code: PROBLEM_ERROR_CODES.deletedCannotModify,
      message: `Bài tập đã bị xóa nên không thể ${labelAction(deleted[1] ?? '')}. Hãy khôi phục bài tập trước.`,
    };
  }
  const onHold = /^A problem on hold cannot (.+)$/.exec(message);
  if (onHold) {
    return {
      ...base,
      code: PROBLEM_ERROR_CODES.onHoldCannotModify,
      message: `Bài tập đang tạm ngưng nên không thể ${labelAction(onHold[1] ?? '')}. Hãy xuất bản lại bài tập trước.`,
    };
  }
  if (message === 'The problem type can only be changed while the problem is a draft') {
    return {
      ...base,
      code: PROBLEM_ERROR_CODES.typeLocked,
      message: 'Chỉ đổi được loại bài tập khi bài tập còn ở trạng thái nháp.',
    };
  }
  if (message === 'The problem is already deleted') {
    return {
      ...base,
      code: PROBLEM_ERROR_CODES.alreadyDeleted,
      message: 'Bài tập này đã bị xóa từ trước.',
    };
  }
  if (message === 'The problem is not deleted') {
    return {
      ...base,
      code: PROBLEM_ERROR_CODES.notDeleted,
      message: 'Bài tập này chưa bị xóa nên không cần khôi phục.',
    };
  }
  if (message === 'Only a published or on-hold problem can be deleted') {
    return {
      ...base,
      code: PROBLEM_ERROR_CODES.deleteStateInvalid,
      message:
        'Chỉ xóa được bài tập đã xuất bản hoặc đang tạm ngưng. Bài tập nháp không thể xóa theo cách này.',
    };
  }
  const transition = /^Cannot (.+?) a problem with status (\w+)$/.exec(message);
  if (transition) {
    return {
      ...base,
      code: PROBLEM_ERROR_CODES.statusTransitionInvalid,
      message: `Không thể ${labelAction(transition[1] ?? '')} bài tập đang ở trạng thái "${labelPublishStatus(transition[2] ?? '')}".`,
    };
  }
  const harness = /^A (\w+) problem requires a harness for (\S+)$/.exec(message);
  if (harness) {
    return {
      ...base,
      code: PROBLEM_ERROR_CODES.harnessRequired,
      message: `Bài tập loại ${harness[1]} cần có harness cho ngôn ngữ ${harness[2]} trước khi chấm. Hãy thêm harness rồi thử lại.`,
    };
  }
  return {
    ...base,
    code: PROBLEM_ERROR_CODES.stateInvalid,
    message: 'Trạng thái hiện tại của bài tập không cho phép thao tác này.',
  };
}

function describeForbidden(exception: ForbiddenError): ErrorDescriptor {
  const permission = /^Missing permission (.+)$/.exec(exception.message);
  if (permission) {
    return {
      status: 403,
      code: LEARNING_AUTH_ERROR_CODES.permissionMissing,
      message: `Tài khoản của bạn chưa có quyền "${permission[1]}" để thực hiện thao tác này. Hãy liên hệ quản trị viên.`,
    };
  }
  if (exception.message === 'Lecturer or admin role required') {
    return {
      status: 403,
      code: LEARNING_AUTH_ERROR_CODES.roleRequired,
      message: 'Thao tác này chỉ dành cho giảng viên hoặc quản trị viên.',
    };
  }
  if (exception.message === 'Only the problem owner or an admin can do this') {
    return {
      status: 403,
      code: PROBLEM_ERROR_CODES.notOwner,
      message:
        'Bài tập này do giảng viên khác tạo. Chỉ người tạo hoặc quản trị viên mới thao tác được.',
    };
  }
  return {
    status: 403,
    code: PROBLEM_ERROR_CODES.forbidden,
    message: 'Bạn không có quyền thực hiện thao tác này trên bài tập.',
  };
}

/** Trả về `null` khi không phải lỗi của module problems để bộ lọc toàn cục xử lý. */
export function describeProblemError(exception: unknown): ErrorDescriptor | null {
  if (exception instanceof DomainValidationError) {
    const detail = translateDomainMessage(exception.field, exception.message);
    return {
      status: 400,
      code: PROBLEM_ERROR_CODES.fieldInvalid,
      message: detail.message,
      details: [detail],
    };
  }
  if (exception instanceof UnknownReferenceError) {
    const details = exception.references.map((reference): ApiErrorDetail => ({
      field: reference.kind === 'topic' ? 'topicIds' : 'tagIds',
      code: 'NOT_FOUND',
      message: `${reference.kind === 'topic' ? 'Chủ đề' : 'Thẻ'} có mã "${reference.id}" không tồn tại.`,
    }));
    return {
      status: 400,
      code: PROBLEM_ERROR_CODES.referenceUnknown,
      message: `Có ${details.length} chủ đề hoặc thẻ không tồn tại. Hãy chọn lại từ danh sách hiện có.`,
      details,
    };
  }
  if (exception instanceof PublishNotReadyError) {
    return {
      status: 400,
      code: PROBLEM_ERROR_CODES.notReadyToPublish,
      message: `Bài tập chưa đủ điều kiện xuất bản: còn ${exception.issues.length} mục cần hoàn thiện.`,
      details: exception.issues.map(describePublishIssue),
    };
  }
  if (exception instanceof UnauthorizedError) return describePrincipalError();
  if (exception instanceof ForbiddenError) return describeForbidden(exception);
  if (exception instanceof ProblemNotFoundError) {
    return {
      status: 404,
      code: PROBLEM_ERROR_CODES.notFound,
      message: 'Không tìm thấy bài tập này, hoặc bài tập chưa được xuất bản.',
    };
  }
  if (exception instanceof TestCaseNotFoundError) {
    return {
      status: 404,
      code: PROBLEM_ERROR_CODES.testCaseNotFound,
      message: 'Không tìm thấy test case này trong bài tập.',
    };
  }
  if (exception instanceof HarnessNotFoundError) {
    return {
      status: 404,
      code: PROBLEM_ERROR_CODES.harnessNotFound,
      message: `Bài tập chưa có harness cho ngôn ngữ ${exception.language}.`,
    };
  }
  if (exception instanceof DuplicateSlugError) {
    return {
      status: 409,
      code: PROBLEM_ERROR_CODES.slugAlreadyExists,
      message: `Slug "${exception.slug}" đã được bài tập khác sử dụng. Hãy chọn slug khác.`,
      details: [{ field: 'slug', code: 'ALREADY_EXISTS', message: 'Slug này đã tồn tại.' }],
    };
  }
  if (exception instanceof InvalidProblemState) return describeInvalidState(exception);
  if (exception instanceof ConcurrentModificationError) {
    return {
      status: 409,
      code: PROBLEM_ERROR_CODES.concurrentModification,
      message: 'Bài tập vừa được thay đổi bởi một yêu cầu khác. Hãy tải lại bài tập rồi thử lại.',
    };
  }
  return null;
}
