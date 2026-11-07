# JDG-003 Tasks Function Judge

**Trạng thái:** Chưa thực hiện. Phụ thuộc [spec Approved v1.0](./spec.md), [plan reviewed](./plan.md), JDG-001/002/005.

## Cổng trước triển khai

- [x] Chốt callable signature/entrypoint cho C/C++/Java/Python, source/harness layout, assertion mapping, process state và library policy — xong 2026-10-07 theo [REVIEW.md](../REVIEW.md) D-09; ghi vào FR-007/008/013 của spec.
- [x] Multi-file ngoài phạm vi (FR-013); nếu sau này cần, duyệt thay đổi `JudgeRequest` với Learning/Submission trước khi code.
- [ ] Xác nhận spec Approved, plan được review, kiến trúc Judge và trạng thái worktree.

## Chuẩn bị và đánh giá FUNCTION

- [ ] Validate `problemType=FUNCTION`, language, harness bắt buộc, size/limits; thiếu harness không fallback STANDARD (FR-001/002).
- [ ] Chuẩn bị source/harness theo contract language đã duyệt bằng trusted filenames/commands; không nhận layout từ client (FR-003/005).
- [ ] Compile trong Sandbox; phân biệt lỗi source với harness/configuration bằng cơ chế đã duyệt (FR-007/012).
- [ ] Truyền stdin thô từng testcase cho harness; so stdout với expected output theo JDG-001 (FR-009/010).
- [ ] Áp verdict/score/count/runtime và assertion mapping theo JDG-001/002/005; cô lập testcase theo policy (FR-006/008/011).
- [ ] Lọc result/diagnostics/log để không tiết lộ harness/hidden test (FR-004/012).

## Kiểm chứng và tài liệu

- [ ] Kiểm chứng AC-001..005 với mỗi language, thiếu harness, sai signature, compile user/harness, assertion và resource exhaustion.
- [ ] Đối chiếu FR/AC, source ownership và Out of Scope; cập nhật contract docs nếu có thay đổi.
- [ ] Chạy `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` khi triển khai; cập nhật tasks/worked entry.

## N/A theo phạm vi

- [x] N/A — Database/migration/repository: Judge stateless; Learning sở hữu harness.
- [x] N/A — API/Swagger/realtime: JDG-003 dùng message nội bộ; Submission/Gateway sở hữu client flow.

## Checklist triển khai chi tiết

Đây là task phân rã theo FR/AC, không thay thế việc chốt callable contract ở phần Cổng. Những quyết định về signature/layout phải được đưa vào spec Approved trước khi bắt đầu implementation.

### A. Callable contract và request preparation

- [ ] **JDG003-T01 — Chốt contract theo language:** ghi callable signature, tên hàm/class, type mapping, visibility, entrypoint và giới hạn thư viện cho C/C++/Java/Python.
- [ ] **JDG003-T02 — Chốt source/harness layout:** quyết định một file hay multi-file, tên file/package/import, cách truyền source và harness qua contract; nếu cần đổi `JudgeRequest`, có compatibility review Learning/Submission.
- [ ] **JDG003-T03 — Chốt assertion/error semantics:** phân biệt assertion fail, exception/runtime lỗi user, harness lỗi, expected exception và compile error.
- [ ] **JDG003-T04 — Chốt process/test isolation:** quy định một process cho mỗi testcase hay nhiều testcase; nêu rõ state được giữ/xóa theo spec.
- [ ] **JDG003-T05 — Validate request:** chỉ nhận `problemType=FUNCTION`, language được hỗ trợ, harness bắt buộc và giới hạn LRN-002; invalid payload bị từ chối trước workspace.
- [ ] **JDG003-T06 — Chuẩn bị file an toàn:** tạo layout từ template tin cậy; tên/path do adapter quyết định; source/harness không thể ghi đè file hệ thống hoặc compiler command.

### B. Compile và execute strategy

- [ ] **JDG003-T07 — Chọn runner:** dispatch qua JDG-002 registry; không tự tạo compiler command riêng trong evaluator.
- [ ] **JDG003-T08 — Compile trong Sandbox:** compile source và harness theo thứ tự/layout đã chốt; truyền provenance đủ để core phân biệt lỗi source và lỗi harness/toolchain.
- [ ] **JDG003-T09 — Phân loại compile failure:** lỗi bài làm trả mapping đã duyệt; lỗi harness/configuration là lỗi hệ thống; không dựa riêng vào exit code.
- [ ] **JDG003-T10 — Chạy testcase:** gửi stdin nguyên văn tới harness; harness gọi callable và in stdout; so stdout/expected output bằng comparator JDG-001.
- [ ] **JDG003-T11 — Cô lập testcase:** reset process/workspace/state đúng policy; bảo đảm testcase trước không làm sai kết quả testcase sau ngoài contract.
- [ ] **JDG003-T12 — Result/error filtering:** reuse result policy JDG-001; không trả hidden harness/test/stdin hoặc diagnostic có source/path nhạy cảm.
- [ ] **JDG003-T13 — Cleanup:** gọi sandbox cleanup sau compile/test success và mọi lỗi; chuyển cleanup failure theo policy JDG-001/005.

### C. Kiểm chứng và hoàn tất

- [ ] **JDG003-T14 — Contract fixtures:** tạo fixture hợp lệ cho từng language thể hiện callable signature, harness wiring, stdin/output và edge case theo spec Approved.
- [ ] **JDG003-T15 — Compile provenance tests:** cover user syntax/type error, harness syntax/config error, missing callable/signature mismatch và toolchain failure.
- [ ] **JDG003-T16 — Runtime/assertion tests:** cover đúng kết quả, assertion fail, exception, expected exception (nếu spec có), timeout và resource limit.
- [ ] **JDG003-T17 — Multi-test isolation tests:** chạy nhiều testcase với input khác nhau, kiểm tra state lifecycle theo quyết định.
- [ ] **JDG003-T18 — Security tests:** xác nhận source/harness cùng bị sandbox giới hạn; không có host path/network/privilege hoặc dữ liệu hidden trong result/log.
- [ ] **JDG003-T19 — Traceability/DoD:** liên kết FR-001..012 và AC-001..005 tới test/evidence; chạy DoD khi có code; cập nhật plan/tasks/worked entry.

### Ma trận kiểm chứng tối thiểu

| AC     | Bằng chứng                                                               |
| ------ | ------------------------------------------------------------------------ |
| AC-001 | FUNCTION hợp lệ gọi implementation theo contract language đã khai báo    |
| AC-002 | Thiếu harness không bị chạy như STANDARD                                 |
| AC-003 | Harness và hidden test không xuất hiện trong result/log hướng client     |
| AC-004 | Harness/submission cùng chịu sandbox timeout và resource limits          |
| AC-005 | Compile/runtime/test failures được phân loại theo contract chung đã chốt |

Stdin thô, expected stdout, assertion semantics và cleanup được kiểm tra theo FR-005/008..011; chúng không được gán nhầm thành AC riêng.
