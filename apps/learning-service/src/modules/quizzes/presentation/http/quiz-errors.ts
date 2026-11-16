import {
  describePrincipalError,
  LEARNING_AUTH_ERROR_CODES,
} from '@learning/presentation/http/learning-error';
import type { ErrorDescriptor } from '@learning/presentation/http/learning-error';

import { UnauthorizedError } from '@/modules/problems/application/errors/unauthorized.error';
import { QuizError } from '@/modules/quizzes/domain';

/** Mã lỗi ổn định của module quizzes (spec ERR-001 FR-002, FR-009). */
export const QUIZ_ERROR_CODES = {
  notFound: 'QUIZ_NOT_FOUND',
  notAvailable: 'QUIZ_NOT_AVAILABLE',
  questionNotFound: 'QUIZ_QUESTION_NOT_FOUND',
  questionNotAvailable: 'QUIZ_QUESTION_NOT_AVAILABLE',
  attemptNotFound: 'QUIZ_ATTEMPT_NOT_FOUND',
  contentNotFound: 'QUIZ_CONTENT_NOT_FOUND',
  contentNotAvailable: 'QUIZ_CONTENT_NOT_AVAILABLE',
  revisionNotAvailable: 'QUIZ_REVISION_NOT_AVAILABLE',
  permissionMissing: LEARNING_AUTH_ERROR_CODES.permissionMissing,
  notOwner: 'QUIZ_NOT_OWNER',
  questionDeleted: 'QUIZ_QUESTION_DELETED',
  questionNotDeleted: 'QUIZ_QUESTION_NOT_DELETED',
  requestIdReused: 'QUIZ_REQUEST_ID_REUSED',
  stateNotPublished: 'QUIZ_STATE_NOT_PUBLISHED',
  stateNotOnHold: 'QUIZ_STATE_NOT_ON_HOLD',
  stateNotDeleted: 'QUIZ_STATE_NOT_DELETED',
  notEditable: 'QUIZ_NOT_EDITABLE',
  noEditableDraft: 'QUIZ_NO_EDITABLE_DRAFT',
  answerLocked: 'QUIZ_ANSWER_LOCKED',
  attemptFinished: 'QUIZ_ATTEMPT_FINISHED',
  attemptIncomplete: 'QUIZ_ATTEMPT_INCOMPLETE',
  attemptNotFinished: 'QUIZ_ATTEMPT_NOT_FINISHED',
  difficultyInvalid: 'QUIZ_DIFFICULTY_INVALID',
  optionsCountInvalid: 'QUIZ_OPTIONS_COUNT_INVALID',
  optionIdsDuplicated: 'QUIZ_OPTION_IDS_DUPLICATED',
  correctOptionInvalid: 'QUIZ_CORRECT_OPTION_INVALID',
  taxonomyInvalid: 'QUIZ_TAXONOMY_INVALID',
  taxonomyUnknown: 'QUIZ_TAXONOMY_UNKNOWN',
  noPublishedRevision: 'QUIZ_NO_PUBLISHED_REVISION',
  questionsInvalid: 'QUIZ_QUESTIONS_INVALID',
  questionsRequired: 'QUIZ_QUESTIONS_REQUIRED',
  attemptDefinitionInvalid: 'QUIZ_ATTEMPT_DEFINITION_INVALID',
  answerInvalid: 'QUIZ_ANSWER_INVALID',
  empty: 'QUIZ_EMPTY',
  questionRevisionInvalid: 'QUIZ_QUESTION_REVISION_INVALID',
  shareRecipientInvalid: 'QUIZ_SHARE_RECIPIENT_INVALID',
  shareDependencyUnavailable: 'QUIZ_SHARE_DEPENDENCY_UNAVAILABLE',
  fieldInvalid: 'QUIZ_FIELD_INVALID',
  contentUnsafe: 'QUIZ_CONTENT_UNSAFE',
  invalidRequest: 'QUIZ_INVALID_REQUEST',
  forbidden: 'QUIZ_FORBIDDEN',
  conflict: 'QUIZ_CONFLICT',
  dependencyUnavailable: 'QUIZ_DEPENDENCY_UNAVAILABLE',
  notFoundGeneric: 'QUIZ_RESOURCE_NOT_FOUND',
} as const;

