import { AppHttpException } from '@app/common';

/** Mã lỗi do chính Gateway sinh ra (spec ERR-001 FR-006, FR-011). Lỗi của service được chuyển tiếp nguyên vẹn. */
export const GATEWAY_ERROR_CODES = {
  tokenMissing: 'AUTH_TOKEN_MISSING',
  bearerMalformed: 'AUTH_BEARER_MALFORMED',
  tokenInvalidOrExpired: 'AUTH_TOKEN_INVALID_OR_EXPIRED',
  sessionUnavailable: 'AUTH_SESSION_UNAVAILABLE',
  originNotAllowed: 'ORIGIN_NOT_ALLOWED',
  csrfTokenInvalid: 'CSRF_TOKEN_INVALID',
  unsafeRequestPath: 'UNSAFE_REQUEST_PATH',
  upstreamNotConfigured: 'UPSTREAM_NOT_CONFIGURED',
  upstreamUnavailable: 'UPSTREAM_UNAVAILABLE',
  upstreamInvalidResponse: 'UPSTREAM_INVALID_RESPONSE',
  tooManyRequests: 'TOO_MANY_REQUESTS',
} as const;

/** Tên logic của service phía sau, dùng trong message. Không bao giờ nêu host, port hay chuỗi kết nối. */
export type UpstreamService = 'Identity' | 'Learning' | 'Submission' | 'Community';

const MAX_REFLECTED_LENGTH = 200;

function reflect(value: string): string {
  return value.length > MAX_REFLECTED_LENGTH ? `${value.slice(0, MAX_REFLECTED_LENGTH)}…` : value;
}

export function createTokenMissingError(): AppHttpException {
  return new AppHttpException(
    401,
    GATEWAY_ERROR_CODES.tokenMissing,
    'Bạn chưa đăng nhập: yêu cầu không có access token. Hãy đăng nhập rồi thử lại.',
  );
}

export function createBearerMalformedError(): AppHttpException {
  return new AppHttpException(
    401,
    GATEWAY_ERROR_CODES.bearerMalformed,
    'Header Authorization không đúng định dạng. Hãy gửi dạng "Authorization: Bearer <access token>".',
  );
}

export function createTokenInvalidOrExpiredError(): AppHttpException {
  return new AppHttpException(
    401,
    GATEWAY_ERROR_CODES.tokenInvalidOrExpired,
    'Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Hãy đăng nhập lại.',
  );
}

export function createSessionUnavailableError(): AppHttpException {
  return new AppHttpException(
    503,
    GATEWAY_ERROR_CODES.sessionUnavailable,
    'Chưa kiểm tra được phiên đăng nhập vì dịch vụ Identity tạm thời không phản hồi. Vui lòng thử lại sau ít phút.',
  );
}

export function createOriginNotAllowedError(): AppHttpException {
  return new AppHttpException(
    403,
    GATEWAY_ERROR_CODES.originNotAllowed,
    'Yêu cầu đến từ một nguồn (origin) không được phép gọi API này. Hãy mở BKPractice từ địa chỉ chính thức rồi thử lại.',
  );
}

/**
 * Giữ nguyên chuỗi `Invalid CSRF token` có chủ đích: frontend hiện nhận diện lỗi CSRF bằng đúng chuỗi này
 * (403) để lấy lại token rồi gửi lại. Chỉ đổi sang tiếng Việt sau khi frontend nhận diện bằng
 * `code === 'CSRF_TOKEN_INVALID'` (việc theo dõi tiếp của ERR-001).
 */
export function createCsrfTokenInvalidError(): AppHttpException {
  return new AppHttpException(403, GATEWAY_ERROR_CODES.csrfTokenInvalid, 'Invalid CSRF token');
}

export type UnsafePathReason = 'mismatch' | 'forbidden-sequence' | 'bad-encoding';

const UNSAFE_PATH_MESSAGES: Record<UnsafePathReason, string> = {
  mismatch:
    'Đường dẫn yêu cầu bị từ chối vì thay đổi sau khi chuẩn hóa (ví dụ chứa "..", "//" hoặc ký tự mã hóa lạ). Hãy kiểm tra lại đường dẫn.',
  'forbidden-sequence':
    'Đường dẫn yêu cầu bị từ chối vì chứa chuỗi không an toàn (".." , "%2f", "\\", "?", "#" hoặc ký tự điều khiển). Hãy kiểm tra lại đường dẫn.',
  'bad-encoding':
    'Đường dẫn yêu cầu bị từ chối vì mã hóa phần trăm (%) không hợp lệ. Hãy kiểm tra lại đường dẫn.',
};

