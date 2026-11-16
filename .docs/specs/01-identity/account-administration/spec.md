# ID-009 — Quản trị tài khoản theo SRS v3 (UC07 / UC-QT01)

## Trạng thái và nguồn

Approved — chủ sở hữu yêu cầu căn chỉnh theo `Team7_Tai_lieu_dac_ta_da_cap_nhat_v3.docx` ngày 2026-11-08 và xác nhận Admin nhập mật khẩu khởi tạo. Bản này thay thế các quy định trái ngược của ID-003 và ID-006 về cấp/thu hồi ADMIN, xóa Admin, tìm kiếm và phạm vi quản trị. ID-004 import Excel vẫn có contract riêng. Quiz tạm giữ ngoài phạm vi theo yêu cầu chủ sở hữu.

## Mục tiêu và ranh giới

Identity sở hữu User, credential, role, phiên và nhật ký quản trị. Gateway xác thực/chuyển tiếp; Learning, Submission và Community không đọc DB Identity. UC-QT01 cho Admin tạo/cấp tài khoản, tìm kiếm/xem, khóa/mở khóa, xóa mềm và thay đổi role. Không tự đăng ký công khai. Xác nhận thao tác ở giao diện thuộc ứng dụng web; API chỉ được gọi sau xác nhận.

## Yêu cầu chức năng

- **ID-009-FR-001:** Chỉ `ADMIN` có quyền tương ứng được dùng API quản trị. `STUDENT`, `LECTURER` và khách không được xem hoặc thay đổi dữ liệu quản trị. Actor lấy từ access token và phiên đã kiểm chứng, không lấy từ body/header client.
- **ID-009-FR-002:** Admin có `user:create` tạo một User qua biểu mẫu với `studentId` (Sinh viên), `displayName`, `email`, `password`, `role` và `reason`. Password 8–128 ký tự, chỉ lưu Argon2 hash, không trả password/hash. Email chuẩn hóa; STUDENT dùng `@sv1.dut.udn.vn`, LECTURER và ADMIN dùng `@dut.udn.vn`. STUDENT cần MSSV duy nhất; hai role còn lại không có MSSV. User mới `ACTIVE`, có Profile ban đầu và role được gán nguyên tử. Admin khác được cấp tài khoản ADMIN; không cấp Admin qua import Excel.
- **ID-009-FR-003:** Admin có `user:read` xem trang User và chi tiết theo projection của ID-006. Danh sách nhận `q` (khớp không phân biệt hoa/thường với MSSV, email, tên), `role`, `status`, `includeDeleted`, `page`, `limit`; các bộ lọc được kết hợp AND. Trang mặc định 1/20, giới hạn 50, thứ tự `createdAt DESC, userId DESC`; không lộ credential hoặc định danh Microsoft nội bộ.
- **ID-009-FR-004:** Admin có `user:status` được khóa User `ACTIVE` thành `LOCKED` hoặc mở `LOCKED` thành `ACTIVE`, với `reason` bắt buộc. Không biến `PENDING` thành `ACTIVE` bằng API này. Khóa thu hồi mọi phiên trong cùng transaction; User bị khóa không nhận token mới. Thao tác lặp cùng trạng thái thành công nhưng không ghi một thay đổi giả.
- **ID-009-FR-005:** Admin có `user:delete` xóa mềm User với `reason` bắt buộc; giữ bản ghi, Profile, role và tham chiếu; thu hồi mọi phiên. Không khóa/xóa chính mình hoặc tài khoản hệ thống. Có thể khóa/xóa Admin khác nếu sau thay đổi vẫn còn ít nhất một Admin `ACTIVE`, chưa xóa. Thao tác lặp không thay đổi dấu xóa.
- **ID-009-FR-006:** Admin xem/gán/thu hồi role `STUDENT`, `LECTURER`, `ADMIN` cho User khác, với `reason` khi thay đổi. Chỉ Admin khác có thể cấp `ADMIN`; không tự cấp hay tự gỡ `ADMIN`. Không được thu hồi `ADMIN` cuối cùng đang hoạt động. Gán/thu hồi lặp là idempotent. Token cũ giữ ảnh chụp role/quyền tới khi hết hạn, trừ khi phiên bị khóa/xóa thu hồi.
- **ID-009-FR-007:** Mỗi thay đổi tạo tài khoản, trạng thái, xóa hoặc role phải ghi nhật ký bền vững trong cùng transaction: actor ID, target ID, hành động, thời điểm, lý do và state trước/sau đã lọc. Không ghi password, hash, token hoặc dữ liệu nhạy cảm. Lỗi DB rollback cả thay đổi và nhật ký, trả lỗi server an toàn để phân biệt với lỗi đầu vào.
- **ID-009-FR-008:** Import Excel ID-004 giữ route và validation đã duyệt. Mỗi User import được ghi nhật ký với actor đã xác minh và lý do kỹ thuật `Excel account import`; import vẫn nguyên tử toàn file.
- **ID-009-FR-009:** Identity cung cấp API nội bộ chỉ đọc danh sách mọi User `STUDENT` chưa xóa, kể cả chưa luyện tập, để Learning lập báo cáo SRS. API này dùng bí mật service nội bộ, phân trang ổn định và chỉ trả `userId`, `studentId`, `displayName`.

