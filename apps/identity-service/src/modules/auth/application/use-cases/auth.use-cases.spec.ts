import { createHash } from 'node:crypto';

import type { BkRefreshClaims } from '@app/contracts';

import { AuthTokenIssuer } from '@/modules/auth/application';
import type {
  AuthAccountRepository,
  AuthFlowStore,
  BkTokenService,
  ExternalIdentityRepository,
  MicrosoftIdentityProvider,
  PasswordHasher,
  RefreshSessionRepository,
  LoginCodeGrant,
} from '@/modules/auth/application/ports';
import {
  CompleteMicrosoftLogin,
  ChangePassword,
  ExchangeMicrosoftLoginCode,
  GetCurrentAuthenticatedUser,
  LoginWithPassword,
  LogoutCurrentSession,
  RefreshSession,
  StartMicrosoftLogin,
} from '@/modules/auth/application/use-cases';
import { AuthFailure } from '@/modules/auth/domain';
import type { AuthAccount, LoginLookup } from '@/modules/auth/domain';
import { MemoryAuthFlowStore } from '@/modules/auth/infrastructure/memory';

const account: AuthAccount = {
  userId: 'user-1',
  studentId: '2210001',
  email: 'student@school.edu',
  status: 'ACTIVE',
  roles: ['STUDENT'],
};
const pair = { accessToken: 'access', refreshToken: 'refresh' };
const refreshClaims: BkRefreshClaims = {
  sub: 'user-1',
  jti: 'token-1',
  fid: 'family-1',
  type: 'refresh',
  exp: 9999999999,
};

function createAccounts(): AuthAccountRepository {
  const accounts: AuthAccountRepository = {
    findByIdentifier: jest.fn().mockResolvedValue({ ...account, passwordHash: 'hash' }),
    // Dẫn xuất từ findByIdentifier để các test cũ vẫn điều khiển được kết quả tra cứu.
    findForLogin: jest.fn(async (identifier: string): Promise<LoginLookup> => {
      const found = await accounts.findByIdentifier(identifier);
      return found ? { kind: 'found', account: found, deleted: false } : { kind: 'none' };
    }),
    findById: jest.fn().mockResolvedValue(account),
  };
  return accounts;
}

function createHasher(): PasswordHasher {
  return {
    hash: jest.fn().mockResolvedValue('hash'),
    verify: jest.fn().mockResolvedValue(true),
    verifyDummy: jest.fn().mockResolvedValue(undefined),
  };
}

function createSessions(): RefreshSessionRepository {
  return {
    create: jest.fn().mockResolvedValue(undefined),
    rotate: jest.fn().mockResolvedValue(true),
    revokeFamily: jest.fn().mockResolvedValue(undefined),
    revokeBySid: jest.fn().mockResolvedValue(undefined),
    revokeAll: jest.fn().mockResolvedValue(undefined),
    isActive: jest.fn().mockResolvedValue(true),
  };
}

function createTokens(): BkTokenService {
  return {
    signAccess: jest.fn().mockResolvedValue('access'),
    signRefresh: jest
      .fn()
      .mockResolvedValue({ token: 'refresh', expiresAt: new Date('2030-01-01') }),
    verifyRefresh: jest.fn().mockResolvedValue(refreshClaims),
    verifyAccess: jest.fn().mockResolvedValue('user-1'),
    verifyAccessClaims: jest.fn().mockResolvedValue({
      sub: 'user-1',
      sid: 'family-1',
      jti: 'access-1',
      roles: ['STUDENT'],
      permissions: [],
      type: 'access',
    }),
  };
}

function createIssuer(): AuthTokenIssuer {
  return new AuthTokenIssuer(createTokens(), createHasher(), createSessions(), {
    readForUser: jest.fn().mockResolvedValue([]),
  });
}

