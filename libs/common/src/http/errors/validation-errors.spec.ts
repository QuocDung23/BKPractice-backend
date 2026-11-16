import { Type } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

import type { AppHttpException } from './api-error';
import { createValidationPipe } from './validation-errors';

class ChildDto {
  @IsString() @IsNotEmpty() name!: string;
}

class SignupDto {
  @IsEmail() email!: string;
  @MinLength(8) @MaxLength(128) password!: string;
  @IsString() @IsNotEmpty({ message: 'Vui lòng nhập họ tên.' }) fullName!: string;
  @ValidateNested() @Type(() => ChildDto) child!: ChildDto;
}

async function validate(value: unknown): Promise<AppHttpException> {
  try {
    await createValidationPipe().transform(value, { type: 'body', metatype: SignupDto });
  } catch (error) {
    return error as AppHttpException;
  }
  throw new Error('expected validation to fail');
}

describe('createValidationPipe', () => {
  it('liệt kê mọi trường sai kèm mã và thông báo tiếng Việt (AC-006)', async () => {
    const error = await validate({ email: 'abc', password: '123', fullName: '', child: {} });
    expect(error.getStatus()).toBe(400);
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.message).toBe('Dữ liệu gửi lên chưa hợp lệ: 4 trường cần sửa.');
    expect(error.details).toEqual(
      expect.arrayContaining([
        {
          field: 'email',
          code: 'INVALID_FORMAT',
          message: 'Trường "email" không phải là email hợp lệ.',
        },
        {
          field: 'password',
          code: 'TOO_SHORT',
          message: 'Trường "password" phải có ít nhất 8 ký tự.',
        },
        { field: 'fullName', code: 'IS_NOT_EMPTY', message: 'Vui lòng nhập họ tên.' },
        {
          field: 'child.name',
          code: 'REQUIRED',
          message: 'Trường "child.name" là bắt buộc, không được để trống.',
        },
      ]),
    );
  });

  it('báo trường lạ bị cấm theo whitelist', async () => {
    const error = await validate({
      email: 'a@b.co',
      password: '12345678',
      fullName: 'A',
      child: { name: 'x' },
      role: 'ADMIN',
    });
    expect(error.details).toEqual([
      { field: 'role', code: 'NOT_ALLOWED', message: 'Trường "role" không được hỗ trợ.' },
    ]);
  });

  it('không lặp lại giá trị người dùng nhập, nhất là mật khẩu', async () => {
    const error = await validate({
      email: 'a@b.co',
      password: 'hunter2',
      fullName: 'A',
      child: { name: 'x' },
    });
    expect(JSON.stringify(error.details)).not.toContain('hunter2');
  });
});
