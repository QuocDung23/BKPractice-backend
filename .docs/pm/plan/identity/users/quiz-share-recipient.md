# Tra cứu người nhận chia sẻ Quiz

`GET /internal/users/:id/roles` là endpoint nội bộ Identity cho Learning, không công khai qua Gateway
hoặc Swagger. Header `x-internal-service-secret` phải khớp `INTERNAL_SERVICE_SECRET`; so sánh bằng
`timingSafeEqual`. Thiếu cấu hình trả 503; sai credential 401; UUID sai 400; user không tồn tại,
đã xoá hoặc không ACTIVE trả 404.

Response chỉ gồm `{userId, roles}`. Không trả email, tên, mã sinh viên hoặc profile. UserManagementUseCases
đọc repository sở hữu bởi Identity. Learning xác minh đúng userId yêu cầu và role LECTURER trước cấp
quyền; lỗi network/timeout/response không đọc được không được biến thành cấp quyền thành công.

Identity thêm cấu hình `INTERNAL_SERVICE_SECRET` optional để tương thích triển khai cũ; phải đặt cùng
secret với Learning để dùng chia sẻ. Learning cần `IDENTITY_SERVICE_URL`. Không ghi giá trị secret vào
log hoặc tài liệu. Thu hồi grant không cần gọi Identity để vẫn thu hồi được người đã mất role.

HTTP tests dùng user repository giả kiểm credential, active/deleted và projection chính xác;
Learning có test HTTP adapter cho cùng hợp đồng `{userId, roles}`. Xem [Quiz](../../learning/quizzes/README.md).
