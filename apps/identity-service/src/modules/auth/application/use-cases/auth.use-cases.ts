import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import type { AuthTokenIssuer, TokenPair } from '@/modules/auth/application';
import type {
  AuthAccountRepository,
  AuthFlowStore,
  BkTokenService,
  ExternalIdentityRepository,
  PasswordChangeRepository,
  MicrosoftIdentityProvider,
  PasswordHasher,
  RefreshSessionRepository,
  SessionMetadata,
  ClientType,
} from '@/modules/auth/application/ports';
import { AuthFailure, requireActiveAccount } from '@/modules/auth/domain';

export class LoginWithPassword {
  constructor(
    private readonly accounts: AuthAccountRepository,
    private readonly hasher: PasswordHasher,
    private readonly issuer: AuthTokenIssuer,
  ) {}

  async execute(
    identifier: string,
    password: string,
    metadata: SessionMetadata = { clientType: 'web' },
  ): Promise<{ userId: string } & TokenPair> {
    const lookup = await this.accounts.findForLogin(identifier.trim());
    if (lookup.kind !== 'found') {
      await this.hasher.verifyDummy(password);
      throw new AuthFailure(lookup.kind === 'none' ? 'account_not_found' : 'identifier_ambiguous');
    }
    const { account, deleted } = lookup;
    if (!(await this.hasher.verify(account.passwordHash, password))) {
      throw new AuthFailure('wrong_password');
    }
    // Trạng thái tài khoản chỉ được báo sau khi mật khẩu đúng (ERR-001 FR-007).
    if (deleted) throw new AuthFailure('account_deleted');
    if (account.status === 'LOCKED') throw new AuthFailure('account_locked');
    if (account.status === 'PENDING') throw new AuthFailure('account_pending');
    requireActiveAccount(account);
    return {
      userId: account.userId,
      ...(await this.issuer.issueNewFamily(account, metadata, account.passwordHash)),
    };
  }
}

export class StartMicrosoftLogin {
  constructor(
    private readonly provider: MicrosoftIdentityProvider,
    private readonly flows: AuthFlowStore,
    private readonly mobileRedirectUrl?: string,
  ) {}

  async execute(clientType: ClientType = 'web', mobileChallenge?: string): Promise<string> {
    if (clientType === 'mobile' && !this.mobileRedirectUrl)
      throw new AuthFailure('dependency_unavailable');
    if (clientType === 'mobile' && !/^[A-Za-z0-9_-]{43}$/.test(mobileChallenge ?? ''))
      throw new AuthFailure('invalid_credentials');
    const state = randomBytes(32).toString('base64url');
    const nonce = randomBytes(32).toString('base64url');
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const url = await this.provider.getAuthorizationUrl(state, nonce, challenge);
    await this.flows.putTransaction(state, { nonce, verifier, clientType, mobileChallenge });
    return url;
  }
}

export class CompleteMicrosoftLogin {
  constructor(
    private readonly provider: MicrosoftIdentityProvider,
    private readonly flows: AuthFlowStore,
    private readonly identities: ExternalIdentityRepository,
    private readonly loginRedirectUrl: string,
    private readonly mobileRedirectUrl?: string,
  ) {}

  async execute(input: { code?: string; state?: string; error?: string }): Promise<string> {
    if (input.error || !input.code || !input.state) throw new AuthFailure('invalid_credentials');
    const transaction = await this.flows.takeTransaction(input.state);
    if (!transaction) throw new AuthFailure('invalid_credentials');
    const identity = await this.provider.exchangeCode(input.code, transaction);
    const account = await this.identities.resolveOrLink(identity);
    requireActiveAccount(account);
    const clientType = transaction.clientType ?? 'web';
    if (clientType === 'mobile' && !this.mobileRedirectUrl)
      throw new AuthFailure('dependency_unavailable');
    const loginCode = await this.flows.createLoginCode({
      userId: account.userId,
      clientType,
      mobileChallenge: transaction.mobileChallenge,
    });
    const url = new URL(clientType === 'mobile' ? this.mobileRedirectUrl! : this.loginRedirectUrl);
    url.searchParams.set('loginCode', loginCode);
    return url.toString();
  }
}

