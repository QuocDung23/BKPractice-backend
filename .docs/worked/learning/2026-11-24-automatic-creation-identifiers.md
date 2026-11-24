# 2026-11-24 — Tự sinh định danh học phần và bài tập

Codex triển khai yêu cầu mới cho luồng tạo nháp. Kế hoạch và checklist nằm cùng thư mục với đặc tả. [LRN-003](../../specs/02-learning/courses/spec.md) · [LRN-001](../../specs/02-learning/problems/spec.md)

## Luồng tạo

- Khi form gửi tiêu đề, use case tạo slug chữ thường không dấu từ tên học phần hoặc bài tập. Slug dành riêng `managed` và chuỗi có dạng UUID được xử lý trước khi lưu.
- Nếu slug trùng, use case thử các hậu tố số rồi dùng hậu tố ngẫu nhiên khi các hậu tố số phổ biến đã được dùng. Mỗi lần thử lưu mở một giao dịch riêng để phục hồi sau vi phạm UNIQUE.
- Khi UUID mới của bài tập trùng khóa chính, use case sinh UUID khác và thử lại. API cũ vẫn chấp nhận slug truyền tường minh và giữ quy tắc kiểm tra giá trị đó.
- `GET /api/tags` trả danh mục tên và ID của thẻ qua Gateway cho người dùng đã xác thực. Form dùng danh mục này cùng với `GET /api/topics` để gửi mã liên kết tương ứng.

## Xác minh

Typecheck, build các service liên quan và các kiểm thử đơn vị liên quan đã chạy. Test API cần mở cổng loopback và bị môi trường thực thi từ chối. Thay đổi không yêu cầu migration.
