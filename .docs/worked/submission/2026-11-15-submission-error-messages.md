# 2026-11-15 — Thông báo lỗi rõ ràng cho Submission

- Author: Claude (theo yêu cầu của chủ repo)
- Scope: `apps/submission-service` (presentation). Không đổi domain, application, status HTTP hay logic nghiệp vụ.

## Spec and plan

- Spec: `.docs/specs/00-system/error-responses/spec.md` (ERR-001), FR-001, FR-003, FR-009
- Plan: `.docs/specs/00-system/error-responses/plan.md`, bước 5 (phần Submission)
- Tasks: `.docs/specs/00-system/error-responses/tasks.md`
- Spec status at start: Approved (2026-11-14)

## Questions clarified

| Question                                             | Conclusion                                                                                                                                                 | Source                                          |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Có đổi status HTTP của lỗi cũ không?                 | Không, giữ nguyên                                                                                                                                          | ERR-001 Quy tắc nghiệp vụ; yêu cầu của chủ repo |
| Lỗi nào thuộc HTTP, lỗi nào thuộc consumer RabbitMQ? | Chỉ lỗi HTTP được sửa; `RejectedJudgeResultError`, `InvalidSubmissionTransitionError`, `Malformed judge result` nằm ở đường consumer, không trả cho client | Khảo sát mã nguồn                               |

## What was done

- Thêm `presentation/submission-errors.ts`: bảng `SUBMISSION_ERRORS` (status, `code`, message tiếng Việt) và hàm `createSubmissionError`, `createSubmissionIdInvalidError`, đều trả `AppHttpException` từ `@app/common`.
- Thay các điểm ném lỗi Nest mặc định:
  - `trusted-owner.decorator.ts`: thiếu hoặc sai `x-auth-user-id` thành `401 AUTH_USER_CONTEXT_MISSING`.
  - `internal-submission-counts.controller.ts`: thiếu hoặc sai khóa nội bộ thành `401 AUTH_INTERNAL_SECRET_INVALID`.
  - `submissions.controller.ts`: `ProblemNotSubmittableError` thành `404 SUBMISSION_PROBLEM_NOT_SUBMITTABLE`; `JudgePackageUnavailableError` thành `503 SUBMISSION_JUDGE_PACKAGE_UNAVAILABLE`; không thấy bài nộp thành `404 SUBMISSION_NOT_FOUND`; `publicId` sai UUID thành `400 VALIDATION_FAILED` kèm `details`.
- Cập nhật test cũ (`submissions.controller.spec.ts`, `trusted-owner.decorator.spec.ts`) kiểm tra status và `code` thay cho `instanceof NotFoundException`; thêm `submission-errors.spec.ts`.

## Why these choices

- Ánh xạ lỗi đặt ở presentation để domain và application không import `@nestjs/*` (Clean Architecture, `dependency-rules.md`).
- Một file hằng cho cả module để message không rải rác trong controller; test kiểm tra mã không trùng.
- `SUBMISSION_PROBLEM_NOT_SUBMITTABLE` nêu cả ba nguyên nhân có thể vì Learning không cho biết nguyên nhân cụ thể (ghi chú ở `ProblemNotSubmittableError`).
- Message "không thấy bài nộp" không phân biệt bài của người khác với bài không tồn tại, để không lộ dữ liệu (giữ hành vi 404 chung đã có).

## How the feature works

1. Gateway chuyển request tới Submission. Controller gọi use case.
2. Use case ném lỗi domain hoặc trả `null`.
3. Controller bắt lỗi và ném `AppHttpException` có `code` và message tiếng Việt.
4. `AllExceptionsFilter` toàn cục (đã có từ commit trước) ghi `requestId` và trả `{ statusCode, code, message, details?, requestId }`.

## Configuration

No configuration change.

## Verification

- Commands run and their results:
  - `pnpm typecheck`: passed.
  - `pnpm exec eslint` trên các file đã sửa: passed.
  - `pnpm exec jest apps/submission-service apps/community-service --runInBand`: 31 suites passed, 1 skipped; 162 tests passed, 1 skipped.
  - `codegraph sync .`: done.
- Not verified:
  - Chưa chạy end-to-end qua Gateway với service thật; chưa kiểm tra body thực tế của lỗi 404/503 ngoài test đơn vị.

## Remaining

- Not done:
  - `RunCodeUseCase` ném `Error('Run was no longer pending after judge dispatch')` và lỗi publish RabbitMQ vẫn thành `500 INTERNAL_ERROR` chung. Đặt mã riêng (ví dụ `RUNCODE_DISPATCH_FAILED`) sẽ đổi status 500 thành 503, nên chưa làm; cần chủ repo quyết định.
  - Lỗi consumer (`RejectedJudgeResultError`...) không phải phản hồi HTTP nên không thuộc phạm vi.
- Risks:
  - Frontend nào đang đọc `message` tiếng Anh cũ ("Submission not found", "Missing authenticated user context") sẽ thấy câu mới; nên rẽ nhánh theo `code`.
