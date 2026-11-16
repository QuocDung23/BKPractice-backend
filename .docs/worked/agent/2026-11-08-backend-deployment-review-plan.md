# 2026-11-08 — Backend production deployment review plan

- Author: Codex, theo yêu cầu của chủ repo.
- Scope: Tài liệu kế hoạch triển khai cấp repository trong `review/`; không sửa source, runtime config, dependency, migration hay VPS.

## Spec and plan

- Spec: Chưa có deployment spec Approved; đây là bản review để owner tự triển khai, không phải giấy phép bỏ qua SDD.
- Plan: `review/2026-11-08-backend-production-deployment-plan.md` — bản nháp review chi tiết.
- Tasks: Chưa tạo tasks chính thức; tài liệu review có trình tự và gate để chuyển thành tasks sau khi spec được duyệt.
- Spec status at start: N/A — công việc này chỉ ghi lại kế hoạch do người dùng yêu cầu; không thực thi deploy.

## Questions clarified

| Question                              | Conclusion                                                                                                                   | Source                                                                         |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Môi trường và phạm vi?                | Production trên VPS, đủ sáu ứng dụng; tái sử dụng PostgreSQL/RabbitMQ/Redis hiện có qua Tailscale.                           | Người dùng trong cuộc trao đổi lập plan, 2026-11-08.                           |
| Người dùng frontend có cần Tailscale? | Không; Gateway phải có HTTPS public. Tailscale chỉ cho hạ tầng/CI.                                                           | Người dùng chọn truy cập công khai không cần Tailscale, 2026-11-08.            |
| Frontend ở đâu?                       | Chưa deploy, dự kiến cùng VPS qua Nginx, cùng origin với API.                                                                | Người dùng, 2026-11-08.                                                        |
| Có domain và TLS không?               | Không mua domain; đồng ý cấp HTTPS cho IP public và tự động gia hạn.                                                         | Người dùng, 2026-11-08.                                                        |
| CI/CD và image?                       | GitHub Actions tự deploy khi merge `main`, dùng GHCR.                                                                        | Người dùng, 2026-11-08.                                                        |
| VPS đang dùng cổng nào?               | Nginx nghe 80/443; ứng dụng khác dùng loopback 3000/4000; chọn 8443 HTTPS riêng và Gateway loopback 3100 để tránh chồng lấn. | Đầu ra `ss`/`docker ps`/`nginx -t` người dùng gửi, 2026-11-08; Nginx SNI docs. |
| Rủi ro mạng hiện tại?                 | Redis đang publish trên mọi IPv4/IPv6, cần khoanh lại trước go-live.                                                         | Đầu ra `docker ps` người dùng gửi, 2026-11-08.                                 |

## What was done

Tạo một bản review trong `review/` để chủ repo tự triển khai backend. Tài liệu nêu quyết định đã chốt, hiện trạng repo/VPS, sơ đồ đường mạng, điều kiện phải kiểm, file/config cần chuẩn bị, hình dạng CI/CD, thứ tự backup-migration-seed-deploy, Nginx/HTTPS IP, kiểm chứng và rollback. Ghi rõ người dùng frontend không cần Tailscale khi Gateway đi qua HTTPS public. Không tạo deployment spec/plan/tasks chính thức và không thực hiện bất kỳ bước phát hành nào.

## Why these choices

- Dùng `review/` vì người dùng yêu cầu bản kế hoạch chi tiết để tự làm, và folder này đã chứa các review plan khác.
- Dùng 8443 cho HTTPS IP vì Nginx cổng 443 đang phục vụ ứng dụng khác; client truy cập bằng IP có thể không gửi SNI, nên cấp chứng chỉ IP trên cổng 443 có nguy cơ đưa sai default certificate.
- Dùng Compose production riêng vì Compose hiện tại dựng hạ tầng dev và public nhiều cổng; production phải tái sử dụng dịch vụ đã chạy qua Tailscale.
- Tách migration image/job vì runtime image hiện không chứa TypeScript source mà các script migration/seed cần.
- Giữ tài liệu ở trạng thái review vì chưa có spec deployment Approved; bản review không sửa Approved feature spec và không triển khai thay owner.

## How the feature works

Đây không phải thay đổi sản phẩm. Chủ repo dùng bản review để tạo và duyệt deployment spec/plan/tasks, chuẩn bị hạ tầng VPS, Nginx/HTTPS IP, CI/CD và secret; sau đó tự phát hành theo gate và ghi bằng chứng kiểm chứng. Người dùng web tương lai sẽ gọi cùng origin HTTPS public, Nginx chuyển `/api` và `/socket.io` tới Gateway; các service chỉ dùng Tailscale để tới hạ tầng riêng.

## Configuration

No configuration change. Tài liệu chỉ nêu những key sẽ cần cấu hình khi owner triển khai; không điền hoặc đọc giá trị secret thật.

## Verification

- Commands run and their results: `pnpm exec prettier --check` trên hai tài liệu pass;
  kiểm tra 15 liên kết local trong review plan đều tồn tại; `git check-ignore -v` xác nhận
  `review/` bị ignore theo `.gitignore` hiện có.
- Not verified: VPS, Nginx config thật, chứng chỉ IP, GHCR, GitHub Actions, migration, service health, smoke test và rollback; chưa deploy.

## Remaining

- Not done: owner cần duyệt spec/plan/tasks, thực thi theo review và ghi worked entry deployment sau khi hoàn tất.
- Risks: Redis public hiện tại; chứng chỉ IP sống khoảng sáu ngày; frontend chưa deploy nên OAuth web end-to-end chưa thể nghiệm thu. File review nằm trong thư mục bị Git ignore, nên sẽ không xuất hiện trong commit thông thường trừ khi owner thay đổi quy tắc theo dõi file.
