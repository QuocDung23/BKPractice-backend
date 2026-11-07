# JDG-005 Kế hoạch Sandbox

## Trạng thái

**Reviewed.** [Spec JDG-005 v1.0](./spec.md) đã `Approved` ngày 2026-10-07 theo
[`REVIEW.md`](../REVIEW.md); trần nền tảng và workspace/timeout/output policy (D-11, D-07) đã chốt,
plan này là căn cứ triển khai.

## Service đích và kiến trúc bắt buộc

- Service: Judge.
- Kiến trúc: **Hexagonal Architecture (Ports & Adapters) + Pipeline** theo [ADR 0002](../../../adr/0002-revised-service-internal-architectures.md) và [Judge architecture](../../../architecture/judge-service.md).
- Sandbox là driven adapter. Core chỉ biết contract thực thi, không biết Docker flags, process spawning hay đường dẫn host. Không thêm domain entity/repository/database cho phép biến đổi stateless này.

## Ảnh hưởng tới mã hiện có

| Thành phần                   | Hiện trạng                                                                                                | Hướng triển khai theo spec Approved                                                      |
| ---------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `judge.engine.ts`            | Gọi trực tiếp `DockerSandboxExecutor`; tạo workspace và `chmod 0777`                                      | Dùng sandbox port có thật; chuẩn bị workspace/quyền file theo policy đã duyệt            |
| `docker-sandbox.executor.ts` | Docker `--network none`, CPU 1, memory/swap, PID 64, non-root, drop caps, read-only root; workspace `:rw` | Giữ các control bắt buộc, thêm trần/cleanup/metric được chốt, xử lý timeout cả container |
| `judge.module.ts`            | Bind concrete executor                                                                                    | Bind Docker adapter vào sandbox port tại composition root                                |
| Config template/schema       | Có workspace root, Docker binary, max output                                                              | Thêm/chỉnh key chỉ sau khi trần platform được duyệt; không đọc `.env` thật               |

## Core, port và adapter

- Định nghĩa một `Sandbox` port cho các dữ liệu thực sự cần: image/command tin cậy, workspace, stdin, timeout, memory limit; trả exit code, stdout/stderr có giới hạn, runtime, timeout/output flags và metric memory nếu có nguồn đo đáng tin.
- Docker adapter kiểm soát image, command arguments đã được runner chọn; dữ liệu request chỉ đi qua file/stdin. Không gọi shell.
- Workspace tạm là đơn vị cô lập theo execution; thay quyền `0777` và file `0666` bằng quyền theo UID/GID đã duyệt. Kiểm soát symlink/path traversal và giới hạn writable area/dung lượng.
- Giai đoạn compile vẫn phải ghi artifact; test execution có quyền ghi chỉ theo policy cuối cùng. Nếu cần tách vùng compile và test, triển khai sau khi quyết định quyền ghi được chốt, không chọn âm thầm.
- Trình tự dừng phải xử lý Docker client và container/process tree. Ghi nhận cleanup failure mà không log source, stdin hay harness.
- Adapter chỉ trả outcome kỹ thuật; verdict `INTERNAL_ERROR`/TLE/MLE thuộc pipeline JDG-001. Sandbox không xử lý RabbitMQ hoặc trạng thái Submission.

## DTO, API, lưu trữ, migration, phân quyền, realtime

- DTO/kiểm tra: validate limits trước khi gọi port; kẹp bởi trần platform sau khi trần được duyệt. Không nhận flags/image/filename từ client.
- API/Swagger: N/A — Judge không có API công khai; không thêm route.
- Lưu trữ/migration: N/A — workspace tạm không phải database nghiệp vụ, không có migration.
- Phân quyền: thông điệp đến từ consumer nội bộ; sandbox kiểm soát mã không tin cậy bằng OS/container permissions, không dùng role người dùng.
- Realtime: N/A — Submission/Gateway sở hữu realtime.

## Lỗi, bảo mật và khả năng quan sát

