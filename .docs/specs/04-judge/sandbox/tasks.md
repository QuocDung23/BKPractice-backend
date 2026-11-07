# JDG-005 Tasks Sandbox

**Trạng thái:** Chưa thực hiện. Phụ thuộc [spec Approved v1.0](./spec.md) và [plan reviewed](./plan.md).

## Cổng trước triển khai

- [x] Chốt câu hỏi mở về trần tài nguyên, timeout, output-limit, quyền ghi, memory metric và cleanup — xong 2026-10-07 theo [REVIEW.md](../REVIEW.md) D-11/D-07; ghi vào bảng trần nền tảng và các SR của spec.
- [ ] Xác nhận spec `Approved`, plan khớp spec, kiến trúc Hexagonal + Pipeline và trạng thái worktree.
- [ ] Xác nhận không có thay đổi nào nới control bắt buộc của `judge-security.md`.

## Port, Docker adapter và sandbox

- [ ] Định nghĩa Sandbox port và kết quả kỹ thuật theo SR-021; bind Docker adapter trong `judge.module.ts`.
- [ ] Giữ network off, CPU/memory/swap/PID/wall-clock/output ceilings, non-root, drop caps, no-new-privileges và read-only root (SR-001..007, SR-014).
- [ ] Áp giới hạn workspace/tmpfs/disk và quyền file theo policy đã duyệt; thử path/symlink isolation (SR-006/008/015..018).
- [ ] Dùng container identity không va chạm; dừng cả process tree/container khi timeout; dọn workspace/container trên success/error (SR-009/011/019/020).
- [ ] Thu stdout/stderr/compiler diagnostics trong giới hạn byte và trả metric memory chỉ nếu đo thật (SR-004/010/012).
- [ ] Phân biệt Docker/image/host failure với outcome chương trình; xác nhận OOM bằng tín hiệu tin cậy thay vì chỉ exit `137`; adapter không quyết định verdict hay ACK/NACK (SR-012/021/022).

## Kiểm chứng và tài liệu

- [ ] Kiểm chứng AC-001..015 và các trường hợp abuse, đồng thời, timeout, output flood, exit `137`, disk fill, failure cleanup.
- [ ] Kiểm tra log không chứa source/stdin/hidden harness/secret; soát cấu hình template, không đọc `.env` thật.
- [ ] Đối chiếu tất cả SR/AC với spec, bảo mật và chiều phụ thuộc; ghi sai lệch và mục N/A có lý do.
- [ ] Chạy các script hiện có `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` khi triển khai; cập nhật tasks và worked entry.

## N/A theo phạm vi

- [x] N/A — API/Swagger: Judge không có API công khai ở JDG-005.
- [x] N/A — Database/migration/repository: Judge stateless, chỉ dùng workspace tạm.
- [x] N/A — Realtime và quyền người dùng: Submission/Gateway sở hữu các luồng đó.

## Checklist triển khai chi tiết

Các bước dưới đây chia nhỏ SR/AC thành phần có thể triển khai và kiểm chứng. Giá trị giới hạn và policy lấy theo spec Approved; thay đổi phải quay lại spec trước khi đổi code/config.

### A. Chốt contract Sandbox

- [ ] **JDG005-T01 — Chốt giới hạn nền tảng:** ghi rõ CPU, memory, swap, wall time theo compile/run, PID, output, tmpfs, writable disk, source size và concurrency theo quyết định sản phẩm/vận hành.
- [ ] **JDG005-T02 — Chốt outcome contract:** định nghĩa timeout, output-limit, OOM, daemon/image failure, cancellation và cleanup failure ở mức kỹ thuật; mapping verdict/ACK thuộc JDG-001.
- [ ] **JDG005-T03 — Chốt quyền workspace:** xác định UID/GID, directory/file modes, vùng ghi cần cho compile/test, symlink/path policy và cleanup khi worker bị dừng.
- [ ] **JDG005-T04 — Chốt đo memory:** chọn nguồn metric cgroup/runtime được hỗ trợ; xác định điều kiện đủ để báo MLE, gồm trường hợp exit 137 không có OOM evidence.
- [ ] **JDG005-T05 — Chốt config:** xác nhận key/default/max và template thay đổi; không đọc hoặc ghi secret trong `.env` thật.

### B. Port và Docker adapter

