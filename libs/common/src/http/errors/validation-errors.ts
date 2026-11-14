import type { ApiErrorDetail } from '@app/contracts';
import { COMMON_ERROR_CODES } from '@app/contracts';
import { ValidationPipe } from '@nestjs/common';
import type { ValidationError } from 'class-validator';

import { AppHttpException } from './api-error';

type Rule = (field: string, original: string) => ApiErrorDetail;

/** Số cuối cùng trong thông báo mặc định của class-validator (ví dụ "... equal to 8 characters"). */
function lastNumber(original: string): string {
  return original.match(/-?\d+(?:\.\d+)?/g)?.at(-1) ?? '';
}

const detail = (field: string, code: string, message: string): ApiErrorDetail => ({
  field,
  code,
  message,
});

const typeRule =
  (what: string): Rule =>
  (field) =>
    detail(field, 'INVALID_TYPE', `Trường "${field}" phải là ${what}.`);

/** Ánh xạ khóa ràng buộc của class-validator sang mã và thông báo tiếng Việt. */
const RULES: Record<string, Rule> = {
  isNotEmpty: (f) => detail(f, 'REQUIRED', `Trường "${f}" là bắt buộc, không được để trống.`),
  isDefined: (f) => detail(f, 'REQUIRED', `Trường "${f}" là bắt buộc.`),
  isString: typeRule('chuỗi ký tự'),
  isNumber: typeRule('số'),
  isInt: typeRule('số nguyên'),
  isBoolean: typeRule('giá trị đúng/sai'),
  isArray: typeRule('một danh sách'),
  isObject: typeRule('một đối tượng'),
  isEmail: (f) => detail(f, 'INVALID_FORMAT', `Trường "${f}" không phải là email hợp lệ.`),
  isUUID: (f) => detail(f, 'INVALID_FORMAT', `Trường "${f}" không phải là mã UUID hợp lệ.`),
  isUrl: (f) => detail(f, 'INVALID_FORMAT', `Trường "${f}" không phải là đường dẫn hợp lệ.`),
  matches: (f) => detail(f, 'INVALID_FORMAT', `Trường "${f}" không đúng định dạng yêu cầu.`),
  minLength: (f, o) =>
    detail(f, 'TOO_SHORT', `Trường "${f}" phải có ít nhất ${lastNumber(o)} ký tự.`),
  maxLength: (f, o) =>
    detail(f, 'TOO_LONG', `Trường "${f}" chỉ được có tối đa ${lastNumber(o)} ký tự.`),
  min: (f, o) =>
    detail(f, 'OUT_OF_RANGE', `Trường "${f}" phải lớn hơn hoặc bằng ${lastNumber(o)}.`),
  max: (f, o) =>
    detail(f, 'OUT_OF_RANGE', `Trường "${f}" phải nhỏ hơn hoặc bằng ${lastNumber(o)}.`),
  arrayMinSize: (f, o) =>
    detail(f, 'TOO_SHORT', `Trường "${f}" phải có ít nhất ${lastNumber(o)} phần tử.`),
  arrayMaxSize: (f, o) =>
    detail(f, 'TOO_LONG', `Trường "${f}" chỉ được có tối đa ${lastNumber(o)} phần tử.`),
  isIn: (f) =>
    detail(f, 'NOT_ALLOWED', `Trường "${f}" có giá trị không nằm trong danh sách cho phép.`),
  isEnum: (f) =>
    detail(f, 'NOT_ALLOWED', `Trường "${f}" có giá trị không nằm trong danh sách cho phép.`),
  whitelistValidation: (f) => detail(f, 'NOT_ALLOWED', `Trường "${f}" không được hỗ trợ.`),
};

/** Thông báo mặc định của class-validator luôn mở đầu bằng tên thuộc tính; thông báo tự đặt thì không. */
function isDefaultMessage(field: string, message: string): boolean {
  return message.startsWith(`${field} `) || message.startsWith(`property ${field} `);
}

export function toValidationDetails(errors: ValidationError[], parent = ''): ApiErrorDetail[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const own = Object.entries(error.constraints ?? {}).map(([key, original]) => {
      if (!isDefaultMessage(error.property, original)) {
        // Thông báo do lập trình viên tự đặt trong decorator: giữ nguyên.
        return detail(field, key.replace(/([A-Z])/g, '_$1').toUpperCase(), original);
      }
      const rule = RULES[key];
      return rule
        ? rule(field, original)
        : detail(field, 'INVALID', `Trường "${field}" không hợp lệ.`);
    });
    return [...own, ...toValidationDetails(error.children ?? [], field)];
  });
}

export function createValidationException(errors: ValidationError[]): AppHttpException {
  const details = toValidationDetails(errors);
  const fields = new Set(details.map((item) => item.field)).size;
  return new AppHttpException(
    400,
    COMMON_ERROR_CODES.validationFailed,
    `Dữ liệu gửi lên chưa hợp lệ: ${fields} trường cần sửa.`,
    details,
  );
}

/** Giữ nguyên cấu hình pipe hiện tại, chỉ đổi cách trình bày lỗi (spec ERR-001 FR-004). */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    exceptionFactory: createValidationException,
  });
}
