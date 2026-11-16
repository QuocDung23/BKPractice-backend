# [ERR-001] Kế hoạch triển khai

> Spec ERR-001 đã `Approved` (2026-11-14). Kế hoạch này vẫn cần chủ sở hữu xem lại trước khi code; mục
> "Tuân thủ kiến trúc" còn một bước đối chiếu bắt buộc (xem `tasks.md`).

## Đặc tả liên quan

[`./spec.md`](./spec.md), phiên bản 1.0 (2026-11-14), trạng thái `Approved`.

## Service đích

Nhiều service: API Gateway, Identity, Learning, Submission, Community, cộng thư viện dùng chung
`libs/common` và `libs/contracts`. Judge không thuộc phạm vi (không có API HTTP công khai).

## Kiến trúc service bắt buộc

Mỗi service giữ nguyên kiến trúc theo ADR 0002: Gateway = Layered; Identity, Submission, Community = Clean
Architecture; Learning = DDD + Hexagonal. Kế hoạch **không đổi** kiến trúc nào; chỉ thêm một cơ chế
xuyên suốt ở tầng presentation/transport.

## Ảnh hưởng tới mã nguồn hiện có

Khảo sát 2026-11-14:

| Nơi                                                  | Hiện trạng                                                                                                                                                   | Việc cần làm                                  |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| `libs/common/src/bootstrap.ts`                       | `ValidationPipe` mặc định (message tiếng Anh, mảng), không có filter toàn cục                                                                                | Thêm `exceptionFactory` + `useGlobalFilters`  |
| `libs/common/src/http/`                              | Có middleware request-id                                                                                                                                     | Tái sử dụng để lấy `requestId`                |
| Identity: 6 filter                                   | `auth-failure`, `password-reset-failure`, `account-import-failure`, `profile-failure`, `rbac-failure`, `user-management-failure`                             | Chuyển sang dùng helper envelope, thêm `code` |
| Learning: 5 filter                                   | `course-exception`, `quiz-exception`, `problem-exception`, `progress-exception`, `student-course-report`                                                     | Chuyển sang helper envelope                   |
| Submission, Community                                | Không có filter, ném `HttpException` mặc định; Community dùng TypeORM trực tiếp trong `posts.service.ts`                                                     | Bổ sung mapping lỗi và `code`                 |
| Gateway                                              | `BadGatewayException`, `UnauthorizedException`... với message tiếng Anh ngắn; proxy chuyển nguyên body upstream (`response.status(...).send(upstream.data)`) | Thêm `code` + message; giữ nguyên chuyển tiếp |
| Login: `LoginWithPassword` + `account.repository.ts` | `findByIdentifier` lọc `deletedAt IS NULL`, trả `null` khi 0 hoặc >1 kết quả, mọi lỗi thành `invalid_credentials`                                            | Xem mục Thay đổi ở tầng domain/application    |

Hành vi phải giữ tương thích: status HTTP hiện tại của mọi lỗi (trừ FR-007), tên cookie, luồng CSRF,
throttling, nội dung chống dò ở Microsoft/refresh/quên mật khẩu.

## Thiết kế chung

### Đặt mã dùng chung ở đâu

- `libs/contracts/src/http-error.contracts.ts` (mới): kiểu `ApiErrorBody`, `ApiErrorDetail`, danh mục
  `CommonErrorCode` (hằng chuỗi). Chỉ là hợp đồng, không có logic nghiệp vụ.
- `libs/common/src/http/errors/` (mới): hạ tầng không thuộc nghiệp vụ nào:
  - `buildApiError({ status, code, message, details?, request })` tạo body chuẩn, lấy `requestId`.
  - `AppHttpException(status, code, message, details?)`: ngoại lệ có `code`, dùng cho Gateway và các service
    còn đang ném `HttpException` thường.
  - `AllExceptionsFilter` (toàn cục, `@Catch()`): bắt `AppHttpException`, `HttpException` (kể cả 404/405/413),
    `QueryFailedError` (unique violation Postgres `23505` thành 409), mọi lỗi còn lại thành `INTERNAL_ERROR`.
  - `createValidationPipe()`: `ValidationPipe` giữ nguyên `transform/whitelist/forbidNonWhitelisted`, thêm
    `exceptionFactory` biến `ValidationError[]` thành `VALIDATION_FAILED` + `details` tiếng Việt.
  - Bảng ánh xạ ràng buộc `class-validator` sang `{ code, message }` tiếng Việt (`isNotEmpty`, `minLength`,
    `maxLength`, `isEmail`, `matches`, `whitelistValidation`...).
