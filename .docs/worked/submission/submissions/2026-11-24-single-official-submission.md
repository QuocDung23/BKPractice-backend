# 2026-11-24 — Giới hạn nộp bài chính thức

Codex triển khai quy tắc mỗi tài khoản có một lần nộp chính thức cho mỗi bài tập theo yêu cầu mới. Luồng gửi Judge và contract nền dựa trên [SUB-002](../../../specs/03-submission/submit-code/spec.md).

## Luồng nộp

1. Gateway chuyển chủ sở hữu lấy từ phiên đã xác thực. `GET /api/submissions/problems/:problemId/status` chỉ trả về trạng thái của chủ sở hữu đó.
2. Use case kiểm tra lần nộp trước, lấy gói chấm từ Learning và lưu bản ghi chính thức. Chỉ mục duy nhất trên cặp tài khoản và bài tập xử lý cả trường hợp nhiều yêu cầu vượt qua bước kiểm tra ban đầu.
3. Yêu cầu trùng trả `409 SUBMISSION_ALREADY_SUBMITTED`. Chỉ bản ghi lưu thành công mới được gửi sang Judge.
4. Nếu phát công việc chấm thất bại trong khi bản ghi còn chờ, repository đánh dấu lỗi và giải phóng lượt nộp trong cùng câu lệnh cập nhật. Bản ghi lỗi vẫn nằm trong lịch sử.

## Dữ liệu và xác minh

Migration `1792515606000` đánh dấu một bản ghi nộp chính thức có sẵn cho mỗi cặp và giữ toàn bộ lịch sử. Không có khóa cấu hình mới. Kiểm thử đơn vị kiểm tra xung đột, báo trạng thái theo chủ sở hữu và giải phóng lượt nộp. Kiểm thử PostgreSQL cho migration và hai yêu cầu đồng thời cần PostgreSQL kiểm thử cùng quyền mở kết nối cục bộ.
