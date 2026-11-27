# Triển khai bảng xếp hạng XP trong Learning

## Hiện trạng Problem XP

XP Problem được lưu ở `progress.awarded_xp`, gán cùng transaction xử lý lần `Accepted` đầu tiên.
Migration đã backfill bài đã giải theo độ khó hiện tại và giữ `solvedAt`. Leaderboard đọc cùng
database Learning và kiểm tra sinh viên hợp lệ qua Identity theo lô. Gateway chuyển principal đã
xác thực cho `GET /api/leaderboard`.

## Amendment 1.1 — Quiz XP (code đã triển khai, chờ kiểm chứng)

Nguồn: [spec leaderboard](./spec.md) và [LRN-009 Quiz 1.7](../quizzes/spec.md).

- Code Quiz award nằm trên attempt đầu tiên đạt 90% cho một user + Quiz; amount là 10/20/30 theo độ
  khó Quiz revision đã pass, timestamp là `finished_at`. Không cấp lại qua retry/revision/Course.
- `quiz_attempts.awarded_xp` chỉ được điền ở finish sau rollout. Migration gán EASY cho revision cũ
  thiếu difficulty nhưng không backfill XP; người đã pass trước rollout không nhận XP khi làm lại.
- Dùng transaction finish hiện có, advisory transaction lock và partial unique index cho `(user_id, quiz_id)` khi có award.
  Không tạo service XP, event hoặc outbox riêng.
- Reader kết hợp `progress.awarded_xp` và `quiz_attempts.awarded_xp` trong cùng kỳ xếp hạng, lọc
  Quiz đang PUBLISHED/chưa xóa, giữ `solved` là số Problem và thêm `quizzesPassed`.
- Tie-break dùng timestamp award gần nhất trong kỳ tăng dần, rồi ID tăng dần. `GET /api/leaderboard`
  giữ pagination, Top 3, viewer card và profile lookup Identity hiện có.
- Tests cần bao phủ no-backfill, pre-launch pass, in-progress attempt sau rollout, one-time award,
  concurrent finish, replay, period boundary, count semantics và tie-break.

Kế hoạch này không đổi định dạng XP Problem, điều kiện Identity, Profile API hoặc contract
Submission. Dùng Learning/Quiz transaction hiện có và cập nhật Swagger/Gateway allowlist chỉ khi
response API thay đổi.

Implementation code và kết quả `pnpm typecheck` được ghi trong
[worked entry](../../../worked/learning/quizzes/2026-11-27-quiz-xp-implementation.md). Chưa xác minh
migration hoặc hành vi tích hợp trên PostgreSQL.