- Phân biệt lỗi user process (timeout, memory, output, exit) với Docker/image/host failure. Memory limit cần tín hiệu OOM đáng tin, không chỉ exit code `137` (SR-022). Lỗi hạ tầng đi về core dưới dạng lỗi kỹ thuật; JDG-001 quyết định `INTERNAL_ERROR`.
- Giữ mạng tắt, CPU/memory/swap/PID/output/wall clock giới hạn, non-root, drop all capabilities, no-new-privileges, read-only root, giới hạn tmpfs, không privileged.
- Log chỉ execution ID, stage, loại lỗi/cleanup và metric an toàn. Không log command có source, stdin, expected output, harness, token hay đường dẫn nhạy cảm.
- Soát container collision, orphan process, disk/FD exhaustion, lỗi khi `docker kill` và worker crash trong review bảo mật.

## Messaging

N/A trong adapter. JDG-001 giữ publish/ACK/NACK/retry/DLQ. Nếu cleanup failure xảy ra sau khi đã có result, chính sách terminal/retry phải được chốt trước khi nối adapter vào pipeline.

## Kiểm chứng dự kiến

| Yêu cầu                                   | Minh chứng cần có sau triển khai                                                        |
| ----------------------------------------- | --------------------------------------------------------------------------------------- |
| SR-001..007/014, AC-001/002/006/008       | Docker args/workload kiểm tra isolation, resource ceilings và trusted command/image     |
| SR-008/009/015..020, AC-003..005/009..012 | Thử đồng thời, disk/path/permission, lifecycle/identity và cleanup                      |
| SR-004/010..013/021/022, AC-007/013..015  | Bounded output, daemon/image failure, timeout mapping, OOM evidence và adapter boundary |

Chỉ chạy kiểm thử và các script `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` trong giai đoạn triển khai, theo definition of done; bản plan này không chạy code.

## Thứ tự thực hiện và điều kiện chặn

1. Chốt các câu hỏi JDG-005 về trần, timeout, output verdict, quyền ghi, metric và cleanup; cập nhật spec rồi phê duyệt.
2. Cập nhật port/core boundary và bind Docker adapter.
3. Áp isolation/resource/cleanup controls đã được duyệt.
4. Bổ sung kiểm chứng cho lạm dụng, timeout, resource exhaustion, đồng thời và lỗi hạ tầng.
5. Đối chiếu từng SR/AC, kiểm tra kiến trúc và cập nhật tasks.

## Rủi ro và tuân thủ kiến trúc

Mọi giá trị config/contract lấy theo spec Approved, không cố định số mới ngoài plan. Docker adapter vẫn là hạ tầng thay thế được; core không nhập Docker/Nest Config, không có persistence. Mọi thay đổi nới lỏng một control sandbox cần quyết định bảo mật/kiến trúc riêng theo `.docs/specs/00-system/judge-security.md`.

## Lát cắt triển khai và điểm chạm dự kiến

| Lát cắt                      | Điểm chạm dự kiến                                                               | Đầu ra review được                                                                               | Điều kiện bắt đầu                                  |
| ---------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| 1. Resource/outcome contract | `sandbox/docker-sandbox.executor.ts`, `judge.engine.ts`, config schema/template | Limit values, timeout/output/OOM/cleanup outcomes và bounded DTO                                 | D-11, JDG-001 mapping, security review đã chốt     |
| 2. Core port/composition     | Sandbox port mới trong Judge module, `judge.module.ts`                          | Core phụ thuộc port; Docker adapter được bind tại composition root                               | Port contract reviewed; không thay business scope  |
| 3. Isolation and workspace   | `sandbox/docker-sandbox.executor.ts`, workspace helper nếu cần                  | Docker controls, workspace identity/permissions/path/size và network isolation                   | Workspace/write policy + platform ceiling Approved |
| 4. Lifecycle/metrics         | executor và config boundary                                                     | Timeout dừng process/container tree; output bounded; OOM chỉ khi evidence đủ; cleanup observable | Outcome/metric sources được xác nhận               |
| 5. Adversarial verification  | sandbox tests, Docker integration/security checks                               | Evidence cho SR/AC, concurrency, abuse, cleanup và daemon failures                               | Lát cắt 1–4 hoàn tất                               |

Không đưa RabbitMQ vào Sandbox port và không để adapter tự quyết định Judge verdict. Mọi giới hạn chạy trong container phải được kẹp bởi platform ceiling đã Approved; giá trị cụ thể không được lấy mặc định từ hành vi hiện tại nếu spec chưa chốt.
