# Dọn bài tập có nhãn demo và các dòng liên kết trong Learning

Yêu cầu bảo trì một lần sau migration `RemoveDemoProblems1700000013000`. [LRN-001](../../../../specs/02-learning/problems/spec.md) quy định vòng đời bài tập trong API. [LRN-003](../../../../specs/02-learning/courses/spec.md) quy định điều kiện xuất bản khóa học.

- Đặt timestamp `1700000012500` sau migration schema cuối cùng và trước `1700000013000`. Nếu cả hai đang chờ, lượt dọn rộng chạy trước để lượt dọn cũ gặp tập rỗng. TypeORM nhận diện migration đã áp dụng theo tên, nên DB đã chạy lượt cũ vẫn nhận migration bổ sung.
- Chọn bài có từ `demo` hoặc nhãn dạng `demo123` trong tiêu đề hoặc slug, bỏ qua hoa thường. Dấu ngoặc, khoảng trắng, gạch ngang và các ký tự phân tách có thể xuất hiện trước hoặc sau nhãn.
- Tạm ẩn khóa đang xuất bản nếu việc xóa làm mất mục học khả dụng cuối cùng. Giữ bản ghi khóa và chương.
- Gỡ dòng tham chiếu trong `chapter_problems` và `course_problem_history`. Các khóa ngoại `ON DELETE CASCADE` tự dọn các dòng phụ thuộc khi xóa bài. Lược đồ khóa ngoại và dữ liệu lịch sử ở service khác tiếp tục áp dụng theo hợp đồng hiện tại.
- Kiểm tra ca có nhãn ở giữa tiêu đề, nhãn trong slug, bài thường, khóa mất mục học cuối cùng, thứ tự xóa và chạy lặp.