interface QuizMessageRule {
  readonly code: string;
  readonly message: string;
}

/** Domain/use case của quiz ném thông báo tiếng Anh cố định; ánh xạ nguyên văn sang mã và câu tiếng Việt. */
const QUIZ_MESSAGES: Readonly<Record<string, QuizMessageRule>> = {
  'Quiz not available': {
    code: QUIZ_ERROR_CODES.notAvailable,
    message: 'Bài kiểm tra không tồn tại hoặc chưa được xuất bản.',
  },
  'Quiz not published': {
    code: QUIZ_ERROR_CODES.notAvailable,
    message: 'Bài kiểm tra chưa được xuất bản nên chưa xem được.',
  },
  'Quiz not found': {
    code: QUIZ_ERROR_CODES.notFound,
    message: 'Không tìm thấy bài kiểm tra này.',
  },
  'Question not found': {
    code: QUIZ_ERROR_CODES.questionNotFound,
    message: 'Không tìm thấy câu hỏi này.',
  },
  'Question not available': {
    code: QUIZ_ERROR_CODES.questionNotAvailable,
    message: 'Câu hỏi không tồn tại hoặc bạn không có quyền xem.',
  },
  'Question unavailable': {
    code: QUIZ_ERROR_CODES.questionNotAvailable,
    message: 'Có câu hỏi không còn khả dụng (đã bị xóa hoặc chưa xuất bản).',
  },
  'Attempt not found': {
    code: QUIZ_ERROR_CODES.attemptNotFound,
    message: 'Không tìm thấy lượt làm bài này.',
  },
  'Content not found': {
    code: QUIZ_ERROR_CODES.contentNotFound,
    message: 'Không tìm thấy nội dung (bài kiểm tra hoặc câu hỏi) này.',
  },
  'Content not available': {
    code: QUIZ_ERROR_CODES.contentNotAvailable,
    message: 'Nội dung không tồn tại hoặc bạn không có quyền truy cập.',
  },
  'No usable revision': {
    code: QUIZ_ERROR_CODES.revisionNotAvailable,
    message: 'Bài kiểm tra chưa có phiên bản nào dùng được để sao chép.',
  },
  'Quiz revision not available': {
    code: QUIZ_ERROR_CODES.revisionNotAvailable,
    message: 'Phiên bản bài kiểm tra này không còn khả dụng.',
  },
  'Missing role or permission': {
    code: QUIZ_ERROR_CODES.permissionMissing,
    message:
      'Tài khoản của bạn chưa có vai trò hoặc quyền cần thiết để thao tác với bài kiểm tra. Hãy liên hệ quản trị viên.',
  },
  'Only the owner can edit this content': {
    code: QUIZ_ERROR_CODES.notOwner,
    message: 'Nội dung này do người khác tạo. Chỉ người tạo mới chỉnh sửa được.',
  },
  'Question is deleted': {
    code: QUIZ_ERROR_CODES.questionDeleted,
    message: 'Câu hỏi đã bị xóa. Hãy khôi phục câu hỏi trước khi thao tác.',
  },
  'Question is not deleted': {
    code: QUIZ_ERROR_CODES.questionNotDeleted,
    message: 'Câu hỏi này chưa bị xóa nên không cần khôi phục.',
  },
  'Request id reused': {
    code: QUIZ_ERROR_CODES.requestIdReused,
    message:
      'Mã yêu cầu (request id) này đã được dùng cho một nội dung khác. Hãy tạo mã yêu cầu mới.',
  },
  'Request id reused with another payload': {
    code: QUIZ_ERROR_CODES.requestIdReused,
    message: 'Mã yêu cầu (request id) này đã được dùng với dữ liệu khác. Hãy tạo mã yêu cầu mới.',
  },
  'Quiz is not published': {
    code: QUIZ_ERROR_CODES.stateNotPublished,
    message: 'Bài kiểm tra chưa ở trạng thái đã xuất bản nên không thể thực hiện thao tác này.',
  },
  'Quiz is not on hold': {
    code: QUIZ_ERROR_CODES.stateNotOnHold,
    message: 'Bài kiểm tra không ở trạng thái tạm ngưng nên không thể xuất bản lại.',
  },
  'Quiz is not deleted': {
    code: QUIZ_ERROR_CODES.stateNotDeleted,
    message: 'Bài kiểm tra này chưa bị xóa nên không cần khôi phục.',
  },
  'Quiz is not editable': {
    code: QUIZ_ERROR_CODES.notEditable,
    message:
      'Bài kiểm tra không thể chỉnh sửa ở trạng thái hiện tại (đã bị xóa hoặc đang tạm ngưng).',
  },
  'No editable draft': {
    code: QUIZ_ERROR_CODES.noEditableDraft,
    message: 'Bài kiểm tra chưa có bản nháp để chỉnh sửa hoặc xuất bản.',
  },
  'Answer is already locked': {
    code: QUIZ_ERROR_CODES.answerLocked,
    message: 'Câu hỏi này đã được trả lời và khóa, không thể đổi đáp án.',
  },
  'Attempt is finished': {
    code: QUIZ_ERROR_CODES.attemptFinished,
    message: 'Lượt làm bài này đã kết thúc nên không thể trả lời thêm.',
  },
  'Answer every question before finishing': {
    code: QUIZ_ERROR_CODES.attemptIncomplete,
    message: 'Bạn cần trả lời tất cả các câu hỏi trước khi nộp bài.',
  },
  'Attempt is not finished': {
    code: QUIZ_ERROR_CODES.attemptNotFinished,
    message: 'Lượt làm bài chưa kết thúc nên chưa có kết quả. Hãy nộp bài trước.',
  },
  'Invalid difficulty': {
    code: QUIZ_ERROR_CODES.difficultyInvalid,
    message: 'Độ khó không hợp lệ. Chỉ nhận EASY, MEDIUM hoặc HARD.',
  },
  'A question requires 2–6 options': {
    code: QUIZ_ERROR_CODES.optionsCountInvalid,
    message: 'Mỗi câu hỏi cần có từ 2 đến 6 đáp án.',
  },
  'Duplicate option ids': {
    code: QUIZ_ERROR_CODES.optionIdsDuplicated,
    message: 'Các đáp án của câu hỏi đang có mã (id) trùng nhau. Mỗi đáp án cần một mã riêng.',
  },
  'Exactly one correct option is required': {
    code: QUIZ_ERROR_CODES.correctOptionInvalid,
    message: 'Mỗi câu hỏi cần có đúng một đáp án đúng.',
  },
  'Invalid taxonomy ids': {
    code: QUIZ_ERROR_CODES.taxonomyInvalid,
    message: 'Danh sách chủ đề hoặc thẻ không hợp lệ: tối đa 50 mục và không được trùng nhau.',
  },
  'Unknown topic or tag': {
    code: QUIZ_ERROR_CODES.taxonomyUnknown,
    message: 'Có chủ đề hoặc thẻ không tồn tại. Hãy chọn lại từ danh sách hiện có.',
  },
  'Missing published revision': {
    code: QUIZ_ERROR_CODES.noPublishedRevision,
    message: 'Bài kiểm tra chưa có phiên bản đã xuất bản để làm gốc.',
  },
  'Duplicate questions or too many questions': {
    code: QUIZ_ERROR_CODES.questionsInvalid,
    message: 'Danh sách câu hỏi có câu bị lặp hoặc vượt quá 50 câu.',
  },
  'At least one question is required': {
    code: QUIZ_ERROR_CODES.questionsRequired,
    message: 'Bài kiểm tra cần có ít nhất một câu hỏi trước khi xuất bản.',
  },
  'Invalid attempt definition': {
    code: QUIZ_ERROR_CODES.attemptDefinitionInvalid,
    message: 'Không thể tạo lượt làm bài: danh sách câu hỏi của bài kiểm tra không hợp lệ.',
  },
  'Question or option does not belong to this attempt': {
    code: QUIZ_ERROR_CODES.answerInvalid,
    message: 'Câu hỏi hoặc đáp án được chọn không thuộc lượt làm bài này.',
  },
  'Quiz is empty': {
    code: QUIZ_ERROR_CODES.empty,
    message: 'Bài kiểm tra chưa có câu hỏi nào nên chưa thể bắt đầu làm bài.',
  },
  'Invalid question revision': {
    code: QUIZ_ERROR_CODES.questionRevisionInvalid,
    message: 'Phiên bản câu hỏi được chọn không hợp lệ hoặc không còn tồn tại.',
  },
  'Recipient must be an active LECTURER': {
    code: QUIZ_ERROR_CODES.shareRecipientInvalid,
    message: 'Người nhận phải là giảng viên có tài khoản đang hoạt động.',
  },
  'Identity is unavailable': {
    code: QUIZ_ERROR_CODES.shareDependencyUnavailable,
    message:
      'Không kiểm tra được người nhận vì dịch vụ Identity tạm thời không phản hồi. Vui lòng thử lại sau.',
  },
};

