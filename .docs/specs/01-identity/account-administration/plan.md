# ID-009 — Kế hoạch triển khai UC-QT01

Spec: [spec.md](./spec.md) Approved theo SRS v3 và quyết định của chủ sở hữu 2026-11-08. Identity giữ Clean Architecture; Gateway giữ Layered Architecture.

1. Thêm chính sách domain/application cho tạo User, tìm kiếm, khóa/mở khóa, xóa mềm và bảo vệ Admin cuối cùng; tái dùng Auth password hasher, authenticator và session repository. Không đặt workflow trong controller.
2. Bổ sung migration Identity cho bảng audit; TypeORM adapter ghi User/Profile/role/audit trong transaction và khóa hàng/role cho thay đổi cạnh tranh. Cập nhật catalog/seed quyền `user:create`, `user:status`; giữ import ID-004 và thêm audit trong transaction import.
3. Mở rộng RBAC gán ADMIN bởi Admin khác, nhận lý do, audit trong transaction; chỉ đếm Admin ACTIVE/chưa xóa khi bảo vệ Admin cuối cùng. Không sửa ảnh chụp token đã phát hành.
4. Thêm DTO/Swagger và route REST đã chốt trong spec; API nội bộ roster dùng `INTERNAL_SERVICE_SECRET`. Gateway chuyển tiếp đúng route và CSRF; không cho client gọi `/internal`.
5. Test domain/HTTP/Gateway, PostgreSQL transaction/concurrency/migration và đường auth sau khóa/xóa. Chạy lint, typecheck, test, build; ghi worked entry trước khi cập nhật report Excel.

Không chạy migration/seed trên DB thật. Dùng PostgreSQL test cô lập; giữ thay đổi worktree không liên quan.