- [ ] **JDG005-T06 — Thiết kế Sandbox port:** chỉ chứa input/output cần cho execute; không để core phụ thuộc Docker/process APIs; outcome trả stdout/stderr đã bounded và trạng thái kỹ thuật.
- [ ] **JDG005-T07 — Composition root:** bind port với Docker adapter tại `judge.module.ts`; kiểm tra injection graph không tạo phụ thuộc ngược.
- [ ] **JDG005-T08 — Container identity/workspace:** tạo tên/container/workspace duy nhất theo execution và stage; chống collision giữa executions đồng thời.
- [ ] **JDG005-T09 — Resource controls:** cấu hình network off, CPU/memory/swap/PID/time/output, non-root, drop capabilities, no-new-privileges, read-only root và tmpfs theo limits đã duyệt.
- [ ] **JDG005-T10 — Filesystem controls:** áp quyền tối thiểu; kiểm tra path traversal/symlink; chỉ mount workspace được chỉ định; giới hạn dung lượng writable theo policy.
- [ ] **JDG005-T11 — Process lifecycle:** quản lý compile và execute timeout; khi timeout/cancel dừng cả container/process tree, chờ kết thúc, rồi thực hiện cleanup.
- [ ] **JDG005-T12 — Output capture:** tính byte chính xác trong khi stream; ngừng thu/kill theo output policy khi vượt giới hạn; không buffer vô hạn trong memory worker.
- [ ] **JDG005-T13 — Failure classification:** phân biệt user process exit/resource outcome với daemon, image pull/start, mount và host failure; xác nhận OOM bằng metric tin cậy.
- [ ] **JDG005-T14 — Cleanup:** dọn container/workspace ở success và mọi exception path; báo cleanup error có correlation ID nhưng không lộ source/stdin/harness.

### C. Kiểm chứng bảo mật/vận hành

- [ ] **JDG005-T15 — Unit tests adapter:** kiểm tra argv/flags, container lifecycle, bounded output, timeout handling, failure classification và cleanup.
- [ ] **JDG005-T16 — Isolation tests:** thử network access, privilege escalation/capabilities, đọc filesystem host, PID/process flood và truy cập workspace execution khác.
- [ ] **JDG005-T17 — Resource abuse tests:** CPU loop, memory pressure, output flood, disk fill, FD pressure, compile timeout và runtime timeout theo từng giới hạn.
- [ ] **JDG005-T18 — OOM/exit tests:** test có OOM evidence, exit 137 không có evidence, daemon failure; xác nhận không gán MLE chỉ từ exit code.
- [ ] **JDG005-T19 — Cleanup/concurrency tests:** chạy song song, inject failure ở start/execute/kill/remove; xác nhận không sót container/workspace sau policy cleanup.
- [ ] **JDG005-T20 — Security review:** soát `judge-security.md`, Docker options thực tế, config templates và log redaction; ghi evidence cho từng SR/AC.
- [ ] **JDG005-T21 — Hoàn tất:** chạy các lệnh DoD khi triển khai, rà tất cả SR/AC, cập nhật tasks/worked entry và nêu giới hạn chưa kiểm chứng.

### Ma trận kiểm chứng tối thiểu

| AC         | Bằng chứng                                                                    |
| ---------- | ----------------------------------------------------------------------------- |
| AC-001/008 | Network off, không privileged, drop capabilities và PID limit                 |
| AC-002     | CPU, memory, wall timeout, output ceiling và request không nới platform cap   |
| AC-003/011 | Timeout dừng process tree/container, không để execution mồ côi                |
| AC-004/012 | Workspace isolation và container identity chống collision/control chéo        |
| AC-005     | Cleanup success/error; lỗi cleanup được phát hiện, không lộ dữ liệu           |
| AC-006     | Source/stdin không điều khiển executable, flags, image hoặc host path         |
| AC-007     | Docker/hạ tầng unavailable thành INTERNAL_ERROR, không quy lỗi cho submission |
| AC-009/010 | Disk/tmpfs quota, permissions và path/symlink isolation                       |
| AC-013     | Gộp byte stdout/stderr và terminal behavior khi vượt ngưỡng                   |
| AC-014     | Compile/run timeout limits và verdict mapping riêng, rõ ràng                  |
| AC-015     | Exit 137 không bị coi là MLE khi thiếu OOM evidence                           |