- `configureHttpApp` đăng ký pipe và filter toàn cục, nên **mọi app tự hưởng**. Danh mục `code` nghiệp vụ nằm
  **trong từng service** (ví dụ `apps/identity-service/src/modules/rbac/presentation/rbac-error-codes.ts`),
  không đặt trong libs (libs không chứa mô hình nghiệp vụ).

### Thứ tự ưu tiên filter

Nest chạy filter gắn ở controller/route (`@UseFilters`) **trước** filter toàn cục. Vì vậy các filter hiện có
của từng module vẫn thắng. Kế hoạch: sửa từng filter đó để gọi `buildApiError` (cùng envelope), còn
`AllExceptionsFilter` là lưới an toàn cho phần còn lại. Không xóa filter nào trong đợt này.

### Quy ước `code`

`<MODULE>_<SITUATION>` UPPER_SNAKE: `AUTH_*`, `RBAC_*`, `USER_*`, `PROFILE_*`, `COURSE_*`, `PROBLEM_*`,
`QUIZ_*`, `PROGRESS_*`, `SUBMISSION_*`, `POST_*`, `COMMENT_*`. Mỗi `code` có hằng riêng và ít nhất một test
xác nhận status + message.

## Thay đổi ở tầng domain

Chỉ Identity/auth (FR-007):

- Mở rộng `AuthFailure.code` thêm: `account_not_found`, `wrong_password`, `identifier_ambiguous`,
  `account_deleted`, `account_locked`, `account_pending`. Giữ nguyên `invalid_credentials`, `invalid_token`,
  `dependency_unavailable` cho refresh/Microsoft/exchange (FR-008).
- `requireActiveAccount` **không đổi** (vẫn dùng ở refresh, Microsoft, exchange). Login dùng một hàm riêng
  kiểm tra trạng thái và ném mã chi tiết.

## Tầng application / Use case

`LoginWithPassword.execute` (Identity) đổi luồng như sau, đúng thứ tự FR-007:

1. Tra tài khoản **kể cả đã xóa mềm** qua port mới `AuthAccountRepository.findForLogin(identifier)`; trả
   `{ kind: 'none' } | { kind: 'ambiguous' } | { kind: 'found', account, deletedAt }`.
2. `none`: vẫn gọi `hasher.verifyDummy(password)` để thời gian xử lý không khác biệt rõ rệt, rồi ném
   `account_not_found`. `ambiguous`: ném `identifier_ambiguous`.
3. `found`: verify mật khẩu; sai thì ném `wrong_password` (bất kể trạng thái).
4. Mật khẩu đúng: nếu đã xóa mềm thì `account_deleted`; nếu `LOCKED` thì `account_locked`; nếu `PENDING` thì
   `account_pending`; ngược lại phát token như cũ.

Các use case khác (refresh, Microsoft, exchange, quên mật khẩu) không đổi hành vi.

## Lưu trữ

- Identity: thêm `findForLogin` trong `account.repository.ts`, dùng `withDeleted()` hoặc bỏ điều kiện
  `deletedAt IS NULL` rồi tự phân loại; giữ điều kiện `is_system_account = false` cho nhánh email.
  Không đụng service/DB khác.
- Không cần migration, không đổi schema.

## Thay đổi cơ sở dữ liệu

N/A.

## Migration

N/A.

## API

- Không thêm/xóa route. Mọi route giữ request cũ.
- Response lỗi đổi theo FR-001. Swagger: thêm `ApiErrorResponseDto` (libs/common) và gắn `@ApiResponse` cho các
  mã lỗi chính của route công khai quan trọng (login, refresh, quản lý user, khóa học, submit code, bài viết).
- Tương thích: `statusCode` và `message` vẫn có mặt; `message` luôn là chuỗi. Lỗi validation đổi `message` từ
  mảng sang chuỗi, danh sách chuyển vào `details` (ghi trong tài liệu `guides/frontend-api.md`).

## DTO / Kiểm tra dữ liệu

Không đổi ràng buộc DTO. Chỉ đổi cách trình bày lỗi qua `createValidationPipe()`. Với DTO tự viết
`@IsString()`... không cần sửa; message mặc định được thay bằng bảng ánh xạ chung. Nếu một DTO cần message
riêng thì dùng `message` option của decorator.

