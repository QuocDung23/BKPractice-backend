import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';

import type {
  AccountImportRepository,
  PreparedImportAccount,
} from '@/modules/auth/application/ports';
import {
  AccountImportFailure,
  type AccountImportRow,
  type ImportIssue,
} from '@/modules/auth/domain';
import { Profile } from '@/modules/profiles/infrastructure/persistence';
import { Role } from '@/modules/rbac/infrastructure/persistence';
import { AccountStatus, User } from '@/modules/users/infrastructure/persistence';
import { writeAdminAudit } from '@/modules/users/infrastructure/persistence/admin-audit';

@Injectable()
export class TypeormAccountImportRepository implements AccountImportRepository {
  constructor(private readonly database: DataSource) {}

  async findConflicts(rows: AccountImportRow[]): Promise<ImportIssue[]> {
    try {
      await this.loadRoles(this.database.manager, rows);
      return await this.loadConflicts(this.database.manager, rows);
    } catch (error) {
      if (error instanceof AccountImportFailure) throw error;
      throw new AccountImportFailure('dependency_unavailable');
    }
  }

  async createAll(rows: PreparedImportAccount[], actorId: string): Promise<void> {
    try {
      await this.database.transaction(async (manager) => {
        const roles = await this.loadRoles(manager, rows);
        const conflicts = await this.loadConflicts(manager, rows);
        if (conflicts.length) throw new AccountImportFailure('conflict', conflicts, rows.length);
        const users = rows.map((row) => ({
          id: randomUUID(),
          studentId: row.studentId,
          email: row.email,
          displayName: row.displayName,
          passwordHash: row.passwordHash,
          status: AccountStatus.Active,
        }));
        await manager.insert(User, users);
        await manager.insert(
          Profile,
          users.map((user, index) => ({
            user: { id: user.id },
            displayName: rows[index]!.displayName,
            avatarReference: null,
            bio: null,
          })),
        );
        await manager.insert(
          'user_roles',
          users.map((user, index) => ({
            user_id: user.id,
            role_id: roles.get(rows[index]!.role)!,
          })),
        );
        for (let index = 0; index < users.length; index++) {
          await writeAdminAudit(manager, {
            actorId,
            targetId: users[index]!.id,
            action: 'IMPORT',
            reason: 'Excel account import',
            beforeState: null,
            afterState: { status: 'ACTIVE', roles: [rows[index]!.role], deletedAt: null },
          });
        }
      });
    } catch (error) {
      if (error instanceof AccountImportFailure) throw error;
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === '23505'
      ) {
        const issues = await this.findConflicts(rows);
        throw new AccountImportFailure(
          'conflict',
          issues.length ? issues : [{ row: 0, field: 'row', code: 'concurrent_conflict' }],
          rows.length,
        );
      }
      throw new AccountImportFailure('dependency_unavailable');
    }
  }

  private async loadRoles(
    manager: EntityManager,
    rows: AccountImportRow[],
  ): Promise<Map<string, string>> {
    const roles = new Map((await manager.find(Role)).map((role) => [role.name, role.id]));
    if (rows.some((row) => !roles.has(row.role)))
      throw new AccountImportFailure('dependency_unavailable', [
        { row: 0, field: 'role', code: 'role_not_seeded' },
      ]);
    return roles;
  }

  private async loadConflicts(
    manager: EntityManager,
    rows: AccountImportRow[],
  ): Promise<ImportIssue[]> {
    const ids = rows.flatMap((row) => (row.studentId ? [row.studentId] : []));
    const conditions = ['LOWER(BTRIM(user.email)) IN (:...emails)'];
    if (ids.length) conditions.push('user.studentId IN (:...ids)');
    const query = manager
      .createQueryBuilder(User, 'user')
      .select(['user.email', 'user.studentId'])
      .where(`(${conditions.join(' OR ')})`, { emails: rows.map((row) => row.email), ids })
      .andWhere('user.isSystemAccount = false');
    const existing = await query.getMany();
    const emails = new Set(existing.map((user) => user.email.trim().toLowerCase()));
    const studentIds = new Set(existing.map((user) => user.studentId));
    return rows.flatMap((row) => {
      const issues: ImportIssue[] = [];
      if (emails.has(row.email))
        issues.push({ row: row.row, field: 'email', code: 'already_exists' });
      if (row.studentId && studentIds.has(row.studentId))
        issues.push({ row: row.row, field: 'mssv', code: 'already_exists' });
      return issues;
    });
  }
}
