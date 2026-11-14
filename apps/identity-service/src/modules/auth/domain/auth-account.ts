export type AccountStatus = 'ACTIVE' | 'LOCKED' | 'PENDING';

export interface AuthAccount {
  userId: string;
  studentId: string | null;
  email: string;
  status: AccountStatus;
  roles: string[];
}

export interface LocalAuthAccount extends AuthAccount {
  passwordHash: string;
}

/** Kết quả tra tài khoản khi đăng nhập bằng mật khẩu (spec ERR-001 FR-007). */
export type LoginLookup =
  | { kind: 'none' }
  | { kind: 'ambiguous' }
  | { kind: 'found'; account: LocalAuthAccount; deleted: boolean };

export interface MicrosoftIdentity {
  tenantId: string;
  objectId: string;
  username: string;
}

export function requireActiveAccount(account: AuthAccount | null): asserts account is AuthAccount {
  if (!account || account.status !== 'ACTIVE') throw new AuthFailure('invalid_credentials');
}

/**
 * Các mã chi tiết (`account_*`, `wrong_password`, `identifier_ambiguous`) chỉ dành cho đăng nhập bằng
 * mật khẩu. Microsoft, refresh và exchange vẫn dùng mã chung để không tiết lộ tài khoản (ERR-001 FR-008).
 */
export type AuthFailureCode =
  | 'invalid_credentials'
  | 'invalid_token'
  | 'dependency_unavailable'
  | 'account_not_found'
  | 'wrong_password'
  | 'identifier_ambiguous'
  | 'account_deleted'
  | 'account_locked'
  | 'account_pending';

export class AuthFailure extends Error {
  constructor(readonly code: AuthFailureCode) {
    super(code);
  }
}