## Phân quyền

Không đổi. Lỗi 403 của `RbacGuard`/`TrustedPrincipalGuard` được bổ sung tên quyền thiếu **chỉ khi** guard đã
biết tên quyền (không đoán). Cần đọc `RbacGuard` để lấy tên quyền ở bước triển khai.

## Messaging / Sự kiện

N/A. Lỗi của consumer RabbitMQ và Judge nằm ngoài phạm vi.

## Realtime

N/A.

## Adapter hạ tầng

- Gateway: `gateway-proxy.service.ts` hiện bắt lỗi axios thành `BadGatewayException('Upstream service is
unavailable')`. Đổi thành `AppHttpException(502, 'UPSTREAM_UNAVAILABLE', ...)` có tên service suy ra từ route
  đích. Khi upstream trả body không phải envelope (ví dụ HTML từ nginx, hoặc service chưa nâng cấp) thì Gateway
  bọc thành `UPSTREAM_INVALID_RESPONSE` thay vì chuyển nguyên.
- `QueryFailedError`: map `23505` (unique) theo tên constraint sang `code` cụ thể qua một bảng trong từng
  service (`USER_EMAIL_ALREADY_EXISTS`, `USER_STUDENT_ID_ALREADY_EXISTS`, `COURSE_SLUG_ALREADY_EXISTS`...),
  mặc định `CONFLICT_DUPLICATE`. Tên constraint không bao giờ ra client.

## Xử lý lỗi

Bảng quyết định của `AllExceptionsFilter`:

| Nguồn                                     | Status         | `code`                                                                    |
| ----------------------------------------- | -------------- | ------------------------------------------------------------------------- |
| `AppHttpException`                        | theo exception | theo exception                                                            |
| `BadRequestException` từ `ValidationPipe` | 400            | `VALIDATION_FAILED` + `details`                                           |
| `HttpException` khác (404/405/413...)     | theo exception | `NOT_FOUND`, `METHOD_NOT_ALLOWED`, `PAYLOAD_TOO_LARGE`, hoặc `HTTP_ERROR` |
| `QueryFailedError` 23505                  | 409            | theo bảng constraint                                                      |
| Lỗi kết nối DB/Redis/AMQP                 | 503            | `DEPENDENCY_UNAVAILABLE`                                                  |
| JSON parse lỗi (`entity.parse.failed`)    | 400            | `INVALID_JSON`                                                            |
| Còn lại                                   | 500            | `INTERNAL_ERROR`                                                          |

Lỗi 5xx ghi `logger.error` (có stack) kèm `requestId`; lỗi 4xx ghi `logger.warn` không stack.

## Bảo mật

| Mối đe doạ                                         | Biện pháp                                                                                                 |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Lộ nội bộ qua message lỗi (SQL, stack, host)       | Body 5xx luôn dùng message cố định; test khẳng định body không chứa `SELECT`, `at `, `postgres`, `/home`  |
| Dò tài khoản qua login (rủi ro chấp nhận ở FR-007) | Chỉ báo trạng thái sau khi mật khẩu đúng; giữ `verifyDummy`; **giữ throttling Gateway** (câu hỏi mở 1)    |
| Lộ dữ liệu người khác trong message                | Message chỉ nhắc dữ liệu người gọi vừa gửi; review từng `code` mới                                        |
| Lộ bí mật qua `details`                            | `details` chỉ chứa tên trường và message chuẩn hóa, không echo giá trị người dùng nhập (nhất là mật khẩu) |

Cần xác nhận khi triển khai: log lỗi không in giá trị trường mật khẩu/token (ID-007-AC-006).

## Chiến lược kiểm thử

| AC                | Kiểm thử                                                                                              |
| ----------------- | ----------------------------------------------------------------------------------------------------- |
| AC-001, AC-009    | Test hợp đồng dùng chung `expectApiError(res)` chạy trên một route lỗi của mỗi service và qua Gateway |
| AC-002 đến AC-005 | Unit test `LoginWithPassword` cho 6 nhánh + test filter + e2e supertest (DB test)                     |
| AC-006            | Test `createValidationPipe` với DTO nhiều trường sai                                                  |
| AC-007, AC-010    | Test filter với `QueryFailedError` giả và lỗi ngẫu nhiên; kiểm tra body không lộ nội bộ               |
| AC-008            | Test hồi quy: Microsoft, refresh, quên mật khẩu vẫn không phân biệt trường hợp                        |
| AC-011            | Test `requestId` trong body khớp `x-request-id` và có trong log                                       |
| AC-012            | Snapshot Swagger có schema lỗi                                                                        |

