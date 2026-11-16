# ID-006 Xem và xoá mềm User cho Admin

> **SRS v3 (2026-11-08):** [ID-009](../account-administration/spec.md) thay thế các quy định trái ngược về tìm kiếm, tạo tài khoản, khóa/mở khóa, audit và bảo vệ Admin khi xóa. Các quy tắc đọc và xóa mềm không trái ID-009 vẫn áp dụng.

## Trạng thái

Approved — phiên bản 1.0, được chủ sở hữu phê duyệt ngày 2026-10-28. ID-004 giữ nguyên phần import đã Approved; ID-006 chốt phần đọc/xoá mềm User từng được ghi ở phần CRUD Proposed của ID-004. Tạo/cập nhật User thủ công vẫn thuộc đợt khác.

## Mục tiêu

Cho phép Admin xem danh sách/chi tiết User và xoá mềm một User qua FE, giữ dữ liệu tham chiếu và ngăn User đã xoá tiếp tục xác thực. Route mới dùng tên tài nguyên `users` thay `accounts`.

## Tác nhân và bối cảnh

- ADMIN quản trị User bằng API được bảo vệ; STUDENT, LECTURER và khách không xem danh sách/chi tiết quản trị hoặc xoá User.
- Identity sở hữu User, credential, vai trò, Profile và phiên; service khác chỉ giữ `userId` như tham chiếu.
- ID-004 đã Approved riêng cho `POST /api/auth/accounts/import`; ID-006 không đổi route hoặc contract import. Bản sao `student-provisioning/spec.md` của ID-004 hiện thiếu trong worktree sau lần discard và cần được khôi phục trước khi triển khai.
- ID-002 sở hữu hồ sơ công khai; `GET /api/users/:userId/profile` phục vụ xem người khác, không phải chi tiết tài khoản quản trị.

## Yêu cầu chức năng

- **ID-006-FR-001 — Danh sách User:** ADMIN có quyền `user:read` MUST xem được danh sách User có phân trang `page`/`limit`; mặc định ẩn User đã xoá, chỉ đưa vào khi `includeDeleted=true`. Sắp xếp theo `createdAt` giảm dần rồi `userId` giảm dần; không trả toàn bảng trong một response.
- **ID-006-FR-002 — Chi tiết User:** ADMIN có quyền `user:read` MUST xem một User theo `userId`, kể cả User đã xoá. Projection cho phép gồm `userId`, `studentId`, `email`, `displayName`, `status`, `roles`, `createdAt`, `deletedAt`.
- **ID-006-FR-003 — Giới hạn dữ liệu:** Danh sách/chi tiết MUST NOT trả password/hash, refresh token, secret, định danh Microsoft nội bộ hoặc dữ liệu Profile/học tập không cần thiết.
- **ID-006-FR-004 — Xoá mềm:** ADMIN có quyền `user:delete` MUST yêu cầu xoá mềm User bằng `userId`; giữ bản ghi và tham chiếu, lưu `deletedAt` tách khỏi enum `ACTIVE`/`LOCKED`/`PENDING`.
- **ID-006-FR-005 — Hiệu lực xác thực:** User đã xoá mềm MUST không nhận token mới từ login cục bộ, Microsoft exchange hoặc refresh. Xoá mềm MUST thu hồi mọi phiên BKPractice của User để access token cũ bị Gateway từ chối ngay theo kiểm tra phiên hiện có.
- **ID-006-FR-006 — Hồ sơ công khai:** User đã xoá mềm MUST không xuất hiện trong tìm kiếm ID-005 hoặc hồ sơ công khai ID-002; phản hồi công khai không tiết lộ lý do xoá.
- **ID-006-FR-007 — Bảo toàn dữ liệu:** Xoá mềm MUST không cascade sang Learning/Submission/Community hoặc xoá hồ sơ, vai trò, bài nộp và dữ liệu lịch sử.
- **ID-006-FR-008 — Bảo vệ Admin:** API xoá mềm MUST từ chối User có role `ADMIN` (kể cả chính actor) và tài khoản hệ thống. Điều này bảo toàn Admin cuối cùng; không nhận role đích do client tự khai.
- **ID-006-FR-009 — Tính lặp:** Xoá lặp cùng User MUST không tạo trạng thái xoá thứ hai hoặc khôi phục User.
- **ID-006-FR-010 — Quyền quản trị:** Danh sách/chi tiết MUST yêu cầu cả role `ADMIN` và `user:read`; xoá mềm MUST yêu cầu cả role `ADMIN` và `user:delete`. Hai quyền mới chỉ được seed cho `ADMIN` qua RBAC; `user:import` không tự cấp quyền đọc/xoá. Token cũ chỉ nhận quyền mới sau đăng nhập hoặc refresh.

## Quy tắc nghiệp vụ và phân quyền