describe('Authentication use cases', () => {
  it('changes the current password and keeps only the current session family', async () => {
    const passwords = {
      findPasswordHash: jest.fn().mockResolvedValue('old-hash'),
      changePasswordAndRevokeOtherSessions: jest.fn().mockResolvedValue(true),
    };
    const hasher = createHasher();
    jest.mocked(hasher.verify).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const change = new ChangePassword(passwords, hasher);

    await expect(
      change.execute('user-1', 'session-current', 'old-password', 'new-password'),
    ).resolves.toBeUndefined();
    expect(passwords.changePasswordAndRevokeOtherSessions).toHaveBeenCalledWith(
      'user-1',
      'session-current',
      'old-hash',
      'hash',
    );
  });

  it('keeps Unicode and surrounding whitespace intact in both password checks', async () => {
    const passwords = {
      findPasswordHash: jest.fn().mockResolvedValue('old-hash'),
      changePasswordAndRevokeOtherSessions: jest.fn().mockResolvedValue(true),
    };
    const hasher = createHasher();
    jest.mocked(hasher.verify).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const change = new ChangePassword(passwords, hasher);

    await change.execute('user-1', 'session-current', '  mật khẩu cũ  ', ' new-password ');

    expect(hasher.verify).toHaveBeenNthCalledWith(1, 'old-hash', '  mật khẩu cũ  ');
    expect(hasher.hash).toHaveBeenCalledWith(' new-password ');
  });

  it('allows login with the new password and rejects the old password after change', async () => {
    let passwordHash = 'old-hash';
    const passwords = {
      findPasswordHash: jest.fn().mockImplementation(async () => passwordHash),
      changePasswordAndRevokeOtherSessions: jest
        .fn()
        .mockImplementation(
          async (_userId: string, _sid: string, _oldHash: string, nextHash: string) => {
            passwordHash = nextHash;
            return true;
          },
        ),
    };
    const accounts = createAccounts();
    jest.mocked(accounts.findByIdentifier).mockImplementation(async () => ({
      ...account,
      passwordHash,
    }));
    const hasher = createHasher();
    jest
      .mocked(hasher.verify)
      .mockImplementation(async (hash, password) =>
        hash === 'old-hash'
          ? password === 'old-password'
          : hash === 'new-hash' && password === 'new-password',
      );
    jest.mocked(hasher.hash).mockResolvedValue('new-hash');

    await new ChangePassword(passwords, hasher).execute(
      'user-1',
      'session-current',
      'old-password',
      'new-password',
    );
    const login = new LoginWithPassword(accounts, hasher, createIssuer());

    await expect(login.execute('2210001', 'old-password')).rejects.toEqual(
      new AuthFailure('wrong_password'),
    );
    await expect(login.execute('2210001', 'new-password')).resolves.toEqual({
      userId: 'user-1',
      ...pair,
    });
  });

  it.each([
    { currentPassword: 'wrong-password', newPassword: 'new-password', verify: [false] },
    { currentPassword: 'old-password', newPassword: 'old-password', verify: [true, true] },
    { currentPassword: 'old-password', newPassword: 'short', verify: [] },
  ])('rejects invalid password changes without updating the credential', async (input) => {
    const passwords = {
      findPasswordHash: jest.fn().mockResolvedValue('old-hash'),
      changePasswordAndRevokeOtherSessions: jest.fn().mockResolvedValue(true),
    };
    const hasher = createHasher();
    for (const result of input.verify) jest.mocked(hasher.verify).mockResolvedValueOnce(result);

    await expect(
      new ChangePassword(passwords, hasher).execute(
        'user-1',
        'session-current',
        input.currentPassword,
        input.newPassword,
      ),
    ).rejects.toBeInstanceOf(AuthFailure);
    expect(passwords.changePasswordAndRevokeOtherSessions).not.toHaveBeenCalled();
  });

  it('rejects a concurrent password update when the stored hash changed', async () => {
    const passwords = {
      findPasswordHash: jest.fn().mockResolvedValue('old-hash'),
      changePasswordAndRevokeOtherSessions: jest.fn().mockResolvedValue(false),
    };
    const hasher = createHasher();
    jest.mocked(hasher.verify).mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await expect(
      new ChangePassword(passwords, hasher).execute(
        'user-1',
        'session-current',
        'old-password',
        'new-password',
      ),
    ).rejects.toEqual(new AuthFailure('invalid_credentials'));
  });

  it('signs in the bootstrap Admin through its technical identifier', async () => {
    const accounts = createAccounts();
    const admin = { ...account, studentId: 'admin', roles: ['ADMIN'], passwordHash: 'hash' };
    jest.mocked(accounts.findByIdentifier).mockResolvedValueOnce(admin);
    const issuer = createIssuer();
    const issue = jest.spyOn(issuer, 'issueNewFamily');

    await expect(
      new LoginWithPassword(accounts, createHasher(), issuer).execute('admin', 'admin'),
    ).resolves.toEqual({ userId: 'user-1', ...pair });
    expect(issue).toHaveBeenCalledWith(admin, { clientType: 'web' }, 'hash');
  });

  it('rejects a wrong Admin password and a locked Admin before issuing tokens', async () => {
    const accounts = createAccounts();
    const hasher = createHasher();
    const issuer = createIssuer();
    const issue = jest.spyOn(issuer, 'issueNewFamily');
    const admin = { ...account, studentId: 'admin', roles: ['ADMIN'], passwordHash: 'hash' };
    jest.mocked(accounts.findByIdentifier).mockResolvedValue(admin);
    jest.mocked(hasher.verify).mockResolvedValueOnce(false);
    const login = new LoginWithPassword(accounts, hasher, issuer);

    await expect(login.execute('admin', 'wrong')).rejects.toEqual(
      new AuthFailure('wrong_password'),
    );
    jest.mocked(accounts.findByIdentifier).mockResolvedValueOnce({ ...admin, status: 'LOCKED' });
    await expect(login.execute('admin', 'admin')).rejects.toEqual(
      new AuthFailure('account_locked'),
    );
    expect(issue).not.toHaveBeenCalled();
  });

  describe('LoginWithPassword reports a specific reason (ERR-001 FR-007)', () => {
    const local = { ...account, passwordHash: 'hash' };

    function setup(lookup: LoginLookup, passwordOk = true) {
      const accounts = createAccounts();
      jest.mocked(accounts.findForLogin).mockResolvedValue(lookup);
      const hasher = createHasher();
      jest.mocked(hasher.verify).mockResolvedValue(passwordOk);
      const issuer = createIssuer();
      const issue = jest.spyOn(issuer, 'issueNewFamily');
      return { login: new LoginWithPassword(accounts, hasher, issuer), hasher, issue };
    }

    it('reports account_not_found and still spends the dummy hash time', async () => {
      const { login, hasher, issue } = setup({ kind: 'none' });
      await expect(login.execute('nobody', 'secret1')).rejects.toEqual(
        new AuthFailure('account_not_found'),
      );
      expect(hasher.verifyDummy).toHaveBeenCalledWith('secret1');
      expect(issue).not.toHaveBeenCalled();
    });

    it('reports identifier_ambiguous when several accounts match', async () => {
      const { login, issue } = setup({ kind: 'ambiguous' });
      await expect(login.execute('2210001', 'secret1')).rejects.toEqual(
        new AuthFailure('identifier_ambiguous'),
      );
      expect(issue).not.toHaveBeenCalled();
    });

    it('reports wrong_password for an active account', async () => {
      const { login, issue } = setup({ kind: 'found', account: local, deleted: false }, false);
      await expect(login.execute('2210001', 'bad')).rejects.toEqual(
        new AuthFailure('wrong_password'),
      );
      expect(issue).not.toHaveBeenCalled();
    });

    it.each([
      ['deleted', { deleted: true, status: 'ACTIVE' as const }, 'account_deleted'],
      ['locked', { deleted: false, status: 'LOCKED' as const }, 'account_locked'],
      ['pending', { deleted: false, status: 'PENDING' as const }, 'account_pending'],
    ])('reports the %s state only when the password is correct', async (_name, state, reason) => {
      const lookup: LoginLookup = {
        kind: 'found',
        deleted: state.deleted,
        account: { ...local, status: state.status },
      };
      const right = setup(lookup, true);
      await expect(right.login.execute('2210001', 'secret1')).rejects.toEqual(
        new AuthFailure(reason as 'account_deleted' | 'account_locked' | 'account_pending'),
      );
      expect(right.issue).not.toHaveBeenCalled();

      // Mật khẩu sai thì không lộ trạng thái (AC-003).
      const wrong = setup(lookup, false);
      await expect(wrong.login.execute('2210001', 'bad')).rejects.toEqual(
        new AuthFailure('wrong_password'),
      );
    });
  });

  it('returns the bootstrap Admin in its own /auth/me response', async () => {
    const accounts = createAccounts();
    jest.mocked(accounts.findById).mockResolvedValueOnce({
      ...account,
      studentId: 'admin',
      roles: ['ADMIN'],
    });
    await expect(new GetCurrentAuthenticatedUser(accounts).execute('user-1')).resolves.toEqual({
      userId: 'user-1',
      studentId: 'admin',
      roles: ['ADMIN'],
      status: 'ACTIVE',
    });
  });

  it('trims the student ID, keeps the password intact, and creates a new family', async () => {
    const accounts = createAccounts();
    const hasher = createHasher();
    const issuer = createIssuer();
    const result = await new LoginWithPassword(accounts, hasher, issuer).execute(
      ' 2210001 ',
      ' pass word ',
    );
    expect(accounts.findByIdentifier).toHaveBeenCalledWith('2210001');
    expect(hasher.verify).toHaveBeenCalledWith('hash', ' pass word ');
    expect(result).toEqual({ userId: 'user-1', ...pair });
  });

  it('uses the same login flow for a school email', async () => {
    const accounts = createAccounts();
    await new LoginWithPassword(accounts, createHasher(), createIssuer()).execute(
      ' STUDENT@school.edu ',
      '123456',
    );
    expect(accounts.findByIdentifier).toHaveBeenCalledWith('STUDENT@school.edu');
  });

  it('distinguishes missing student IDs from wrong passwords (ERR-001 FR-007 supersedes ID-001-AC-003 for login)', async () => {
    const accounts = createAccounts();
    const hasher = createHasher();
    const issuer = createIssuer();
    const issue = jest.spyOn(issuer, 'issueNewFamily');
    jest.mocked(accounts.findByIdentifier).mockResolvedValueOnce(null);
    const login = new LoginWithPassword(accounts, hasher, issuer);
    await expect(login.execute('missing', 'wrong')).rejects.toEqual(
      new AuthFailure('account_not_found'),
    );
    expect(hasher.verifyDummy).toHaveBeenCalledWith('wrong');
    jest.mocked(hasher.verify).mockResolvedValueOnce(false);
    await expect(login.execute('2210001', 'wrong')).rejects.toEqual(
      new AuthFailure('wrong_password'),
    );
    expect(issue).not.toHaveBeenCalled();
  });

  it.each(['LOCKED', 'PENDING'] as const)(
    'does not issue tokens for a %s student',
    async (status) => {
      const accounts = createAccounts();
      jest
        .mocked(accounts.findByIdentifier)
        .mockResolvedValue({ ...account, status, passwordHash: 'hash' });
      const issuer = createIssuer();
      const issue = jest.spyOn(issuer, 'issueNewFamily');
      await expect(
        new LoginWithPassword(accounts, createHasher(), issuer).execute('2210001', '123456'),
      ).rejects.toBeInstanceOf(AuthFailure);
      expect(issue).not.toHaveBeenCalled();
    },
  );

  it('issues access with the current effective permissions', async () => {
    const tokens = createTokens();
    const permissions = { readForUser: jest.fn().mockResolvedValue(['problem:create']) };
    const issuer = new AuthTokenIssuer(tokens, createHasher(), createSessions(), permissions);
    await issuer.issueNewFamily(account);
    expect(tokens.signAccess).toHaveBeenCalledWith(account, ['problem:create'], expect.any(String));
  });

  it('consumes Microsoft state and login code only once', async () => {
    const transactions = new Map<string, { nonce: string; verifier: string }>();
    const loginCodes = new Map<string, LoginCodeGrant>();
    const flows: AuthFlowStore = {
      putTransaction: async (state, transaction) => {
        transactions.set(state, transaction);
      },
      takeTransaction: async (state) => {
        const value = transactions.get(state) ?? null;
        transactions.delete(state);
        return value;
      },
      createLoginCode: async (grant) => {
        loginCodes.set('once', grant);
        return 'once';
      },
      takeLoginCode: async (code) => {
        const value = loginCodes.get(code) ?? null;
        loginCodes.delete(code);
        return value;
      },
    };
    const provider: MicrosoftIdentityProvider = {
      getAuthorizationUrl: jest
        .fn()
        .mockResolvedValue('https://login.microsoftonline.com/tenant/oauth'),
      exchangeCode: jest.fn().mockResolvedValue({
        tenantId: 'tenant',
        objectId: 'object',
        username: 'student@school.edu',
      }),
    };
    const identities: ExternalIdentityRepository = {
      resolveOrLink: jest.fn().mockResolvedValue(account),
    };
    const start = new StartMicrosoftLogin(provider, flows);
    await start.execute();
    const state = [...transactions.keys()][0];
    expect(state).toBeDefined();
    expect(provider.getAuthorizationUrl).toHaveBeenCalledWith(
      state,
      expect.any(String),
      expect.any(String),
    );
    expect(transactions.get(state ?? '')?.nonce).toHaveLength(43);
    expect(transactions.get(state ?? '')?.verifier).toHaveLength(43);
    const complete = new CompleteMicrosoftLogin(
      provider,
      flows,
      identities,
      'https://app.example/auth/callback',
    );
    const redirect = await complete.execute({ code: 'code', state });
    expect(new URL(redirect).searchParams.get('loginCode')).toBe('once');
    await expect(complete.execute({ code: 'code', state })).rejects.toBeInstanceOf(AuthFailure);
    const exchange = new ExchangeMicrosoftLoginCode(flows, createAccounts(), createIssuer());
    expect((await exchange.execute('once')).userId).toBe('user-1');
    await expect(exchange.execute('once')).rejects.toBeInstanceOf(AuthFailure);
  });

  it('binds a mobile Microsoft handoff to the app PKCE verifier', async () => {
    const verifier = 'v'.repeat(64);
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const flows = new MemoryAuthFlowStore();
    const provider: MicrosoftIdentityProvider = {
      getAuthorizationUrl: jest.fn(async (state) => `https://login.example/oauth?state=${state}`),
      exchangeCode: jest
        .fn()
        .mockResolvedValue({ tenantId: 'tenant', objectId: 'object', username: account.email }),
    };
    const start = new StartMicrosoftLogin(provider, flows, 'https://mobile.example/auth/callback');
    const complete = new CompleteMicrosoftLogin(
      provider,
      flows,
      { resolveOrLink: jest.fn().mockResolvedValue(account) },
      'https://web.example/auth/callback',
      'https://mobile.example/auth/callback',
    );
    const exchange = new ExchangeMicrosoftLoginCode(flows, createAccounts(), createIssuer());
    const url = await start.execute('mobile', challenge);
    const redirect = await complete.execute({
      code: 'code',
      state: new URL(url).searchParams.get('state')!,
    });
    expect(new URL(redirect).origin).toBe('https://mobile.example');
    expect(redirect).not.toContain('accessToken');
    const code = new URL(redirect).searchParams.get('loginCode')!;
    await expect(
      exchange.execute(code, { clientType: 'mobile' }, 'wrong'.repeat(10)),
    ).rejects.toBeInstanceOf(AuthFailure);
    await expect(exchange.execute(code, { clientType: 'mobile' }, verifier)).rejects.toBeInstanceOf(
      AuthFailure,
    );
    const secondUrl = await start.execute('mobile', challenge);
    const secondRedirect = await complete.execute({
      code: 'code',
      state: new URL(secondUrl).searchParams.get('state')!,
    });
    const secondCode = new URL(secondRedirect).searchParams.get('loginCode')!;
    expect((await exchange.execute(secondCode, { clientType: 'mobile' }, verifier)).userId).toBe(
      account.userId,
    );
  });

  it('rejects an inactive account before rotating refresh', async () => {
    const accounts = createAccounts();
    jest.mocked(accounts.findById).mockResolvedValue({ ...account, status: 'LOCKED' });
    const sessions = createSessions();
    const refresh = new RefreshSession(createTokens(), accounts, sessions, createIssuer());
    await expect(refresh.execute('refresh')).rejects.toBeInstanceOf(AuthFailure);
    expect(sessions.rotate).not.toHaveBeenCalled();
  });

  it('rejects a refresh token when atomic rotation loses the race', async () => {
    const sessions = createSessions();
    jest.mocked(sessions.rotate).mockResolvedValue(false);
    await expect(
      new RefreshSession(createTokens(), createAccounts(), sessions, createIssuer()).execute(
        'refresh',
      ),
    ).rejects.toBeInstanceOf(AuthFailure);
  });

  it('revokes the refresh session even when access is absent or stale', async () => {
    const sessions = createSessions();
    await new LogoutCurrentSession(createTokens(), sessions).execute({
      userId: 'other-user',
      refreshToken: 'refresh',
    });
    expect(sessions.revokeFamily).toHaveBeenCalledWith(refreshClaims, 'refresh');
    expect(sessions.revokeBySid).not.toHaveBeenCalled();
  });

  it('returns only the four current-user fields', async () => {
    const result = await new GetCurrentAuthenticatedUser(createAccounts()).execute('user-1');
    expect(result).toEqual({
      userId: 'user-1',
      studentId: '2210001',
      roles: ['STUDENT'],
      status: 'ACTIVE',
    });
  });
});