Mỗi filter hiện có giữ spec cũ; cập nhật kỳ vọng body, không xóa test.

## Khả năng quan sát

`requestId` trong body = `x-request-id` do Gateway cấp (middleware có sẵn ở `libs/common/src/http`). Log lỗi
dạng có cấu trúc: `{ requestId, code, status, operation }`, không chứa body request.

## Thứ tự triển khai

Mỗi bước là một PR nhỏ, backend không phá vỡ frontend:

0. **Frontend trước** (repo `bkpractice-frontend`, PR riêng): nhận CSRF theo `code === 'CSRF_TOKEN_INVALID'`
   hoặc chuỗi cũ; hiển thị `message` backend ở form đăng nhập; không còn đọc `message` như mảng.
1. `libs/contracts` + `libs/common`: envelope, `buildApiError`, `AppHttpException`, `AllExceptionsFilter`,
   `createValidationPipe` + test. Đăng ký ở `configureHttpApp`.
2. **Gateway**: gán `code` + message cho mọi lỗi tự sinh; xử lý body upstream không phải envelope.
3. **Identity**: chuyển 6 filter sang envelope; đổi luồng login (FR-007) cùng test; danh mục `AUTH_*`, `RBAC_*`,
   `USER_*`, `PROFILE_*`.
4. **Learning**: chuyển 5 filter; danh mục `COURSE_*`, `PROBLEM_*`, `QUIZ_*`, `PROGRESS_*`.
5. **Submission** và **Community**: thêm mapping lỗi, danh mục `SUBMISSION_*`, `POST_*`, `COMMENT_*`.
6. Swagger + cập nhật `.docs/guides/frontend-api.md` (định dạng lỗi, bảng `code`).
7. Worked entry theo từng service, chạy `pnpm lint`, `typecheck`, `test`, `build`, `codegraph sync .`.

## Rủi ro

| Rủi ro                                                                            | Giảm thiểu                                                                               |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Frontend gãy vì đổi chuỗi CSRF hoặc `message` mảng                                | Bước 0 phát hành trước; giai đoạn chuyển tiếp chấp nhận cả `code` mới lẫn chuỗi cũ       |
| Filter cấp module che mất `AllExceptionsFilter`, một số lỗi vẫn ra định dạng cũ   | Test hợp đồng `expectApiError` chạy trên từng filter; liệt kê filter còn sót trong tasks |
| `@/` alias bị overload (Learning/Gateway/Identity) gây import nhầm khi sửa filter | Dùng alias `@app/*`, `@identity`, `@learning`...; kiểm tra import bằng `pnpm typecheck`  |
| Lộ danh sách tài khoản qua login                                                  | Đã được chủ sở hữu chấp nhận; giữ throttling; câu hỏi mở 1 đề xuất siết thêm             |
| Số lượng `code` nghiệp vụ lớn, dễ trùng/sót                                       | Mỗi service một file hằng; test kiểm tra không có `code` trùng giá trị                   |
| Message tiếng Việt không đồng nhất                                                | Tập trung message trong file hằng của từng module, không viết rải rác trong filter       |

## Tuân thủ kiến trúc

- Mã dùng chung trong `libs/common` và `libs/contracts` chỉ là hạ tầng HTTP và hợp đồng kiểu, không chứa
  entity, use case hay repository, đúng quy tắc libs.
- Danh mục `code` nghiệp vụ và message nằm trong tầng presentation của từng service; domain/application chỉ
  ném lỗi miền (`AuthFailure`...), không import `@nestjs/*` (Learning domain cấm Nest).
- Không import chéo giữa service; Gateway không biết `code` nghiệp vụ, chỉ chuyển tiếp body.
- Login: port mới `findForLogin` nằm ở application, adapter TypeORM ở infrastructure; presentation chỉ ánh xạ
  mã lỗi sang HTTP (đúng chiều presentation → application → domain).
- **Chưa đối chiếu trực tiếp** với `.docs/architecture/dependency-rules.md` và ADR 0002 (dựa trên tóm tắt
  trong CLAUDE.md). Việc đối chiếu là mục bắt buộc ở bước Chuẩn bị trong `tasks.md` trước khi code.
