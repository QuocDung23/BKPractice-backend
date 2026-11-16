import { AccountImportFailure, PasswordResetFailure } from '@/modules/auth/domain';
import { describeAccountImportFailure } from '@/modules/auth/presentation/account-import-failure.filter';
import { describePasswordResetFailure } from '@/modules/auth/presentation/password-reset-failure.filter';

describe('describePasswordResetFailure (ID-007 giữ không tiết lộ)', () => {
  it('OTP sai và email không tồn tại nhận cùng một thông báo 400', () => {
    const result = describePasswordResetFailure(new PasswordResetFailure('invalid_request'));
    expect(result.status).toBe(400);
    expect(result.code).toBe('PASSWORD_RESET_REQUEST_INVALID');
    expect(result.message).not.toMatch(/không tồn tại|không có tài khoản/i);
  });

  it('nêu rõ lỗi độ dài mật khẩu mới và lỗi dịch vụ', () => {
    expect(
      describePasswordResetFailure(new PasswordResetFailure('invalid_request', 'password_length')),
    ).toMatchObject({ status: 400, code: 'PASSWORD_RESET_PASSWORD_INVALID' });
    expect(
      describePasswordResetFailure(new PasswordResetFailure('dependency_unavailable')),
    ).toMatchObject({ status: 503, code: 'PASSWORD_RESET_UNAVAILABLE' });
  });
});

describe('describeAccountImportFailure', () => {
  it('giải thích từng dòng lỗi bằng tiếng Việt và giữ status cũ', () => {
    const result = describeAccountImportFailure(
      new AccountImportFailure(
        'invalid_rows',
        [
          { row: 3, field: 'email', code: 'invalid_email' },
          { row: 5, field: 'mssv', code: 'duplicate_in_file' },
        ],
        10,
      ),
    );
    expect(result.status).toBe(400);
    expect(result.code).toBe('ACCOUNT_IMPORT_ROWS_INVALID');
    expect(result.message).toContain('2 lỗi');
    expect(result.message).toContain('10 dòng');
    expect(result.details?.[0]?.message).toMatch(/^Dòng 3, cột Email: .*sai đuôi/);
    expect(result.details?.[1]?.message).toMatch(/^Dòng 5, cột MSSV: .*lặp trong file/);
  });

  it.each([
    ['forbidden', 403, 'ACCOUNT_IMPORT_FORBIDDEN'],
    ['dependency_unavailable', 503, 'ACCOUNT_IMPORT_UNAVAILABLE'],
    ['conflict', 409, 'ACCOUNT_IMPORT_CONFLICT'],
    ['invalid_file', 400, 'ACCOUNT_IMPORT_FILE_INVALID'],
  ] as const)('%s trả %i %s', (code, status, expected) => {
    expect(describeAccountImportFailure(new AccountImportFailure(code))).toMatchObject({
      status,
      code: expected,
    });
  });

  it('nêu lý do cụ thể khi file hỏng và hướng dẫn khi thiếu file', () => {
    const broken = describeAccountImportFailure(
      new AccountImportFailure('invalid_file', [
        { row: 0, field: 'row', code: 'row_limit_exceeded' },
      ]),
    );
    expect(broken.message).toContain('vượt quá 1000 dòng');
    expect(
      describeAccountImportFailure(new AccountImportFailure('invalid_file')).message,
    ).toContain('.xlsx');
  });
});
