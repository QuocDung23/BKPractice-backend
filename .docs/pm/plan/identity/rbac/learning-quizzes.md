# Quyền Learning cho Quiz MVP

[LRN-009 1.3](../../../../specs/02-learning/quizzes/spec.md) thay chính sách ADMIN-only: LECTURER
quản lý nội dung mình tạo; ADMIN quản lý mọi nội dung với permission tương ứng. Learning tự kiểm owner;
claim role không đủ để vượt scope.

Catalog thêm `question:{create,read-managed,update,share,clone,delete,restore}` và
`quiz:{create,read-managed,update,publish,hold,republish,share,clone,delete,restore}` cho LECTURER/ADMIN.
Các quyền Problem/Course hiện có cũng cấp lại cho hai role. STUDENT không nhận quyền quản lý.
Catalog có 37 code duy nhất, 70 cặp role/code; seeder hiện có nhóm theo code nên không cần seeder mới.

Migration `1700000000010-LearningQuizPermissions` chạy sau SelfStudyPermissions. Bảng
`lrn009_added_role_permissions` lưu chính xác assignments vừa thêm. Down chỉ xoá assignments được
migration ghi nhận, giữ catalog và mapping có trước. Không sửa migration lịch sử hoặc phục hồi Class.

Deployment được cấp quyền dùng `pnpm migration:run:identity`, trước rollout Learning/Gateway;
refresh/đăng nhập lại sau migration để nhận claim mới. Token cũ không tự có quyền mới. Không chạy
seed catalog mới sau rollback code cũ vì seed có thể cấp lại permissions của phiên bản mới.
Migration up/down đã được kiểm tra trong schema PostgreSQL test tách biệt. Chưa smoke test token
trên môi trường triển khai thật; không có migration production trong lần triển khai code này.
