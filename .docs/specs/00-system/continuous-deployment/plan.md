# [OPS-001] Kế hoạch triển khai

## Đặc tả liên quan

[`./spec.md`](./spec.md), trạng thái `Approved`, 2026-11-15.

## Service đích

Hạ tầng phát hành toàn hệ thống; không thay đổi application service.

## Kiến trúc bắt buộc

Giữ application boundary trong [System Architecture](../../../architecture/system-architecture.md): mỗi
container vẫn là một application độc lập. Workflow chỉ điều phối image đã build, không tạo dependency
giữa các business service.

## Ảnh hưởng tới mã nguồn hiện có

`.github/workflows/build-images.yml` đã verify và publish matrix image theo `${{ github.sha }}`. Thêm job
`deploy` phụ thuộc `publish`, dùng GitHub Environment `production` và SSH tới VPS để gọi root-owned script.

## Domain / Application / Lưu trữ / Cơ sở dữ liệu / Migration / API / DTO / Messaging / Realtime

N/A — OPS-001 không thay đổi business behavior, persistence, migration, API hay message contract.

## Adapter hạ tầng

- VPS giữ `/usr/local/sbin/bkpractice-deploy`, nhận một SHA, lock bằng `flock`, dùng
  `docker compose --env-file production.env`, pull/recreate service và kiểm tra health.
- GitHub Actions pin host key trong `PROD_SSH_KNOWN_HOSTS`; private key chỉ lấy từ Environment secret.

## Xử lý lỗi

Shell script dùng `set -Eeuo pipefail`; pull, Compose `--wait`, hoặc HTTP health lỗi sẽ trả non-zero cho SSH
và khiến job fail. GitHub concurrency và VPS lock là hai lớp chống chạy đồng thời.

## Bảo mật

- Không dùng SSH key cá nhân. Key triển khai chỉ đăng nhập user `bkdeploy`.
- `bkdeploy` chỉ sudo `/usr/local/sbin/bkpractice-deploy`; script root-owned, validate SHA trước khi dùng.
- Strict host-key checking không bị tắt.
- Không truyền hay log `production.env` và không dùng `latest`.

## Chiến lược kiểm thử

- Validate YAML workflow và chạy quality commands hiện có.
- Test deploy thủ công một SHA đã publish trước khi thêm secrets/workflow.
- Sau khi bật workflow, merge một commit không có migration và xác nhận action job + VPS health.

## Khả năng quan sát

GitHub Actions job ghi SHA deploy và trạng thái health. Docker container health cùng `/health` là tín hiệu
production; secrets không được ghi log.

## Thứ tự triển khai

1. Provision script và deploy user/key trên VPS.
2. Đặt GitHub Environment secrets và pinned known-hosts.
3. Thêm job `deploy` sau job `publish`.
4. Validate workflow, deploy thử và xác nhận health.

## Rủi ro

- Mất kết nối SSH hoặc image pull lỗi: deployment fail, image/container cũ vẫn còn.
- Migration cần rollout riêng; không được trộn tự động vào release code.
- Cần pin host key đúng trước khi bật workflow để tránh MITM.

## Tuân thủ kiến trúc

OPS-001 chỉ điều phối các container độc lập đã có. Nó không đưa business code, entity, database access hay
transport contract vào Gateway hoặc shared library, nên không thay đổi ownership/dependency direction.
