# JDG-005 Sandbox

## Trạng thái

Approved — phiên bản 1.0, ngày 2026-10-07.

## Mục tiêu

Yêu cầu mọi lần compile/execute mã không tin cậy diễn ra trong môi trường cách ly có giới hạn tài
nguyên và được dọn dẹp đáng tin cậy, bảo vệ host, dữ liệu và các service khác.

## Tác nhân và bối cảnh

Judge khởi chạy compiler/runtime thông qua Sandbox boundary; Docker hiện là adapter đang dùng.
Sandbox nhận lệnh do runner tin cậy dựng và dữ liệu source/stdin. Request không được điều khiển
command, image, filename hoặc Docker flags.

### Trần nền tảng đã duyệt

Bảng dưới vừa là baseline của adapter vừa là trần nền tảng đã duyệt (quyết định D-11, 2026-10-07).
Giá trị chỉ đổi qua quyết định bảo mật/kiến trúc riêng theo `.docs/specs/00-system/judge-security.md`.

| Control         | Trần đã duyệt                                                                                        | Nguồn                        |
| --------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------- |
| Network         | `none`                                                                                               | `docker-sandbox.executor.ts` |
| CPU             | 1 CPU                                                                                                | `--cpus 1`                   |
| Memory/swap     | Memory theo request; swap bằng memory limit                                                          | `--memory`, `--memory-swap`  |
| PID             | 64                                                                                                   | `--pids-limit 64`            |
| User/capability | UID:GID 1000:1000; drop ALL; no-new-privileges                                                       | Docker args                  |
| Root/temp       | Root read-only; `/tmp` tmpfs 64 MiB, `noexec,nosuid`                                                 | Docker args                  |
| Workspace       | Bind mount read-write, riêng theo request; compile artifact và mọi testcase trong request dùng chung | Docker args/engine           |
| Output          | stdout+stderr cộng dồn, trần 1 MiB (`JUDGE_MAX_OUTPUT_BYTES`); vượt thì kill                         | executor                     |
| Timeout         | `timeLimitMs` cho từng lần execute; compile `max(3 * timeLimitMs, 10s)`                              | engine/executor              |
| Source          | `sourceCode` tối đa 1 MiB theo JDG-001/JDG-002                                                       | JDG-001                      |
| Cleanup         | Docker `--rm`; host workspace bị xóa ở finally; cleanup fail → log + ACK                             | executor/engine              |

Workspace read-write dùng chung giữa compile và các testcase trong cùng request được duyệt như hiện
trạng; các testcase cùng một request có thể phụ thuộc file do nhau ghi. Việc nâng quyền file workspace
lên đúng UID chạy container (bỏ world-writable) là yêu cầu bắt buộc tại SR-016 và phải sửa khi
triển khai.

## Yêu cầu chức năng và bảo mật

- **JDG-005-SR-001 — Network:** Mọi container thực thi MUST không có network access.
- **JDG-005-SR-002 — Tài nguyên:** Mọi compile/run MUST áp CPU, memory và wall-clock timeout; memory
  swap MUST không cho phép vượt memory ceiling.
- **JDG-005-SR-003 — Process:** Sandbox MUST giới hạn số process/PID.
- **JDG-005-SR-004 — Output:** Stdout/stderr/compiler output MUST có giới hạn byte (trần 1 MiB,
  tính gộp stdout+stderr); vượt ngưỡng MUST dừng lần execute đang chạy và trả cờ output-limit để
  JDG-001 phân loại `RUNTIME_ERROR` rồi dừng request.
- **JDG-005-SR-005 — Privilege:** Container MUST chạy với đặc quyền tối thiểu, drop capabilities,
  bật no-new-privileges và MUST NOT chạy privileged.
- **JDG-005-SR-006 — Filesystem:** Root filesystem MUST read-only khi có thể; writable temp phải
  giới hạn và không thực thi file tuỳ tiện ngoài workspace được cấp.
- **JDG-005-SR-007 — Commands:** Executable, arguments nền tảng, filename và image MUST do adapter
  tin cậy kiểm soát; dữ liệu payload chỉ truyền qua file/stdin đã quy định.
- **JDG-005-SR-008 — Workspace:** Mỗi request MUST dùng workspace riêng, không chia sẻ với request
  khác; compile artifact và mọi testcase trong cùng request dùng chung workspace đó. Quyền file
  workspace không được rộng hơn UID chạy container (xem SR-016).
- **JDG-005-SR-009 — Cleanup:** Workspace và container MUST được dọn cả sau success, timeout, lỗi
  process và lỗi bất thường; cleanup failure phải được phát hiện/ghi nhận an toàn.
- **JDG-005-SR-010 — Output capture:** Sandbox MUST thu stdout/stderr và compiler diagnostics trong
  giới hạn; không ghi raw hidden data vào log vận hành.
