/** Chi tiết một lỗi gắn với trường hoặc dòng dữ liệu cụ thể (spec ERR-001 FR-001). */
export interface ApiErrorDetail {
  field?: string;
  code: string;
  message: string;
}

/** Body JSON chung của mọi phản hồi lỗi HTTP (spec ERR-001 FR-001). */
export interface ApiErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details?: ApiErrorDetail[];
  requestId: string;
}

/** Mã lỗi chung do hạ tầng/Gateway sinh ra. Mã nghiệp vụ nằm trong từng service. */
export const COMMON_ERROR_CODES = {
  validationFailed: 'VALIDATION_FAILED',
  invalidJson: 'INVALID_JSON',
  internalError: 'INTERNAL_ERROR',
  httpError: 'HTTP_ERROR',
  badRequest: 'BAD_REQUEST',
  notFound: 'NOT_FOUND',
  methodNotAllowed: 'METHOD_NOT_ALLOWED',
  payloadTooLarge: 'PAYLOAD_TOO_LARGE',
  conflictDuplicate: 'CONFLICT_DUPLICATE',
  unprocessableEntity: 'UNPROCESSABLE_ENTITY',
  tooManyRequests: 'TOO_MANY_REQUESTS',
  unauthorized: 'UNAUTHORIZED',
  forbidden: 'FORBIDDEN',
  upstreamUnavailable: 'UPSTREAM_UNAVAILABLE',
  upstreamInvalidResponse: 'UPSTREAM_INVALID_RESPONSE',
  dependencyUnavailable: 'DEPENDENCY_UNAVAILABLE',
  serviceUnavailable: 'SERVICE_UNAVAILABLE',
} as const;
