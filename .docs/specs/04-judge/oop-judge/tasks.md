# JDG-004 Tasks OOP Judge

**Trạng thái:** Chưa thực hiện. Phụ thuộc [spec Approved v1.0](./spec.md), [plan reviewed](./plan.md), JDG-001/002/005.

## Cổng trước triển khai

- [x] Chốt contract scope (thuộc Learning), stdin format, single-file layout, process state và error mapping — xong 2026-10-07 theo [REVIEW.md](../REVIEW.md) D-10; ghi vào FR-005/006 và Quy tắc nghiệp vụ của spec.
- [x] Multi-file ngoài phạm vi; mở `JudgeRequest` chỉ khi có contract change duyệt với Learning/Submission.
- [ ] Xác nhận spec Approved, plan được review, kiến trúc Judge và trạng thái worktree.

## Chuẩn bị và đánh giá OOP

- [ ] Validate OOP request/harness/language/testcase/limits; không fallback STANDARD/FUNCTION (FR-001/002).
- [ ] Chuẩn bị source/harness bằng trusted filenames/commands theo contract đã duyệt (FR-001/005).
- [ ] Compile trong Sandbox; phân biệt lỗi user code với harness/configuration (FR-006/007/011).
- [ ] Truyền stdin thô cho harness, so stdout với expected output qua JDG-001 (FR-008/009).
- [ ] Áp quy tắc state/process độc lập và verdict/score/count/runtime theo JDG-001/005.
- [ ] Giới hạn/ẩn diagnostics, stdout/stderr và hidden harness/test theo policy (FR-003/004/010).

## Kiểm chứng và tài liệu

- [ ] Kiểm chứng AC-001..005 với mỗi language, thiếu harness, sai class/signature, state giữa test, compile user/harness và resource exhaustion.
- [ ] Đối chiếu FR/AC, service ownership và Out of Scope; cập nhật transport docs nếu contract đổi.
- [ ] Chạy `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` khi triển khai; cập nhật tasks/worked entry.

## N/A theo phạm vi

- [x] N/A — Database/migration/repository: Judge stateless; Learning sở hữu OOP contract/harness.
- [x] N/A — API/Swagger/realtime: JDG-004 dùng message nội bộ; Submission/Gateway sở hữu client flow.

## Checklist triển khai chi tiết

Task dưới đây phân rã FR/AC để review tiến độ. Contract OOP là dữ liệu do Learning sở hữu; không tự suy ra signature, serialization hay operation protocol trong implementation.

### A. OOP contract và preparation

- [ ] **JDG004-T01 — Chốt class contract:** định nghĩa class, constructor, method signatures, visibility, type mapping, package/module và entrypoint theo từng language.
- [ ] **JDG004-T02 — Chốt testcase protocol:** định nghĩa cú pháp stdin cho chuỗi thao tác, biểu diễn arguments/return values/errors và stdout format chính xác.
- [ ] **JDG004-T03 — Chốt file/state model:** quyết định multi-file contract, source/harness layout, process reuse và state giữa thao tác/testcase.
- [ ] **JDG004-T04 — Chốt error mapping:** phân biệt lỗi compile user/harness, method/class không tồn tại, assertion, exception và lỗi configuration/toolchain.
- [ ] **JDG004-T05 — Contract compatibility:** nếu cần field multi-file/metadata, phối hợp Learning/Submission sửa và version contract trước khi triển khai.
- [ ] **JDG004-T06 — Validate request:** chỉ nhận `problemType=OOP`, language/testcases/limits hợp lệ và harness cần thiết; không fallback sang STANDARD/FUNCTION.
- [ ] **JDG004-T07 — Tạo trusted layout:** file/class/package names được xác định bởi contract và adapter, không từ payload tự do; kiểm tra không ghi đè vùng ngoài workspace.

### B. Compile, execute, result

- [ ] **JDG004-T08 — Dispatch runner:** dùng registry JDG-002 và Sandbox JDG-005; giữ command/image ngoài core OOP.
- [ ] **JDG004-T09 — Compile và provenance:** biên dịch source+harness theo layout; giữ đủ thông tin để phân biệt nguồn lỗi user với harness/configuration.
- [ ] **JDG004-T10 — Thực thi operation sequence:** chuyển stdin thô tới harness; harness diễn giải giao thức đã Approved, khởi tạo/call object và in stdout theo contract.
- [ ] **JDG004-T11 — State isolation:** áp lifecycle process/object/workspace đã duyệt cho từng operation/testcase; không dùng state ngầm ngoài spec.
- [ ] **JDG004-T12 — Compare/classify:** so stdout với expected output qua comparator JDG-001; phân loại compile/runtime/assertion/timeout/resource trước comparator khi phù hợp.
- [ ] **JDG004-T13 — Build result/filter:** dùng verdict/score/count/mode policy JDG-001; lọc hidden harness, input/output và diagnostic.
- [ ] **JDG004-T14 — Cleanup:** đảm bảo sandbox/container/workspace được dọn trên mọi đường, gồm lỗi parse operation/harness và timeout.

### C. Kiểm chứng và hoàn tất

- [ ] **JDG004-T15 — Contract fixtures:** mỗi language có fixture thể hiện class construction, method call, input operation format và output format theo spec.
- [ ] **JDG004-T16 — OOP behavior tests:** cover constructor, nhiều method calls, method visibility/overload nếu spec hỗ trợ, sai signature/class và return values.
- [ ] **JDG004-T17 — State tests:** kiểm tra state trong cùng operation sequence và reset/giữ state giữa testcase đúng quyết định.
- [ ] **JDG004-T18 — Error provenance tests:** phân biệt user compile/runtime, harness/configuration, malformed operation và toolchain failure.
- [ ] **JDG004-T19 — Sandbox/security tests:** kiểm tra timeout/resource exhaustion, không lộ hidden contract/data và cleanup.
- [ ] **JDG004-T20 — Traceability/DoD:** gắn FR-001..011, AC-001..005 với tests/evidence; chạy DoD khi có code; cập nhật plan/tasks/worked entry.

### Ma trận kiểm chứng tối thiểu

| AC     | Bằng chứng                                                                   |
| ------ | ---------------------------------------------------------------------------- |
| AC-001 | Request dùng đúng OOP harness và contract theo language                      |
| AC-002 | Thiếu/sai harness không bị diễn giải thành STANDARD                          |
| AC-003 | Evaluation không làm lộ harness hoặc hidden tests                            |
| AC-004 | Submission và harness cùng chịu isolation/resource ceiling                   |
| AC-005 | Error được phân biệt theo nguồn user code, configuration hoặc infrastructure |

Operation protocol, stdout/expected output và state lifecycle được kiểm tra theo FR-005/008/009/011; không gán các hành vi này nhầm vào AC-003/004.