- **JDG-005-SR-011 — Timeout termination:** Hết hạn MUST kết thúc process/container kịp thời và
  không để orphan tiếp tục chạy.
- **JDG-005-SR-012 — Failure classification:** Lỗi do giới hạn của submission được phân loại riêng
  lỗi infrastructure; contract verdict hiện có không chứa sandbox-unavailable riêng nên hạ tầng
  không khả dụng MUST map về `INTERNAL_ERROR`.
- **JDG-005-SR-013 — No persistence:** Sandbox artifacts chỉ tồn tại trong thời gian cần cho một
  request; Judge MUST NOT duy trì kho source/test/harness hay lịch sử chấm.
- **JDG-005-SR-014 — CPU quota:** Mỗi sandbox MUST có CPU quota hữu hạn do platform đặt; request
  không thể chọn/nới quota. Nếu đang dùng Docker, quota phải được truyền dưới dạng control cgroup
  tương đương `--cpus`.
- **JDG-005-SR-015 — Disk quota:** Writable temp MUST có giới hạn dung lượng (tmpfs `/tmp` 64 MiB).
  Workspace bind mount không có quota riêng trong bản này; nó bị giới hạn gián tiếp bởi trần source
  1 MiB, trần output và việc không cấp đường ghi ngoài workspace. Đầy disk MUST kết thúc execution
  có kiểm soát, không ảnh hưởng host hay workspace khác.
- **JDG-005-SR-016 — File permissions:** Workspace MUST chỉ cấp quyền cần thiết cho UID chạy
  container. Không dùng quyền world-writable nếu không có quyết định security được duyệt.
- **JDG-005-SR-017 — Path isolation:** Mọi đường dẫn do source/harness tạo MUST bị giới hạn trong
  workspace hoặc mount được cho phép; symlink/path traversal không được truy cập host path.
- **JDG-005-SR-018 — Compile/run artifact:** Artifact compile cần tồn tại đủ để chạy testcase nhưng
  không được ghi ra vùng host không cách ly. Test execution chỉ có quyền ghi file nếu policy Problem
  đã cho phép; quyền này phải giới hạn trong workspace.
- **JDG-005-SR-019 — Container identity:** Container name/ID MUST duy nhất cho mỗi process invocation
  và không được tạo collision qua chuỗi ký tự từ payload.
- **JDG-005-SR-020 — Process tree termination:** Timeout/cancel MUST dừng toàn bộ process tree và
  container, không chỉ process Docker client; cleanup phải xác nhận không còn workload mồ côi.
- **JDG-005-SR-021 — Ranh giới adapter:** Sandbox MUST trả kết quả hoặc lỗi kỹ thuật về core và
  MUST NOT phụ thuộc RabbitMQ, quyết định ACK/NACK hay ghi trạng thái Submission. Phân phối result
  thuộc JDG-001.
- **JDG-005-SR-022 — Bằng chứng cạn bộ nhớ:** Sandbox MUST chỉ báo sự kiện chạm giới hạn bộ nhớ khi
  có tín hiệu runtime/cgroup đáng tin; exit code `137` đơn lẻ MUST NOT được coi là bằng chứng đầy đủ,
  vì process có thể bị kill vì lý do khác.

## Đầu vào/đầu ra

Sandbox nhận workspace riêng, image/command tin cậy, stdin và limits đã xác thực. Trả exit status,
stdout/stderr có giới hạn, runtime và cờ timeout/output-limit; memory metric chỉ trả nếu đo tin cậy.
Không chấp nhận bất cứ lệnh/flag nào từ client.

## Lỗi và biên

Docker daemon không sẵn sàng; image thiếu; workspace permission; container không thoát; output flood;
fork bomb; memory/CPU exhaustion; timeout race; trùng execution/container name; dọn dẹp thất bại;
host restart khi container chạy; symlink/path traversal từ source; filesystem đầy.

## Tiêu chí nghiệm thu

- **JDG-005-AC-001:** Mỗi execution tắt network, không privileged, drop capabilities và giới hạn PID.
- **JDG-005-AC-002:** CPU, memory, wall timeout và output ceiling luôn được áp dụng; request không
  thể nới trần nền tảng.
- **JDG-005-AC-003:** Hết giờ kết thúc container/process và không để execution chạy mồ côi.
- **JDG-005-AC-004:** Workspace của hai execution đồng thời không thể đọc/ghi lẫn nhau.
- **JDG-005-AC-005:** Workspace/container được dọn sau success và lỗi; thất bại dọn dẹp được phát
  hiện mà không làm lộ dữ liệu nhạy cảm.
- **JDG-005-AC-006:** Source/stdin không thể thay đổi executable, flags, image hoặc host path.
- **JDG-005-AC-007:** Docker/hạ tầng unavailable tạo `INTERNAL_ERROR`, không gán verdict sai cho
  submission.
