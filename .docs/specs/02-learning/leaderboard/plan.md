# Triển khai bảng xếp hạng XP trong Learning

Thêm cột XP cố định vào bản ghi tiến độ vốn duy nhất theo cặp người dùng–bài. Migration dựng lại XP từ `SOLVED` và độ khó có tại lúc chuyển đổi. Adapter lưu tiến độ gán XP ngay trong transaction xử lý sự kiện hiện có. Luồng đọc tổng hợp từ cùng cơ sở dữ liệu Learning và xếp trên tập sinh viên hợp lệ do Identity trả qua HTTP nội bộ theo lô. Gateway chuyển principal đã xác thực cho `GET /api/leaderboard` cùng `INTERNAL_SERVICE_SECRET` của các dịch vụ.

Giữ các API học tập và hợp đồng sự kiện hiện có. Kiểm thử điểm, kỳ xếp hạng, điều kiện tài khoản, phân trang, quyền đọc và luồng ghi tiến độ. [Đặc tả](spec.md)
