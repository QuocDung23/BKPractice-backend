export interface ResetAccount {
  userId: string;
  email: string;
  status: string;
  roles: string[];
  isSystemAccount: boolean;
  deletedAt: Date | null;
}

export function canResetPassword(account: ResetAccount | null): account is ResetAccount {
  return (
    !!account &&
    account.status === 'ACTIVE' &&
    !account.isSystemAccount &&
    !account.deletedAt &&
    !account.roles.includes('ADMIN') &&
    account.roles.some((role) => role === 'STUDENT' || role === 'LECTURER')
  );
}

export class PasswordResetFailure extends Error {
  constructor(
    readonly code: 'invalid_request' | 'dependency_unavailable',
    readonly reason?: 'password_length',
  ) {
    super(code);
  }
}
