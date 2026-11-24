import type {
  PasswordResetAccountRepository,
  PasswordResetMailer,
  PasswordResetStore,
} from '@/modules/auth/application/ports';
import { PasswordResetMailDeliveryFailure } from '@/modules/auth/application/ports';
import {
  ResetPasswordWithGrant,
  SendPasswordResetOtp,
  VerifyPasswordResetOtp,
} from '@/modules/auth/application/use-cases';
import { PasswordResetFailure } from '@/modules/auth/domain';

const eligible = {
  userId: 'user-1',
  email: 'student@school.edu',
  status: 'ACTIVE',
  roles: ['STUDENT'],
  isSystemAccount: false,
  deletedAt: null,
};

describe('Password reset use cases', () => {
  let accounts: jest.Mocked<PasswordResetAccountRepository>;
  let store: jest.Mocked<PasswordResetStore>;
  let mailer: jest.Mocked<PasswordResetMailer>;

  beforeEach(() => {
    accounts = {
      findByEmail: jest.fn().mockResolvedValue(eligible),
      resetPasswordWithGrant: jest.fn().mockResolvedValue(true),
    };
    store = {
      assertAvailable: jest.fn().mockResolvedValue(undefined),
      issueOtp: jest.fn().mockResolvedValue(true),
      verifyOtp: jest.fn().mockResolvedValue('user-1'),
    };
    mailer = { sendOtp: jest.fn().mockResolvedValue(undefined) };
  });

  it('sends six digits only to the stored eligible email and hides mail failures', async () => {
    mailer.sendOtp.mockRejectedValueOnce(new PasswordResetMailDeliveryFailure());
    await expect(
      new SendPasswordResetOtp(accounts, store, mailer).execute('student@school.edu'),
    ).resolves.toBeUndefined();
    expect(store.issueOtp).toHaveBeenCalledWith(
      'user-1',
      eligible.email,
      expect.stringMatching(/^\d{6}$/),
    );
    expect(mailer.sendOtp).toHaveBeenCalledWith(eligible.email, expect.stringMatching(/^\d{6}$/));
  });

  it('does not hide an unexpected mailer error', async () => {
    const failure = new Error('unexpected mailer defect');
    mailer.sendOtp.mockRejectedValueOnce(failure);
    await expect(
      new SendPasswordResetOtp(accounts, store, mailer).execute(eligible.email),
    ).rejects.toBe(failure);
  });

  it.each([
    null,
    { ...eligible, status: 'LOCKED' },
    { ...eligible, roles: ['ADMIN', 'STUDENT'] },
    { ...eligible, isSystemAccount: true },
    { ...eligible, deletedAt: new Date() },
  ])('does not send to an absent or ineligible account', async (account) => {
    accounts.findByEmail.mockResolvedValueOnce(account);
    await new SendPasswordResetOtp(accounts, store, mailer).execute(eligible.email);
    expect(store.issueOtp).not.toHaveBeenCalled();
    expect(mailer.sendOtp).not.toHaveBeenCalled();
  });

  it('returns the same dependency failure before looking up any email when PostgreSQL is unavailable', async () => {
    store.assertAvailable.mockRejectedValue(new PasswordResetFailure('dependency_unavailable'));
    await expect(
      new SendPasswordResetOtp(accounts, store, mailer).execute('unknown@school.edu'),
    ).rejects.toEqual(new PasswordResetFailure('dependency_unavailable'));
    await expect(
      new VerifyPasswordResetOtp(accounts, store).execute('unknown@school.edu', '123456'),
    ).rejects.toEqual(new PasswordResetFailure('dependency_unavailable'));
    expect(accounts.findByEmail).not.toHaveBeenCalled();
  });

  it('issues only the opaque token returned by a valid OTP exchange', async () => {
    const result = await new VerifyPasswordResetOtp(accounts, store).execute(
      eligible.email,
      '123456',
    );
    expect(result.resetToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(store.verifyOtp).toHaveBeenCalledWith(
      'user-1',
      eligible.email,
      '123456',
      result.resetToken,
    );
    store.verifyOtp.mockResolvedValueOnce(null);
    await expect(
      new VerifyPasswordResetOtp(accounts, store).execute(eligible.email, '000000'),
    ).rejects.toEqual(new PasswordResetFailure('invalid_request', 'otp_invalid'));
  });

  it('requires a grant and valid password before touching the credential', async () => {
    const reset = new ResetPasswordWithGrant(accounts);
    await expect(reset.execute('token', 'short')).rejects.toEqual(
      new PasswordResetFailure('invalid_request', 'password_length'),
    );
    expect(accounts.resetPasswordWithGrant).not.toHaveBeenCalled();
    accounts.resetPasswordWithGrant.mockResolvedValueOnce(false);
    await expect(reset.execute('token', 'new-password')).rejects.toEqual(
      new PasswordResetFailure('invalid_request', 'reset_session_invalid'),
    );
    expect(accounts.resetPasswordWithGrant).toHaveBeenCalledTimes(1);
    await reset.execute('token', 'new-password');
    expect(accounts.resetPasswordWithGrant).toHaveBeenCalledWith('token', 'new-password');
  });
});
