import { AppHttpException } from '@app/common';
import type { ApiErrorDetail } from '@app/contracts';

import type { RbacFailure } from '@/modules/rbac/domain';

export interface DescribedError {
  status: number;
  code: string;
  message: string;
  details?: ApiErrorDetail[];
}

/** Bảng mã lỗi phân quyền (ERR-001 FR-009). `reason` tinh chỉnh nguyên nhân khi một mã miền có nhiều cách xảy ra. */
export function describeRbacFailure(error: RbacFailure): DescribedError {
  switch (error.code) {
    case 'forbidden':
      if (error.reason === 'not_admin')
        return {
          status: 403,
          code: 'RBAC_ADMIN_REQUIRED',
          message: 'Chỉ quản trị viên mới được thực hiện thao tác này.',
        };
      if (error.reason === 'self_admin')
        return {
          status: 403,
          code: 'RBAC_SELF_ADMIN_CHANGE_FORBIDDEN',
          message: 'Bạn không thể tự cấp hoặc tự thu hồi vai trò quản trị viên của chính mình.',
        };
      return {
        status: 403,
        code: 'RBAC_FORBIDDEN',
        message: 'Bạn không có quyền thực hiện thao tác này.',
      };
    case 'invalid_role':
      if (error.reason === 'reason_invalid')
        return {
          status: 400,
          code: 'RBAC_REASON_INVALID',
          message:
            'Lý do thay đổi vai trò là bắt buộc, tối đa 500 ký tự và không được chứa ký tự điều khiển.',
          details: [
            {
              field: 'reason',
              code: 'INVALID',
              message: 'Lý do bắt buộc, tối đa 500 ký tự, không có ký tự điều khiển.',
            },
          ],
        };
      return {
        status: 400,
        code: 'RBAC_ROLE_INVALID',
        message: 'Vai trò không tồn tại. Chỉ chấp nhận STUDENT, LECTURER hoặc ADMIN.',
      };
    case 'user_not_found':
      return {
        status: 404,
        code: 'RBAC_USER_NOT_FOUND',
        message: 'Không tìm thấy người dùng cần thay đổi vai trò.',
      };
    case 'last_admin':
      return {
        status: 409,
        code: 'RBAC_LAST_ADMIN',
        message:
          'Không thể gỡ vai trò quản trị viên cuối cùng của hệ thống. Hãy cấp quyền quản trị cho một người khác trước.',
      };
  }
}

/** Lỗi HTTP của RbacGuard. */
export const RBAC_HTTP_ERRORS = {
  bearerMissing: (): AppHttpException =>
    new AppHttpException(
      401,
      'AUTH_TOKEN_MISSING',
      'Thiếu header Authorization dạng "Bearer <token>" hoặc token sai định dạng.',
    ),
};
