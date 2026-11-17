# JDG-003 Kế hoạch Function Judge

## Trạng thái và đặc tả liên quan

**Reviewed.** [JDG-003 spec v1.0](./spec.md) đã `Approved` ngày 2026-10-07 theo
[`REVIEW.md`](../REVIEW.md); các câu hỏi mở (D-09) đã chốt, plan này là căn cứ triển khai.

## Service đích và kiến trúc bắt buộc

Judge — **Hexagonal Architecture (Ports & Adapters) + Pipeline** theo [ADR 0002](../../../adr/0002-revised-service-internal-architectures.md). FUNCTION là chiến lược evaluate/prepare của pipeline, dùng chung LanguageRunner và Sandbox thật; không tạo một service hoặc database riêng, không thêm DDD entity.

## Hiện trạng và phạm vi thay đổi

- `JudgeEngine` hiện ghép `sourceCode + '\n\n' + hiddenHarness` rồi chạy như STANDARD. Cách này không định nghĩa được đầy đủ file/module/class layout của bốn ngôn ngữ và không phân biệt lỗi code/harness.
- `JudgeRequest` hiện chỉ có một chuỗi `sourceCode` và `hiddenHarness`; `JudgeTestCase.stdin`/`expectedOutput` là chuỗi. LRN-002 đã Approved quy định harness tự đọc stdin thô và in stdout cần so.
- Plan sẽ bổ sung validation `problemType=FUNCTION` và harness bắt buộc, rồi chọn preparation/evaluation strategy theo callable contract đã được duyệt. Không tự thêm field contract đa file hoặc parser JSON.
- Nếu contract cuối cùng cần nhiều file/entrypoint, thay đổi `JudgeRequest` là hạng mục phối hợp Learning/Submission riêng, kèm compatibility review trước triển khai.

## Core và adapter

1. Nhận FUNCTION request đã được transport validate; kiểm tra harness có mặt, language được hỗ trợ, giới hạn kích thước theo LRN-002/JDG-005.
2. Chọn runner JDG-002, chuẩn bị source/harness bằng layout tin cậy theo language được duyệt. Tên file/package/import không đến từ client.
3. Compile bằng Sandbox JDG-005; nếu compile fail, phân biệt lỗi trong source người học với lỗi harness/configuration bằng cơ chế được chốt (ví dụ provenance của file/diagnostic), không suy từ exit code đơn độc.
4. Với mỗi testcase theo thứ tự, chuyển stdin nguyên văn cho harness. Harness gọi implementation, in stdout; core so với expected output theo comparator JDG-001.
5. Phân loại verdict, score, counts, runtime và result field filtering theo JDG-001; không trả harness/hidden tests qua result/log.

Chỉ thêm `FunctionEvaluator`/preparer nếu nó chứa chính sách riêng có thể kiểm chứng. Compilation/sandbox/normalization được dùng lại; không sao chép JudgeEngine thành một engine thứ hai.

## Lưu trữ, migration, API, quyền, realtime

N/A — Judge không có database/migration/API/realtime trong JDG-003. Learning sở hữu callable contract, Test Case/harness; Submission sở hữu Run/Submit/lịch sử. Message chỉ đến từ Submission nhưng payload vẫn được validate. Không đọc DB Learning hoặc trả harness cho Gateway/client.

## Messaging, lỗi và bảo mật

- Dùng `judge.request`/`judge.result` do JDG-001 định nghĩa; JDG-003 không thêm event/routing key.
- Thiếu harness hoặc payload sai không fallback STANDARD; map lỗi theo policy invalid request của JDG-001.
- Lỗi source compile là `COMPILE_ERROR`; harness/configuration compile là `INTERNAL_ERROR` sau khi phân biệt được nguồn. Assertion failure/expected exception cần quyết định mapping trước implementation.
- Toàn bộ source và harness chạy chung sandbox; không cấp host path/network/privilege cho harness. Diagnostics/log/result phải lọc source harness và hidden input/output.

## Truy vết và kiểm chứng

| Nhóm yêu cầu           | Cách kiểm chứng sau khi duyệt                                             |
| ---------------------- | ------------------------------------------------------------------------- |
| FR-001/002, AC-001/002 | FUNCTION contract và harness bắt buộc; thiếu harness không fallback       |
| FR-003/004, AC-003     | Harness là trusted input nhưng không lộ qua result/log hướng client       |
| FR-005/009/010         | Stdin thô vào harness; stdout được so với expected output theo contract   |
| FR-006/011, AC-004     | Verdict dùng chung và testcase/process isolation dưới sandbox limits      |
| FR-007/008/012, AC-005 | Phân biệt source/harness failure, assertion/test failure và kết quả chung |

Kiểm chứng C/C++/Java/Python với contract callable thật, input rỗng, nhiều testcase, compile error user/harness và resource exhaustion. Chạy các script hiện có khi triển khai theo definition of done.

## Thứ tự, rủi ro và tuân thủ kiến trúc

1. Chốt callable contract/language, layout source/harness, assertion mapping, process state và API/library policy; phê duyệt spec.
2. Xem có cần thay transport contract hay không; nếu có, phối hợp Learning/Submission và versioning.
3. Thêm preparation/evaluation strategy trong core, dùng runner/sandbox ports.
4. Kiểm chứng FR/AC, bảo mật, compatibility và cập nhật tasks/worked entry.

Rủi ro chính: ghép chuỗi hiện tại không bảo đảm compile đúng mọi language và không chứng minh được lỗi đến từ harness. Plan chỉ chốt cách ghép sau quyết định ở spec. Core không nhập Docker/RabbitMQ hoặc service internals; không có state lâu dài.

## Lát cắt triển khai và điểm chạm dự kiến

| Lát cắt                            | Điểm chạm dự kiến                                                                       | Đầu ra review được                                                                     | Điều kiện bắt đầu                                          |
| ---------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 1. Callable/transport contract     | `libs/contracts/src/judge.contracts.ts` nếu cần; contract tests với Learning/Submission | Callable signatures, file layout, harness contract, compatibility decision             | D-09 được chốt; contract đa file được review nếu phát sinh |
| 2. Type-specific validation        | `judge.consumer.ts` hoặc validation stage trong core                                    | FUNCTION chỉ nhận request đúng type/harness/limits, reject trước workspace             | Spec Approved, validation policy JDG-001 ổn định           |
| 3. Preparation/evaluation strategy | `judge.engine.ts`; thêm preparer/evaluator riêng chỉ khi cần                            | Trusted source+harness layout và flow FUNCTION rõ ràng                                 | Runner JDG-002 và Sandbox JDG-005 interfaces sẵn sàng      |
| 4. Error/result integration        | shared result/verdict policy tại JDG-001; contract tests                                | User compile vs harness/config failure, assertion/runtime mapping, no hidden-data leak | Error semantics đã Approved                                |
| 5. Language matrix verification    | tests/fixtures cho C/C++/Java/Python                                                    | Callable/harness fixtures và AC evidence mỗi language                                  | Lát cắt 1–4 hoàn tất                                       |

Không nhân đôi compile, comparator, scoring hoặc Docker logic. Không thêm parser/protocol/library ngoài callable contract đã Approved; nếu transport không đủ biểu diễn requirement, dừng tại contract review thay vì nhét dữ liệu vào chuỗi hiện có.
