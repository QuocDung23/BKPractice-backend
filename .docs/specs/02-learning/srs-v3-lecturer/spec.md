# LRN-009 — Giảng viên quản lý nội dung và xem tiến độ theo SRS v3

## Trạng thái và nguồn

Approved — SRS v3, mục Giảng viên/UC04/UC06, theo yêu cầu chủ sở hữu 2026-11-08. Chủ sở hữu xác nhận Giảng viên quản lý nội dung mình tạo, Admin quản lý tất cả; báo cáo gồm mọi Sinh viên kể cả chưa nộp. Bản này thay thế chính sách ADMIN-only của LRN-008 và phần tiến độ chỉ-cá-nhân. Tự học không Enrollment/Class và các quy tắc hiển thị Course/Problem hiện tại vẫn giữ. Quiz tạm giữ.

## Yêu cầu

- **LRN-009-FR-001:** `LECTURER` có quyền `problem:*`/`course:*` tương ứng được tạo và quản lý Problem, Test Case, Course do chính mình tạo (`createdBy` từ principal tin cậy). `ADMIN` có quyền tương ứng quản lý mọi nội dung. `STUDENT` không quản lý nội dung. Một Giảng viên không đọc/sửa/xuất bản/xóa bản nháp của Giảng viên khác.
- **LRN-009-FR-002:** Danh sách quản lý của Giảng viên chỉ gồm nội dung mình tạo; Admin xem tất cả. Gắn Problem vào Course phải thuộc quyền quản lý của cùng actor, bên cạnh các điều kiện trạng thái cũ. Course đã công bố vẫn cho mọi Sinh viên có tài khoản xem/luyện tập, không cần Enrollment hoặc thứ tự bắt buộc.
- **LRN-009-FR-003:** Giảng viên được xem báo cáo theo Course mình tạo; Admin xem mọi Course. Báo cáo phân trang mọi User STUDENT ACTIVE/LOCKED/PENDING chưa xóa từ Identity, kể cả không có Submission. Không đọc DB Identity hoặc Submission trực tiếp.
- **LRN-009-FR-004:** Với mỗi Student, báo cáo trả số Submission `SUBMIT` đã được tạo cho các Problem thuộc Course, gồm lần nộp lại, kết quả không đạt và lượt cũ của Problem sau khi bị ẩn/gỡ; không tính Run hoặc request bị từ chối trước khi lưu. Tiến độ là số Problem hiển thị đã từng ACCEPTED trên tổng Problem hiển thị, cho Course và từng Chapter. Dữ liệu hoàn thành đã lưu vẫn tồn tại khi Problem bị ẩn/gỡ, và được tính lại khi hiển thị trở lại. Course không có Problem trả 0/0 và trạng thái `Chưa có bài tập`.
- **LRN-009-FR-005:** Identity cung cấp roster Student qua API nội bộ; Submission cung cấp số lượt SUBMIT theo danh sách `userId` và `problemId` qua API nội bộ. Learning chỉ kết hợp các projection trong use case, không truy cập DB service khác. Lỗi upstream trả lỗi server an toàn, không coi thiếu dữ liệu là 0.
- **LRN-009-FR-006:** Quyền `problem:*`/`course:*` được seed cho LECTURER và ADMIN. Quyền được tính vào token mới; token cũ giữ snapshot. Không cấp quyền quản trị User cho LECTURER.

## API và lỗi

`GET /api/progress/courses/:courseId/students?page=1&limit=20` trả `{items,page,limit,hasMore,courseId}`. Mỗi item chứa `userId`, `studentId`, `displayName`, `submissionCount`, `completed`, `total`, `chapters:[{chapterId,completed,total}]`. Thứ tự Student ổn định theo `studentId`, rồi `userId`. `401` thiếu xác thực, `403` thiếu role/quyền/sở hữu, `404` Course không có, `400` query sai, `503` phụ thuộc nội bộ không sẵn sàng. Không trả email, password, token hoặc dữ liệu học tập ngoài Course yêu cầu. API cá nhân hiện có giữ nguyên.

## Tiêu chí nghiệm thu

- Giảng viên A quản lý được Problem/Course của A và bị từ chối khi dùng nội dung riêng của B; Admin có quyền quản lý cả A/B; Student bị từ chối.
- Seed cấp đúng quyền nội dung cho Giảng viên, không cấp `user:*`.
- Báo cáo gồm cả Student 0 lượt, giữ lượt nộp cũ khi bài bị ẩn/gỡ, còn tiến độ tính theo Course/Chapter hiện đang hiển thị; Run không tăng lượt.
- Course ẩn không cho Student truy cập nhưng giữ tiến độ; Problem ẩn/gỡ không được tính vào tử/mẫu và xuất hiện lại dùng kết quả cũ.
- Service gọi nhau qua API nội bộ có xác thực, không đọc DB xuyên service.

## Ngoài phạm vi

Quiz, Class, Enrollment, Assignment, bảng xếp hạng, chỉnh sửa tiến độ thủ công và cấu hình sandbox.
