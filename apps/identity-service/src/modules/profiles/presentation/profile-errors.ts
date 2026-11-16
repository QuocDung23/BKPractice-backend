import type { ProfileFailure } from '@/modules/profiles/domain';
import { RbacFailure } from '@/modules/rbac/domain';
import { describeRbacFailure } from '@/modules/rbac/presentation/rbac-errors';
import type { DescribedError } from '@/modules/rbac/presentation/rbac-errors';

const INVALID_FIELDS: Record<string, { field: string; code: string; message: string }> = {
  display_name: {
    field: 'displayName',
    code: 'PROFILE_DISPLAY_NAME_INVALID',
    message: 'Tên hiển thị là bắt buộc và tối đa 100 ký tự.',
  },
  bio: {
    field: 'bio',
    code: 'PROFILE_BIO_INVALID',
    message: 'Giới thiệu bản thân phải là văn bản và tối đa 1000 ký tự.',
  },
  avatar: {
    field: 'avatar',
    code: 'PROFILE_AVATAR_INVALID',
    message: 'Ảnh đại diện phải là một tham chiếu ảnh hợp lệ, hoặc null để xóa ảnh.',
  },
  unknown_field: {
    field: 'body',
    code: 'PROFILE_FIELD_NOT_ALLOWED',
    message: 'Chỉ được cập nhật các trường displayName, avatar và bio.',
  },
  body: {
    field: 'body',
    code: 'PROFILE_BODY_INVALID',
    message: 'Nội dung cập nhật hồ sơ phải là một đối tượng JSON.',
  },
  search: {
    field: 'name',
    code: 'PROFILE_SEARCH_INVALID',
    message:
      'Từ khóa tìm kiếm phải từ 1 đến 100 ký tự, trang phải từ 1 trở lên và mỗi trang tối đa 50 kết quả.',
  },
  avatar_not_uploaded: {
    field: 'avatar',
    code: 'PROFILE_AVATAR_NOT_UPLOADED',
    message: 'Ảnh đại diện chưa được tải lên hoặc đã hết hạn. Hãy tải ảnh lên lại rồi lưu hồ sơ.',
  },
  avatar_upload: {
    field: 'avatar',
    code: 'PROFILE_AVATAR_FILE_INVALID',
    message:
      'Ảnh đại diện không hợp lệ: định dạng không được hỗ trợ hoặc dung lượng vượt giới hạn.',
  },
};

export function describeProfileFailure(error: ProfileFailure | RbacFailure): DescribedError {
  if (error instanceof RbacFailure) return describeRbacFailure(error);
  switch (error.code) {
    case 'invalid': {
      const rule = error.reason ? INVALID_FIELDS[error.reason] : undefined;
      if (!rule)
        return {
          status: 400,
          code: 'PROFILE_REQUEST_INVALID',
          message: 'Yêu cầu về hồ sơ không hợp lệ.',
        };
      return {
        status: 400,
        code: rule.code,
        message: rule.message,
        details: [{ field: rule.field, code: 'INVALID', message: rule.message }],
      };
    }
    case 'missing_name':
      return {
        status: 409,
        code: 'PROFILE_INITIAL_NAME_MISSING',
        message:
          'Tài khoản chưa có tên hiển thị hợp lệ để tạo hồ sơ. Hãy cập nhật tên hiển thị trước.',
      };
    case 'not_found':
      return error.reason === 'account'
        ? { status: 404, code: 'PROFILE_USER_NOT_FOUND', message: 'Không tìm thấy người dùng này.' }
        : {
            status: 404,
            code: 'PROFILE_NOT_FOUND',
            message: 'Không tìm thấy hồ sơ của người dùng này.',
          };
    case 'forbidden':
      return {
        status: 403,
        code: 'PROFILE_FORBIDDEN',
        message: 'Bạn không có quyền xem hoặc sửa hồ sơ này.',
      };
    case 'dependency':
      return {
        status: 503,
        code: 'PROFILE_STORAGE_UNAVAILABLE',
        message: 'Không kết nối được kho lưu ảnh đại diện. Vui lòng thử lại sau ít phút.',
      };
  }
}
