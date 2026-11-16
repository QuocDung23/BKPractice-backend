# 2026-11-12 — Course Learning Item và Quiz Progress

- Author: Codex
- Scope: Course readiness cho Problem/Quiz, Progress Learning Item, Quiz completion reader, API tương
  thích và regression tests.

## Spec and plan

- Spec: [Course 1.1](../../../specs/02-learning/courses/spec.md),
  [Progress 1.1](../../../specs/02-learning/progress/spec.md),
  [Quiz 1.6](../../../specs/02-learning/quizzes/spec.md).
- Plan/tasks: Course, Progress và Quiz được amend ngày 2026-11-12 theo phê duyệt của chủ dự án.
- Spec status at start/end: Approved; không tự nâng sang Verified.

## Questions clarified

| Question                         | Conclusion                                                                                                       |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Course cần gì để publish?        | Có Chapter và ít nhất một Problem hoặc Quiz `PUBLISHED`, chưa xoá. Mã lỗi chung là `PUBLISHED_CONTENT_REQUIRED`. |
| Quiz hoàn thành khi nào?         | User có ít nhất một attempt `FINISHED` với `passed=true` theo ngưỡng Quiz hiện có. Fail sau không thu hồi.       |
| Completion gắn revision nào?     | Gắn user + Quiz root, nên publish revision mới không làm mất completion.                                         |
| Hold/delete/detach xử lý ra sao? | Item biến mất khỏi tử số/mẫu số nhưng completion gốc giữ nguyên; khi item hiển thị lại thì được tính lại ngay.   |
| Có thêm DB không?                | Không. Dùng `chapter_quizzes`, `quizzes`, `quiz_attempts` và Progress Problem hiện có; không migration.          |

## What was done

Course domain có projection `LearningItemState` cho Problem/Quiz. Application readiness đọc đồng thời
`CourseProblemCatalog` và `CourseQuizCatalog`, rồi dùng chung cho publish, republish và các mutation
phải giữ Course đã publish luôn có nội dung. Detach Quiz cuối cùng bị từ chối và không lưu aggregate.
Managed/Swagger dùng mã readiness mới.

Progress đổi cấu trúc Course sang danh sách Learning Item có type. `CourseStructureReader` union
Problem và Quiz đang hiển thị. `QuizCompletionReader` đọc thời điểm pass đầu tiên từ attempt hiện có.
Use case hợp nhất Problem solved và Quiz passed bằng key có type; domain calculator cho mỗi item trọng
số một và trả `completed/completedItems`.

HTTP giữ alias deprecated `solved`, Chapter `solved` và `solvedProblems` để client cũ không vỡ trong
giai đoạn chuyển đổi. Client mới dùng contract Learning Item. Không có write API, event mới, bảng mới
hoặc thay đổi schema.

## Why these choices

Projection và read-port hẹp giữ domain/application không phụ thuộc TypeORM hay write repository của
module khác. Completion được suy ra từ nguồn sự thật hiện có nên tránh đồng bộ thêm bảng và tránh lỗi
eventual consistency. Key gồm type tránh đụng UUID giữa Problem và Quiz. Giữ compatibility alias giảm
rủi ro rollout cho dự án lớn mà vẫn cung cấp contract tên đúng cho client mới.

## How the feature works

1. Course readiness lấy ID Problem/Quiz đang link, đọc trạng thái root hiện tại và hợp nhất thành
   Learning Item. Chỉ cần một item published chưa xoá để publish/republish hoặc giữ mutation hợp lệ.
2. Khi đọc Course Progress, reader chỉ trả Course published, Chapter và item published chưa xoá.
3. Repository Progress trả Problem đã giải; Quiz reader trả `MIN(finished_at)` của các attempt pass.
4. Use case ghép hai map theo `TYPE:id`; calculator đếm completion theo cấu trúc đang hiển thị.
5. Hold/delete/detach chỉ làm item vắng khỏi projection. Republish/restore/attach làm completion cũ
   xuất hiện lại. Revision Quiz mới không đổi root ID nên completion vẫn còn.

## Configuration and storage

- Không thêm biến môi trường, route Gateway, entity, table, index hoặc migration.
- Không có `.codegraph/` trong repository nên bỏ qua CodeGraph theo AGENTS.md.
- PostgreSQL integration dùng `TEST_DATABASE_URL` cách ly nếu được cung cấp.

## Verification

- 6 suite unit/application/mapper: **55/55 test qua**.
- Course HTTP e2e in-memory: **39/39 test qua**; lần đầu sandbox chặn listen localhost, chạy lại ngoài
  sandbox đã qua.
- Hai suite PostgreSQL được load nhưng **35 test skip** vì phiên này không có `TEST_DATABASE_URL`.
  Fixture đã bao phủ Problem-only, Quiz-only, mixed, fail sau pass, hold, delete, detach, republish và
  đổi revision.
- ESLint toàn bộ file source/test thay đổi: qua.
- `pnpm build:learning`: qua.
- `pnpm typecheck`: code thay đổi sạch; còn 5 lỗi baseline trong
  `test/account-import.integration.spec.ts` do `officialName` không còn trong type hiện hành.
- `git diff --check`: qua.

## Remaining

- Chạy lại hai suite PostgreSQL với database test cách ly trước khi nâng spec sang Verified.
- Client nên migrate từ alias deprecated `solved/solvedProblems` sang
  `completed/completedItems`; chưa đặt thời điểm xoá alias trong thay đổi này.
