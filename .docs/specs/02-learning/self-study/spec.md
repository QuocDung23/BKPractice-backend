> **Bản sửa đổi LRN-009 1.3, Approved 2026-11-11:** LECTURER có quyền quản lý nội dung Learning mình tạo; ADMIN có quyền tương ứng quản lý mọi nội dung. Quy tắc này thay các câu ADMIN-only hoặc bỏ kiểm created_by trước đó. Course hỗ trợ liên kết nhiều Quiz/Chapter theo LRN-009; tiến độ Problem hiện có không đổi. Không khôi phục Class/Enrollment/Assignment.

# LRN-008 — Learning tự học, không có vai trò giảng viên

> **SRS v3 (2026-11-08):** [LRN-009](../srs-v3-lecturer/spec.md) thay thế chính sách chỉ ADMIN quản lý nội dung và chỉ có tiến độ cá nhân; Giảng viên quản lý nội dung mình tạo và xem báo cáo mọi Sinh viên theo Course. Quy tắc tự học không Class/Enrollment/Assignment vẫn áp dụng. Quiz tạm giữ.

## Trạng thái

Approved — quyết định của chủ sở hữu sản phẩm ngày 2026-11-07.

## Mục tiêu và phạm vi

Learning phục vụ người học tự học. `ADMIN` tạo, xuất bản và quản lý Problem, Test Case và Course. Mọi `ADMIN` có quyền tương ứng được quản lý nội dung do bất kỳ `ADMIN` nào tạo. `created_by` vẫn được lưu để truy vết, không dùng làm điều kiện phân quyền.

Learning không còn Class, Enrollment, Assignment, mã tham gia, thành viên lớp, bài tập theo lớp, điểm bài tập hoặc báo cáo tiến độ theo lớp. Tiến độ cá nhân theo Problem/Course và gợi ý Problem vẫn thuộc Learning.

Quyết định này thay thế mọi yêu cầu trái ngược về `LECTURER`, quyền sở hữu riêng của người tạo, Class, Enrollment và Assignment trong LRN-001 đến LRN-007. Những quy tắc còn lại của LRN-001, LRN-002, LRN-003, LRN-006 và LRN-007 vẫn áp dụng.

## Yêu cầu

- **LRN-008-FR-001:** Chỉ `ADMIN` có quyền `problem:*` tương ứng mới được quản lý Problem và Test Case. Không kiểm tra `created_by` khi đọc, sửa, xuất bản, tạm giữ, xoá hoặc khôi phục.
- **LRN-008-FR-002:** Chỉ `ADMIN` có quyền `course:*` tương ứng mới được quản lý Course. Danh sách và chi tiết quản lý gồm Course của mọi người tạo. Một `ADMIN` có thể gắn Problem nháp hoặc tạm giữ do `ADMIN` khác tạo, theo các quy tắc trạng thái hiện hành.
- **LRN-008-FR-003:** Các quyền `problem:*` và `course:*` được seed cho `ADMIN`, không cấp cho `LECTURER`. Các quyền `class:*` và `assignment:*` không còn được cấp. Vai trò nền tảng `LECTURER` của Identity không bị xoá bởi thay đổi Learning này.
- **LRN-008-FR-004:** Learning không đăng ký entity, route hay workflow Class, Enrollment và Assignment. Migration mới gỡ các bảng cũ sau khi đã xử lý phụ thuộc; migration lịch sử không bị sửa.
- **LRN-008-FR-005:** Tiến độ chỉ có API đọc của chính người gọi theo Problem và Course. Không có API điểm Assignment hoặc xem tiến độ sinh viên theo Class. Consumer accepted-submission tiếp tục cập nhật tiến độ cá nhân.
- **LRN-008-FR-006:** Gợi ý Problem xét mọi Course `PUBLISHED` chưa xoá mềm cho luật bài kế tiếp. Sắp Course theo `created_at` giảm dần rồi `id` tăng dần để kết quả xác định; mỗi Course đóng góp Problem chưa giải đầu tiên theo thứ tự Chapter/Problem. Luật Topic/Tag còn lại giữ nguyên; không dùng Enrollment hay danh sách Course theo dõi.
- **LRN-008-FR-007:** Gateway không chuyển tiếp route Class và Assignment hoặc route tiến độ theo lớp. Gateway vẫn chuyển tiếp route Problem, Course, tiến độ cá nhân và gợi ý.

## Tiêu chí nghiệm thu

- `ADMIN` A có thể sửa Problem/Course do `ADMIN` B tạo khi có quyền tương ứng; `STUDENT` và `LECTURER` không thể quản lý nội dung Learning.
- Danh sách quản lý của `ADMIN` A hiển thị nội dung do cả A và B tạo; thao tác xoá/khôi phục cũng không phụ thuộc `created_by`.
- Không còn endpoint Class, Enrollment, Assignment hoặc tiến độ theo lớp ở Gateway và Learning.
- Tiến độ cá nhân theo Problem/Course và gợi ý từ mọi Course công khai vẫn có hợp đồng rõ ràng; gợi ý không đọc bảng Enrollment.
- Migration mới có thể áp dụng trên schema Learning hiện tại; không chạy migration trên dữ liệu thật trong đợt sửa code nếu chưa có lịch triển khai.

## Ngoài phạm vi

- Xoá vai trò `LECTURER` khỏi toàn bộ Identity hoặc thay đổi import tài khoản của Identity.
- Xây mới toàn bộ LRN-006 Progress và LRN-007 Recommendation; chỉ điều chỉnh hợp đồng của hai tính năng để không còn phụ thuộc lớp học.
