# Phiếu duyệt bộ SRS, plan và tasks của Judge

Ngày chuẩn bị: 2026-09-30. Ngày duyệt: 2026-10-07. Tài liệu này ghi kết quả duyệt đồng thời năm
phạm vi JDG; các quyết định ở dưới có hiệu lực cho tới khi chủ sở hữu repo thay đổi.

## Tình trạng tài liệu

| Phạm vi          | Spec                                  | Plan                             | Tasks                              | Kết luận hiện tại                |
| ---------------- | ------------------------------------- | -------------------------------- | ---------------------------------- | -------------------------------- |
| JDG-001 Standard | [spec v1.0](standard-judge/spec.md)   | [plan](standard-judge/plan.md)   | [tasks](standard-judge/tasks.md)   | Approved 2026-10-07 (D-01…D-07)  |
| JDG-002 Runners  | [spec v1.0](language-runners/spec.md) | [plan](language-runners/plan.md) | [tasks](language-runners/tasks.md) | Approved 2026-10-07 (D-08)       |
| JDG-003 Function | [spec v1.0](function-judge/spec.md)   | [plan](function-judge/plan.md)   | [tasks](function-judge/tasks.md)   | Approved 2026-10-07 (D-09)       |
| JDG-004 OOP      | [spec v1.0](oop-judge/spec.md)        | [plan](oop-judge/plan.md)        | [tasks](oop-judge/tasks.md)        | Approved 2026-10-07 (D-10)       |
| JDG-005 Sandbox  | [spec v1.0](sandbox/spec.md)          | [plan](sandbox/plan.md)          | [tasks](sandbox/tasks.md)          | Approved 2026-10-07 (D-11, D-07) |

Cả năm spec đã chuyển `Approved` v1.0; các câu hỏi mở trong từng spec đã được thay bằng mục
**Quyết định khi duyệt**. Plan được đánh dấu `Reviewed`; tasks là checklist triển khai chính thức,
trong đó phần **Cổng trước triển khai** đã chốt xong các mục quyết định. Việc triển khai vẫn phải
đi qua các mục chưa tích của cổng (xác nhận worktree/kiến trúc) theo
[`.docs/agent/working-agreement.md`](../../agent/working-agreement.md). Không có code, cấu hình
hay migration nào thay đổi trong gói duyệt này.

## Kết quả đối chiếu nguồn

- **Kiến trúc:** Cả năm plan dùng đúng `Hexagonal Architecture (Ports & Adapters) + Pipeline` theo ADR 0002. Judge là stateless, không có database/repository/entity; consumer là driving adapter, runner/sandbox và publish là các ranh giới driven.
- **Quyền sở hữu:** Learning sở hữu Problem/Test Case/harness; Submission sở hữu Run/Submit, lịch sử và tiến độ; Judge chỉ thực thi, đánh giá, phân loại và gửi result. Không plan nào yêu cầu truy cập DB service khác.
- **Contract hiện có:** `JudgeRequest`, `JudgeResult`, enum language/type/status và Rabbit topology nằm trong `libs/contracts`; đợt duyệt này KHÔNG mở rộng `JudgeStatus` hay `JudgeRequest`.
- **Dữ liệu Learning đã chốt:** LRN-002 Approved quy định tối đa 100 testcase, mỗi stdin/expected output tối đa 1 MiB, tổng testcase/harness tối đa 8 MiB; FUNCTION/OOP harness đọc stdin thô và in stdout cần so; testcase SAMPLE cũng được chấm khi Submit.
- **Bảo mật:** JDG-005 bảo toàn network off, CPU/memory/time/PID/output limits, privilege tối thiểu, workspace riêng và cleanup. Các hành vi chưa chuẩn của code hiện tại được liệt kê thành deviation bên dưới, không được coi là chuẩn đã duyệt.
- **Messaging:** Code hiện dùng publisher confirm, manual ACK, retry tối đa ba lần và DLQ; chính sách poison/duplicate/cleanup đã chốt tại D-07.

## Quyết định đã chốt (2026-10-07)

