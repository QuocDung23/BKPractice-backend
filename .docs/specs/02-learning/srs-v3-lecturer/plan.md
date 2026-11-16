# LRN-009 — Kế hoạch

Spec: [spec.md](./spec.md) Approved theo SRS v3. Learning giữ DDD + Hexagonal; Submission giữ Clean + Event-Driven; Identity giữ Clean.

1. Đổi policy quản lý Problem/Test Case/Course thành LECTURER có quyền và sở hữu, ADMIN có quyền và quản lý mọi nội dung. Áp dụng ở từng use case trước khi đọc/ghi; danh sách lọc ở repository theo actor. Giữ `createdBy` và quy tắc trạng thái hiện có.
2. Cập nhật catalog/seed Identity cho quyền nội dung của LECTURER mà không gỡ quyền ADMIN. Kiểm chứng token mới nhận quyền đúng.
3. Thêm port đọc roster Student và số Submission trong Learning; adapter HTTP gọi API nội bộ Identity/Submission bằng secret đã cấu hình. Thêm endpoint tổng hợp Submission chỉ SELECT `SUBMIT` đã lưu, nhóm theo User/Problem.
4. Thêm use case báo cáo Course có phân trang, kiểm tra sở hữu, đọc cấu trúc hiện tại, roster, progress đã lưu và Submission counts; domain calculator tính Course/Chapter. Mở route Gateway và Swagger.
5. Test quyền/sở hữu, báo cáo 0 lượt và nộp lại, visibility, lỗi upstream; chạy quality gates và viết worked entry. Không chạy migration trên DB thật.
