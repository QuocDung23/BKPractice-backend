# JDG-001 Tasks Chấm bài chuẩn

**Trạng thái:** Chưa thực hiện. Phụ thuộc [spec Approved v1.0](./spec.md), [plan reviewed](./plan.md), runner JDG-002 và sandbox JDG-005.

## Cổng trước triển khai

- [x] Chốt stop/continue, scoring, comparator, Run status, output theo mode, runtime/memory, compile timeout, output-limit verdict, poison message và retry/DLQ — xong 2026-10-07 theo [REVIEW.md](../REVIEW.md) D-01…D-07; ghi vào FR/Quy tắc nghiệp vụ của spec.
- [x] Đồng bộ các quyết định với SUB-001/SUB-002/SUB-003 (đã Approved) và contract `JudgeRequest`/`JudgeResult` — D-02 lấy theo SUB-001 mục "Vòng đời Run", D-04 theo SUB-002-FR-019 và SUB-003-FR-011; không mở rộng `JudgeStatus`.
- [ ] Xác nhận spec Approved, plan được review, kiến trúc Judge và trạng thái worktree.

## Core và transport

- [ ] Kiểm tra request shape/IDs/enum/limits/testcase/harness trước khi tạo workspace (FR-001/002/024).
- [ ] Chọn runner whitelist, chuẩn bị source và compile một lần; dừng pipeline đúng stage (FR-003..006).
- [ ] Đánh giá testcase theo thứ tự với comparator đã duyệt; phân loại execution outcome trước output comparison (FR-007/008/018).
- [ ] Tính passed/total/score/runtime/memory theo policy đã duyệt, không tự gán default score (FR-009..012/019/020).
- [ ] Dựng result giữ ID/mode và lọc stdout/stderr/diagnostics theo policy RUN/SUBMIT (FR-013..016/021/025).
- [ ] Dọn workspace/container theo JDG-005 cả khi exception/timeout/cleanup failure (FR-017).
- [ ] Publish một logical result, xác nhận publish trước ACK; xử lý retry/DLQ/duplicate delivery theo policy đã duyệt (FR-022..024).

## Kiểm chứng

- [ ] Kiểm chứng AC-001..010: success, mismatch, compile/runtime/time/memory error, empty tests, IDs/mode, ẩn dữ liệu, cleanup, metric.
- [ ] Kiểm chứng RUN không có expected output không thành `WRONG_ANSWER`; Submit result không làm lộ hidden input qua raw output.
- [ ] Kiểm chứng publish failure/redelivery/poison message và kết quả đến trùng với Submission.
- [ ] Đối chiếu từng FR/AC, service ownership, security và Out of Scope; cập nhật tài liệu contract nếu có thay đổi.
- [ ] Chạy `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` khi triển khai; cập nhật tasks/worked entry.

## N/A theo phạm vi

- [x] N/A — Database/migration/repository: Judge stateless; Submission lưu kết quả.
- [x] N/A — API/Swagger/realtime: Judge chỉ nhận/phát message nội bộ; Submission/Gateway sở hữu các luồng client.

## Checklist triển khai chi tiết

Các mục dưới đây phân rã checklist trên thành đầu việc có thể review độc lập. Mỗi task chỉ được đánh dấu hoàn tất sau khi có bằng chứng kiểm chứng; điều kiện ở Cổng trước triển khai vẫn áp dụng.

### A. Chốt contract và chuẩn bị

- [ ] **JDG001-T01 — Đóng quyết định sản phẩm:** ghi kết luận cho D-01..D-07 trong spec/review; định nghĩa stop/continue, score, comparator, Run result, field theo mode, metric, timeout/output-limit và delivery policy.
- [ ] **JDG001-T02 — So khớp contract liên dịch vụ:** đối chiếu `JudgeRequest`/`JudgeResult` với SUB-001/002/003 và LRN-002; ghi rõ field bắt buộc/tùy chọn, compatibility và owner của từng field.
- [ ] **JDG001-T03 — Chốt data validation:** viết bảng validation theo mode/type, IDs, enum, giới hạn testcase và kích thước từ nguồn Approved; mọi reject path được xác định trước khi mở workspace.
- [ ] **JDG001-T04 — Chốt delivery semantics:** quyết định poison payload, publish failure, redelivery, duplicate execution, stale result và ACK timing; kiểm tra không đổi semantics RabbitMQ dùng chung ngoài scope.

### B. Pipeline và đánh giá

