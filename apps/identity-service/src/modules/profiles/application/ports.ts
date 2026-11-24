import type { ProfilePatch, ProfileRecord } from '@/modules/profiles/domain';

export interface ProfileAccount {
  userId: string;
  displayName: string | null;
  status: 'ACTIVE' | 'LOCKED' | 'PENDING';
}

export interface IdentityProfileContext {
  findAccount(userId: string): Promise<ProfileAccount | null>;
}

export interface ProfileRepository {
  find(userId: string): Promise<ProfileRecord | null>;
  listLeaderboardStudents(userIds: string[]): Promise<
    {
      userId: string;
      displayName: string | null;
      avatarReference: string | null;
    }[]
  >;
  searchByDisplayName(
    query: string,
    page: number,
    limit: number,
  ): Promise<{
    items: Array<Pick<ProfileRecord, 'userId' | 'displayName' | 'avatarReference'>>;
    hasMore: boolean;
  }>;
  loadOrCreate(userId: string, displayName: string | null): Promise<ProfileRecord>;
  update(
    userId: string,
    displayName: string | null,
    patch: ProfilePatch,
    createIfMissing: boolean,
  ): Promise<{ profile: ProfileRecord; replacedAvatar: string | null }>;
}

export interface AvatarStorage {
  createUploadIntent(
    userId: string,
    contentType: string,
    size: number,
  ): Promise<{
    avatar: string;
    uploadUrl: string;
    expiresInSeconds: number;
    headers: Record<string, string>;
  }>;
  verifyReference(userId: string, reference: string): Promise<void>;
  signReadUrl(userId: string, reference: string): Promise<string>;
  scheduleCleanup(reference: string): void;
}

export const PROFILE_REPOSITORY = Symbol('ProfileRepository');
export const PROFILE_ACCOUNT_CONTEXT = Symbol('IdentityProfileContext');
export const AVATAR_STORAGE = Symbol('AvatarStorage');
