# JDG-004 Kế hoạch OOP Judge

## Trạng thái và đặc tả liên quan

**Reviewed.** [JDG-004 spec v1.0](./spec.md) đã `Approved` ngày 2026-10-07 theo
[`REVIEW.md`](../REVIEW.md); contract scope, single-file layout và mapping lỗi (D-10) đã chốt, plan
này là căn cứ triển khai.

## Service đích và kiến trúc bắt buộc

Judge — **Hexagonal Architecture (Ports & Adapters) + Pipeline** theo [ADR 0002](../../../adr/0002-revised-service-internal-architectures.md). OOP là chiến lược prepare/evaluate của Judge core, dùng lại LanguageRunner/Sandbox; không tạo service, database, entity hoặc repository.

## Hiện trạng và phạm vi thay đổi

- `JudgeEngine` hiện ghép source và hidden harness thành một chuỗi, không có OOP-specific parser/evaluator hoặc quy tắc state. `JudgeRequest` chỉ có một `sourceCode`/`hiddenHarness`; không hỗ trợ danh sách file.
- LRN-001 sở hữu contract OOP theo ngôn ngữ; LRN-002 sở hữu harness và quy định stdin thô cho harness, stdout của harness so với expected output.
- Thêm kiểm tra `problemType=OOP`, harness bắt buộc và một strategy riêng khi các quy tắc OOP thật đã được duyệt. Không giả định reflection, serialization, package/import hay giao thức thao tác.

## Core và adapter

1. Validate OOP request, harness, language, testcase và limits. Payload thiếu harness không được đi qua STANDARD/FUNCTION.
2. Chọn runner JDG-002; chuẩn bị source/harness theo file/class/package layout đã duyệt bằng tên file và lệnh do nền tảng kiểm soát.
3. Compile trong Sandbox JDG-005; phân biệt lỗi user code với harness/configuration theo policy provenance được duyệt.
4. Truyền stdin nguyên văn cho harness; harness tự diễn giải chuỗi thao tác OOP và in stdout; core so với expected output bằng comparator JDG-001.
5. Quyết định lifecycle process/state cho mỗi testcase theo spec đã duyệt, không để test chia sẻ state ngoài chủ ý của contract.
6. Trả verdict, counts, score và số liệu như JDG-001; lọc diagnostics/output, không gửi harness/hidden tests.

Chỉ tạo `OopEvaluator`/preparer nếu chứa quy tắc khác FUNCTION/STANDARD. Reuse compile, sandbox, comparator và result construction, không nhân bản pipeline.

## Contract, quyền và lưu trữ

- Nếu contract OOP cần nhiều file/class hoặc metadata ngoài `JudgeRequest`, phải sửa transport contract có versioning/compatibility với Submission và Learning trước khi triển khai.
- Learning sở hữu class/method signature, starter code, harness và Test Case; Judge không tự định nghĩa đề bài. Submission sở hữu lịch sử/điểm chính thức.
- Không có API/Swagger, database/migration/repository hoặc realtime trong JDG-004. Consumer nội bộ validate payload; không truy cập DB khác.

## Messaging, lỗi và bảo mật

Dùng topology `judge.request`/`judge.result` của JDG-001, không thêm event. Lỗi user compile là `COMPILE_ERROR`; harness/configuration failure là `INTERNAL_ERROR` sau khi phân biệt được; assertion/runtime/timeout/resource theo policy đã duyệt. Cả harness và user code chạy trong cùng sandbox restrictions, không host/network privilege. Diagnostic filtering phải ngăn lộ hidden source/input.

## Truy vết và kiểm chứng

| Nhóm yêu cầu           | Kiểm chứng sau khi duyệt                                         |
| ---------------------- | ---------------------------------------------------------------- |
| FR-001/002, AC-001/002 | OOP contract theo language; harness bắt buộc, không fallback     |
| FR-003/004/010, AC-003 | Sandbox trust boundary và không lộ harness/hidden tests          |
| FR-005/008/009         | Thứ tự/normalization, stdin thô và expected stdout theo contract |
| FR-006/007/011, AC-005 | Phân biệt compile/runtime/resource failure theo nguồn            |

Kiểm chứng constructor/method/visibility/package, multi-test state, lỗi riêng user/harness và C/C++/Java/Python theo contract đã chốt. Các script kiểm chứng chỉ chạy khi triển khai.

## Thứ tự, rủi ro và tuân thủ kiến trúc

1. Chốt contract OOP theo từng language, stdin operation format, file layout, state và error mapping; phê duyệt spec.
2. Review thay đổi transport contract với Learning/Submission nếu cần.
3. Thêm OOP strategy trong core trên runner/sandbox ports đã có.
4. Kiểm chứng FR/AC, bảo mật và compatibility; cập nhật tasks/worked entry.

Rủi ro chính là contract một chuỗi source/harness không đủ biểu diễn bài OOP nhiều file và lỗi harness bị nhầm thành lỗi bài làm. Không tự mở rộng contract hoặc áp cơ chế runtime ngoài spec. Core giữ độc lập với Docker/RabbitMQ.

## Lát cắt triển khai và điểm chạm dự kiến

| Lát cắt                      | Điểm chạm dự kiến                                                                       | Đầu ra review được                                                                    | Điều kiện bắt đầu                                       |
| ---------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 1. OOP/transport contract    | `libs/contracts/src/judge.contracts.ts` nếu cần; contract tests với Learning/Submission | Class/method/input-operation/file/state contract đã chốt                              | D-10 được chốt; contract change có compatibility review |
| 2. Validation và preparation | `judge.consumer.ts` hoặc validation stage; `judge.engine.ts`                            | OOP request đúng type được dựng thành trusted files/layout; invalid request bị reject | Spec Approved; JDG-001 validation policy ổn định        |
| 3. OOP execution strategy    | `judge.engine.ts`; evaluator/preparer riêng chỉ khi có policy OOP riêng                 | Harness diễn giải operation input, gọi class/method và tạo stdout theo contract       | Runner JDG-002/Sandbox JDG-005 sẵn sàng                 |
| 4. Verdict/error/result      | policy JDG-001 và compiler provenance từ JDG-002                                        | Phân biệt lỗi user/harness/runtime; field được lọc theo mode                          | Error/state semantics đã Approved                       |
| 5. Language/state matrix     | tests/fixtures C/C++/Java/Python                                                        | AC evidence cho constructors, calls, multiple operations/testcases và isolation       | Lát cắt 1–4 hoàn tất                                    |

Không giả định reflection, serialization, naming convention hay state lifecycle. Nếu OOP contract cần file list/metadata mà message chưa có, việc mở rộng `JudgeRequest` phải được duyệt với Learning/Submission trước khi code.