const FIELD_LABELS: Readonly<Record<string, string>> = {
  content: 'nội dung câu hỏi',
  explanation: 'phần giải thích',
  option: 'nội dung đáp án',
  title: 'tiêu đề',
  description: 'mô tả',
};

/** Câu chung theo loại lỗi khi thông báo domain chưa có trong bảng (để mã vẫn đúng loại, không lộ tiếng Anh). */
const KIND_FALLBACKS: Readonly<
  Record<QuizError['code'], { status: number; code: string; message: string }>
> = {
  INVALID: {
    status: 400,
    code: QUIZ_ERROR_CODES.invalidRequest,
    message: 'Dữ liệu bài kiểm tra hoặc câu hỏi không hợp lệ. Hãy kiểm tra lại các trường đã nhập.',
  },
  FORBIDDEN: {
    status: 403,
    code: QUIZ_ERROR_CODES.forbidden,
    message: 'Bạn không có quyền thực hiện thao tác này.',
  },
  NOT_FOUND: {
    status: 404,
    code: QUIZ_ERROR_CODES.notFoundGeneric,
    message: 'Không tìm thấy nội dung được yêu cầu.',
  },
  CONFLICT: {
    status: 409,
    code: QUIZ_ERROR_CODES.conflict,
    message: 'Trạng thái hiện tại không cho phép thao tác này.',
  },
  UNAVAILABLE: {
    status: 503,
    code: QUIZ_ERROR_CODES.dependencyUnavailable,
    message: 'Một dịch vụ phụ trợ tạm thời không phản hồi. Vui lòng thử lại sau.',
  },
};

