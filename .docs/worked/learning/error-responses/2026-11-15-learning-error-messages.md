# 2026-11-15 — Message lỗi chính xác cho learning-service

- Author: Claude (fork thực hiện lát cắt learning-service của ERR-001)
- Scope: `apps/learning-service` (courses, problems, quizzes, progress và báo cáo khóa học). Không đụng `libs/`, app khác hay `.docs/specs`.

## Spec and plan

- Spec: `.docs/specs/00-system/error-responses/spec.md` (ERR-001), FR-001, FR-002, FR-003, FR-009, FR-012
- Plan: `.docs/specs/00-system/error-responses/plan.md`, bước 4 (Learning)
- Tasks: `.docs/specs/00-system/error-responses/tasks.md`, mục Learning
- Spec status at start: Approved (2026-11-14)

## Questions clarified

| Question                                                               | Conclusion                                                                                     | Source                                |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------- |
| Domain không được sửa, mà message domain bằng tiếng Anh. Dịch thế nào? | Bộ lọc nhận diện mẫu câu đã biết và dựng lại tiếng Việt; câu lạ rơi về câu chung có tên trường | Chỉ dẫn của lát cắt: không đổi domain |
| `issues` của khóa học/bài tập đi đâu?                                  | Chuyển sang `details` `{field?, code, message}` tiếng Việt                                     | ERR-001 FR-001                        |
| Lỗi 5xx/không nhận diện?                                               | Vẫn do bộ lọc toàn cục xử lý (500 `INTERNAL_ERROR`)                                            | ERR-001 FR-005                        |

## What was done

- `src/presentation/http/learning-error.ts` (mới): `ErrorDescriptor`, `respondWithError` (ghi body chuẩn + log an toàn), `respondWithGlobalFilter`, `respondWithSanitizedFallback`, `describePrincipalError`, `describeFrameworkError` (dịch lỗi `ParseUUIDPipe`/`ParseIntPipe`), `translateDomainMessage` (bảng mẫu câu domain tiếng Anh sang tiếng Việt), `labelPublishStatus`, `labelAction`.
- Mỗi module có một file danh mục mã lỗi và message: `problem-errors.ts`, `course-errors.ts`, `quiz-errors.ts`, `progress-errors.ts`. Bộ lọc chỉ còn gọi `describeXxxError(...)` rồi `respondWithError(...)`.
- Viết lại 5 bộ lọc: `ProblemExceptionFilter`, `CourseExceptionFilter`, `QuizExceptionFilter`, `ProgressExceptionFilter`, `CourseReportExceptionFilter`.
- `InternalServiceGuard`: ném `AppHttpException` 401 `AUTH_INTERNAL_CREDENTIAL_INVALID` thay cho `UnauthorizedException`.
- `ProblemAuthorizationService`: chỉ đổi chuỗi message truyền vào `ForbiddenError` (3 lý do từ chối: thiếu vai trò, thiếu quyền kèm tên quyền, không phải người tạo) để bộ lọc nêu đúng lý do. Không đổi điều kiện kiểm tra.
- Cập nhật test cũ theo body mới và thêm test mới (xem Verification).

### Mã lỗi theo module (status giữ nguyên như trước)

- **AUTH (dùng chung):** `AUTH_PRINCIPAL_INVALID` 401, `AUTH_INTERNAL_CREDENTIAL_INVALID` 401, `AUTH_ROLE_REQUIRED` 403, `AUTH_PERMISSION_MISSING` 403 (nêu tên quyền), `INVALID_PATH_PARAMETER` 400.
- **PROBLEM\_*:** `PROBLEM_FIELD_INVALID` 400, `PROBLEM_REFERENCE_UNKNOWN` 400, `PROBLEM_NOT_READY_TO_PUBLISH` 400 (details theo từng mã vấn đề), `PROBLEM_NOT_FOUND`/`TEST_CASE_NOT_FOUND`/`HARNESS_NOT_FOUND` 404, `PROBLEM_FORBIDDEN`/`PROBLEM_NOT_OWNER` 403, `PROBLEM_SLUG_ALREADY_EXISTS`/`PROBLEM_CONCURRENT_MODIFICATION`/`PROBLEM_DELETED_CANNOT_MODIFY`/`PROBLEM_ON_HOLD_CANNOT_MODIFY`/`PROBLEM_TYPE_LOCKED`/`PROBLEM_ALREADY_DELETED`/`PROBLEM_NOT_DELETED`/`PROBLEM_DELETE_STATE_INVALID`/`PROBLEM_STATUS_TRANSITION_INVALID`/`PROBLEM_HARNESS_REQUIRED`/`PROBLEM_STATE_INVALID` 409.
- _\*COURSE_* / CHAPTER__:** `COURSE_FIELD_INVALID`/`COURSE_ORDER_INVALID`/`COURSE_SLUG_RESERVED`/`COURSE_NOT_READY`/`COURSE_PROBLEM_NOT_ATTACHABLE`/`COURSE_PROBLEM_NOT_IN_CHAPTER` 400, `COURSE_NOT_FOUND`/`COURSE_QUIZ_NOT_AVAILABLE`/`CHAPTER_NOT_FOUND` 404, `COURSE_FORBIDDEN`/`COURSE_NOT_OWNER` 403, `COURSE_SLUG_ALREADY_EXISTS`/`COURSE_PROBLEM_ALREADY_ATTACHED`/`COURSE_CONCURRENT_MODIFICATION`/`COURSE_DELETED_CANNOT_MODIFY`/`COURSE_ON_HOLD_CANNOT_MODIFY`/`COURSE_NOT_EDITABLE`/`COURSE_STATUS_TRANSITION_INVALID`/`COURSE_ALREADY_DELETED`/`COURSE_NOT_DELETED`/`COURSE_DELETE_STATE_INVALID`/`COURSE_STATE_INVALID` 409.
- **QUIZ\_*:** khoảng 40 mã (xem `QUIZ_ERROR_CODES` trong `quiz-errors.ts`), status lấy theo loại `QuizError` (400/403/404/409/503); thông báo lạ rơi về câu chung theo loại (`QUIZ_INVALID_REQUEST`, `QUIZ_FORBIDDEN`, `QUIZ_RESOURCE_NOT_FOUND`, `QUIZ_CONFLICT`, `QUIZ_DEPENDENCY_UNAVAILABLE`).
- **PROGRESS\_*:** `PROGRESS_COURSE_NOT_FOUND` 404, `PROGRESS_REPORT_FORBIDDEN` 403, `PROGRESS_REPORT_COURSE_NOT_FOUND` 404, `PROGRESS_REPORT_DEPENDENCY_UNAVAILABLE` 503.

