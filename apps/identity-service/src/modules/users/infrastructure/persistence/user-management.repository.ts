import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';

import { Profile } from '@/modules/profiles/infrastructure/persistence';
import { RoleName } from '@/modules/rbac/domain';
import { Role } from '@/modules/rbac/infrastructure/persistence';
import type { UserManagementRepository } from '@/modules/users/application';
import {
  UserManagementFailure,
  type CreateManagedUser,
  type UserAdminProjection,
  type UserListFilters,
} from '@/modules/users/domain';
import { writeAdminAudit } from '@/modules/users/infrastructure/persistence/admin-audit';
import { AccountStatus, User } from '@/modules/users/infrastructure/persistence/user.entity';

function toProjection(user: User): UserAdminProjection {
  return {
    userId: user.id,
    studentId: user.studentId,
    email: user.email,
    displayName: user.displayName,
    status: user.status,
    roles: user.roles.map((role) => role.name).sort(),
    createdAt: user.createdAt,
    deletedAt: user.deletedAt,
  };
}

function auditState(user: User): Record<string, unknown> {
  return {
    status: user.status,
    roles: user.roles.map((role) => role.name).sort(),
    deletedAt: user.deletedAt,
  };
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  if ('code' in error && error.code === '23505') return true;
  return 'driverError' in error && isUniqueViolation(error.driverError);
}

/** Cột bị trùng theo chi tiết của Postgres ("Key (email)=(...)"); không lấy giá trị người dùng nhập. */
function uniqueViolationField(error: unknown): 'email' | 'student_id' | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const detail = 'detail' in error && typeof error.detail === 'string' ? error.detail : undefined;
  const column = detail?.match(/^Key \(([a-z_]+)\)=/)?.[1];
  if (column === 'email' || column === 'student_id') return column;
  return 'driverError' in error ? uniqueViolationField(error.driverError) : undefined;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

@Injectable()
export class TypeormUserManagementRepository implements UserManagementRepository {
  constructor(private readonly database: DataSource) {}