## Hợp đồng API

| Method   | Route                             | Đầu vào/đầu ra chính                                                                |
| -------- | --------------------------------- | ----------------------------------------------------------------------------------- |
| `POST`   | `/api/admin/users`                | JSON `{studentId?,displayName,email,password,role,reason}`; `201` projection        |
| `GET`    | `/api/admin/users`                | `q?,role?,status?,includeDeleted?,page?,limit?`; `200` `{items,page,limit,hasMore}` |
| `GET`    | `/api/admin/users/:userId`        | `200` projection                                                                    |
| `PATCH`  | `/api/admin/users/:userId/status` | JSON `{status:"ACTIVE"                                                              | "LOCKED",reason}`; `200` projection |
| `DELETE` | `/api/admin/users/:userId`        | JSON `{reason}`; `204`                                                              |
| `POST`   | `/api/roles/users/:userId`        | JSON `{role,reason}`; `200` `{userId,roles}`                                        |
| `DELETE` | `/api/roles/users/:userId/:role`  | JSON `{reason}`; `200` `{userId,roles}`                                             |
| `GET`    | `/internal/users/students`        | Bí mật service; `page,limit`; `200` `{items,page,limit,hasMore}`                    |

Cookie web dùng Origin và CSRF cho mutation; Bearer app dùng access token. `400` cho DTO/UUID sai, `401` thiếu hoặc sai phiên, `403` thiếu quyền/chính sách bảo vệ, `404` User không có, `409` trùng định danh hoặc vi phạm Admin cuối cùng, `5xx` cho lỗi hạ tầng. Query ngoài danh sách được từ chối.

## Tiêu chí nghiệm thu

- Admin tạo Student/Lecturer/Admin thành công với hash và Profile đúng; trùng email/MSSV rollback; Student/Lecturer/khách bị từ chối.
- Tìm kiếm và lọc đúng, có phân trang ổn định; dữ liệu xóa mặc định ẩn; projection không lộ bí mật.
- Khóa thu hồi phiên và chặn login/refresh; mở khóa cho phép login mới; `PENDING` không bị mở ngoài ý muốn.
- Xóa mềm giữ lịch sử và chặn phiên; tự khóa/xóa, system account, Admin cuối cùng bị bảo vệ.
- Admin khác có thể được cấp ADMIN; tự nâng quyền và thu hồi Admin cuối cùng bị chặn; quyền token mới phản ánh role hiện tại.
- Audit ghi nguyên tử đúng actor, target, thời điểm, lý do và state; rollback khi audit thất bại.
- Learning lấy được roster đầy đủ qua API nội bộ, không truy cập DB Identity.

## Ngoài phạm vi

Quiz, CRUD role/permission động, tự đăng ký, xóa cứng/khôi phục User, chỉnh sửa Profile tùy ý, frontend xác nhận thao tác, cấu hình sandbox và xử lý báo cáo vi phạm. Những nghiệp vụ đó không được đánh dấu đạt trong test report API UC-QT01.
