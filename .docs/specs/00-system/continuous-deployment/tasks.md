# [OPS-001] Công việc triển khai

Đặc tả: [`./spec.md`](./spec.md)

Kế hoạch: [`./plan.md`](./plan.md)

## Chuẩn bị

- [x] Xác nhận spec `Approved`, kiến trúc hệ thống và workflow publish hiện có.
- [x] Xác nhận SHA image và Compose production đã được deploy thử thủ công.
- [x] Chốt user/key SSH riêng, server script root-owned và GitHub Environment secrets.

## Triển khai

- [x] Thêm job deploy sau matrix publish, truyền đúng `${{ github.sha }}`.
- [x] Thiết lập concurrency, strict host-key checking và fail-fast khi secret thiếu.
- [x] Provision VPS: tạo `bkdeploy`, deploy script, sudo rule và authorized key.
- [x] Tạo GitHub Environment `production` cùng năm secrets cần thiết.

## Kiểm thử

- [ ] Validate workflow trên GitHub Actions bằng một merge `main` sau provisioning.
- [ ] Xác nhận SSH deploy, Compose health và Gateway health thành công.
- [ ] Xác nhận một deployment lỗi fail rõ ràng, không lộ secret.
- [ ] N/A — `pnpm` quality commands không liên quan thay đổi YAML/docs; chúng đã pass trên commit image đang deploy.

## Tài liệu và xác minh

- [x] Ghi yêu cầu vận hành, giới hạn migration và quy tắc bảo mật.
- [ ] Viết worked entry sau khi GitHub deployment đầu tiên được xác minh.
