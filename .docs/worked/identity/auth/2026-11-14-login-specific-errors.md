# 2026-11-14 — Hạ tầng lỗi chung và lỗi đăng nhập chi tiết

- Author: Claude (theo yêu cầu của chủ repo)
- Scope: `libs/contracts`, `libs/common`, Identity `modules/auth`. Gateway, Learning, Submission, Community chưa làm.

## Spec and plan

- Spec: `.docs/specs/00-system/error-responses/spec.md` (ERR-001), phần FR-001 đến FR-005, FR-007, FR-008, FR-012
- Plan: `.docs/specs/00-system/error-responses/plan.md`, bước 1 (hạ tầng chung) và bước 3 (chỉ phần login của Identity)
- Tasks: `.docs/specs/00-system/error-responses/tasks.md`
- Spec status at start: Approved (2026-11-14)

## Questions clarified

| Question                                                                  | Conclusion                                                                      | Source                                                      |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Login có báo chi tiết từng lý do không, dù spec ID-001 yêu cầu lỗi chung? | Có, chỉ riêng `POST /auth/login`. Microsoft, refresh, quên mật khẩu giữ nguyên. | Chủ repo, 2026-11-14; ghi vào ERR-001 FR-007 và ID-001 v1.3 |
| Thứ tự báo trạng thái tài khoản                                           | Chỉ báo xóa/khóa/chưa kích hoạt sau khi mật khẩu đúng                           | ERR-001 câu hỏi mở 2 (chốt theo đề xuất, chủ repo ủy quyền) |
| Status của tài khoản bị xóa/khóa/chưa kích hoạt                           | 403                                                                             | ERR-001 câu hỏi mở 5                                        |
| Message ngôn ngữ nào                                                      | Tiếng Việt                                                                      | ERR-001 câu hỏi mở 3                                        |

## What was done

- Thêm kiểu `ApiErrorBody`, `ApiErrorDetail` và danh mục mã lỗi chung vào `libs/contracts/src/http-error.contracts.ts`.
- Thêm vào `libs/common/src/http/errors/`: `AppHttpException` (ngoại lệ có `code`), `buildApiError`/`sendApiError`/`resolveRequestId`, `AllExceptionsFilter` (lưới an toàn toàn cục) và `createValidationPipe` (lỗi dữ liệu tiếng Việt, liệt kê từng trường). `configureHttpApp` đăng ký cả hai nên mọi app dùng chung `libs/common` đều nhận.
- Identity: đăng nhập tra tài khoản kể cả đã xóa mềm bằng `findForLogin` mới, rồi báo 6 lý do riêng. `AuthFailureFilter` viết lại để trả `{ statusCode, code, message, requestId }`.
- Hành vi mới: `POST /auth/login` với tài khoản đã xóa mềm và mật khẩu đúng nhận `403 AUTH_ACCOUNT_DELETED` thay vì `401 Authentication failed`.

## Why these choices

- `findForLogin` là phương thức mới thay vì sửa `findByIdentifier`: nhiều test tích hợp và `seed-admin` đang dựa vào hành vi cũ (trả `null` khi không có hoặc trùng).
- Tra tài khoản còn sống trước, chỉ tra tài khoản đã xóa khi không có tài khoản sống: một MSSV được cấp lại sau khi xóa không bị tính là trùng (`AUTH_IDENTIFIER_AMBIGUOUS`).
- Kiểm tra mật khẩu trước rồi mới báo trạng thái: người không biết mật khẩu không dò được tài khoản nào đã bị xóa hay khóa. Vẫn gọi `verifyDummy` khi không tìm thấy để thời gian xử lý không quá khác biệt.
- Mã lỗi đặt trong tầng presentation của Identity (`AUTH_ERROR_RESPONSES`), domain chỉ ném `AuthFailure` với mã nội bộ: domain không biết HTTP, đúng `dependency-rules.md`.
- Helper lỗi đặt ở `libs/common` vì `dependency-rules.md` cho phép "context-neutral output/error helpers" trong libs; không có mã nghiệp vụ nào ở đó.
- `requestId` tự sinh khi thiếu `x-request-id`: `RequestIdMiddleware` hiện chỉ chạy ở Gateway và vài controller của Identity.

## How the feature works

1. Frontend gọi `POST /api/auth/login` qua Gateway, Gateway chuyển tiếp tới Identity.
2. `AuthController.login` gọi `LoginWithPassword.execute`.
3. Use case gọi `AuthAccountRepository.findForLogin` và nhận một trong `none`, `ambiguous`, `found` (kèm cờ `deleted`).
4. `none` hoặc `ambiguous`: gọi `verifyDummy`, ném `account_not_found` hoặc `identifier_ambiguous`.
5. `found`: kiểm tra mật khẩu, sai thì ném `wrong_password`. Đúng thì lần lượt kiểm tra `deleted`, `LOCKED`, `PENDING`; mọi thứ hợp lệ mới phát token.
6. `AuthFailureFilter` ánh xạ mã sang status, `code` và message tiếng Việt, ghi một dòng log gồm `requestId`, `status`, `code`, `method` (không có MSSV, email hay mật khẩu).
7. Gateway chuyển nguyên body lỗi về frontend.

Lỗi không thuộc module nào đi qua `AllExceptionsFilter`: lỗi dữ liệu thành `VALIDATION_FAILED` kèm `details`, vi phạm unique thành 409, mất kết nối DB thành 503, lỗi lạ thành 500 chỉ kèm `requestId`.

## Configuration

No configuration change.

## Verification

- Commands run and their results:
  - `pnpm typecheck`: passed.
  - `pnpm lint`: passed.
  - `pnpm test`: 147 suites passed, 24 skipped (integration, cần `TEST_DATABASE_URL`); 1182 tests passed, 280 skipped.
  - Truy vấn chỉ đọc trên DB identity thật để kiểm tra logic `findForLogin` (SQL tương đương): tài khoản đã xóa mềm trả `found(deleted)`, MSSV `123220145` và `admin` trả `found(live)`, `admin@bkpractice.local` (tài khoản hệ thống) và MSSV lạ trả `none`.
  - `codegraph sync .`: done.
- Not verified:
  - Truy vấn TypeORM `findForLogin` chưa chạy với DB thật qua code repository (test tích hợp mới thêm trong `auth-migration.spec.ts` đang bị bỏ qua vì thiếu `TEST_DATABASE_URL`).
  - Chưa chạy end-to-end qua Gateway và chưa triển khai lên production.
  - Frontend chưa đọc `code`/`message` mới (xem Remaining).

## Remaining

- Not done:
  - Gateway, các filter còn lại của Identity (password-reset, account-import, profile, rbac, user-management), Learning, Submission, Community (plan bước 2, 3 phần còn lại, 4, 5).
  - Swagger và `.docs/guides/frontend-api.md` (bước 6).
  - Bước 0 (repo frontend): form đăng nhập hiện chỉ biết 401 và hiển thị câu cố định, nên 403/409 mới sẽ hiện "Không thể đăng nhập lúc này" cho tới khi frontend hiển thị `message` từ backend.
- Risks:
  - Đăng nhập giờ lộ MSSV/email có tồn tại hay không (rủi ro đã được chủ repo chấp nhận); throttling Gateway giữ nguyên.
  - Lỗi dữ liệu đổi `message` từ mảng sang chuỗi. Chưa đổi message lỗi CSRF của Gateway vì frontend đang nhận diện bằng chuỗi `Invalid CSRF token`.
