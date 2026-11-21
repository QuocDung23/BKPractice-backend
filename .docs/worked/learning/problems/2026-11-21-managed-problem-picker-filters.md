# 2026-11-21 — Bộ lọc bài quản lý cho bộ chọn học phần

## Đặc tả và kế hoạch

Luồng dùng phạm vi quản lý đã Approved trong [LRN-001](../../../specs/02-learning/problems/spec.md).
Quyền sở hữu của giảng viên và quyền quản lý của quản trị viên tuân theo bản sửa đổi LRN-009.
Tham số tùy chọn được ghi trong [plan](../../../specs/02-learning/problems/plan.md) và
[tasks](../../../specs/02-learning/problems/tasks.md).

## Luồng truy vấn

1. Bộ chọn gửi `GET /api/problems/managed` với `publishStatus=PUBLISHED`, từ khóa, số trang và
   kích thước trang. Gateway chuyển tiếp query đến Learning qua route đang có.
2. `ManagedProblemQueryDto` kiểm tra giá trị enum và giới hạn từ khóa 200 ký tự.
   `ListManagedProblemsUseCase` dùng principal đã xác thực để suy ra phạm vi chủ sở hữu và chuẩn
   hóa phân trang.
3. `ProblemTypeOrmRepository` dùng cùng một tập điều kiện khi đếm và lấy trang. Tìm kiếm theo tiêu
   đề hoặc slug dùng `ILIKE` và escape các ký tự wildcard, cùng cách với danh mục công khai. API
   trả về trang bài quản lý cùng tổng số đã lọc và thông tin sẵn sàng xuất bản.
4. Yêu cầu gắn bài tiếp tục được kiểm tra tại `AttachProblemUseCase` khi thực hiện ghi. Màn quản
   lý bài cũ có thể tiếp tục gọi endpoint với tham số phân trang như trước.

## Kiểm tra

Unit test kiểm tra quyền sở hữu, từ khóa và trạng thái được truyền xuống repository. Test HTTP
bao phủ hai giảng viên, admin, bài nháp và hai trang kết quả. Test tích hợp PostgreSQL bao phủ
thêm bài đã xóa mềm và tìm dấu gạch dưới theo nghĩa đen.

`pnpm test --runTestsByPath` cho bốn suite liên quan qua 70 test với HTTP gọi trong bộ nhớ do môi
trường chặn mở cổng loopback. Phiên kiểm tra này dùng `class-validator` 0.14.2 và Zod 4.3.6 từ
cache. Suite PostgreSQL cần `TEST_DATABASE_URL` riêng nên chưa chạy. Typecheck và lint toàn repo
vẫn bị chặn bởi dependency thiếu. `git diff --check` qua.