- [ ] **JDG001-T05 — Tách transport khỏi use case:** consumer giải mã message, gọi operation core và quản lý delivery; không đặt scoring/comparator trong consumer.
- [ ] **JDG001-T06 — Validate trước side effect:** kiểm tra ID/mode/type/language/source/testcases/harness/limits; chứng minh request invalid không tạo workspace/container.
- [ ] **JDG001-T07 — Chọn runner và compile:** dùng registry whitelist, compile tối đa theo chính sách đã chốt, phân biệt source error với lỗi image/toolchain/harness; không lấy command/path từ payload.
- [ ] **JDG001-T08 — Chạy testcase theo policy:** bảo toàn thứ tự testcase; áp stop/continue đã duyệt; phân loại timeout, memory, output-limit, exit và infrastructure outcome trước bước so output.
- [ ] **JDG001-T09 — Comparator và verdict:** áp chuẩn hóa output đã duyệt; xác định verdict cho mismatch, compile/runtime/resource error và testcase rỗng theo spec.
- [ ] **JDG001-T10 — Score và metrics:** tính `passedTests`, `totalTests`, score, runtime và memory theo policy; không dùng fallback/default ngoài spec; định nghĩa hành vi khi metric không khả dụng.
- [ ] **JDG001-T11 — Dựng result:** giữ nguyên `executionId`, `submissionId`, `mode`; chỉ đưa field được phép theo RUN/SUBMIT; không để stdout/stderr phản chiếu hidden stdin hoặc diagnostics lộ source/host path.
- [ ] **JDG001-T12 — Dọn tài nguyên:** gọi Sandbox cleanup trên success, compile failure, runtime failure, timeout và exception; đưa cleanup failure vào policy đã duyệt và không làm mất correlation IDs.

### C. Messaging, bảo mật và kiểm chứng

- [ ] **JDG001-T13 — Publish và ACK:** publish đúng routing key/message ID; ACK chỉ theo publisher confirm và delivery policy đã chốt; kiểm chứng broker failure và redelivery.
- [ ] **JDG001-T14 — Tính idempotent ở biên:** chạy lại cùng execution theo delivery semantics; kiểm chứng Submission có thể nhận duplicate/stale result theo contract mà không phát sinh kết quả sai.
- [ ] **JDG001-T15 — Unit tests pipeline:** cover validation, stage order, comparator, stop/continue, precedence verdict, scoring/counts/metrics và result filtering, gắn assertion với FR tương ứng.
- [ ] **JDG001-T16 — Integration/contract tests:** cover consumer→core→Sandbox/runner→publisher, IDs/mode, publish confirm/ACK, malformed payload, retry/DLQ và compatibility Submission.
- [ ] **JDG001-T17 — Security regression:** kiểm tra hidden stdin/output/harness/source không xuất hiện trong result/log; kiểm tra source/stdin không thể thành command/path.
- [ ] **JDG001-T18 — Traceability và hoàn tất:** đánh dấu từng FR/AC trong spec bằng test/evidence; cập nhật tasks, plan nếu lệch, worked entry và Definition of Done.

### Ma trận hoàn tất theo acceptance criteria

| AC     | Bằng chứng cần lưu trong test/review                                             |
| ------ | -------------------------------------------------------------------------------- |
| AC-001 | Request STANDARD hợp lệ, mọi output khớp sau chuẩn hóa: ACCEPTED và đúng số test |
| AC-002 | Output mismatch tạo verdict/count/score đúng policy                              |
| AC-003 | Compile failure được phân loại và không chạy testcase                            |
| AC-004 | Runtime failure được phân biệt với mismatch và infrastructure failure            |
| AC-004 | Runtime error, timeout hoặc memory exhaustion dùng đúng verdict, không ACCEPTED  |
| AC-005 | Giữ nguyên executionId, submissionId và mode                                     |
| AC-006 | Result không làm lộ stdin ẩn, expected output hoặc harness                       |
| AC-007 | Workspace cleanup sau success và đường lỗi có thể phục hồi                       |
| AC-008 | Testcase rỗng không nhận ACCEPTED/điểm tối đa theo mặc định                      |
| AC-009 | Không báo memoryKb nếu sandbox không có metric đáng tin                          |
| AC-010 | Publish retry/redelivery giữ IDs/mode; duplicate terminal result được xử lý      |

Kiểm tra RUN không có expected output không bị kết luận `WRONG_ANSWER` là evidence cho FR-007/021 và quyết định D-02; đây không phải AC riêng trong spec.
