import type {
  IdentityAccountContext,
  TransactionRunner,
  UserRoles,
} from '@/modules/rbac/application/ports';
import {
  type AuthorizationPrincipal,
  type AuthorizationDecision,
  RoleName,
  RbacFailure,
  evaluatePermission,
  requireAdmin,
  requireAnotherAdmin,
  requireAssignableRole,
  requireRevocableRole,
  requireRoleChangeReason,
} from '@/modules/rbac/domain';

async function loadUserRoles(context: IdentityAccountContext, userId: string): Promise<UserRoles> {
  const result = await context.findUserRoles(userId);
  if (!result) throw new RbacFailure('user_not_found');
  return result;
}

export class GetUserRoles {
  constructor(private readonly accounts: IdentityAccountContext) {}

  execute(principal: AuthorizationPrincipal, userId: string): Promise<UserRoles> {
    requireAdmin(principal);
    return loadUserRoles(this.accounts, userId);
  }
}

export class AssignRoleToUser {
  constructor(private readonly transactions: TransactionRunner) {}

  execute(
    principal: AuthorizationPrincipal,
    userId: string,
    role: RoleName,
    reason: string,
  ): Promise<UserRoles> {
    requireAdmin(principal);
    requireAssignableRole(principal, userId, role);
    const validatedReason = requireRoleChangeReason(reason);
    return this.transactions.run(async (repository) => {
      if (role === RoleName.Admin) await repository.lockAdminRole();
      await repository.lockUser(userId);
      const current = await loadUserRoles(repository, userId);
      if (current.roles.includes(role)) return current;
      await repository.assignRole(userId, role);
      const result = await loadUserRoles(repository, userId);
      await repository.recordRoleAudit({
        actorId: principal.userId,
        targetId: userId,
        action: 'ASSIGN_ROLE',
        reason: validatedReason,
        before: current.roles,
        after: result.roles,
      });
      return result;
    });
  }
}

export class RevokeRoleFromUser {
  constructor(private readonly transactions: TransactionRunner) {}

  execute(
    principal: AuthorizationPrincipal,
    userId: string,
    role: RoleName,
    reason: string,
  ): Promise<UserRoles> {
    requireAdmin(principal);
    requireRevocableRole(principal, userId, role);
    const validatedReason = requireRoleChangeReason(reason);
    return this.transactions.run(async (repository) => {
      if (role === RoleName.Admin) await repository.lockAdminRole();
      await repository.lockUser(userId);
      const current = await loadUserRoles(repository, userId);
      if (!current.roles.includes(role)) return current;
      if (role === RoleName.Admin && current.roles.includes(RoleName.Admin)) {
        requireAnotherAdmin(await repository.countAdmins());
      }
      await repository.revokeRole(userId, role);
      const result = await loadUserRoles(repository, userId);
      await repository.recordRoleAudit({
        actorId: principal.userId,
        targetId: userId,
        action: 'REVOKE_ROLE',
        reason: validatedReason,
        before: current.roles,
        after: result.roles,
      });
      return result;
    });
  }
}

export class EvaluateAuthorization {
  execute(
    principal: AuthorizationPrincipal,
    requiredPermission: string,
    resourceAllowed?: boolean,
  ): AuthorizationDecision {
    return evaluatePermission(principal, requiredPermission, resourceAllowed);
  }
}
