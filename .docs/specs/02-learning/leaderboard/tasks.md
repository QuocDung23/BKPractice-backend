# Công việc bảng xếp hạng XP

- [x] Ghi XP trong tiến độ và tạo migration chuyển đổi.
- [x] Thêm Identity lookup nội bộ cho sinh viên đủ điều kiện và hồ sơ hiển thị.
- [x] Tính kỳ, điểm và thứ hạng trong Learning. Mở API qua Gateway.
- [x] Thêm ca kiểm thử và ghi kết quả đã chạy.
- [ ] Xác nhận migration và luồng Accepted đến bảng hạng trên PostgreSQL test.

## Amendment 1.1 — Quiz XP (verification pending)

Code reader/API đã được cập nhật và `pnpm typecheck` pass. Các mục giữ mở cho đến khi kiểm acceptance
và migration trên PostgreSQL; xem [worked entry](../../../worked/learning/quizzes/2026-11-27-quiz-xp-implementation.md).

- [ ] Gộp Quiz awards vào XP period reader; giữ `solved` là số Problem, thêm `quizzesPassed`.
- [ ] Đổi tie-break sang thời điểm award XP gần nhất trong kỳ; lọc Quiz PUBLISHED/chưa xóa.
- [ ] Cập nhật DTO/Swagger và Gateway response contract, giữ nguyên Top 3, pagination và viewer card.
- [ ] Kiểm kỳ tuần/tháng, XP Quiz trong kỳ, no-backfill, student eligibility, count và tie-break.
- [ ] Xác minh integration trên PostgreSQL test; không đánh dấu hoàn tất khi DB test chưa chạy.
