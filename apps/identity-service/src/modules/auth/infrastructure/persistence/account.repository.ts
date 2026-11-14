import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import type { SelectQueryBuilder } from 'typeorm';

import type { AuthAccountRepository } from '@/modules/auth/application/ports';
import type { AuthAccount, LocalAuthAccount, LoginLookup } from '@/modules/auth/domain';
import { User } from '@/modules/users/infrastructure/persistence';

function mapAccount(user: User): AuthAccount {
  return {
    userId: user.id,
    studentId: user.studentId,
    email: user.email,
    status: user.status,
    roles: user.roles.map((role) => role.name).sort(),
  };
}

@Injectable()
export class TypeormAuthAccountRepository implements AuthAccountRepository {
  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}

  private identifierQuery(identifier: string): SelectQueryBuilder<User> {
    return this.users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .leftJoinAndSelect('user.roles', 'role')
      .where(
        '(user.studentId = :identifier OR (LOWER(BTRIM(user.email)) = :email AND user.isSystemAccount = false))',
        { identifier, email: identifier.toLowerCase() },
      );
  }

  async findByIdentifier(identifier: string): Promise<LocalAuthAccount | null> {
    const users = await this.identifierQuery(identifier)
      .andWhere('user.deletedAt IS NULL')
      .take(2)
      .getMany();
    const user = users[0];
    if (users.length !== 1 || !user) return null;
    return { ...mapAccount(user), passwordHash: user.passwordHash };
  }

  /**
   * Ưu tiên tài khoản còn sống (giữ nguyên hành vi cũ). Chỉ khi không có tài khoản nào còn sống mới tra
   * tài khoản đã xóa mềm, để một MSSV được cấp lại sau khi xóa không bị tính là trùng.
   */
  async findForLogin(identifier: string): Promise<LoginLookup> {
    const live = await this.identifierQuery(identifier)
      .andWhere('user.deletedAt IS NULL')
      .take(2)
      .getMany();
    if (live.length > 1) return { kind: 'ambiguous' };
    const found = live[0];
    if (found) {
      return {
        kind: 'found',
        deleted: false,
        account: { ...mapAccount(found), passwordHash: found.passwordHash },
      };
    }
    const removed = await this.identifierQuery(identifier)
      .andWhere('user.deletedAt IS NOT NULL')
      .orderBy('user.deletedAt', 'DESC')
      .take(1)
      .getMany();
    const latest = removed[0];
    if (!latest) return { kind: 'none' };
    return {
      kind: 'found',
      deleted: true,
      account: { ...mapAccount(latest), passwordHash: latest.passwordHash },
    };
  }

  async findById(userId: string): Promise<AuthAccount | null> {
    const user = await this.users.findOneBy({ id: userId, deletedAt: IsNull() });
    return user ? mapAccount(user) : null;
  }
}
