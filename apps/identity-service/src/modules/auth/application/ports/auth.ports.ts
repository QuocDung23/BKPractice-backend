import type { BkAccessClaims, BkRefreshClaims } from '@app/contracts';

import type {
  AuthAccount,
  LocalAuthAccount,
  LoginLookup,
  MicrosoftIdentity,
} from '@/modules/auth/domain';

export interface AuthAccountRepository {
  findByIdentifier(identifier: string): Promise<LocalAuthAccount | null>;
  findForLogin(identifier: string): Promise<LoginLookup>;
  findById(userId: string): Promise<AuthAccount | null>;
}

export interface PasswordChangeRepository {
  findPasswordHash(userId: string): Promise<string | null>;
  changePasswordAndRevokeOtherSessions(
    userId: string,
    currentSessionId: string,
    expectedPasswordHash: string,
    newPasswordHash: string,
  ): Promise<boolean>;
}

export interface ExternalIdentityRepository {
  resolveOrLink(identity: MicrosoftIdentity): Promise<AuthAccount | null>;
}

export interface RefreshRecord {
  tokenId: string;
  familyId: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  expectedPasswordHash?: string;
}

export type ClientType = 'web' | 'mobile';

export interface SessionMetadata {
  clientType: ClientType;
  device?: string;
  userAgent?: string;
  ip?: string;
}

export interface RefreshSessionRepository {
  create(record: RefreshRecord, metadata?: SessionMetadata): Promise<void>;
  rotate(current: BkRefreshClaims, rawToken: string, replacement: RefreshRecord): Promise<boolean>;
  revokeFamily(current: BkRefreshClaims, rawToken: string): Promise<void>;
  revokeBySid(userId: string, sid: string): Promise<void>;
  revokeAll(userId: string): Promise<void>;
  isActive(userId: string, sid: string): Promise<boolean>;
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
  verifyDummy(password: string): Promise<void>;
}

export interface BkTokenService {
  signAccess(account: AuthAccount, permissions: string[], sid: string): Promise<string>;
  signRefresh(
    userId: string,
    tokenId: string,
    familyId: string,
  ): Promise<{ token: string; expiresAt: Date }>;
  verifyRefresh(token: string): Promise<BkRefreshClaims>;
  verifyAccess(token: string): Promise<string>;
  verifyAccessClaims(token: string): Promise<BkAccessClaims>;
}

export interface OAuthTransaction {
  nonce: string;
  verifier: string;
  clientType?: ClientType;
  mobileChallenge?: string;
}

export interface LoginCodeGrant {
  userId: string;
  clientType: ClientType;
  mobileChallenge?: string;
}

export interface MicrosoftIdentityProvider {
  getAuthorizationUrl(state: string, nonce: string, challenge: string): Promise<string>;
  exchangeCode(code: string, transaction: OAuthTransaction): Promise<MicrosoftIdentity>;
}

export interface AuthFlowStore {
  putTransaction(state: string, transaction: OAuthTransaction): Promise<void>;
  takeTransaction(state: string): Promise<OAuthTransaction | null>;
  createLoginCode(grant: LoginCodeGrant): Promise<string>;
  takeLoginCode(code: string): Promise<LoginCodeGrant | null>;
}
