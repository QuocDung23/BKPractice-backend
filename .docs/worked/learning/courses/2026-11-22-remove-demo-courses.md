# 2026-11-22 — Dọn khóa học có nhãn demo

Claude Code thêm migration dữ liệu Learning theo yêu cầu của chủ sở hữu, sau khi kiểm tra DB cho thấy bài tập demo đã sạch nhưng khóa học demo vẫn còn. Tiếp nối [dọn bài tập demo](../problems/2026-11-22-remove-demo-problems.md).

## Hiện trạng trước khi dọn

DB Learning còn 13 khóa có `demo` trong tiêu đề hoặc slug (11 `PUBLISHED`, 2 `ON_HOLD`), 25 chương và 12 quiz chỉ gắn vào các khóa này. Không có quiz nào dùng chung với khóa thường. Bảng `progress` trống.

## Triển khai

`1700000014000-RemoveDemoCourses.ts` chọn khóa theo cùng mẫu nhãn `demo[0-9]*` trên `title` hoặc `slug`, bỏ qua hoa thường. Migration xóa khóa và dựa vào `ON DELETE CASCADE` để dọn `chapters`, `chapter_problems`, `chapter_quizzes` và `course_problem_history`.

Quiz chỉ gắn vào khóa demo bị xóa cùng chuỗi phụ thuộc không có cascade: gỡ `published_revision_id`, rồi xóa câu trả lời, lượt làm, câu hỏi theo revision, quyền truy cập, revision và quiz. Ngân hàng câu hỏi được giữ vì có thể dùng chung. Migration chạy lặp an toàn nhờ thoát sớm khi không còn khóa demo.

## Xác minh

- ESLint và Prettier trên file migration đều qua.
- Chưa chạy migration. Chủ sở hữu chạy `pnpm migration:run:learning` sau khi sao lưu DB, vì `down()` không khôi phục được.
