# 2026-11-15 — Message lỗi rõ ràng cho API Gateway

- Author: Claude (fork, theo yêu cầu của chủ repo)
- Scope: `apps/api-gateway` (không đụng `libs/`, app khác hay `.docs/specs`)

## Spec and plan

- Spec: `.docs/specs/00-system/error-responses/spec.md` (ERR-001), FR-006, FR-011
- Plan: `.docs/specs/00-system/error-responses/plan.md`, bước 2 (Gateway)
- Tasks: `.docs/specs/00-system/error-responses/tasks.md`, mục Gateway
- Spec status at start: Approved

## Questions clarified

| Question                                                | Conclusion                                                                                  | Source                                                                                                       |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Có đổi message CSRF sang tiếng Việt ngay không?         | Chưa. Giữ đúng chuỗi `Invalid CSRF token`, chỉ thêm `code: CSRF_TOKEN_INVALID`              | Frontend đang nhận diện lỗi CSRF bằng chuỗi này (CLAUDE.md gốc; `bkpractice-frontend/src/lib/api/client.ts`) |
| Body lỗi của service chưa theo định dạng chuẩn thì sao? | Gateway trả `502 UPSTREAM_INVALID_RESPONSE`, không chuyển tiếp bất kỳ phần nào của body gốc | ERR-001 FR-011 và bảng Tình huống lỗi (sửa sau review ngày 2026-11-15)                                       |

## What was done

Mọi lỗi do chính Gateway sinh ra giờ là `AppHttpException` với `code` ổn định và message tiếng Việt (trừ CSRF). Status giữ nguyên như trước.

| Tình huống                                                          | Status | `code`                          |
| ------------------------------------------------------------------- | ------ | ------------------------------- |
| Header `Authorization` sai dạng Bearer                              | 401    | `AUTH_BEARER_MALFORMED`         |
| Không có access token                                               | 401    | `AUTH_TOKEN_MISSING`            |
| Token sai, hết hạn, phiên bị thu hồi                                | 401    | `AUTH_TOKEN_INVALID_OR_EXPIRED` |
| Identity không trả lời khi kiểm tra phiên                           | 503    | `AUTH_SESSION_UNAVAILABLE`      |
| Origin không được phép                                              | 403    | `ORIGIN_NOT_ALLOWED`            |
| Sai CSRF (message giữ `Invalid CSRF token`)                         | 403    | `CSRF_TOKEN_INVALID`            |
| Đường dẫn không an toàn (3 lý do, 3 message)                        | 400    | `UNSAFE_REQUEST_PATH`           |
| Không có tuyến chuyển tiếp                                          | 502    | `UPSTREAM_NOT_CONFIGURED`       |
| Service phía sau chết hoặc quá thời gian chờ                        | 502    | `UPSTREAM_UNAVAILABLE`          |
| Phản hồi đăng nhập của Identity bị từ chối (body, cookie, redirect) | 502    | `UPSTREAM_INVALID_RESPONSE`     |
| Bị giới hạn tần suất                                                | 429    | `TOO_MANY_REQUESTS`             |

Hành vi mới đáng chú ý:

- Lỗi 502 khi service chết nêu tên service ("dịch vụ Learning") và, nếu hết thời gian chờ, nêu số giây. Không bao giờ nêu host, port.
- Lỗi 429 nói rõ phải đợi bao lâu và đang bị giới hạn việc gì (đăng nhập, SSO/làm mới phiên, đặt lại mật khẩu, hay chung).
- Khi service trả status >= 400 mà body không phải lỗi chuẩn (HTML của nginx, chuỗi thô, rỗng, định dạng cũ), Gateway trả `502 UPSTREAM_INVALID_RESPONSE` kèm `requestId`, không giữ status của upstream và không chép message gốc vào đâu cả (body đó có thể chứa DSN, SQL, stack). Chỉ body đúng chuẩn đầy đủ (`statusCode` khớp status HTTP, `code`, `message`, `requestId` là chuỗi không rỗng; `details` nếu có phải đúng dạng) mới được giữ nguyên từng byte. Status < 400, redirect, cookie không đổi.

File: `application/errors/gateway-errors.ts` (mới, toàn bộ mã và message), `presentation/guards/gateway-throttler.guard.ts` (mới), `gateway-proxy.service.ts`, `gateway-auth.middleware.ts`, `gateway-session.service.ts`, `api-gateway.module.ts`; test: 3 file mới và 6 file test cũ cập nhật kỳ vọng (không xóa test nào).

## Why these choices