- ADMIN + `user:read` để đọc, ADMIN + `user:delete` để xoá. Hai mã được chủ sở hữu phê duyệt cho feature này, cần được bổ sung vào RBAC catalog/seed khi triển khai.
- Người dùng thường xem hồ sơ qua ID-002/ID-005, không dùng projection quản trị.
- Không dùng `LOCKED` làm dấu xoá. User đã xoá giữ email/MSSV và các ràng buộc duy nhất; import lại cùng định danh tiếp tục báo trùng, không tạo User thay thế.
- Giữ bất biến Admin cuối cùng của ID-003. Không tin role/quyền/actor từ body hoặc header client.

## Đầu vào và đầu ra

- Route: `GET /api/admin/users`, `GET /api/admin/users/:userId`, `DELETE /api/admin/users/:userId`. Route import ID-004 hiện có không đổi.
- `userId` là UUID Identity. Danh sách nhận `page` nguyên từ 1, mặc định 1; `limit` nguyên từ 1 tới 50, mặc định 20; `includeDeleted` boolean, mặc định false. Không có bộ lọc khác trong v1.
- Danh sách trả `200` với `{ items: UserAdminProjection[], page, limit, hasMore }`; chi tiết trả `200` với một `UserAdminProjection`. Projection gồm đúng các trường FR-002. `DELETE` thành công hoặc lặp cho User đã xoá trả `204` không body.

## Tình huống lỗi và biên

- Thiếu/sai token: `401`; thiếu role/quyền: `403`; UUID hoặc query sai: `400`; User không có: `404`.
- Xoá bất kỳ Admin hoặc tài khoản hệ thống trả `403`, dữ liệu giữ nguyên.
- Xoá đồng thời với login/refresh, import và hai lần xoá phải không phát token mới cho User đã xoá hoặc mất dữ liệu.
- ID tham chiếu cũ trong service khác tiếp tục ổn định.
- Các service khác không bị sửa trong v1; khi client cần tên cho User đã xoá, hồ sơ công khai trả không khả dụng và client xử lý placeholder của nó. ID-006 không định nghĩa projection lịch sử xuyên service.

## Tiêu chí nghiệm thu

- **ID-006-AC-001:** ADMIN có quyền xem trang User và chi tiết; chỉ nhận projection cho phép.
- **ID-006-AC-002:** STUDENT, LECTURER/khách không xem dữ liệu quản trị hoặc xoá User.
- **ID-006-AC-003:** Xoá thành công giữ bản ghi/tham chiếu, đánh dấu một lần; lặp không khôi phục.
- **ID-006-AC-004:** User đã xoá không login/refresh để lấy token mới và không xuất hiện trong profile công khai/search.
- **ID-006-AC-005:** Xoá bất kỳ Admin hoặc tài khoản hệ thống bị chặn; Admin cuối cùng được bảo toàn.
- **ID-006-AC-006:** Danh sách/chi tiết không lộ hash, token, secret hay định danh Microsoft nội bộ.
- **ID-006-AC-007:** Learning/Submission/Community không bị cascade/sửa bởi thao tác xoá mềm Identity.

## Ngoài phạm vi

Tạo/cập nhật User thủ công, khôi phục, xoá cứng, đổi/quên mật khẩu, sửa Profile, thay vai trò, import Excel hoặc đổi route import ID-004. Không cấp Admin hay thay catalog ngoài mã quyền được phê duyệt riêng.

## Phụ thuộc

- ID-004 import (`student-provisioning/spec.md` hiện thiếu trong worktree), [ID-003 RBAC](../rbac/spec.md), [ID-001 Auth](../authentication/spec.md), [ID-002 Profile](../profile/spec.md), [ID-005 tìm kiếm](../profile-discovery/spec.md).
- [Kiến trúc Identity](../../../architecture/identity-service.md), [ADR 0002](../../../adr/0002-revised-service-internal-architectures.md), [ranh giới service](../../00-system/service-boundaries.md).

## Câu hỏi mở

Không còn câu hỏi hành vi. Bản sao ID-004 `student-provisioning` đang thiếu trong worktree phải được khôi phục trước khi triển khai để đối chiếu import đã Approved; việc thiếu file không thay đổi contract ID-006 vừa được duyệt. ID-006 thay phần đọc/xoá mềm của bản nháp CRUD ID-004; phần tạo/cập nhật thủ công vẫn chờ một quyết định riêng.

## Lịch sử sửa đổi

| Ngày       | Phiên bản | Tác giả/Người review | Tóm tắt                                                                                 |
| ---------- | --------- | -------------------- | --------------------------------------------------------------------------------------- |
| 2026-10-28 | 0.1       | Codex / chờ review   | Tách quản trị User khỏi tìm kiếm Profile, dùng route `users`.                           |
| 2026-10-28 | 1.0       | Chủ sở hữu sản phẩm  | Chốt quyền, projection/phân trang, `deletedAt`, phiên và bảo vệ Admin/system; Approved. |
