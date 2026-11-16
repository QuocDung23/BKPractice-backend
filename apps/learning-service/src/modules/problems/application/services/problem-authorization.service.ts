import { ForbiddenError } from '@learning/modules/problems/application/errors/forbidden.error';
import type { Principal } from '@learning/modules/problems/application/models/principal';
import { Injectable } from '@nestjs/common';

export type ManagedProblemAction =
  'read-managed' | 'update' | 'publish' | 'hold' | 'republish' | 'delete' | 'restore';

const ACTION_PERMISSIONS: Record<ManagedProblemAction, string> = {
  'read-managed': 'problem:read-managed',
  update: 'problem:update',
  publish: 'problem:publish',
  hold: 'problem:hold',
  republish: 'problem:republish',
  delete: 'problem:delete',
  restore: 'problem:restore',
};

const ADMIN_ROLE = 'ADMIN';
const LECTURER_ROLE = 'LECTURER';

@Injectable()
export class ProblemAuthorizationService {
  requireCreate(principal: Principal): void {
    this.requireManager(principal);
    this.requirePermission(principal, 'problem:create');
  }

  requireManagedList(principal: Principal): void {
    this.requireManager(principal);
    this.requirePermission(principal, 'problem:read-managed');
  }

  requireManaged(principal: Principal, action: ManagedProblemAction, createdBy: string): void {
    this.requireManager(principal);
    this.requirePermission(principal, ACTION_PERMISSIONS[action]);
    if (!principal.roles.includes(ADMIN_ROLE) && principal.userId !== createdBy) {
      throw new ForbiddenError('Only the problem owner or an admin can do this');
    }
  }

  private requireManager(principal: Principal): void {
    if (!principal.roles.includes(ADMIN_ROLE) && !principal.roles.includes(LECTURER_ROLE)) {
      throw new ForbiddenError('Lecturer or admin role required');
    }
  }

  private requirePermission(principal: Principal, permission: string): void {
    if (!principal.permissions.includes(permission)) {
      throw new ForbiddenError(`Missing permission ${permission}`);
    }
  }
}
