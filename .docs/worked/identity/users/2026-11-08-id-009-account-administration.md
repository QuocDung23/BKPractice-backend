# 2026-11-08 — ID-009 quản trị tài khoản theo SRS v3 (UC07 / UC-QT01)

- Author: Codex triển khai; Claude Code tiếp tục phiên (rà soát, quality gates, tài liệu).
- Scope: Identity (users, rbac, auth import), Gateway route, migration audit, test PostgreSQL. Quiz ngoài phạm vi.

## Spec and plan

- Spec: [`.docs/specs/01-identity/account-administration/spec.md`](../../../specs/01-identity/account-administration/spec.md) (ID-009).
- Plan: [`plan.md`](../../../specs/01-identity/account-administration/plan.md).
- Tasks: [`tasks.md`](../../../specs/01-identity/account-administration/tasks.md).
- Spec status at start: ID-009 được tạo và đặt Approved trong phiên này theo yêu cầu chủ repo; nó thay thế các quy định trái SRS của ID-003/ID-004/ID-006 (cấp ADMIN, xóa Admin, tìm kiếm).

## Questions clarified

| Question                    | Conclusion                                                               | Source                |
| --------------------------- | ------------------------------------------------------------------------ | --------------------- |
| Làm toàn bộ SRS v3 hay chỉ? | Quiz tạm giữ; làm quản trị tài khoản, quyền Giảng viên, báo cáo tiến độ. | Chủ repo, 2026-11-08. |
| Mật khẩu tài khoản thủ công | Admin nhập mật khẩu khởi tạo (8–128 ký tự, chỉ lưu Argon2).              | Chủ repo, 2026-11-08. |
| Admin khác được cấp không?  | Có, qua tạo thủ công/RBAC; không cấp Admin qua import Excel.             | SRS v3 + chủ repo.    |

## What was done

- `POST /api/admin/users` tạo User + Profile + role nguyên tử; `GET /api/admin/users` thêm `q` (MSSV/email/tên, không phân biệt hoa thường), `role`, `status`, `includeDeleted`; `PATCH /api/admin/users/:userId/status` khóa/mở khóa và thu hồi phiên; `DELETE` xóa mềm có lý do, bảo vệ Admin cuối cùng.
- Mọi thao tác quản trị (kể cả import Excel) ghi `admin_audit_events` cùng transaction (migration `1700000000010-SrsV3Administration.ts`).
- RBAC: quyền `user:create`, `user:status`; LECTURER nhận quyền nội dung Learning; cấp/thu hồi ADMIN có lý do và audit.
- `GET /internal/users/students`: roster Student nội bộ cho Learning.
- Gateway mở route `GET /api/progress/courses/:courseId/students`.

## Why these choices

- Giữ Identity ở Clean Architecture, tái dùng `ACTIVE/LOCKED/PENDING` và cơ chế thu hồi phiên có sẵn thay vì thêm trạng thái mới.
- Audit cùng transaction để không có thay đổi nào mà thiếu dấu vết.
- Roster đi qua API nội bộ có `INTERNAL_SERVICE_SECRET` vì Learning không được đọc DB Identity (ADR boundary).

## How the feature works

1. Admin gọi API qua Gateway (cookie + CSRF); Gateway dựng lại header danh tính từ token.
2. Controller kiểm quyền, use case kiểm quy tắc (email theo role, MSSV duy nhất, Admin cuối cùng).
3. Repository ghi User/Profile/role/audit trong một transaction; khóa/xóa thu hồi phiên.
4. Lỗi nghiệp vụ trả qua `user-management-failure.filter`.

## Configuration

Không thêm biến môi trường. Có migration mới; chưa chạy trên DB thật.

## Verification

- `pnpm typecheck`, `pnpm lint`, `pnpm build` (6 app) đều sạch; `pnpm test`: 139 suite pass, 1072 test pass, 18 suite integration skip (không có `TEST_DATABASE_URL` trong lần chạy của Claude Code).
- Codex đã chạy các integration PostgreSQL (tạo/khóa/xóa tài khoản, phân quyền Admin, import + audit) và pass trên DB test cục bộ; Claude Code chưa chạy lại các suite này.
- `pnpm format:check` vẫn fail ở các file đã không đạt từ HEAD (nợ có sẵn); file mới/đã sạch trước đó đã được format.
- Claude Code thêm `test/account-administration.integration.spec.ts` (17 ca API qua Gateway + Identity + PostgreSQL tạm, đặt `ACCOUNT_ADMIN_TEST_DATABASE_URL`), pass 17/17; chạy lại 7 suite integration khác cũng pass.
- Test Report Excel: Codex đã cập nhật `Test Report - UC10 main.xlsx` (Round 2); case chưa có bằng chứng giữ `Pending`.

## Remaining

- Chủ repo chạy migration + seed trên môi trường thật; token cũ giữ snapshot quyền.
- Chạy lại các suite integration trước khi merge.