  async list(
    page: number,
    limit: number,
    includeDeleted: boolean,
    filters: UserListFilters,
  ): Promise<{
    items: UserAdminProjection[];
    hasMore: boolean;
  }> {
    const query = this.database
      .getRepository(User)
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.roles', 'role')
      .orderBy('user.createdAt', 'DESC')
      .addOrderBy('user.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit + 1);
    if (!includeDeleted) query.andWhere('user.deletedAt IS NULL');
    if (filters.status) query.andWhere('user.status = :status', { status: filters.status });
    if (filters.role)
      query.andWhere(
        `EXISTS (
      SELECT 1 FROM user_roles ur JOIN roles filter_role ON filter_role.id = ur.role_id
      WHERE ur.user_id = user.id AND filter_role.name = :role
    )`,
        { role: filters.role },
      );
    if (filters.q)
      query.andWhere(
        '(user.studentId ILIKE :q OR user.email ILIKE :q OR user.displayName ILIKE :q)',
        { q: `%${escapeLike(filters.q)}%` },
      );
    const users = await query.getMany();
    return { items: users.slice(0, limit).map(toProjection), hasMore: users.length > limit };
  }

  async find(userId: string): Promise<UserAdminProjection | null> {
    const user = await this.database.getRepository(User).findOne({ where: { id: userId } });
    return user ? toProjection(user) : null;
  }

  async create(
    actorId: string,
    input: Omit<CreateManagedUser, 'password'> & { passwordHash: string },
  ): Promise<UserAdminProjection> {
    try {
      return await this.database.transaction(async (manager) => {
        const role = await manager.getRepository(Role).findOneBy({ name: input.role });
        if (!role) throw new UserManagementFailure('conflict', 'role_unavailable');
        const id = randomUUID();
        await manager.insert(User, {
          id,
          studentId: input.studentId,
          displayName: input.displayName,
          email: input.email,
          passwordHash: input.passwordHash,
          status: AccountStatus.Active,
        });
        await manager.insert(Profile, {
          user: { id },
          displayName: input.displayName,
          avatarReference: null,
          bio: null,
        });
        await manager.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)', [
          id,
          role.id,
        ]);
        const created = await manager.getRepository(User).findOneByOrFail({ id });
        await writeAdminAudit(manager, {
          actorId,
          targetId: id,
          action: 'CREATE',
          reason: input.reason,
          beforeState: null,
          afterState: auditState(created),
        });
        return toProjection(created);
      });
    } catch (error) {
      if (isUniqueViolation(error))
        throw new UserManagementFailure('conflict', 'identity_exists', uniqueViolationField(error));
      throw error;
    }
  }

  async setStatus(
    actorId: string,
    userId: string,
    status: 'ACTIVE' | 'LOCKED',
    reason: string,
  ): Promise<UserAdminProjection> {
    return this.database.transaction(async (manager) => {
      const user = await this.loadMutable(manager, userId);
      this.requireTargetAllowed(user, actorId);
      if (user.deletedAt) throw new UserManagementFailure('not_found', 'user_deleted');
      if (user.status === (status === 'ACTIVE' ? AccountStatus.Active : AccountStatus.Locked))
        return toProjection(user);
      if (user.status === AccountStatus.Pending)
        throw new UserManagementFailure('conflict', 'account_pending');
      if (status === 'LOCKED') await this.protectLastAdmin(manager, user);
      const beforeState = auditState(user);
      const changedAt = new Date();
      user.status = status === 'ACTIVE' ? AccountStatus.Active : AccountStatus.Locked;
      await manager.getRepository(User).update(userId, { status: user.status });
      if (status === 'LOCKED') await this.revokeSessions(manager, userId, changedAt);
      await writeAdminAudit(manager, {
        actorId,
        targetId: userId,
        action: status === 'LOCKED' ? 'LOCK' : 'UNLOCK',
        reason,
        beforeState,
        afterState: auditState(user),
      });
      return toProjection(user);
    });
  }

  async softDelete(actorId: string, userId: string, reason: string): Promise<void> {
    await this.database.transaction(async (manager) => {
      const user = await this.loadMutable(manager, userId);
      this.requireTargetAllowed(user, actorId);
      if (user.deletedAt) return;
      await this.protectLastAdmin(manager, user);
      const beforeState = auditState(user);
      const deletedAt = new Date();
      user.deletedAt = deletedAt;
      await manager.getRepository(User).update(userId, { deletedAt });
      await this.revokeSessions(manager, userId, deletedAt);
      await writeAdminAudit(manager, {
        actorId,
        targetId: userId,
        action: 'DELETE',
        reason,
        beforeState,
        afterState: auditState(user),
      });
    });
  }

  async listStudents(
    page: number,
    limit: number,
  ): Promise<{
    items: Array<{ userId: string; studentId: string | null; displayName: string | null }>;
    hasMore: boolean;
  }> {
    const users = await this.database
      .getRepository(User)
      .createQueryBuilder('user')
      .innerJoin('user.roles', 'role', 'role.name = :role', { role: RoleName.Student })
      .where('user.deletedAt IS NULL AND user.isSystemAccount = false')
      .orderBy('user.studentId', 'ASC', 'NULLS LAST')
      .addOrderBy('user.id', 'ASC')
      .skip((page - 1) * limit)
      .take(limit + 1)
      .getMany();
    return {
      items: users.slice(0, limit).map((user) => ({
        userId: user.id,
        studentId: user.studentId,
        displayName: user.displayName,
      })),
      hasMore: users.length > limit,
    };
  }

  private async loadMutable(manager: EntityManager, userId: string): Promise<User> {
    await manager.query("SELECT id FROM roles WHERE name = 'ADMIN' FOR UPDATE");
    const locked = await manager
      .getRepository(User)
      .createQueryBuilder('user')
      .setLock('pessimistic_write')
      .where('user.id = :userId', { userId })
      .getOne();
    if (!locked) throw new UserManagementFailure('not_found', 'user_not_found');
    const user = await manager.getRepository(User).findOne({ where: { id: userId } });
    if (!user) throw new UserManagementFailure('not_found', 'user_not_found');
    return user;
  }

  private requireTargetAllowed(user: User, actorId: string): void {
    if (user.isSystemAccount) throw new UserManagementFailure('forbidden', 'system_account');
    if (user.id === actorId) throw new UserManagementFailure('forbidden', 'self_action');
  }

  private async protectLastAdmin(manager: EntityManager, user: User): Promise<void> {
    if (
      !user.roles.some((role) => role.name === RoleName.Admin) ||
      user.status !== AccountStatus.Active
    )
      return;
    const rows = await manager.query<
      Array<{ count: number }>
    >(`SELECT count(DISTINCT u.id)::int AS count
      FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id
      WHERE r.name = 'ADMIN' AND u.status = 'ACTIVE' AND u.deleted_at IS NULL`);
    if ((rows[0]?.count ?? 0) <= 1) throw new UserManagementFailure('conflict', 'last_admin');
  }

  private async revokeSessions(manager: EntityManager, userId: string, at: Date): Promise<void> {
    await manager.query(
      'UPDATE sessions SET revoked_at = $2 WHERE user_id = $1 AND revoked_at IS NULL',
      [userId, at],
    );
    await manager.query(
      'UPDATE refresh_tokens SET revoked_at = $2 WHERE user_id = $1 AND revoked_at IS NULL',
      [userId, at],
    );
  }
}
