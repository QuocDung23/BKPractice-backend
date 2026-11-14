import { RoleName } from '@/modules/rbac/domain';
import {
  UserManagementFailure,
  validateCreateManagedUser,
  type CreateManagedUser,
  type UserManagementReason,
} from '@/modules/users/domain';
import { describeUserManagementFailure } from '@/modules/users/presentation/user-management-errors';

const valid: CreateManagedUser = {
  studentId: '2210001',
  displayName: 'Nguyễn Văn A',
  email: 'a@sv1.dut.udn.vn',
  password: 'password-1',
  role: RoleName.Student,
  reason: 'Cấp tài khoản',
};

function failureOf(input: CreateManagedUser): UserManagementFailure {
  try {
    validateCreateManagedUser(input);
  } catch (error) {
    return error as UserManagementFailure;
  }
  throw new Error('expected validation to fail');
}

describe('describeUserManagementFailure (ERR-001 FR-009, FR-010)', () => {
  it.each([
    ['invalid', 'pagination', 400, 'USER_PAGINATION_INVALID'],
    ['invalid', 'admin_reason', 400, 'USER_REASON_INVALID'],
    ['invalid', 'role', 400, 'USER_ROLE_INVALID'],
    ['invalid', 'display_name', 400, 'USER_DISPLAY_NAME_INVALID'],
    ['invalid', 'email_format', 400, 'USER_EMAIL_INVALID'],
    ['invalid', 'email_domain', 400, 'USER_EMAIL_DOMAIN_INVALID'],
    ['invalid', 'password_length', 400, 'USER_PASSWORD_INVALID'],
    ['invalid', 'student_id_required', 400, 'USER_STUDENT_ID_REQUIRED'],
    ['invalid', 'student_id_invalid', 400, 'USER_STUDENT_ID_INVALID'],
    ['invalid', 'student_id_not_allowed', 400, 'USER_STUDENT_ID_NOT_ALLOWED'],
    ['not_found', 'user_not_found', 404, 'USER_NOT_FOUND'],
    ['not_found', 'user_deleted', 404, 'USER_ALREADY_DELETED'],
    ['forbidden', 'missing_permission', 403, 'USER_PERMISSION_REQUIRED'],
    ['forbidden', 'system_account', 403, 'USER_SYSTEM_ACCOUNT_PROTECTED'],
    ['forbidden', 'self_action', 403, 'USER_SELF_ACTION_FORBIDDEN'],
    ['conflict', 'role_unavailable', 409, 'USER_ROLE_NOT_SEEDED'],
    ['conflict', 'identity_exists', 409, 'USER_IDENTITY_ALREADY_EXISTS'],
    ['conflict', 'account_pending', 409, 'USER_ACCOUNT_PENDING'],
    ['conflict', 'last_admin', 409, 'USER_LAST_ADMIN'],
  ] as const)('%s/%s trả %i %s', (code, reason, status, expected) => {
    const result = describeUserManagementFailure(new UserManagementFailure(code, reason));
    expect(result.status).toBe(status);
    expect(result.code).toBe(expected);
    expect(result.message.length).toBeGreaterThan(10);
  });

  it('giữ status cũ khi không có reason', () => {
    expect(describeUserManagementFailure(new UserManagementFailure('invalid')).status).toBe(400);
    expect(describeUserManagementFailure(new UserManagementFailure('forbidden')).status).toBe(403);
    expect(describeUserManagementFailure(new UserManagementFailure('conflict')).status).toBe(409);
    expect(describeUserManagementFailure(new UserManagementFailure('not_found')).status).toBe(404);
  });

  it('nêu tên quyền còn thiếu và đuôi email cần có', () => {
    const permission = describeUserManagementFailure(
      new UserManagementFailure('forbidden', 'missing_permission', 'user:delete'),
    );
    expect(permission.message).toContain('user:delete');
    const domain = describeUserManagementFailure(
      new UserManagementFailure('invalid', 'email_domain', 'sv1.dut.udn.vn'),
    );
    expect(domain.message).toContain('@sv1.dut.udn.vn');
    expect(domain.details?.[0]?.field).toBe('email');
  });

  it('báo trùng email hoặc MSSV riêng khi biết cột bị trùng, không lộ giá trị', () => {
    const email = describeUserManagementFailure(
      new UserManagementFailure('conflict', 'identity_exists', 'email'),
    );
    const studentId = describeUserManagementFailure(
      new UserManagementFailure('conflict', 'identity_exists', 'student_id'),
    );
    expect(email.code).toBe('USER_EMAIL_ALREADY_EXISTS');
    expect(studentId.code).toBe('USER_STUDENT_ID_ALREADY_EXISTS');
    expect(email.details?.[0]?.field).toBe('email');
    expect(JSON.stringify([email, studentId])).not.toContain('@');
  });

  it('gắn lỗi vào đúng trường ở details', () => {
    const result = describeUserManagementFailure(
      new UserManagementFailure('invalid', 'password_length'),
    );
    expect(result.details).toEqual([
      { field: 'password', code: 'INVALID', message: result.message },
    ]);
  });
});

describe('validateCreateManagedUser nêu đúng nguyên nhân', () => {
  it.each<[string, Partial<CreateManagedUser>, UserManagementReason]>([
    ['vai trò lạ', { role: 'ROOT' as RoleName }, 'role'],
    ['tên trống', { displayName: '  ' }, 'display_name'],
    ['email sai định dạng', { email: 'khong-phai-email' }, 'email_format'],
    ['email sai đuôi', { email: 'a@gmail.com' }, 'email_domain'],
    ['mật khẩu ngắn', { password: '123' }, 'password_length'],
    ['sinh viên thiếu MSSV', { studentId: null }, 'student_id_required'],
    ['MSSV có khoảng trắng', { studentId: '22 10' }, 'student_id_invalid'],
    [
      'giảng viên có MSSV',
      { role: RoleName.Lecturer, email: 'a@dut.udn.vn', studentId: '2210001' },
      'student_id_not_allowed',
    ],
  ])('%s', (_name, patch, reason) => {
    const error = failureOf({ ...valid, ...patch });
    expect(error.code).toBe('invalid');
    expect(error.reason).toBe(reason);
  });

  it('chấp nhận đầu vào hợp lệ', () => {
    expect(validateCreateManagedUser(valid).email).toBe('a@sv1.dut.udn.vn');
  });
});
