import { validatePermissionCode } from '@/modules/rbac/domain/effective-permissions';
import { isRoleName, RoleName } from '@/modules/rbac/domain/role-name';

export interface AuthorizationPrincipal {
  userId: string;
  roles: RoleName[];
  permissions: string[];
}

export type RbacFailureReason = 'not_admin' | 'self_admin' | 'role_unknown' | 'reason_invalid';

export class RbacFailure extends Error {
  constructor(
    readonly code: 'forbidden' | 'invalid_role' | 'user_not_found' | 'last_admin',
    readonly reason?: RbacFailureReason,
  ) {
    super(code);
  }
}

export function requireAdmin(principal: AuthorizationPrincipal): void {
  if (
    !principal.userId ||
    !Array.isArray(principal.roles) ||
    !principal.roles.every(isRoleName) ||
    !principal.roles.includes(RoleName.Admin)
  ) {
    throw new RbacFailure('forbidden', 'not_admin');
  }
}

export function requireAssignableRole(
  principal: AuthorizationPrincipal,
  userId: string,
  role: RoleName,
): void {
  if (!isRoleName(role)) throw new RbacFailure('invalid_role', 'role_unknown');
  if (role === RoleName.Admin && principal.userId === userId)
    throw new RbacFailure('forbidden', 'self_admin');
}

export function requireRevocableRole(
  principal: AuthorizationPrincipal,
  userId: string,
  role: RoleName,
): void {
  if (!isRoleName(role)) throw new RbacFailure('invalid_role', 'role_unknown');
  if (role === RoleName.Admin && principal.userId === userId) {
    throw new RbacFailure('forbidden', 'self_admin');
  }
}

export function requireRoleChangeReason(value: string): string {
  const reason = typeof value === 'string' ? value.trim() : '';
  if (!reason || reason.length > 500 || /\p{Cc}/u.test(reason))
    throw new RbacFailure('invalid_role', 'reason_invalid');
  return reason;
}

export function requireAnotherAdmin(adminCount: number): void {
  if (adminCount <= 1) throw new RbacFailure('last_admin');
}

export interface AuthorizationDecision {
  allowed: boolean;
  reason: 'allowed' | 'invalid_context' | 'missing_permission' | 'resource_denied';
}

export function evaluatePermission(
  principal: AuthorizationPrincipal,
  requiredPermission: string,
  resourceAllowed?: boolean,
): AuthorizationDecision {
  if (
    !principal.userId ||
    !Array.isArray(principal.roles) ||
    !principal.roles.every(isRoleName) ||
    !Array.isArray(principal.permissions) ||
    !principal.permissions.every((permission) => typeof permission === 'string') ||
    !validatePermissionCode(requiredPermission)
  ) {
    return { allowed: false, reason: 'invalid_context' };
  }
  if (!principal.permissions.includes(requiredPermission)) {
    return { allowed: false, reason: 'missing_permission' };
  }
  if (resourceAllowed === false) return { allowed: false, reason: 'resource_denied' };
  return { allowed: true, reason: 'allowed' };
}
