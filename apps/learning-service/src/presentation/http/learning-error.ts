import { AllExceptionsFilter, normalizeException, sendApiError } from '@app/common';
import type { ApiErrorDetail } from '@app/contracts';
import { HttpException } from '@nestjs/common';
import type { ArgumentsHost, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';

/** Mô tả một lỗi HTTP đã được dịch: status, mã ổn định, thông báo tiếng Việt (spec ERR-001 FR-001). */
export interface ErrorDescriptor {
  status: number;
  code: string;
  message: string;
  details?: ApiErrorDetail[];
}

export const LEARNING_AUTH_ERROR_CODES = {
  principalInvalid: 'AUTH_PRINCIPAL_INVALID',
  internalCredentialInvalid: 'AUTH_INTERNAL_CREDENTIAL_INVALID',
  roleRequired: 'AUTH_ROLE_REQUIRED',
  permissionMissing: 'AUTH_PERMISSION_MISSING',
} as const;

export const COMMON_LEARNING_ERROR_CODES = {
  invalidPathParameter: 'INVALID_PATH_PARAMETER',
} as const;

/** Bộ lọc toàn cục dùng làm đường lui cho mọi lỗi mà module không nhận diện (không nuốt lỗi 5xx). */
const globalFilter = new AllExceptionsFilter();

export function respondWithGlobalFilter(exception: unknown, host: ArgumentsHost): void {
  globalFilter.catch(exception, host);
}

/**
 * Dùng cho các module từng chỉ ghi một câu log cố định khi gặp lỗi lạ (để nguyên nhân, như chuỗi kết nối,
 * không lọt vào log). Lỗi lạ chưa phân loại: ghi câu cố định rồi trả 500 theo khuôn chung; lỗi đã phân loại
 * (HTTP, trùng dữ liệu, mất kết nối) vẫn đi qua bộ lọc toàn cục như bình thường.
 */
export function respondWithSanitizedFallback(
  exception: unknown,
  host: ArgumentsHost,
  logger: Logger,
  logMessage: string,
): void {
  const normalized = normalizeException(exception);
  if (exception instanceof HttpException || normalized.code !== 'INTERNAL_ERROR') {
    return respondWithGlobalFilter(exception, host);
  }
  logger.error(logMessage);
  respondWithGlobalFilter(new Error('Unexpected error'), host);
}

/** Ghi body lỗi chuẩn và một dòng log an toàn (không có body request, không có dữ liệu người dùng). */
export function respondWithError(
  host: ArgumentsHost,
  descriptor: ErrorDescriptor,
  logger: Logger,
): void {
  const http = host.switchToHttp();
  const request = http.getRequest<Request>();
  const body = sendApiError({ request, response: http.getResponse<Response>() }, descriptor);
  logger.warn({
    requestId: body.requestId,
    status: descriptor.status,
    code: descriptor.code,
    method: request.method,
  });
}

export function describePrincipalError(): ErrorDescriptor {
  return {
    status: 401,
    code: LEARNING_AUTH_ERROR_CODES.principalInvalid,
    message:
      'Thiếu hoặc sai thông tin người dùng đi kèm yêu cầu. Hãy đăng nhập lại; nếu vẫn lỗi, hãy gọi API qua API Gateway.',
  };
}

/** `ParseUUIDPipe`/`ParseIntPipe` trả message tiếng Anh chung chung; dịch sang thông báo nêu rõ cần gì. */
export function describeFrameworkError(exception: unknown): ErrorDescriptor | null {
  if (!(exception instanceof HttpException) || exception.getStatus() !== 400) return null;
  const body = exception.getResponse();
  const raw = typeof body === 'object' && body !== null && 'message' in body ? body.message : body;
  const match =
    typeof raw === 'string' ? /^Validation failed \((.+?) is expected\)$/.exec(raw) : null;
  if (!match) return null;
  const expected = match[1] ?? '';
  const what = /uuid/i.test(expected)
    ? 'mã định danh dạng UUID'
    : /numeric|integer|number/i.test(expected)
      ? 'một số hợp lệ'
      : 'một giá trị hợp lệ';
  return {
    status: 400,
    code: COMMON_LEARNING_ERROR_CODES.invalidPathParameter,
    message: `Tham số trên đường dẫn không đúng định dạng: cần ${what}.`,
  };
}

type RuleBuild = (field: string, match: RegExpExecArray) => { code: string; message: string };

const quote = (field: string): string => `"${field}"`;

/**
 * Thông báo kiểm tra dữ liệu của domain viết bằng tiếng Anh. Domain không được sửa trong đợt này nên bộ lọc
 * nhận diện các mẫu câu đã biết và dựng lại thông báo tiếng Việt, kèm tên trường.
 */
const DOMAIN_MESSAGE_RULES: ReadonlyArray<readonly [RegExp, RuleBuild]> = [
  [
    /\bmust be a string$/,
    (f) => ({ code: 'INVALID_TYPE', message: `Trường ${quote(f)} phải là chuỗi ký tự.` }),
  ],
  [
    /\bmust not be (?:empty|blank)$/,
    (f) => ({ code: 'REQUIRED', message: `Trường ${quote(f)} không được để trống.` }),
  ],
  [
    /\bmust be at most (\d+) characters$/,
    (f, m) => ({
      code: 'TOO_LONG',
      message: `Trường ${quote(f)} chỉ được có tối đa ${m[1]} ký tự.`,
    }),
  ],
  [
    /\bmust be at most (\d+) UTF-8 bytes$/,
    (f, m) => ({
      code: 'TOO_LONG',
      message: `Trường ${quote(f)} chỉ được dài tối đa ${m[1]} byte (UTF-8).`,
    }),
  ],
  [
    /\bmust be a canonical UUID$/,
    (f) => ({
      code: 'INVALID_FORMAT',
      message: `Trường ${quote(f)} phải là mã UUID viết thường, đúng định dạng.`,
    }),
  ],
  [
    /\bmust be an integer between (-?\d+) and (-?\d+)$/,
    (f, m) => ({
      code: 'OUT_OF_RANGE',
      message: `Trường ${quote(f)} phải là số nguyên từ ${m[1]} đến ${m[2]}.`,
    }),
  ],
  [
    /\bmust be a valid date$/,
    (f) => ({ code: 'INVALID_FORMAT', message: `Trường ${quote(f)} phải là ngày giờ hợp lệ.` }),
  ],
  [
    /\bmust be an array$/,
    (f) => ({ code: 'INVALID_TYPE', message: `Trường ${quote(f)} phải là một danh sách.` }),
  ],
  [
    /\bmust (?:not contain duplicates|be unique)$/,
    (f) => ({
      code: 'DUPLICATE_VALUE',
      message: `Trường ${quote(f)} không được chứa giá trị trùng nhau.`,
    }),
  ],
  [
    /\bmust be one of: (.+)$/,
    (f, m) => ({
      code: 'NOT_ALLOWED',
      message: `Trường ${quote(f)} chỉ nhận một trong các giá trị: ${m[1]}.`,
    }),
  ],
  [
    /\bmust not contain raw HTML or scripts$|\bcontains unsafe content$/,
    (f) => ({
      code: 'UNSAFE_CONTENT',
      message: `Trường ${quote(f)} chứa HTML hoặc script không an toàn. Hãy bỏ các thẻ/đoạn mã đó.`,
    }),
  ],
  [
    /\bmust be at most (\d+)$/,
    (f, m) => ({
      code: 'OUT_OF_RANGE',
      message: `Trường ${quote(f)} không được vượt quá ${m[1]}.`,
    }),
  ],
  [
    /^score must be a non-negative integer$/,
    (f) => ({
      code: 'OUT_OF_RANGE',
      message: `Trường ${quote(f)} (điểm) phải là số nguyên không âm.`,
    }),
  ],
  [
    /^slug must be 1-220 lowercase kebab-case characters$/,
    (f) => ({
      code: 'INVALID_FORMAT',
      message: `Trường ${quote(f)} chỉ gồm 1–220 ký tự chữ thường, số và dấu gạch ngang (ví dụ: two-sum).`,
    }),
  ],
  [
    /^(?:function|OOP) contract languages must be unique$/,
    (f) => ({
      code: 'DUPLICATE_VALUE',
      message: `Mỗi ngôn ngữ chỉ được khai báo contract một lần (trường ${quote(f)}).`,
    }),
  ],
  [
    /^an interface must not have a constructor contract$/,
    (f) => ({
      code: 'NOT_ALLOWED',
      message: `Cấu trúc interface không được có contract hàm khởi tạo (trường ${quote(f)}).`,
    }),
  ],
  [
    /^Harness summary is inconsistent with the stored harness$/,
    (f) => ({
      code: 'INCONSISTENT',
      message: `Thông tin tóm tắt harness không khớp với harness đã lưu (trường ${quote(f)}).`,
    }),
  ],
  [
    /^Display order is already used by another test case$/,
    (f) => ({
      code: 'DUPLICATE_VALUE',
      message: `Thứ tự hiển thị (${quote(f)}) đã được test case khác dùng. Hãy chọn thứ tự khác.`,
    }),
  ],
  [
    /^testCaseIds must contain every test case exactly once$/,
    (f) => ({
      code: 'INCONSISTENT',
      message: `Danh sách ${quote(f)} phải gồm đủ mọi test case của bài tập, mỗi test case đúng một lần.`,
    }),
  ],
  [
    /^A STANDARD problem cannot have a harness$/,
    (f) => ({
      code: 'NOT_ALLOWED',
      message: `Bài tập loại STANDARD không dùng harness (trường ${quote(f)}).`,
    }),
  ],
  [
    /^a STANDARD problem must not have function or oop contracts$/,
    (f) => ({
      code: 'NOT_ALLOWED',
      message: `Bài tập loại STANDARD không được có function/OOP contract (trường ${quote(f)}).`,
    }),
  ],
  [
    /^a FUNCTION problem must not have oop contracts$/,
    (f) => ({
      code: 'NOT_ALLOWED',
      message: `Bài tập loại FUNCTION không được có OOP contract (trường ${quote(f)}).`,
    }),
  ],
  [
    /^an OOP problem must not have function contracts$/,
    (f) => ({
      code: 'NOT_ALLOWED',
      message: `Bài tập loại OOP không được có function contract (trường ${quote(f)}).`,
    }),
  ],
  [
    /^(starter code|function contract|oop contract) language (\S+) is not enabled$/,
    (f, m) => ({
      code: 'NOT_ALLOWED',
      message: `Ngôn ngữ ${m[2]} chưa được bật cho bài tập nên không thể khai báo ${
        m[1] === 'starter code'
          ? 'mã khởi tạo'
          : m[1] === 'oop contract'
            ? 'OOP contract'
            : 'function contract'
      } (trường ${quote(f)}). Hãy bật ngôn ngữ đó trước.`,
    }),
  ],
  [
    /^Problem is not attachable$/,
    (f) => ({
      code: 'NOT_ALLOWED',
      message: `Bài tập này không thể thêm vào khóa học (trường ${quote(f)}): bài tập chưa xuất bản, đã bị xóa hoặc không tồn tại.`,
    }),
  ],
  [
    /^This slug is reserved for course management$/,
    (f) => ({
      code: 'NOT_ALLOWED',
      message: `Giá trị ${quote(f)} này được dành riêng cho chức năng quản lý khóa học. Hãy chọn slug khác.`,
    }),
  ],
  [
    /^Course may have at most (\d+) chapters$/,
    (f, m) => ({
      code: 'LIMIT_EXCEEDED',
      message: `Một khóa học chỉ được có tối đa ${m[1]} chương (trường ${quote(f)}).`,
    }),
  ],
  [
    /^Chapter may have at most (\d+) problems$/,
    (f, m) => ({
      code: 'LIMIT_EXCEEDED',
      message: `Một chương chỉ được có tối đa ${m[1]} bài tập (trường ${quote(f)}).`,
    }),
  ],
  [
    /^Reorder must include all (chapters|problems)$/,
    (f, m) => ({
      code: 'INCONSISTENT',
      message: `Danh sách sắp xếp (${quote(f)}) phải gồm đủ tất cả ${m[1] === 'chapters' ? 'chương' : 'bài tập'}.`,
    }),
  ],
  [
    /^Unknown (chapter|problem) in reorder$/,
    (f, m) => ({
      code: 'NOT_FOUND',
      message: `Danh sách sắp xếp (${quote(f)}) có ${m[1] === 'chapter' ? 'chương' : 'bài tập'} không thuộc khóa học này.`,
    }),
  ],
  [
    /^Duplicate (chapter|problem) in reorder$/,
    (f, m) => ({
      code: 'DUPLICATE_VALUE',
      message: `Danh sách sắp xếp (${quote(f)}) có ${m[1] === 'chapter' ? 'chương' : 'bài tập'} bị lặp.`,
    }),
  ],
  [
    /^Problem not in chapter$/,
    (f) => ({
      code: 'NOT_FOUND',
      message: `Bài tập này không nằm trong chương đã chọn (trường ${quote(f)}).`,
    }),
  ],
  [
    /^Duplicate Quiz or Chapter limit reached$/,
    (f) => ({
      code: 'LIMIT_EXCEEDED',
      message: `Bài kiểm tra đã có trong chương hoặc chương đã đạt số bài kiểm tra tối đa (trường ${quote(f)}).`,
    }),
  ],
  [
    /^Order must contain exactly the current Quiz ids$/,
    (f) => ({
      code: 'INCONSISTENT',
      message: `Danh sách ${quote(f)} phải gồm đúng các bài kiểm tra hiện có trong chương.`,
    }),
  ],
];

/** Dịch một thông báo domain thành chi tiết lỗi tiếng Việt; không khớp mẫu nào thì dùng câu chung có tên trường. */
export function translateDomainMessage(field: string, message: string): ApiErrorDetail {
  for (const [pattern, build] of DOMAIN_MESSAGE_RULES) {
    const match = pattern.exec(message);
    if (match) return { field, ...build(field, match) };
  }
  return { field, code: 'INVALID', message: `Trường ${quote(field)} không hợp lệ.` };
}

/** Nhãn tiếng Việt của trạng thái xuất bản dùng chung cho khóa học và bài tập. */
export function labelPublishStatus(status: string): string {
  const labels: Record<string, string> = {
    DRAFT: 'nháp',
    PUBLISHED: 'đã xuất bản',
    ON_HOLD: 'tạm ngưng',
  };
  return labels[status] ?? status.toLowerCase();
}

/** Động từ của thao tác chuyển trạng thái (tiếng Anh trong domain) sang tiếng Việt. */
export function labelAction(action: string): string {
  const labels: Record<string, string> = {
    publish: 'xuất bản',
    published: 'xuất bản',
    hold: 'tạm ngưng',
    held: 'tạm ngưng',
    republish: 'xuất bản lại',
    republished: 'xuất bản lại',
    updated: 'cập nhật',
    'be updated': 'cập nhật',
    'manage test cases': 'quản lý test case',
    'manage harnesses': 'quản lý harness',
  };
  return labels[action] ?? 'thực hiện thao tác này';
}