export class ExchangeMicrosoftLoginCode {
  constructor(
    private readonly flows: AuthFlowStore,
    private readonly accounts: AuthAccountRepository,
    private readonly issuer: AuthTokenIssuer,
  ) {}

  async execute(
    loginCode: string,
    metadata: SessionMetadata = { clientType: 'web' },
    mobileVerifier?: string,
  ): Promise<{ userId: string } & TokenPair> {
    const grant = await this.flows.takeLoginCode(loginCode);
    if (!grant) throw new AuthFailure('invalid_token');
    if (grant.clientType === 'mobile') {
      const challenge = /^[A-Za-z0-9._~-]{43,128}$/.test(mobileVerifier ?? '')
        ? createHash('sha256').update(mobileVerifier!).digest('base64url')
        : '';
      if (
        !grant.mobileChallenge ||
        challenge.length !== grant.mobileChallenge.length ||
        !timingSafeEqual(Buffer.from(challenge), Buffer.from(grant.mobileChallenge))
      )
        throw new AuthFailure('invalid_token');
    }
    const account = await this.accounts.findById(grant.userId);
    requireActiveAccount(account);
    return { userId: grant.userId, ...(await this.issuer.issueNewFamily(account, metadata)) };
  }
}

export class RefreshSession {
  constructor(
    private readonly tokens: BkTokenService,
    private readonly accounts: AuthAccountRepository,
    private readonly sessions: RefreshSessionRepository,
    private readonly issuer: AuthTokenIssuer,
  ) {}

  async execute(rawToken: string): Promise<{ userId: string } & TokenPair> {
    const current = await this.tokens.verifyRefresh(rawToken);
    const account = await this.accounts.findById(current.sub);
    requireActiveAccount(account);
    const prepared = await this.issuer.prepare(account, current.fid);
    if (!(await this.sessions.rotate(current, rawToken, prepared.record))) {
      throw new AuthFailure('invalid_token');
    }
    return { userId: account.userId, ...prepared.pair };
  }
}

export class LogoutCurrentSession {
  constructor(
    private readonly tokens: BkTokenService,
    private readonly sessions: RefreshSessionRepository,
  ) {}

  async execute(input: { userId?: string; sid?: string; refreshToken?: string }): Promise<void> {
    try {
      if (input.refreshToken) {
        const current = await this.tokens.verifyRefresh(input.refreshToken);
        await this.sessions.revokeFamily(current, input.refreshToken);
        return;
      }
    } catch (error) {
      if (!(error instanceof AuthFailure)) throw error;
    }
    if (input.userId && input.sid) await this.sessions.revokeBySid(input.userId, input.sid);
  }
}

export class LogoutAllSessions {
  constructor(private readonly sessions: RefreshSessionRepository) {}

  async execute(userId: string): Promise<void> {
    await this.sessions.revokeAll(userId);
  }
}

export class GetCurrentAuthenticatedUser {
  constructor(private readonly accounts: AuthAccountRepository) {}

  async execute(
    userId: string,
  ): Promise<{ userId: string; studentId: string | null; roles: string[]; status: string }> {
    const account = await this.accounts.findById(userId);
    if (!account) throw new AuthFailure('invalid_token');
    return {
      userId: account.userId,
      studentId: account.studentId,
      roles: account.roles,
      status: account.status,
    };
  }
}

export class ChangePassword {
  constructor(
    private readonly passwords: PasswordChangeRepository,
    private readonly hasher: PasswordHasher,
  ) {}

  async execute(
    userId: string,
    currentSessionId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    if (newPassword.length < 8 || newPassword.length > 128)
      throw new AuthFailure('invalid_credentials');

    const currentHash = await this.passwords.findPasswordHash(userId);
    if (!currentHash || !(await this.hasher.verify(currentHash, currentPassword)))
      throw new AuthFailure('invalid_credentials');
    if (await this.hasher.verify(currentHash, newPassword))
      throw new AuthFailure('invalid_credentials');

    const newHash = await this.hasher.hash(newPassword);
    if (
      !(await this.passwords.changePasswordAndRevokeOtherSessions(
        userId,
        currentSessionId,
        currentHash,
        newHash,
      ))
    )
      throw new AuthFailure('invalid_credentials');
  }
}
