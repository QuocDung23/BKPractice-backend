import { randomBytes, randomInt } from 'node:crypto';

import type {
  PasswordResetAccountRepository,
  PasswordResetMailer,
  PasswordResetStore,
} from '@/modules/auth/application/ports';
import { PasswordResetMailDeliveryFailure } from '@/modules/auth/application/ports';
import { canResetPassword, PasswordResetFailure } from '@/modules/auth/domain';

export class SendPasswordResetOtp {
  constructor(
    private readonly accounts: PasswordResetAccountRepository,
    private readonly store: PasswordResetStore,
    private readonly mailer: PasswordResetMailer,
  ) {}

  async execute(email: string): Promise<void> {
    await this.store.assertAvailable();
    const account = await this.accounts.findByEmail(email);
    if (!canResetPassword(account)) return;
    const otp = randomInt(0, 1_000_000).toString().padStart(6, '0');
    if (!(await this.store.issueOtp(account.userId, account.email, otp))) return;
    try {
      await this.mailer.sendOtp(account.email, otp);
    } catch (error) {
      if (!(error instanceof PasswordResetMailDeliveryFailure)) throw error;
    }
  }
}

export class VerifyPasswordResetOtp {
  constructor(
    private readonly accounts: PasswordResetAccountRepository,
    private readonly store: PasswordResetStore,
  ) {}

  async execute(email: string, otp: string): Promise<{ resetToken: string }> {
    await this.store.assertAvailable();
    const account = await this.accounts.findByEmail(email);
    if (!canResetPassword(account)) throw new PasswordResetFailure('invalid_request');
    const resetToken = randomBytes(32).toString('base64url');
    const userId = await this.store.verifyOtp(account.userId, account.email, otp, resetToken);
    if (userId !== account.userId) throw new PasswordResetFailure('invalid_request');
    return { resetToken };
  }
}

export class ResetPasswordWithGrant {
  constructor(private readonly accounts: PasswordResetAccountRepository) {}

  async execute(resetToken: string, newPassword: string): Promise<void> {
    if (newPassword.length < 8 || newPassword.length > 128)
      throw new PasswordResetFailure('invalid_request', 'password_length');
    if (!(await this.accounts.resetPasswordWithGrant(resetToken, newPassword)))
      throw new PasswordResetFailure('invalid_request');
  }
}
