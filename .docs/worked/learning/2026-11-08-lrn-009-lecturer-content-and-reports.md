# 2026-11-08 — LRN-009 Giảng viên quản lý nội dung và báo cáo tiến độ Course

- Author: Codex triển khai; Claude Code tiếp tục phiên (rà soát, quality gates, tài liệu).
- Scope: Learning (problems, courses, progress), Submission (API đếm nội bộ), Identity (roster, xem ID-009).

## Spec and plan

- Spec: [`.docs/specs/02-learning/srs-v3-lecturer/spec.md`](../../specs/02-learning/srs-v3-lecturer/spec.md) (LRN-009).
- Plan: [`plan.md`](../../specs/02-learning/srs-v3-lecturer/plan.md).
- Tasks: [`tasks.md`](../../specs/02-learning/srs-v3-lecturer/tasks.md).
- Spec status at start: LRN-009 Approved theo SRS v3; thay chính sách ADMIN-only của LRN-008 và phần tiến độ chỉ-cá-nhân.

## Questions clarified

| Question                            | Conclusion                                                                      | Source                |
| ----------------------------------- | ------------------------------------------------------------------------------- | --------------------- |
| Giảng viên quản lý nội dung của ai? | Nội dung mình tạo; Admin quản lý tất cả.                                        | Chủ repo, 2026-11-08. |
| Báo cáo gồm Student nào?            | Mọi Student, kể cả 0 lượt nộp.                                                  | Chủ repo, 2026-11-08. |
| Lượt nộp sau khi ẩn/gỡ Problem      | Submission `SUBMIT` đã tạo vẫn tính; tỷ lệ tiến độ tính theo bài đang hiển thị. | SRS v3.               |

## What was done

- Policy sở hữu trong `ProblemAuthorizationService` / `CourseAuthorizationService`; mọi use case quản lý (Problem, Test Case, Harness, Course, Chapter) nhận actor và kiểm quyền trước khi đọc/ghi. Danh sách quản lý của Giảng viên lọc theo `createdBy` ở repository.
- Gắn Problem vào Course chỉ được với Problem thuộc quyền quản lý của cùng actor (Problem người khác trả 400, không lộ sự tồn tại). Migration `1700000011000-Lrn009CourseProblemHistory.ts` giữ lịch sử Problem của Course.
- Submission: `POST /internal/submissions/counts` đếm Submission `SUBMIT` theo `userId`/`problemId`.
- Learning: `GET /api/progress/courses/:courseId/students` (phân trang) kết hợp roster Identity + số lượt Submission + tiến độ đã lưu, tính theo Course và từng Chapter; Course không có Problem trả 0/0 `Chưa có bài tập`.

## Why these choices

- Learning giữ DDD + Hexagonal: adapter HTTP tới Identity/Submission là outbound port, use case báo cáo chỉ ghép projection, không đọc DB service khác.
- Lỗi upstream trả lỗi server an toàn, không coi thiếu dữ liệu là 0.
- Sửa `applyManagedFilters` từ `where` sang `andWhere` để điều kiện `createdBy` không bị ghi đè bởi `deletedAt IS NULL`; lỗi này chỉ lộ trên PostgreSQL thật.

## How the feature works

1. Giảng viên/Admin gọi API qua Gateway; header danh tính do Gateway dựng từ token.
2. Use case kiểm sở hữu Course, đọc cấu trúc hiện tại, lấy roster Student và số Submission qua port.
3. Calculator domain tính tiến độ Course/Chapter; controller map sang response.
4. Giảng viên khác nhận lỗi không lộ tồn tại; Identity/Submission lỗi thì trả lỗi server.

## Configuration

Dùng `INTERNAL_SERVICE_SECRET` sẵn có; không thêm biến mới. Có migration mới; chưa chạy trên DB thật.

## Verification

- `pnpm typecheck`, `pnpm lint`, `pnpm build` (6 app) sạch; `pnpm test`: 139 suite pass, 1072 test pass, 18 suite integration skip trong lần chạy của Claude Code.
- Codex đã chạy integration PostgreSQL cho repository Problem/Course, đếm Submission và lịch sử Course; pass trên DB test cục bộ. Claude Code chưa chạy lại.
- Chưa kiểm: luồng thật giữa ba service qua Gateway, hiệu năng báo cáo với roster lớn.

## Remaining

- Chạy migration/seed trên môi trường thật; chạy lại integration suite trước merge.
- Quiz đang hold, chưa có module/API.