- **JDG-005-AC-008:** Không có đường chạy privileged hoặc network-enabled cho code người học.
- **JDG-005-AC-009:** Giới hạn đĩa/workspace/tmpfs ngăn một execution làm cạn filesystem host.
- **JDG-005-AC-010:** File trong workspace không có quyền rộng hơn chính sách đã duyệt; kiểm thử xác
  nhận không thể truy cập đường dẫn host qua `..` hoặc symlink.
- **JDG-005-AC-011:** Timeout giết cả process tree/container, và sau cleanup không còn container/process
  thuộc execution đó.
- **JDG-005-AC-012:** Hai request trùng hoặc gần trùng ID không thể điều khiển/kill container của nhau.
- **JDG-005-AC-013:** Output được tính gộp stdout và stderr theo byte; vượt ngưỡng có hành vi terminal
  xác định và không tiếp tục giữ output vượt giới hạn trong bộ nhớ.
- **JDG-005-AC-014:** Giới hạn compile khác execution được áp rõ ràng; mỗi loại timeout cho verdict
  xác định.
- **JDG-005-AC-015:** Một process tự trả exit code `137` không bị kết luận `MEMORY_LIMIT_EXCEEDED`
  nếu không có tín hiệu OOM xác nhận; lỗi daemon/host được phân loại khác lỗi lời giải.

## Ngoài phạm vi

Chọn công nghệ isolation thay Docker (ví dụ gVisor/Firecracker) nếu chưa có ADR; quản trị cluster,
autoscaling, billing, anti-cheat và host patch management. Các yêu cầu ở đây không cho phép nới
security controls hiện hành.

## Phụ thuộc

[Judge security](../../00-system/judge-security.md), [Judge architecture](../../../architecture/judge-service.md),
[JDG-001](../standard-judge/spec.md), [JDG-002](../language-runners/spec.md), Docker sandbox adapter.

## Quyết định khi duyệt

Phiên bản này được duyệt ngày 2026-10-07 theo phiếu [`.docs/specs/04-judge/REVIEW.md`](../REVIEW.md):

| Quyết định | Nội dung chốt                                                                                                                                                                                       |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-11.1     | Giữ trần nền tảng theo bảng trên: network `none`, CPU 1, PID 64, memory/memswap theo request, user 1000:1000, cap-drop ALL, no-new-privileges, root read-only, tmpfs `/tmp` 64 MiB `noexec,nosuid`. |
| D-11.2     | Timeout áp cho từng lần execute (`timeLimitMs`) và cho compile (`max(3 × timeLimitMs, 10s)`); không có timeout tổng cho cả request.                                                                 |
| D-11.3     | Vượt trần output: kill lần execute đó → `RUNTIME_ERROR` + dừng request (JDG-001); không thêm verdict contract mới.                                                                                  |
| D-11.4     | Workspace read-write dùng chung theo request (chấp nhận phụ thuộc thứ tự trong request); workspace hai request khác nhau không đọc/ghi lẫn nhau.                                                    |
| D-11.5     | Không thêm quota disk workspace, FD limit hay seccomp/apparmor profile trong bản này; tmpfs 64 MiB là quota ghi duy nhất.                                                                           |
| D-11.6     | Không đo memory metric; `memoryKb` không được gửi (JDG-001-FR-012). `MEMORY_LIMIT_EXCEEDED` chỉ được kết luận khi có tín hiệu OOM đáng tin; exit 137 đơn lẻ chưa đủ (SR-022/AC-015).                |
| D-07.1     | Cleanup failure: ghi log + ACK, không giữ result, không tính lại; container chạy mồ côi MUST bị kill/`--rm` dọn theo SR-009/SR-011.                                                                 |
| D-07.2     | Chống trùng: container name sinh từ `executionId` đã sanitize; delivery trùng executionId không tính lại, Submission giữ kết quả đến trước (JDG-001).                                               |

Lưu ý khi triển khai: code hiện tại ghi workspace quyền `0777/0666` và map exit `137` thành
`MEMORY_LIMIT_EXCEEDED` — cả hai đều chưa khớp SR-016 và SR-022/AC-015 ở trên; đây là công việc phải
sửa, không phải chuẩn đã duyệt.

## Lịch sử sửa đổi

| Ngày       | Phiên bản | Tác giả/Người review    | Tóm tắt                                                                                    |
| ---------- | --------- | ----------------------- | ------------------------------------------------------------------------------------------ |
| 2026-09-30 | 0.1       | Codex / chờ review      | SRS đề xuất                                                                                |
| 2026-09-30 | 0.2       | Codex / chờ review      | Thêm baseline Docker, disk/path/process controls và nghiệm thu đo được                     |
| 2026-10-07 | 1.0       | Codex / Chủ sở hữu repo | Duyệt: chốt trần nền tảng, timeout/output/workspace policy, cleanup/duplicate (D-11, D-07) |
