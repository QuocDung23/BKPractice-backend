# [ERR-001] Công việc triển khai

Đặc tả liên quan: `./spec.md`  
Kế hoạch liên quan: `./plan.md`

> Spec đã `Approved` (2026-11-14), câu hỏi mở đã chốt. Hoàn tất mục "Chuẩn bị" còn lại trước khi viết code.

## Chuẩn bị

- [x] Khảo sát mã nguồn hiện có (filter, `ValidationPipe`, Gateway, login) — 2026-11-14.
- [x] Spec `Status: Approved` (2026-11-14).
- [x] Ghi nhận sửa đổi ở ID-001 (Lịch sử sửa đổi, v1.3) về ngoại lệ login của FR-007 (2026-11-14, chủ sở hữu xác nhận).
- [x] Chốt 6 câu hỏi mở trong spec (2026-11-14).
- [x] Đối chiếu `plan.md` với `dependency-rules.md`, ADR 0002, `identity-service.md`: khớp (libs được phép chứa "context-neutral output/error helpers").
- [ ] Đọc `.docs/guides/frontend-api.md` và `RbacGuard`/`TrustedPrincipalGuard` để lấy tên quyền cho lỗi 403.
- [ ] Xác nhận frontend đã phát hành bước 0 (nhận CSRF theo `code`, hiển thị `message`).

## Hạ tầng dùng chung (`libs/contracts`, `libs/common`)

- [x] `ApiErrorBody`, `ApiErrorDetail`, `CommonErrorCode` trong `libs/contracts`.
- [x] `buildApiError`, `AppHttpException` trong `libs/common`.
- [x] `AllExceptionsFilter` theo bảng quyết định ở plan; ánh xạ `QueryFailedError 23505`.
- [x] `createValidationPipe()` + bảng ánh xạ ràng buộc `class-validator` sang tiếng Việt.
- [x] Đăng ký pipe + filter toàn cục trong `configureHttpApp`.
- [ ] Helper test `expectApiError`.

## Gateway

- [x] Gán `code` + message tiếng Việt cho mọi lỗi tự sinh (token, CSRF, origin, path không an toàn, throttle, thiếu route, upstream).
- [x] Bọc body upstream không phải envelope thành `UPSTREAM_INVALID_RESPONSE`; giữ nguyên body hợp lệ.
- [x] Test AC-009 (service lỗi đi qua Gateway giữ nguyên `code`).

## Identity

- [x] Mở rộng `AuthFailure.code`; port `findForLogin`; adapter TypeORM.
- [x] Viết lại `LoginWithPassword` theo 4 bước của plan; test 6 nhánh (AC-002 đến AC-005).
- [x] `AuthFailureFilter`: ánh xạ 6 mã login chi tiết + mã chung cho refresh/Microsoft.
- [x] Chuyển `password-reset`, `account-import`, `profile`, `rbac`, `user-management` filter sang envelope và `code` riêng; giữ `issues` của import trong `details`.
- [x] Hồi quy AC-008: Microsoft, refresh, quên mật khẩu vẫn không tiết lộ.
- [x] Danh mục `AUTH_*`, `RBAC_*`, `USER_*`, `PROFILE_*` (một file hằng mỗi module) + test không trùng `code`.

## Learning

- [x] Chuyển `course`, `quiz`, `problem`, `progress`, `student-course-report` filter sang envelope và `code` riêng.
- [x] Danh mục `COURSE_*`, `PROBLEM_*`, `QUIZ_*`, `PROGRESS_*`; giữ `issues` của `CourseNotReadyError` trong `details`.
- [x] Domain vẫn không import `@nestjs/*`.

## Submission, Community

- [x] Submission: ánh xạ `ProblemNotSubmittableError`, `JudgePackageUnavailableError`, `RejectedJudgeResultError`, `InvalidSubmissionTransitionError`, 401 thiếu owner.
- [x] Community: thay `NotFoundException('Post not found')`... bằng lỗi có `code` (`POST_NOT_FOUND`, `COMMENT_PARENT_NOT_FOUND`, `COMMENT_REPLY_DEPTH_EXCEEDED`).
- [x] Danh mục `SUBMISSION_*`, `POST_*`, `COMMENT_*`.

## API / Tài liệu

- [x] `ApiErrorResponseDto` + gắn schema lỗi vào mọi thao tác của Swagger; `@ApiResponse` kèm danh sách `code` cho login (AC-012). Các route khác chỉ có schema chung, chưa liệt kê `code` riêng.
- [ ] Cập nhật `.docs/guides/frontend-api.md`: định dạng lỗi, bảng `code`, thay đổi `message` mảng sang chuỗi.

## Phân quyền

- [x] N/A — không đổi quy tắc phân quyền; chỉ bổ sung tên quyền vào message 403 khi guard đã biết.

## Cơ sở dữ liệu / Migration

- [x] N/A — không đổi schema, không có migration.

## Messaging / Realtime

- [x] N/A — ngoài phạm vi.

## Kiểm thử

- [x] Ánh xạ test tới AC-001 đến AC-012 theo bảng ở plan.
- [x] Test body lỗi 5xx không chứa `SELECT`, stack, host, đường dẫn.
- [x] Test `requestId` khớp `x-request-id`.
- [x] Chạy `pnpm lint`.
- [x] Chạy `pnpm typecheck`.
- [x] Chạy `pnpm test`.
- [x] Chạy `pnpm build`.

## Tài liệu

- [x] Worked entry cho từng service: `.docs/worked/<service>/YYYY-MM-DD-error-responses.md`.
- [x] Chạy `codegraph sync .` trong repo backend.

## Xác minh

- [ ] Đối chiếu từng `FR-*` và `ERR-001-AC-*`.
- [ ] Xác nhận không có hành vi Ngoài phạm vi (không đổi phân quyền, throttling, chính sách mật khẩu).
- [ ] Thử thủ công: đăng nhập tài khoản bị xóa mềm (mật khẩu đúng/sai) trên môi trường test.
- [ ] Cập nhật trạng thái spec sang `Implemented` qua quy trình review.

## Tuân thủ kiến trúc

- [ ] Chiều phụ thuộc theo kiến trúc từng service.
- [ ] Ranh giới service/DB; không import chéo.
- [ ] `libs/` chỉ chứa hạ tầng HTTP và hợp đồng kiểu.
- [ ] Khớp mục "Tuân thủ kiến trúc" của `plan.md`.
