import {
  ProfileUseCases,
  type AvatarStorage,
  type IdentityProfileContext,
  type ProfileRepository,
} from '@/modules/profiles/application';
import {
  normalizeInitialDisplayName,
  ProfileFailure,
  type ProfilePatch,
  type ProfileRecord,
} from '@/modules/profiles/domain';
import { RoleName, type AuthorizationPrincipal } from '@/modules/rbac/domain';

describe('ProfileUseCases', () => {
  let saved: ProfileRecord | null;
  let initialDisplayName: string | null;
  let status: 'ACTIVE' | 'LOCKED' | 'PENDING';
  let cases: ProfileUseCases;
  let avatars: AvatarStorage;
  let repository: ProfileRepository;
  const admin: AuthorizationPrincipal = {
    userId: 'admin-id',
    roles: [RoleName.Admin],
    permissions: [],
  };
  const student: AuthorizationPrincipal = {
    userId: 'student-id',
    roles: [RoleName.Student],
    permissions: [],
  };

  beforeEach(() => {
    saved = null;
    initialDisplayName = '  Nguyễn An  ';
    status = 'ACTIVE';
    const accounts: IdentityProfileContext = {
      findAccount: jest.fn(async (userId) => ({ userId, displayName: initialDisplayName, status })),
    };
    repository = {
      find: jest.fn(async () => saved),
      listLeaderboardStudents: jest.fn(async () => []),
      searchByDisplayName: jest.fn(async () => ({ items: [], hasMore: false })),
      loadOrCreate: jest.fn(async (userId, name) => {
        saved ??= {
          profileId: 'profile-id',
          userId,
          displayName: normalizeInitialDisplayName(name),
          avatarReference: null,
          bio: null,
        };
        return saved;
      }),
      update: jest.fn(async (userId, name, patch: ProfilePatch, createIfMissing) => {
        if (!saved && !createIfMissing) throw new ProfileFailure('not_found');
        saved ??= {
          profileId: 'profile-id',
          userId,
          displayName: normalizeInitialDisplayName(name),
          avatarReference: null,
          bio: null,
        };
        const previous = saved.avatarReference;
        saved = {
          ...saved,
          ...(patch.displayName !== undefined ? { displayName: patch.displayName } : {}),
          ...(patch.avatar !== undefined ? { avatarReference: patch.avatar } : {}),
          ...(patch.bio !== undefined ? { bio: patch.bio } : {}),
        };
        return {
          profile: saved,
          replacedAvatar: previous !== saved.avatarReference ? previous : null,
        };
      }),
    };
    avatars = {
      createUploadIntent: jest.fn(),
      verifyReference: jest.fn(async () => undefined),
      signReadUrl: jest.fn(async (_userId, reference) => `https://signed.example/${reference}`),
      scheduleCleanup: jest.fn(),
    };
    cases = new ProfileUseCases(accounts, repository, avatars);
  });

  it('creates a missing profile once from the imported name and keeps later custom text', async () => {
    expect((await cases.getMy('student-id')).displayName).toBe('Nguyễn An');
    await cases.updateMy('student-id', { displayName: '  Tên riêng  ', bio: '  Xin chào  ' });
    expect(await cases.getMy('student-id')).toEqual({
      userId: 'student-id',
      displayName: 'Tên riêng',
      avatar: null,
      bio: 'Xin chào',
    });
    expect(await cases.updateMy('student-id', { bio: null })).toEqual({
      userId: 'student-id',
      displayName: 'Tên riêng',
      avatar: null,
      bio: null,
    });
  });

  it('changes only supplied fields in separate profile patches', async () => {
    await cases.updateMy('student-id', { bio: 'Xin chào' });
    await cases.updateMy('student-id', { avatar: 'avatar-key' });
    expect(await cases.getMy('student-id')).toEqual({
      userId: 'student-id',
      displayName: 'Nguyễn An',
      avatar: 'https://signed.example/avatar-key',
      bio: 'Xin chào',
    });
  });

  it('does not create an empty profile without an imported name', async () => {
    initialDisplayName = null;
    await expect(cases.getMy('student-id')).rejects.toThrow('missing_name');
    expect(saved).toBeNull();
  });

  it('keeps an existing profile usable when the imported name is unavailable', async () => {
    await cases.getMy('student-id');
    initialDisplayName = null;
    expect((await cases.getMy('student-id')).displayName).toBe('Nguyễn An');
  });

  it('rejects unapproved fields and failed avatar checks before state changes', async () => {
    await cases.getMy('student-id');
    await expect(cases.updateMy('student-id', { email: 'other@example.edu' })).rejects.toThrow(
      'invalid',
    );
    jest.mocked(avatars.verifyReference).mockRejectedValueOnce(new ProfileFailure('dependency'));
    await expect(cases.updateMy('student-id', { avatar: 'bad' })).rejects.toThrow('dependency');
    expect(saved?.avatarReference).toBeNull();
  });

  it('returns only public fields and hides locked or pending accounts', async () => {
    await cases.getMy('student-id');
    expect(await cases.getPublic('student-id')).toEqual({
      displayName: 'Nguyễn An',
      avatar: null,
      bio: null,
    });
    status = 'LOCKED';
    await expect(cases.getPublic('student-id')).rejects.toThrow('not_found');
    status = 'PENDING';
    await expect(cases.getPublic('student-id')).rejects.toThrow('not_found');
  });

  it('signs avatars only for leaderboard rows that need display profiles', async () => {
    jest.mocked(repository.listLeaderboardStudents).mockResolvedValue([
      { userId: 'student-id', displayName: ' Nguyễn An ', avatarReference: 'private-avatar' },
      { userId: 'student-no-profile', displayName: null, avatarReference: null },
    ]);
    jest.mocked(avatars.signReadUrl).mockResolvedValue('https://example.com/signed-avatar');
    const ids = ['student-id', 'student-no-profile'];

    await expect(cases.listLeaderboardStudents(ids, false)).resolves.toEqual([
      { userId: 'student-id' },
      { userId: 'student-no-profile' },
    ]);
    expect(avatars.signReadUrl).not.toHaveBeenCalled();
    await expect(cases.listLeaderboardStudents(ids, true)).resolves.toEqual([
      {
        userId: 'student-id',
        displayName: 'Nguyễn An',
        avatar: 'https://example.com/signed-avatar',
      },
      { userId: 'student-no-profile', displayName: 'Sinh viên', avatar: null },
    ]);
  });

  it('searches the trimmed Profile name and returns only public fields with signed avatars', async () => {
    jest.mocked(repository.searchByDisplayName).mockResolvedValueOnce({
      items: [
        { userId: 'other-id', displayName: 'Nguyễn An', avatarReference: 'avatar-key' },
        { userId: 'third-id', displayName: 'Nguyễn Bình', avatarReference: null },
      ],
      hasMore: true,
    });
    expect(await cases.searchProfiles('  Nguyễn  ', 2, 2)).toEqual({
      items: [
        {
          userId: 'other-id',
          displayName: 'Nguyễn An',
          avatar: 'https://signed.example/avatar-key',
        },
        { userId: 'third-id', displayName: 'Nguyễn Bình', avatar: null },
      ],
      page: 2,
      limit: 2,
      hasMore: true,
    });
    expect(repository.searchByDisplayName).toHaveBeenCalledWith('Nguyễn', 2, 2);
    expect(avatars.signReadUrl).toHaveBeenCalledWith('other-id', 'avatar-key');
  });

  it('searches after the first typed character', async () => {
    jest.mocked(repository.searchByDisplayName).mockResolvedValueOnce({
      items: [{ userId: 'dung-id', displayName: 'Dũng Dương', avatarReference: null }],
      hasMore: false,
    });
    expect(await cases.searchProfiles(' D ', 1, 20)).toEqual({
      items: [{ userId: 'dung-id', displayName: 'Dũng Dương', avatar: null }],
      page: 1,
      limit: 20,
      hasMore: false,
    });
    expect(repository.searchByDisplayName).toHaveBeenCalledWith('D', 1, 20);
  });

  it('rejects invalid search bounds before querying storage', async () => {
    for (const [query, page, limit] of [
      [' ', 1, 20],
      ['', 1, 20],
      ['a'.repeat(101), 1, 20],
      ['An', 0, 20],
      ['An', 1.5, 20],
      ['An', 1, 51],
      ['An', Number.MAX_SAFE_INTEGER, 50],
    ] as const) {
      await expect(cases.searchProfiles(query, page, limit)).rejects.toThrow('invalid');
    }
    expect(repository.searchByDisplayName).not.toHaveBeenCalled();
  });

  it('allows Admin to manage an existing profile and denies Student cross-user updates', async () => {
    await cases.getMy('student-id');
    await expect(cases.adminUpdate(student, 'student-id', { bio: 'x' })).rejects.toThrow(
      'forbidden',
    );
    expect(await cases.adminUpdate(admin, 'student-id', { bio: '  admin edit  ' })).toEqual({
      userId: 'student-id',
      displayName: 'Nguyễn An',
      avatar: null,
      bio: 'admin edit',
    });
    expect(saved?.bio).toBe('admin edit');
  });

  it('schedules old avatar cleanup only after a successful change', async () => {
    await cases.getMy('student-id');
    await cases.updateMy('student-id', { avatar: 'old' });
    await cases.updateMy('student-id', { avatar: null });
    expect(avatars.scheduleCleanup).toHaveBeenCalledWith('old');
    expect(saved?.avatarReference).toBeNull();
  });
});
