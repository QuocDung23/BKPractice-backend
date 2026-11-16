export interface ProfileRecord {
  profileId: string;
  userId: string;
  displayName: string;
  avatarReference: string | null;
  bio: string | null;
}

export interface ProfilePatch {
  displayName?: string;
  avatar?: string | null;
  bio?: string | null;
}

export type ProfileFailureReason =
  | 'display_name'
  | 'bio'
  | 'avatar'
  | 'unknown_field'
  | 'body'
  | 'search'
  | 'avatar_upload'
  | 'avatar_not_uploaded'
  | 'account'
  | 'profile';

export class ProfileFailure extends Error {
  constructor(
    readonly code: 'invalid' | 'missing_name' | 'not_found' | 'forbidden' | 'dependency',
    readonly reason?: ProfileFailureReason,
  ) {
    super(code);
  }
}

function trimText(
  value: unknown,
  maximum: number,
  reason: 'display_name' | 'bio',
  nullable = false,
): string | null {
  if (value === null && nullable) return null;
  if (typeof value !== 'string') throw new ProfileFailure('invalid', reason);
  const trimmed = value.trim();
  if ((!nullable && !trimmed) || Array.from(trimmed).length > maximum) {
    throw new ProfileFailure('invalid', reason);
  }
  return trimmed;
}

export function normalizeProfilePatch(value: unknown): ProfilePatch {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ProfileFailure('invalid', 'body');
  }
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !['displayName', 'avatar', 'bio'].includes(key))) {
    throw new ProfileFailure('invalid', 'unknown_field');
  }
  const patch: ProfilePatch = {};
  if (input.displayName !== undefined) {
    patch.displayName = trimText(input.displayName, 100, 'display_name') as string;
  }
  if (input.avatar !== undefined) {
    if (input.avatar !== null && typeof input.avatar !== 'string') {
      throw new ProfileFailure('invalid', 'avatar');
    }
    patch.avatar = input.avatar;
  }
  if (input.bio !== undefined) {
    patch.bio = trimText(input.bio, 1000, 'bio', true);
  }
  return patch;
}

export function normalizeInitialDisplayName(value: string | null): string {
  if (value === null) throw new ProfileFailure('missing_name');
  try {
    return trimText(value, 100, 'display_name') as string;
  } catch {
    throw new ProfileFailure('missing_name');
  }
}
