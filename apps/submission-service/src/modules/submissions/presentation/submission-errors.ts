import { AppHttpException } from '@app/common';
import type { ApiErrorDetail } from '@app/contracts';
import { HttpStatus } from '@nestjs/common';

export interface SubmissionErrorDefinition {
  readonly status: number;
  readonly code: string;
  readonly message: string;
}

/**
 * Mã lỗi HTTP của Submission (spec ERR-001 FR-009). Giữ nguyên status đã có từ trước; chỉ thay thông báo
 * chung chung bằng mã ổn định và thông báo tiếng Việt nêu nguyên nhân cùng hướng xử lý.
 */
export const SUBMISSION_ERRORS = {
  userContextMissing: {
    status: HttpStatus.UNAUTHORIZED,
    code: 'AUTH_USER_CONTEXT_MISSING',
    message:
      'Yêu cầu không có thông tin người dùng đã xác thực. Hãy đăng nhập lại rồi thử lại; nếu vẫn lỗi, hãy báo quản trị viên mã tham chiếu.',
  },
  internalSecretInvalid: {
    status: HttpStatus.UNAUTHORIZED,
    code: 'AUTH_INTERNAL_SECRET_INVALID',
    message:
      'Khóa xác thực giữa các dịch vụ bị thiếu hoặc không đúng. Đây là lệnh gọi nội bộ, hãy kiểm tra cấu hình INTERNAL_SERVICE_SECRET của hai dịch vụ.',
  },
  problemNotSubmittable: {
    status: HttpStatus.NOT_FOUND,
    code: 'SUBMISSION_PROBLEM_NOT_SUBMITTABLE',
    message:
      'Không thể nộp bài: bài tập không tồn tại, chưa được công bố hoặc ngôn ngữ đã chọn chưa được bật cho bài này. Hãy kiểm tra lại bài tập và ngôn ngữ.',
  },
  judgePackageUnavailable: {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    code: 'SUBMISSION_JUDGE_PACKAGE_UNAVAILABLE',
    message:
      'Chưa chuẩn bị được dữ liệu chấm cho bài này vì dịch vụ Learning không phản hồi. Bài nộp chưa được tạo, vui lòng thử lại sau ít phút.',
  },
  submissionNotFound: {
    status: HttpStatus.NOT_FOUND,
    code: 'SUBMISSION_NOT_FOUND',
    message:
      'Không tìm thấy bài nộp này trong lịch sử của bạn. Hãy kiểm tra lại mã bài nộp hoặc mở lại từ danh sách bài nộp.',
  },
  submissionIdInvalid: {
    status: HttpStatus.BAD_REQUEST,
    code: 'VALIDATION_FAILED',
    message: 'Mã bài nộp không hợp lệ: trường "publicId" phải là một mã UUID.',
  },
} as const satisfies Record<string, SubmissionErrorDefinition>;

export function createSubmissionError(
  definition: SubmissionErrorDefinition,
  details?: ApiErrorDetail[],
): AppHttpException {
  return new AppHttpException(definition.status, definition.code, definition.message, details);
}

export function createSubmissionIdInvalidError(): AppHttpException {
  return createSubmissionError(SUBMISSION_ERRORS.submissionIdInvalid, [
    {
      field: 'publicId',
      code: 'INVALID_FORMAT',
      message: 'Trường "publicId" phải là một mã UUID hợp lệ.',
    },
  ]);
}
