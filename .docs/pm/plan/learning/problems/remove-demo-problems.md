# Dọn bài tập có nhãn DEMO trong Learning

Yêu cầu bảo trì một lần của chủ sở hữu ngày 2026-11-22. [LRN-001](../../../../specs/02-learning/problems/spec.md) tiếp tục quy định vòng đời xoá mềm và khôi phục của API. [LRN-003](../../../../specs/02-learning/courses/spec.md) quy định điều kiện giữ khóa ở trạng thái xuất bản.

- [x] Thêm migration Learning xóa vật lý các bài có tiêu đề bắt đầu bằng `[DEMO]`, bỏ qua hoa thường và khoảng trắng đầu. Gỡ liên kết bài trong chương và lịch sử gắn bài theo khóa. Dùng cascade cho test case, starter code và các bảng phụ thuộc có khóa ngoại `ON DELETE CASCADE`.
- [x] Tạm ẩn đúng khóa `demo-course-1794753018834` nếu việc dọn khiến khóa mất mục khả dụng cuối cùng. Với khóa khác rơi vào điều kiện này, báo slug và rollback. Giữ dữ liệu tiến độ, biên nhận và lượt nộp theo ID lịch sử.
- [x] Thêm ca tích hợp cho tiền tố, nhãn ở giữa tiêu đề, liên kết và cascade, chạy lại, khóa demo được tạm ẩn và khóa khác mất mục khả dụng cuối cùng.
- [ ] Chạy ca tích hợp trên PostgreSQL cách ly. Môi trường hiện thiếu `class-validator` và quyền truy cập Docker.