## Why these choices

- Danh mục mã và message nằm ở tầng presentation của từng module (không đặt trong `libs/`), domain không import `@nestjs/*`, đúng `dependency-rules.md`.
- Dịch theo nội dung message vì domain/application chưa mang mã lỗi riêng và lát cắt này không được sửa domain. Đánh đổi: nếu ai đổi câu tiếng Anh trong domain, ánh xạ sẽ rơi về câu chung. Test "knows every literal message" quét mã nguồn để bắt trường hợp đó.
- Bộ lọc `@Catch()` cấp module (courses, quizzes, progress, báo cáo) trước đây nuốt mọi lỗi, kể cả lỗi của `ValidationPipe` toàn cục. Giờ chúng chỉ xử lý lỗi của module và chuyển phần còn lại cho `AllExceptionsFilter` để giữ `code`/`details` của `VALIDATION_FAILED`.
- Progress, báo cáo và quiz giữ cách log an toàn cũ (chỉ ghi một câu cố định khi gặp lỗi lạ) qua `respondWithSanitizedFallback`, vì test hiện có yêu cầu nguyên nhân (chuỗi kết nối) không lọt vào log; bộ lọc toàn cục ghi cả stack của lỗi gốc.

## How the feature works

1. Một controller của learning ném lỗi (domain, application hoặc hạ tầng).
2. Bộ lọc `@UseFilters` của controller bắt lỗi.
3. Bộ lọc gọi `describeXxxError`; lỗi của module trả về `ErrorDescriptor` (status, `code`, `message`, `details`).
4. `respondWithError` ghi body `{statusCode, code, message, details?, requestId}`, đặt header `x-request-id` và ghi một dòng log `{requestId, status, code, method}`.
5. Lỗi không nhận diện đi qua `AllExceptionsFilter`: `AppHttpException` từ pipe giữ nguyên; lỗi lạ thành 500 `INTERNAL_ERROR` kèm mã tham chiếu.

## Configuration

No configuration change.

## Verification

- Commands run and their results:
  - `pnpm typecheck`: passed.
  - `pnpm exec eslint` trên 28 file đã đụng tới: passed. `pnpm exec prettier --check` trên cùng danh sách: passed.
  - `pnpm exec jest apps/learning-service --runInBand`: 76 suite passed, 10 skipped (cần `TEST_DATABASE_URL`); 675 test passed, 106 skipped.
  - `codegraph sync .`: done.
- Test mới: danh mục từng module (mã duy nhất, từng lỗi ánh xạ đúng status/mã/tiếng Việt, quét mọi message literal hiện có), `translateDomainMessage`, `describeFrameworkError`, `respondWithSanitizedFallback`, từng bộ lọc (body, `requestId`, không lộ nội bộ), `InternalServiceGuard`.
- Test cũ đã cập nhật (không xóa): `problem-exception.filter.spec.ts`, `internal-service.guard.spec.ts`, `problems.api.e2e.spec.ts`, `problems.security.e2e.spec.ts`, `managed-test-cases.controller.e2e.spec.ts`, `managed-courses.api.e2e.spec.ts`, `my-progress.api.integration.spec.ts`.
- Not verified:
  - Chưa chạy end-to-end qua Gateway và chưa chạy `my-progress.api.integration.spec.ts` (cần DB test); kỳ vọng của nó mới chỉ được sửa theo body mới.
  - Chưa chạy `pnpm test` toàn repo và `pnpm build`.
  - Message tiếng Việt do mô hình soạn, chưa được chủ sản phẩm duyệt từng câu.

## Remaining

- Not done:
  - Domain/application vẫn ném message tiếng Anh; về lâu dài nên mang mã lỗi riêng để khỏi dịch theo nội dung câu.
  - 403 của báo cáo khóa học gộp ba lý do (thiếu vai trò, thiếu quyền, không phải người tạo) vì `CourseReportForbiddenError` không mang lý do.
  - Các tham số `ParseUUIDPipe` mới được dịch ở learning; dịch ở `libs/common` sẽ phủ mọi service (xem Risks).
- Risks:
  - Ánh xạ theo nội dung câu tiếng Anh dễ vỡ khi domain đổi câu (đã có test quét để phát hiện).
  - Các e2e harness tự dựng app không có `createValidationPipe`, nên lỗi `ValidationPipe` mặc định trong test hiển thị `details` bằng câu tiếng Anh của class-validator; ở production, pipe toàn cục của `configureHttpApp` đã dịch sang tiếng Việt.
  - `ProblemAuthorizationService` đổi chuỗi message của `ForbiddenError`; client nào đang so khớp câu cũ (`You do not have permission...`) sẽ không còn khớp, nên cần dùng `code`.
