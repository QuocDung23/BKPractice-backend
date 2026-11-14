import { Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';

import type {
  IdentityProfileContext,
  ProfileAccount,
  ProfileRepository,
} from '@/modules/profiles/application';
import {
  normalizeInitialDisplayName,
  ProfileFailure,
  type ProfilePatch,
  type ProfileRecord,
} from '@/modules/profiles/domain';
import { Profile } from '@/modules/profiles/infrastructure/persistence/profile.entity';
import { User } from '@/modules/users/infrastructure/persistence';

function mapProfile(profile: Profile, userId: string): ProfileRecord {
  return {
    profileId: profile.id,
    userId,
    displayName: profile.displayName,
    avatarReference: profile.avatarReference,
    bio: profile.bio,
  };
}

@Injectable()
export class TypeormProfileAccountContext implements IdentityProfileContext {
  constructor(private readonly database: DataSource) {}

  async findAccount(userId: string): Promise<ProfileAccount | null> {
    const user = await this.database
      .getRepository(User)
      .createQueryBuilder('user')
      .select(['user.id', 'user.status', 'user.displayName'])
      .where('user.id = :userId', { userId })
      .andWhere('user.isSystemAccount = false')
      .andWhere('user.deletedAt IS NULL')
      .getOne();
    if (!user) return null;
    return { userId: user.id, displayName: user.displayName, status: user.status };
  }
}

@Injectable()
export class TypeormProfileRepository implements ProfileRepository {
  constructor(private readonly database: DataSource) {}

  async find(userId: string): Promise<ProfileRecord | null> {
    const profile = await this.findEntity(this.database.manager, userId);
    return profile ? mapProfile(profile, userId) : null;
  }

  async searchByDisplayName(
    query: string,
    page: number,
    limit: number,
  ): Promise<{
    items: Array<Pick<ProfileRecord, 'userId' | 'displayName' | 'avatarReference'>>;
    hasMore: boolean;
  }> {
    const pattern = `%${query.replace(/[!%_]/g, (character) => `!${character}`)}%`;
    const rows = await this.database
      .getRepository(Profile)
      .createQueryBuilder('profile')
      .innerJoin('profile.user', 'user')
      .select('user.id', 'userId')
      .addSelect('profile.displayName', 'displayName')
      .addSelect('profile.avatarReference', 'avatarReference')
      .where("profile.displayName ILIKE :pattern ESCAPE '!'", { pattern })
      .andWhere('user.status = :status', { status: 'ACTIVE' })
      .andWhere('user.isSystemAccount = false')
      .andWhere('user.deletedAt IS NULL')
      .orderBy('LOWER(profile.displayName)', 'ASC')
      .addOrderBy('user.id', 'ASC')
      .offset((page - 1) * limit)
      .limit(limit + 1)
      .getRawMany<Pick<ProfileRecord, 'userId' | 'displayName' | 'avatarReference'>>();
    return { items: rows.slice(0, limit), hasMore: rows.length > limit };
  }

  async loadOrCreate(userId: string, displayName: string | null): Promise<ProfileRecord> {
    return this.database.transaction(async (manager) => {
      await this.lockUser(manager, userId);
      return mapProfile(await this.findOrCreate(manager, userId, displayName), userId);
    });
  }

  async update(
    userId: string,
    displayName: string | null,
    patch: ProfilePatch,
    createIfMissing: boolean,
  ): Promise<{ profile: ProfileRecord; replacedAvatar: string | null }> {
    return this.database.transaction(async (manager) => {
      await this.lockUser(manager, userId);
      const entity = createIfMissing
        ? await this.findOrCreate(manager, userId, displayName)
        : await this.findEntity(manager, userId);
      if (!entity) throw new ProfileFailure('not_found', 'profile');
      const oldAvatar = entity.avatarReference;
      if (patch.displayName !== undefined) entity.displayName = patch.displayName;
      if (patch.avatar !== undefined) entity.avatarReference = patch.avatar;
      if (patch.bio !== undefined) entity.bio = patch.bio;
      await manager.getRepository(Profile).save(entity);
      return {
        profile: mapProfile(entity, userId),
        replacedAvatar: oldAvatar !== entity.avatarReference ? oldAvatar : null,
      };
    });
  }

  private findEntity(manager: EntityManager, userId: string): Promise<Profile | null> {
    return manager
      .getRepository(Profile)
      .createQueryBuilder('profile')
      .where('profile.user_id = :userId', { userId })
      .getOne();
  }

  private async findOrCreate(
    manager: EntityManager,
    userId: string,
    displayName: string | null,
  ): Promise<Profile> {
    const existing = await this.findEntity(manager, userId);
    if (existing) return existing;
    const profile = manager.getRepository(Profile).create({
      user: { id: userId } as User,
      displayName: normalizeInitialDisplayName(displayName),
      avatarReference: null,
      bio: null,
    });
    return manager.getRepository(Profile).save(profile);
  }

  private async lockUser(manager: EntityManager, userId: string): Promise<void> {
    await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [userId]);
  }
}
