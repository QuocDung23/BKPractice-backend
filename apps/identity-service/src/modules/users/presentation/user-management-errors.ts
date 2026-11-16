import { AppHttpException } from '@app/common';
import type { ApiErrorDetail } from '@app/contracts';

import type { UserManagementFailure } from '@/modules/users/domain';

export interface DescribedUserError {
  status: number;
  code: string;
  message: string;
  details?: ApiErrorDetail[];
}

interface FieldRule {
  field: string;
  code: string;
  message: string;
}

const INVALID_RULES: Record<string, FieldRule> = {
  pagination: {
    field: 'page',
    code: 'USER_PAGINATION_INVALID',
    message:
      'Tham số phân trang không hợp lệ: trang phải từ 1 trở lên và số dòng mỗi trang phải nằm trong giới hạn cho phép.',
  },
  admin_reason: {
    field: 'reason',
    code: 'USER_REASON_INVALID',
    message: 'Lý do thao tác là bắt buộc, tối đa 500 ký tự và không được chứa ký tự điều khiển.',
  },
  role: {
    field: 'role',
    code: 'USER_ROLE_INVALID',
    message: 'Vai trò phải là STUDENT, LECTURER hoặc ADMIN.',
  },
  display_name: {
    field: 'displayName',
    code: 'USER_DISPLAY_NAME_INVALID',
    message: 'Tên hiển thị là bắt buộc, tối đa 100 ký tự và không được chứa ký tự điều khiển.',
  },
  email_format: {
    field: 'email',
    code: 'USER_EMAIL_INVALID',
    message: 'Email không đúng định dạng hoặc dài quá 320 ký tự.',
  },
  password_length: {
    field: 'password',
    code: 'USER_PASSWORD_INVALID',
    message: 'Mật khẩu phải có từ 8 đến 128 ký tự.',
  },
  student_id_required: {
    field: 'studentId',
    code: 'USER_STUDENT_ID_REQUIRED',
    message: 'Tài khoản sinh viên bắt buộc phải có MSSV.',
  },
  student_id_invalid: {
    field: 'studentId',
    code: 'USER_STUDENT_ID_INVALID',
    message: 'MSSV tối đa 64 ký tự và không được chứa khoảng trắng.',
  },
  student_id_not_allowed: {
    field: 'studentId',
    code: 'USER_STUDENT_ID_NOT_ALLOWED',
    message: 'Giảng viên và quản trị viên không có MSSV, hãy để trống trường này.',
  },
};

function conflictFor(detail?: string): DescribedUserError {
  if (detail === 'email')
    return {
      status: 409,
      code: 'USER_EMAIL_ALREADY_EXISTS',
      message: 'Email này đã được dùng bởi một tài khoản khác.',
      details: [{ field: 'email', code: 'ALREADY_EXISTS', message: 'Email đã tồn tại.' }],
    };
  if (detail === 'student_id')
    return {
      status: 409,
      code: 'USER_STUDENT_ID_ALREADY_EXISTS',
      message: 'MSSV này đã được dùng bởi một tài khoản khác.',
      details: [{ field: 'studentId', code: 'ALREADY_EXISTS', message: 'MSSV đã tồn tại.' }],
    };
  return {
    status: 409,
    code: 'USER_IDENTITY_ALREADY_EXISTS',
    message: 'Email hoặc MSSV này đã được dùng bởi một tài khoản khác.',
  };
}

/** Bảng mã lỗi quản lý người dùng (ERR-001 FR-009, FR-010). */
export function describeUserManagementFailure(error: UserManagementFailure): DescribedUserError {
  switch (error.code) {
    case 'invalid': {
      if (error.reason === 'email_domain')
        return {
          status: 400,
          code: 'USER_EMAIL_DOMAIN_INVALID',
          message: `Email phải có đuôi @${error.detail ?? 'dut.udn.vn'} đối với vai trò này.`,
          details: [
            {
              field: 'email',
              code: 'INVALID_DOMAIN',
              message: `Email phải có đuôi @${error.detail ?? 'dut.udn.vn'}.`,
            },
          ],
        };
      const rule = error.reason ? INVALID_RULES[error.reason] : undefined;
      if (!rule)
        return {
          status: 400,
          code: 'USER_REQUEST_INVALID',
          message: 'Dữ liệu yêu cầu về người dùng không hợp lệ.',
        };
      return {
        status: 400,
        code: rule.code,
        message: rule.message,
        details: [{ field: rule.field, code: 'INVALID', message: rule.message }],
      };
    }
    case 'not_found':
      return error.reason === 'user_deleted'
        ? { status: 404, code: 'USER_ALREADY_DELETED', message: 'Người dùng này đã bị xóa.' }
        : { status: 404, code: 'USER_NOT_FOUND', message: 'Không tìm thấy người dùng này.' };
    case 'forbidden':
      if (error.reason === 'system_account')
        return {
          status: 403,
          code: 'USER_SYSTEM_ACCOUNT_PROTECTED',
          message: 'Không thể khóa, mở khóa hoặc xóa tài khoản hệ thống.',
        };
      if (error.reason === 'self_action')
        return {
          status: 403,
          code: 'USER_SELF_ACTION_FORBIDDEN',
          message: 'Bạn không thể khóa, mở khóa hoặc xóa chính tài khoản của mình.',
        };
      return {
        status: 403,
        code: 'USER_PERMISSION_REQUIRED',
        message: error.detail
          ? `Bạn cần vai trò quản trị viên và quyền "${error.detail}" để thực hiện thao tác này.`
          : 'Bạn cần vai trò quản trị viên và đủ quyền để thực hiện thao tác này.',
      };
    case 'conflict':
      if (error.reason === 'role_unavailable')
        return {
          status: 409,
          code: 'USER_ROLE_NOT_SEEDED',
          message:
            'Vai trò được yêu cầu chưa được khởi tạo trong hệ thống. Hãy liên hệ người vận hành.',
        };
      if (error.reason === 'account_pending')
        return {
          status: 409,
          code: 'USER_ACCOUNT_PENDING',
          message: 'Tài khoản chưa được kích hoạt nên chưa thể khóa hoặc mở khóa.',
        };
      if (error.reason === 'last_admin')
        return {
          status: 409,
          code: 'USER_LAST_ADMIN',
          message:
            'Không thể khóa hoặc xóa quản trị viên cuối cùng đang hoạt động. Hãy cấp quyền quản trị cho người khác trước.',
        };
      return conflictFor(error.detail);
  }
}

/** Lỗi HTTP của các endpoint nội bộ trong module users. */
export const USER_HTTP_ERRORS = {
  internalCredentialInvalid: (): AppHttpException =>
    new AppHttpException(
      401,
      'INTERNAL_CREDENTIAL_INVALID',
      'Khóa nội bộ (header x-internal-service-secret) bị thiếu hoặc không đúng.',
    ),
  internalLookupUnavailable: (): AppHttpException =>
    new AppHttpException(
      503,
      'INTERNAL_LOOKUP_UNAVAILABLE',
      'Dịch vụ tra cứu nội bộ chưa được cấu hình. Hãy liên hệ người vận hành.',
    ),
  userNotFound: (): AppHttpException =>
    new AppHttpException(404, 'USER_NOT_FOUND', 'Không tìm thấy người dùng này.'),
};