function describeQuizError(error: QuizError): ErrorDescriptor {
  const { status } = KIND_FALLBACKS[error.code];
  const known = QUIZ_MESSAGES[error.message];
  if (known) return { status, ...known };

  const field = /^(Invalid|Unsafe) (\w+)$/.exec(error.message);
  if (field) {
    const label = FIELD_LABELS[field[2] ?? ''] ?? field[2];
    return field[1] === 'Unsafe'
      ? {
          status,
          code: QUIZ_ERROR_CODES.contentUnsafe,
          message: `Trường ${label} chứa HTML hoặc script không an toàn. Hãy bỏ các thẻ/đoạn mã đó.`,
          details: [
            { field: field[2], code: 'UNSAFE_CONTENT', message: `Trường ${label} không an toàn.` },
          ],
        }
      : {
          status,
          code: QUIZ_ERROR_CODES.fieldInvalid,
          message: `Trường ${label} không hợp lệ: để trống hoặc quá dài.`,
          details: [{ field: field[2], code: 'INVALID', message: `Trường ${label} không hợp lệ.` }],
        };
  }
  const fallback = KIND_FALLBACKS[error.code];
  return { status, code: fallback.code, message: fallback.message };
}

/** Trả về `null` khi không phải lỗi của module quizzes để bộ lọc toàn cục xử lý. */
export function describeQuizException(exception: unknown): ErrorDescriptor | null {
  if (exception instanceof QuizError) return describeQuizError(exception);
  if (exception instanceof UnauthorizedError) return describePrincipalError();
  return null;
}
