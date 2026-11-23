# 2026-11-23 — Community trong chế độ dev

| Mục     | Chi tiết                                             |
| ------- | ---------------------------------------------------- |
| Tác giả | Codex                                                |
| Phạm vi | Lệnh khởi động backend khi phát triển trên máy local |

## Đặc tả và kế hoạch

Yêu cầu của chủ repo áp dụng cho lệnh `pnpm dev`. Thay đổi nằm ở script khởi động local và không triển khai tính năng mới. Các tài liệu [đặc tả](../../specs/00-system/continuous-deployment/spec.md), [kế hoạch](../../specs/00-system/continuous-deployment/plan.md) và [checklist](../../specs/00-system/continuous-deployment/tasks.md) của OPS-001 quy định luồng triển khai production.

## Câu hỏi đã làm rõ

| Câu hỏi                                      | Kết luận                                                            | Nguồn                                 |
| -------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------- |
| Lệnh nào cần bỏ Community?                   | `pnpm dev` là lệnh chạy backend đang được dùng để phát triển local. | Yêu cầu của chủ repo                  |
| Khi cần kiểm tra Community thì chạy thế nào? | Dùng lệnh `pnpm dev:community` hiện có.                             | [package.json](../../../package.json) |

## Thay đổi và cách chạy

`scripts.dev` trong `package.json` dùng `concurrently` để chạy Gateway, Identity, Learning, Submission và Judge. Bỏ tiến trình Community cùng tên và màu log tương ứng khỏi danh sách. `README.md` ghi rõ các service chạy mặc định và lệnh mở riêng Community.

Gateway vẫn đọc `COMMUNITY_SERVICE_URL` khi khởi tạo bảng định tuyến. Gateway chỉ kết nối tới Community khi chuyển tiếp một yêu cầu thuộc nhóm route của service này.

## Xác minh

- Chạy chuỗi lệnh `scripts.dev` qua `concurrently` với lệnh `pnpm` giả lập. Cả năm lệnh khởi động dự kiến được gọi và kết thúc thành công.
- Chạy bộ test `gateway-proxy.service.spec.ts`. Kết quả 114 test pass.
- Gateway khởi tạo module và đăng ký `/health` với cấu hình thử nghiệm khi Community tắt. Sandbox chặn mở cổng TCP với `EPERM`, nên chưa kiểm tra endpoint qua HTTP hoặc chạy toàn bộ backend với hạ tầng đã deploy.
