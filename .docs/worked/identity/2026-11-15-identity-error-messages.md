# 2026-11-15 — Message lỗi chính xác cho toàn bộ Identity

- Author: Claude (theo yêu cầu của chủ repo)
- Scope: Identity `modules/auth`, `modules/users`, `modules/profiles`, `modules/rbac`; chỉnh `libs/common/src/http/errors`.

## Spec and plan

- Spec: `.docs/specs/00-system/error-responses/spec.md` (ERR-001), FR-001 đến FR-005, FR-008 đến FR-010, FR-012
- Plan: `.docs/specs/00-system/error-responses/plan.md`, bước 3 (phần còn lại của Identity)
- Tasks: `.docs/specs/00-system/error-responses/tasks.md`
- Spec status at start: Approved (2026-11-14)

## Questions clarified

| Question                                                            | Conclusion                                                                | Source                                |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------- |
| Quên mật khẩu có được nói rõ OTP sai hay email không tồn tại không? | Không, giữ không tiết lộ; chỉ nêu rõ lỗi độ dài mật khẩu mới              | ID-007, ERR-001 FR-008                |
| Message lỗi CSRF có đổi sang tiếng Việt không?                      | Chưa. Giữ chuỗi `Invalid CSRF token`, chỉ thêm `code: CSRF_TOKEN_INVALID` | Frontend đang nhận diện theo chuỗi đó |
| Có đổi status HTTP của lỗi nào không?                               | Không                                                                     | ERR-001 Quy tắc nghiệp vụ             |

## What was done

- 5 filter của Identity (quên mật khẩu, import tài khoản, hồ sơ, phân quyền, quản lý user) trả `{statusCode, code, message, details?, requestId}` qua `sendApiError`.
- Mỗi lỗi miền có thêm `reason` (và `detail` khi cần) để chọn mã và thông báo đúng nguyên nhân: ví dụ `UserManagementFailure('conflict')` trước đây gộp 4 nguyên nhân (thiếu vai trò, trùng email/MSSV, tài khoản chưa kích hoạt, quản trị viên cuối cùng), nay tách thành `USER_ROLE_NOT_SEEDED`, `USER_EMAIL_ALREADY_EXISTS` / `USER_STUDENT_ID_ALREADY_EXISTS`, `USER_ACCOUNT_PENDING`, `USER_LAST_ADMIN`.
- `validateCreateManagedUser` kiểm tra tuần tự từng trường và nêu đúng trường sai (vai trò, tên, email, đuôi email, mật khẩu, MSSV); `details` gắn vào tên trường để frontend hiển thị đúng chỗ.
- Lỗi import file: mỗi dòng lỗi có thông báo "Dòng N, cột X: ..." trong `details`; `totalRows` đưa vào message.
- Các lỗi HTTP ném trực tiếp trong controller (`401`, `400 X-Client-Type`, `403 origin`, `403 CSRF`, `RbacGuard`, endpoint nội bộ) chuyển sang `AppHttpException` có mã riêng.
- `libs/common`: JSON sai cú pháp trả `INVALID_JSON`, UUID/số sai trên đường dẫn trả `INVALID_PARAMETER`, `HttpException` có body là chuỗi giữ nguyên thông báo; thông báo tiếng Anh mặc định của Nest (`Forbidden`, `Not Found`, `ThrottlerException: Too Many Requests`...) được thay bằng thông báo tiếng Việt; `requestId` chỉ được phản chiếu khi là UUID.

## Why these choices

- `reason` là tham số tùy chọn thứ hai của các lớp lỗi miền: domain vẫn không biết HTTP, và các nơi cũ chỉ kiểm tra `code` hoặc `instanceof` vẫn chạy như trước.
- Bảng mã và message nằm ở tầng presentation (`*-errors.ts`) của từng module, đúng `dependency-rules.md`; mỗi hàm `describe*Failure` thuần túy nên test được không cần Nest.
- Cột trùng khi tạo user lấy từ `detail` của Postgres (`Key (email)=...`) chỉ để biết tên cột; giá trị người dùng nhập không bao giờ đưa vào message.
- `requestId` chỉ nhận UUID vì test cũ về "token bị gửi làm request ID" phát hiện bản đầu của mình phản chiếu cả chuỗi dạng token.

## How the feature works

1. Use case hoặc repository ném lỗi miền với `code` và `reason`.
2. Filter của module bắt lỗi, gọi `describe*Failure` để lấy status, `code`, message, `details`.
3. `sendApiError` ghi body chuẩn kèm `requestId`; filter ghi một dòng log có `requestId`, `code`, `status`, `method` (không có dữ liệu người dùng nhập).
4. Lỗi không thuộc filter nào đi tiếp tới `AllExceptionsFilter` toàn cục.

## Configuration

No configuration change.

## Verification

- `pnpm exec jest apps/identity-service libs --runInBand`: 39 suite đạt, 8 bị bỏ qua (tích hợp, cần `TEST_DATABASE_URL`); 237 test đạt.
- `libs/common/src/http/errors/http-errors.http.spec.ts` chạy một app Nest thật qua HTTP (JSON sai, trường sai, route không có, UUID sai, 403 mặc định, 500, thành công); test này phát hiện Nest bọc lỗi JSON thành `BadRequestException` nên test giả bằng đối tượng không thấy được.
- Test mới: bảng mã lỗi cho users, rbac, profiles, quên mật khẩu, import; kiểm tra `validateCreateManagedUser` từng nguyên nhân; hồi quy không tiết lộ ở quên mật khẩu.
- `msal.provider.spec` từng fail một lần khi chạy cả bộ lúc máy bận và đạt khi chạy riêng (không liên quan thay đổi này).

## Not verified

- Chưa chạy các repository tích hợp (cần DB test), nên đường `uniqueViolationField` với lỗi Postgres thật chưa được chạy; chỉ có logic đọc `detail` được viết theo định dạng thông báo chuẩn của Postgres.
- Chưa chạy qua Gateway với service thật.

## Remaining

- Not done: Swagger và `.docs/guides/frontend-api.md`.
- Risks: `message` của lỗi CSRF vẫn là tiếng Anh cho tới khi frontend nhận diện theo `code`. Frontend nào đang đọc message tiếng Anh cũ của các lỗi khác sẽ thấy câu mới, nên rẽ nhánh theo `code`.
