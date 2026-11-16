import { ProfileFailure, type ProfileFailureReason } from '@/modules/profiles/domain';
import { describeProfileFailure } from '@/modules/profiles/presentation/profile-errors';
import { RbacFailure } from '@/modules/rbac/domain';

describe('describeProfileFailure (ERR-001 FR-009)', () => {
  it.each<[ProfileFailureReason, string]>([
    ['display_name', 'PROFILE_DISPLAY_NAME_INVALID'],
    ['bio', 'PROFILE_BIO_INVALID'],
    ['avatar', 'PROFILE_AVATAR_INVALID'],
    ['unknown_field', 'PROFILE_FIELD_NOT_ALLOWED'],
    ['body', 'PROFILE_BODY_INVALID'],
    ['search', 'PROFILE_SEARCH_INVALID'],
    ['avatar_upload', 'PROFILE_AVATAR_FILE_INVALID'],
    ['avatar_not_uploaded', 'PROFILE_AVATAR_NOT_UPLOADED'],
  ])('invalid/%s trả 400 %s và gắn vào details', (reason, code) => {
    const result = describeProfileFailure(new ProfileFailure('invalid', reason));
    expect(result.status).toBe(400);
    expect(result.code).toBe(code);
    expect(result.details).toHaveLength(1);
  });

  it('giữ status cũ cho các mã còn lại', () => {
    expect(describeProfileFailure(new ProfileFailure('invalid')).status).toBe(400);
    expect(describeProfileFailure(new ProfileFailure('missing_name')).status).toBe(409);
    expect(describeProfileFailure(new ProfileFailure('forbidden')).status).toBe(403);
    expect(describeProfileFailure(new ProfileFailure('dependency')).status).toBe(503);
  });

  it('phân biệt thiếu người dùng và thiếu hồ sơ', () => {
    expect(describeProfileFailure(new ProfileFailure('not_found', 'account')).code).toBe(
      'PROFILE_USER_NOT_FOUND',
    );
    expect(describeProfileFailure(new ProfileFailure('not_found', 'profile')).code).toBe(
      'PROFILE_NOT_FOUND',
    );
  });

  it('chuyển lỗi RBAC sang bảng RBAC', () => {
    expect(describeProfileFailure(new RbacFailure('forbidden', 'not_admin')).code).toBe(
      'RBAC_ADMIN_REQUIRED',
    );
  });
});
