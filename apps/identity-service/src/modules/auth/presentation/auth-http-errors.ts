import { AppHttpException } from '@app/common';

/** Lỗi HTTP do controller và bộ xác thực của Identity ném ra (ERR-001 FR-009). */
export const AUTH_HTTP_ERRORS = {
  notLoggedIn: (): AppHttpException =>
    new AppHttpException(
      401,
      'AUTH_NOT_LOGGED_IN',
      'Bạn chưa đăng nhập hoặc chưa có phiên bảo mật. Hãy đăng nhập rồi thử lại.',
    ),
  clientTypeInvalid: (): AppHttpException =>
    new AppHttpException(
      400,
      'AUTH_CLIENT_TYPE_INVALID',
      'Header X-Client-Type chỉ được là "web" hoặc "mobile".',
    ),
  originNotAllowed: (): AppHttpException =>
    new AppHttpException(
      403,
      'ORIGIN_NOT_ALLOWED',
      'Yêu cầu đến từ một nguồn (origin) không được tin cậy. Hãy truy cập qua trang BKPractice chính thức.',
    ),
  // Giữ nguyên chuỗi tiếng Anh: frontend hiện nhận diện lỗi CSRF theo đúng chuỗi này.
  // Đổi sang tiếng Việt sau khi frontend nhận diện theo `code === 'CSRF_TOKEN_INVALID'`.
  csrfInvalid: (): AppHttpException =>
    new AppHttpException(403, 'CSRF_TOKEN_INVALID', 'Invalid CSRF token'),
};