- Mã và message nằm trong một file ở tầng `application`: `presentation` được phép import `application` (Layered), còn `application` không import `presentation`. Throttler guard ở `presentation` vì là guard.
- `GatewayThrottlerGuard` kế thừa `ThrottlerGuard` và chỉ ghi đè `throwThrottlingException`: giữ nguyên cơ chế và hạn mức, chỉ đổi lỗi. Ném thẳng `AppHttpException` vì `AllExceptionsFilter` ở libs bỏ qua message khi `HttpException` có body dạng chuỗi (xem Remaining).
- Middleware trước đây rethrow `ForbiddenException`/`ServiceUnavailableException`; vì lỗi mới là `AppHttpException`, điều kiện đổi thành `HttpException` có status 403 hoặc 503, nếu không lỗi origin/CSRF sẽ bị đổi nhầm thành 401.
- Chuỗi CSRF giữ nguyên vì frontend còn dựa vào nó để lấy lại token; đổi chuỗi lúc này làm hỏng cơ chế thử lại.

## How the feature works

1. Request vào Gateway; `RequestIdMiddleware` rồi `GatewayAuthMiddleware` chạy.
2. Thiếu hoặc sai token/origin/CSRF thì middleware ném `AppHttpException`; `AllExceptionsFilter` (libs, toàn cục) ghi body chuẩn `{statusCode, code, message, requestId}`.
3. Request hợp lệ đến `GatewayProxyService.forward`, chọn service theo tiền tố (kèm tên logic) rồi gọi upstream.
4. Upstream lỗi kết nối hoặc quá hạn: ném `UPSTREAM_UNAVAILABLE`. Upstream trả >= 400: nếu body đã đúng chuẩn thì chuyển tiếp nguyên vẹn, nếu không thì gửi lỗi chuẩn `UPSTREAM_INVALID_RESPONSE` với content-type JSON và `x-request-id`.
5. Vượt hạn mức: `GatewayThrottlerGuard` ném `TOO_MANY_REQUESTS` kèm thời gian chờ.

## Configuration

No configuration change.

## Verification

- Commands run and their results:
  - `pnpm typecheck`: passed.
  - `pnpm exec eslint apps/api-gateway`: passed (không cảnh báo).
  - `pnpm exec jest apps/api-gateway --runInBand`: 14 suite, 286 test passed.
  - `codegraph sync .`: done.
- Not verified:
  - Chưa chạy end-to-end với Gateway và các service thật, chưa deploy.
  - Chưa kiểm tra frontend với các `code` mới ngoài login (frontend chưa đọc `code` ở nơi khác).
  - Realtime Socket.IO (`submission-realtime.gateway.ts`) chỉ ngắt kết nối, không có message lỗi HTTP; không đổi.

## Remaining

- Not done:
  - Đổi `Invalid CSRF token` sang tiếng Việt: chỉ làm sau khi frontend nhận diện bằng `code === 'CSRF_TOKEN_INVALID'`.
  - Thông báo cho lỗi Socket.IO.
- Risks:
  - **Thứ tự phát hành:** các service chưa chuyển sang lỗi chuẩn (nhiều filter của Identity và Learning còn trả `{statusCode, message}` không có `code`) sẽ bị Gateway thay bằng `UPSTREAM_INVALID_RESPONSE` với message chung. Message gốc chỉ còn trong `details`. Nên phát hành Gateway cùng lúc hoặc sau khi các service khác đã chuyển xong.
  - Frontend đọc `message` khi có `code`, nên với backend lẫn lộn định dạng người dùng sẽ thấy câu chung "Dịch vụ X trả về lỗi ..." thay cho câu cũ.
  - `libs/common`: `AllExceptionsFilter.normalizeHttpException` bỏ message khi `HttpException` có body dạng chuỗi (ví dụ `new HttpException('text', 429)`); cần sửa ở libs, ngoài phạm vi.
  - `resolveRequestId` (libs, do fork khác sửa) chỉ nhận UUID, nhưng `RequestIdMiddleware` của Gateway còn chấp nhận mọi chuỗi từ client; khi client gửi chuỗi không phải UUID thì `requestId` trong body khác header `x-request-id`. Cần chỉnh `RequestIdMiddleware` ở libs.

## Sửa sau review (2026-11-15)

- Bản đầu giữ status của upstream, chép message cũ vào `details` và chỉ kiểm tra `code` + `message`. Cả ba đều sai so với spec ERR-001: thiếu 502, có đường rò nội dung nội bộ, và cho qua body thiếu `statusCode`/`requestId` hoặc lệch status. Nguyên nhân gốc là brief giao việc ghi sai "giữ nguyên status".
- Đã sửa: `isApiErrorEnvelope(value, status)` kiểm tra đủ schema và khớp status; Gateway luôn trả 502 và chỉ ghi log `requestId`, tên service, status upstream (không ghi body). Đã bỏ `readLegacyUpstreamMessage`.
- Test mới: HTML 404 thành 502; body hostile có DSN/đường dẫn không xuất hiện trong phản hồi; body thiếu `requestId`/`statusCode`/lệch status bị bọc; body do `buildApiError` của libs sinh ra vẫn được giữ nguyên (tương thích service thật).