export function createUnsafeRequestPathError(reason: UnsafePathReason): AppHttpException {
  return new AppHttpException(
    400,
    GATEWAY_ERROR_CODES.unsafeRequestPath,
    UNSAFE_PATH_MESSAGES[reason],
  );
}

export function createUpstreamNotConfiguredError(method: string, path: string): AppHttpException {
  return new AppHttpException(
    502,
    GATEWAY_ERROR_CODES.upstreamNotConfigured,
    `Gateway không có tuyến chuyển tiếp cho ${reflect(`${method} ${path}`)}. Hãy kiểm tra lại đường dẫn và phương thức HTTP.`,
  );
}

export function createUpstreamUnavailableError(
  service: UpstreamService,
  timeoutMs?: number,
): AppHttpException {
  const message =
    timeoutMs === undefined
      ? `Không kết nối được tới dịch vụ ${service}. Vui lòng thử lại sau ít phút.`
      : `Dịch vụ ${service} không phản hồi trong ${Math.round(timeoutMs / 1000)} giây. Vui lòng thử lại sau ít phút.`;
  return new AppHttpException(502, GATEWAY_ERROR_CODES.upstreamUnavailable, message);
}

export type AuthResponseProblem = 'body' | 'cookie' | 'redirect';

const AUTH_RESPONSE_MESSAGES: Record<AuthResponseProblem, string> = {
  body: 'Gateway từ chối phản hồi đăng nhập của dịch vụ Identity vì nội dung chứa token không được phép. Vui lòng thử lại; nếu lỗi lặp lại hãy báo quản trị viên.',
  cookie:
    'Gateway từ chối phản hồi đăng nhập của dịch vụ Identity vì cookie phiên không đúng chuẩn bảo mật. Vui lòng thử lại; nếu lỗi lặp lại hãy báo quản trị viên.',
  redirect:
    'Gateway từ chối phản hồi chuyển hướng đăng nhập của dịch vụ Identity vì địa chỉ chuyển hướng không hợp lệ. Vui lòng thử lại; nếu lỗi lặp lại hãy báo quản trị viên.',
};

export function createAuthResponseRejectedError(problem: AuthResponseProblem): AppHttpException {
  return new AppHttpException(
    502,
    GATEWAY_ERROR_CODES.upstreamInvalidResponse,
    AUTH_RESPONSE_MESSAGES[problem],
  );
}

const THROTTLE_SUBJECTS: Record<string, string> = {
  password: 'Bạn đã thử đăng nhập quá nhiều lần',
  oauth: 'Bạn đã thử đăng nhập SSO hoặc làm mới phiên quá nhiều lần',
  'password-reset': 'Bạn đã yêu cầu hoặc nhập mã đặt lại mật khẩu quá nhiều lần',
};

export function createTooManyRequestsError(
  throttlerName: string,
  retryAfterSeconds: number,
): AppHttpException {
  const seconds = Math.max(1, Math.ceil(retryAfterSeconds));
  const wait = seconds >= 120 ? `${Math.ceil(seconds / 60)} phút` : `${seconds} giây`;
  const subject = THROTTLE_SUBJECTS[throttlerName] ?? 'Bạn gửi yêu cầu quá nhanh';
  return new AppHttpException(
    429,
    GATEWAY_ERROR_CODES.tooManyRequests,
    `${subject}. Hãy đợi khoảng ${wait} rồi thử lại.`,
  );
}

/** Body lỗi chuẩn (spec ERR-001 FR-001): có `code` và `message` là chuỗi không rỗng. */
export function isApiErrorEnvelope(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const { code, message } = value as Record<string, unknown>;
  return typeof code === 'string' && code !== '' && typeof message === 'string' && message !== '';
}

/** Message gốc của service chưa dùng định dạng chuẩn, rút gọn để đưa vào `details` khi cần dò lỗi. */
export function readLegacyUpstreamMessage(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const { message } = value as Record<string, unknown>;
  return typeof message === 'string' && message !== '' ? reflect(message) : undefined;
}

export function describeUpstreamErrorStatus(
  service: UpstreamService,
  status: number,
  requestId: string,
): string {
  return `Dịch vụ ${service} trả về lỗi ${status} nhưng không theo định dạng lỗi chuẩn, nên Gateway không chuyển tiếp nội dung gốc. Vui lòng thử lại; nếu lỗi lặp lại hãy báo quản trị viên kèm mã tham chiếu ${requestId}.`;
}
