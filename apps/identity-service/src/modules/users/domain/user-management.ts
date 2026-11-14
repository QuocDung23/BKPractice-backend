import { evaluatePermission, RoleName, type AuthorizationPrincipal } from '@/modules/rbac/domain';

export interface UserAdminProjection {
  userId: string;
  studentId: string | null;
  email: string;
  displayName: string | null;
  status: 'ACTIVE' | 'LOCKED' | 'PENDING';
  roles: string[];
  createdAt: Date;
  deletedAt: Date | null;
}

export type UserManagementReason =
  | 'pagination'
  | 'admin_reason'
  | 'role'
  | 'display_name'
  | 'email_format'
  | 'email_domain'
  | 'password_length'
  | 'student_id_required'
  | 'student_id_invalid'
  | 'student_id_not_allowed'
  | 'user_not_found'
  | 'user_deleted'
  | 'missing_permission'
  | 'system_account'
  | 'self_action'
  | 'role_unavailable'
  | 'identity_exists'
  | 'account_pending'
  | 'last_admin';

/** `reason` nêu nguyên nhân cụ thể; `detail` mang thông tin an toàn đi kèm (tên quyền, đuôi email, trường trùng). */
export class UserManagementFailure extends Error {
  constructor(
    readonly code: 'invalid' | 'not_found' | 'forbidden' | 'conflict',
    readonly reason?: UserManagementReason,
    readonly detail?: string,
  ) {
    super(code);
  }
}

export function requireUserManagementPermission(
  principal: AuthorizationPrincipal,
  permission: 'user:read' | 'user:delete' | 'user:create' | 'user:status',
): void {
  if (
    !principal.roles.includes(RoleName.Admin) ||
    !evaluatePermission(principal, permission).allowed
  )
    throw new UserManagementFailure('forbidden', 'missing_permission', permission);
}

export interface CreateManagedUser {
  studentId: string | null;
  displayName: string;
  email: string;
  password: string;
  role: RoleName;
  reason: string;
}

export interface UserListFilters {
  q?: string;
  role?: RoleName;
  status?: UserAdminProjection['status'];
}

export function validateAdminReason(value: string): string {
  const reason = typeof value === 'string' ? value.trim() : '';
  if (!reason || reason.length > 500 || /\p{Cc}/u.test(reason))
    throw new UserManagementFailure('invalid', 'admin_reason');
  return reason;
}

export function validateCreateManagedUser(input: CreateManagedUser): CreateManagedUser {
  const displayName = typeof input.displayName === 'string' ? input.displayName.trim() : '';
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const studentId = typeof input.studentId === 'string' ? input.studentId.trim() : null;
  const role = input.role;
  const domain = role === RoleName.Student ? 'sv1.dut.udn.vn' : 'dut.udn.vn';
  if (![RoleName.Student, RoleName.Lecturer, RoleName.Admin].includes(role))
    throw new UserManagementFailure('invalid', 'role');
  if (!displayName || displayName.length > 100 || /\p{Cc}/u.test(displayName))
    throw new UserManagementFailure('invalid', 'display_name');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320)
    throw new UserManagementFailure('invalid', 'email_format');
  if (!email.endsWith(`@${domain}`))
    throw new UserManagementFailure('invalid', 'email_domain', domain);
  if (
    typeof input.password !== 'string' ||
    input.password.length < 8 ||
    input.password.length > 128
  )
    throw new UserManagementFailure('invalid', 'password_length');
  if (role === RoleName.Student) {
    if (!studentId) throw new UserManagementFailure('invalid', 'student_id_required');
    if (studentId.length > 64 || /\s/.test(studentId))
      throw new UserManagementFailure('invalid', 'student_id_invalid');
  } else if (studentId !== null && studentId !== '') {
    throw new UserManagementFailure('invalid', 'student_id_not_allowed');
  }
  return {
    ...input,
    studentId: role === RoleName.Student ? studentId : null,
    displayName,
    email,
    reason: validateAdminReason(input.reason),
  };
}
