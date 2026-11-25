# 2026-11-25 — Đồng bộ kiểm thử tạo học phần

Kiểm thử E2E cũ kỳ vọng yêu cầu chỉ có `title` trả `400`. API tạo học phần đã hỗ trợ tự sinh slug theo yêu cầu được xác nhận trước đó. Ca kiểm thử thành công hiện có xác minh hai yêu cầu cùng tiêu đề nhận hai slug riêng.

Nhóm kiểm thử validation kiểm tra thiếu tiêu đề, tiêu đề sai kiểu hoặc trắng và slug được truyền với giá trị sai kiểu, rỗng hoặc null. Mỗi yêu cầu lỗi phải trả `400` và không ghi dữ liệu.

Typecheck, lint và 25 kiểm thử vòng đời học phần đạt. Thử trực tiếp ValidationPipe, mapper và use case xác nhận sáu payload lỗi bị từ chối, tiêu đề hợp lệ sinh slug và slug hợp lệ truyền tường minh được chấp nhận. Suite E2E bị môi trường chặn mở cổng loopback với lỗi `EPERM`.
