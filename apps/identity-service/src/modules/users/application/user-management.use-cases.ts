import type { PasswordHasher } from '@/modules/auth/application';
import type { AuthorizationPrincipal } from '@/modules/rbac/domain';
import type { UserManagementRepository } from '@/modules/users/application/ports';
import {
  requireUserManagementPermission,
  UserManagementFailure,
  validateAdminReason,
  validateCreateManagedUser,
  type CreateManagedUser,
  type UserListFilters,
  type UserAdminProjection,
} from '@/modules/users/domain';

export class UserManagementUseCases {
  constructor(
    private readonly users: UserManagementRepository,
    private readonly passwords: PasswordHasher,
  ) {}

  async getQuizShareRecipient(userId: string): Promise<{ userId: string; roles: string[] } | null> {
    const user = await this.users.find(userId);
    return user && !user.deletedAt && user.status === 'ACTIVE'
      ? { userId: user.userId, roles: user.roles }
      : null;
  }

  async listUsers(
    principal: AuthorizationPrincipal,
    page: number,
    limit: number,
    includeDeleted: boolean,
    filters: UserListFilters = {},
  ): Promise<{ items: UserAdminProjection[]; page: number; limit: number; hasMore: boolean }> {
    requireUserManagementPermission(principal, 'user:read');
    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 50 ||
      !Number.isSafeInteger((page - 1) * limit)
    )
      throw new UserManagementFailure('invalid', 'pagination');
    const result = await this.users.list(page, limit, includeDeleted, filters);
    return { ...result, page, limit };
  }

  async getUser(principal: AuthorizationPrincipal, userId: string): Promise<UserAdminProjection> {
    requireUserManagementPermission(principal, 'user:read');
    const user = await this.users.find(userId);
    if (!user) throw new UserManagementFailure('not_found', 'user_not_found');
    return user;
  }

  async createUser(
    principal: AuthorizationPrincipal,
    input: CreateManagedUser,
  ): Promise<UserAdminProjection> {
    requireUserManagementPermission(principal, 'user:create');
    const validated = validateCreateManagedUser(input);
    const passwordHash = await this.passwords.hash(validated.password);
    return this.users.create(principal.userId, {
      studentId: validated.studentId,
      displayName: validated.displayName,
      email: validated.email,
      role: validated.role,
      reason: validated.reason,
      passwordHash,
    });
  }

  async setStatus(
    principal: AuthorizationPrincipal,
    userId: string,
    status: 'ACTIVE' | 'LOCKED',
    reason: string,
  ): Promise<UserAdminProjection> {
    requireUserManagementPermission(principal, 'user:status');
    return this.users.setStatus(principal.userId, userId, status, validateAdminReason(reason));
  }

  async deleteUser(
    principal: AuthorizationPrincipal,
    userId: string,
    reason: string,
  ): Promise<void> {
    requireUserManagementPermission(principal, 'user:delete');
    await this.users.softDelete(principal.userId, userId, validateAdminReason(reason));
  }

  async listStudents(
    page: number,
    limit: number,
  ): Promise<{
    items: Array<{ userId: string; studentId: string | null; displayName: string | null }>;
    page: number;
    limit: number;
    hasMore: boolean;
  }> {
    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 100 ||
      !Number.isSafeInteger((page - 1) * limit)
    )
      throw new UserManagementFailure('invalid', 'pagination');
    return { ...(await this.users.listStudents(page, limit)), page, limit };
  }
}