| Mã   | Phạm vi               | Quyết định                                                                                                                                                                      |
| ---- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-01 | JDG-001               | Dừng ở testcase sai đầu tiên; điểm = tổng `score` các test đã qua, không chuẩn hoá thang; `ACCEPTED` điểm 0 hợp lệ (SUB-002).                                                   |
| D-02 | JDG-001 + SUB-001     | RUN thành công dùng `ACCEPTED` kèm `mode=RUN` (không thêm status); Submission ánh xạ `EXECUTED` theo SUB-001. stdout/stderr của Run trả về và lưu, chỉ hiện ở chi tiết Run.     |
| D-03 | JDG-001               | Giữ comparator CRLF→LF rồi `trimEnd()`; không thêm Unicode normalization.                                                                                                       |
| D-04 | JDG-001 + SUB-002/003 | Judge gửi stdout/stderr cho cả SUBMIT; SUB-002-FR-019 lưu, SUB-003-FR-011 không trả stdout/stderr Submit cho người học. Compile diagnostics cho người học, loại đường dẫn host. |
| D-05 | JDG-001/005           | `runtimeMs` = tổng execute, không gồm compile/setup; compile quá hạn → `TIME_LIMIT_EXCEEDED`; vượt output → `RUNTIME_ERROR`.                                                    |
| D-06 | JDG-001/005           | Không đo bộ nhớ; result không gửi `memoryKb`. `MEMORY_LIMIT_EXCEEDED` chỉ khi có tín hiệu OOM đáng tin, exit 137 đơn lẻ chưa đủ (SR-022/AC-015).                                |
| D-07 | JDG-001/005           | Manual ACK; lỗi hạ tầng retry ≤3 rồi DLQ; thiếu định danh → log + ACK + bỏ; trùng `executionId` không tính lại; cleanup fail → log + ACK, không mất result.                     |
| D-08 | JDG-002               | Ghim toolchain: alpine 3.22 (C/C++), temurin 21 (Java, `Main.java`), python 3.13 (`py_compile` + `-I`); source ≤ 1 MiB; compile timeout `max(3×TL, 10s)`.                       |
| D-09 | JDG-003               | Contract callable thuộc Learning; harness ghép sau source (single-file); lỗi phân loại theo vùng code; mỗi test một process/container; chỉ dùng thư viện trong image.           |
| D-10 | JDG-004               | Contract OOP thuộc Learning; single-file; lỗi phân loại theo vùng code; mỗi test một process riêng; reflection/serialization cấm trừ khi contract Problem cho phép.             |
| D-11 | JDG-005               | Giữ trần: network none, CPU 1, PID 64, memory theo request, tmpfs `/tmp` 64 MiB, output 1 MiB, timeout per execute; workspace rw theo request; không thêm disk/FD/seccomp.      |

## Deviation giữa code hiện tại và spec Approved

Các mục này KHÔNG phải chuẩn đã duyệt; task triển khai phải sửa:

| Deviation                                          | Quy tắc đã duyệt                           |
| -------------------------------------------------- | ------------------------------------------ |
| Workspace ghi `0777`, file `0666`                  | SR-016: chỉ quyền cần thiết cho UID chạy   |
| Exit `137` bị map thẳng `MEMORY_LIMIT_EXCEEDED`    | SR-022/AC-015: cần tín hiệu OOM đáng tin   |
| Điểm 0 bị thay bằng mặc định 100 (`score` OR 100)  | JDG-001-FR-010: không tự gán điểm mặc định |
| Chưa có stage xác thực payload trước workspace     | JDG-001-FR-002                             |
| Cleanup fail làm mất result và bị retry tính lại   | JDG-001-FR-017                             |
| Thiếu định danh đi vào retry/DLQ thay vì log + ACK | JDG-001-FR-024                             |

## Trạng thái sau duyệt

1. Plan/tasks của cả năm phạm vi đã đối chiếu với spec v1.0 Approved.
2. Triển khai bắt đầu theo thứ tự phụ thuộc: JDG-005 → JDG-002 → JDG-001 → JDG-003/JDG-004, qua
   từng `tasks.md` và bước xác nhận còn lại của cổng trước triển khai.
3. Bất kỳ thay đổi nào đối với quyết định D-01…D-11 đều cần phản hồi mới của chủ sở hữu repo và một
   phiên bản spec tiếp theo; không tự chọn phương án khi chưa có quyết định.
