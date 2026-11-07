# JDG-001 Kế hoạch Chấm bài chuẩn

## Trạng thái và đặc tả liên quan

**Reviewed.** [JDG-001 spec v1.0](./spec.md) đã `Approved` ngày 2026-10-07 theo
[`REVIEW.md`](../REVIEW.md); stop-on-first-failure, comparator, scoring, output và messaging policy
(D-01…D-07) đã chốt, plan này là căn cứ triển khai.

## Service đích và kiến trúc bắt buộc

- Service: Judge.
- Kiến trúc: **Hexagonal Architecture (Ports & Adapters) + Pipeline** theo [ADR 0002](../../../adr/0002-revised-service-internal-architectures.md) và [Judge architecture](../../../architecture/judge-service.md).
- Luồng: RabbitMQ consumer (driving adapter) → core orchestration/pipeline → LanguageRunner/Sandbox/ResultPublisher ports → adapters. Không có DDD entity, repository hoặc database nghiệp vụ.

## Ảnh hưởng tới mã nguồn hiện có

| Thành phần                 | Hiện trạng                                                                                           | Hướng triển khai theo spec Approved                                                                                           |
| -------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `judge.consumer.ts`        | Nhận `JudgeRequest` qua queue và publish result trực tiếp                                            | Deserialize/validate ở transport boundary, gọi một operation core, quản lý delivery; publish sau confirmation                 |
| `judge.engine.ts`          | Tạo workspace, chọn runner, compile, execute/evaluate, trả result; phụ thuộc Docker và ConfigService | Giữ orchestration gọn, tách policy đánh giá/validation khi có hành vi thật; dùng Sandbox port và dữ liệu cấu hình đã validate |
| `output-normalizer.ts`     | CRLF → LF, `trimEnd()`                                                                               | Đặt quy tắc comparator theo spec đã duyệt; giữ riêng policy Judge, chỉ dùng shared helper nếu nó là utility kỹ thuật thực sự  |
| `compiler-error.parser.ts` | Lấy line/column/message từ compiler output                                                           | Lọc host path/source/harness và giới hạn diagnostic trước result                                                              |
| `rabbitmq.service.ts`      | Confirm publish, manual ACK, retry 3 lần, dead-letter                                                | Dùng topology hiện có; nếu policy Judge cần khác, đổi trong ranh giới Judge hoặc xin scope chung, tránh làm đổi service khác  |

## Core và pipeline

1. Kiểm tra shape, enum, IDs, mode, problem type, source, testcase count/size, expected output/harness theo mode/type, time/memory limits; với Submit áp tối đa 100 testcase, 1 MiB mỗi stdin/expected output và 8 MiB gói testcase/harness theo LRN-002. Lỗi không chạy mã.
2. Tạo context execution tạm và chọn `LanguageRunner` từ whitelist; runner định nghĩa trusted filename/commands.
3. Gọi Sandbox port để compile một lần khi runner yêu cầu; tách lỗi user source với lỗi image/host/harness theo JDG-002/003/004.
4. Chạy testcase theo thứ tự, truyền stdin nguyên văn, đọc outcome kỹ thuật. Timeout/resource/exit outcome được phân loại trước comparator.
5. Với process thành công, so stdout với expected output theo comparator được duyệt. `RUN` thiếu expected output không thể nhận `WRONG_ANSWER`; trạng thái hoàn tất Run còn cần chốt với SUB-001.
6. Đếm passed/total, tính score và runtime theo policy được duyệt. Không gán score 100/default khi thiếu dữ liệu. Cơ chế stop/continue phải đúng quyết định cuối cùng.
7. Dựng result có ID/mode gốc, lọc fields theo mode. Đặc biệt, stdout/stderr Submit có thể phản chiếu hidden stdin nên chỉ gửi nếu policy lọc/quyền đọc được duyệt.
8. Dọn workspace/container trên mọi đường thành công/thất bại theo JDG-005. Không để cleanup failure âm thầm mất result.

Core có thể giữ ở `JudgeEngine` trong giai đoạn đầu; chỉ tách evaluator/stage khi STANDARD/FUNCTION/OOP cần khác nhau thật. Không tạo class/port giả để đồng bộ sơ đồ.

## Các port và adapter

| Port/seam          | Lý do                                                             | Adapter hiện có hoặc dự kiến                                        |
| ------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------- |
| `LanguageRunner`   | Bốn ngôn ngữ thật cần command/file riêng                          | Runner registry + C/C++/Java/Python (JDG-002)                       |
| `Sandbox`          | Tách policy Judge khỏi Docker và kiểm chứng core không cần Docker | Docker adapter (JDG-005)                                            |
| Result publication | FR-022/023 yêu cầu confirm/ACK và retry an toàn                   | RabbitMQ adapter; chỉ tách port khi cần giữ core độc lập với broker |

## Contract, validation và quyền

- `JudgeRequest`/`JudgeResult` trong `libs/contracts` là transport contract dùng chung. Mọi thay đổi enum/field/version phải phối hợp Submission; không thêm field chỉ để phục vụ implementation.
- Parser JSON lỗi không có ID đáng tin sẽ đi bounded retry/DLQ. Payload có ID nhưng sai shape có thể tạo `INTERNAL_ERROR` chỉ sau khi chính sách poison message được duyệt.
- `executionId`/`submissionId`/`mode` được giữ nguyên trong result; submissionId không được lấy từ nội dung runtime.
- Consumer chỉ nhận queue nội bộ; client không có route Judge. Submission/Gateway xử lý xác thực người dùng. Judge vẫn kiểm tra message như dữ liệu không tin cậy tại ranh giới.
- `SUBMIT` nhận Test Case/expected output/harness/limits từ Learning qua Submission; `RUN` chỉ stdin người dùng qua Submission. Judge không gọi Learning hoặc DB Submission.

## Messaging và phân phối

- Nhận từ exchange `bkpractice.judge`, queue `judge.requests`, key `judge.request`; publish lên exchange `bkpractice.submission`, key `judge.result`, queue `submission.results`; dùng `executionId` làm messageId như contract hiện tại.
- ACK request sau publisher confirm của result. Lỗi broker có thể gây redelivery; Submission xử lý kết quả terminal idempotent. Judge stateless nên không tự lưu kết quả hay tạo bảng dedup.
- Số retry, backoff, poison message, cleanup failure sau publish, DLQ và kết quả stale phải được chốt trước implementation. Không thay đổi `RabbitMqService` dùng chung nếu chỉ Judge cần policy khác.

## Lưu trữ, migration, API, realtime

- Lưu trữ/migration: N/A — workspace tạm; không tạo business DB hoặc TypeORM migration.
- API/Swagger: N/A — Judge là worker nội bộ, không thêm REST route.
- Realtime: N/A — Submission/Gateway sở hữu Redis/Socket.IO.
- Domain entity: N/A — Judge là phép biến đổi stateless; verdict/scoring/comparison là policy của core, không phải aggregate.

## Xử lý lỗi và bảo mật

| Nguồn lỗi                                         | Hướng phân loại sau khi duyệt                                                           |
| ------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Source compile failure                            | `COMPILE_ERROR`                                                                         |
| Test output mismatch                              | `WRONG_ANSWER` theo stop/continue rule                                                  |
| Runtime exit, timeout, memory limit               | `RUNTIME_ERROR`, `TIME_LIMIT_EXCEEDED`, `MEMORY_LIMIT_EXCEEDED` theo bằng chứng Sandbox |
| Image/daemon/configuration/uncorrelatable payload | `INTERNAL_ERROR` nếu có ID; nếu không, poison-message route                             |
| Output limit, compile timeout, harness error      | Chặn trong câu hỏi mở; không tự chọn mapping                                            |

Không log source, stdin/expected output ẩn, harness, token hay raw compiler output. Diagnostics phải được giới hạn/lọc. JDG-005 thực thi mọi mã trong sandbox tắt mạng và giới hạn tài nguyên; Submission không thực thi mã.

## Truy vết và chiến lược kiểm chứng

| Nhóm yêu cầu                             | Kiểm chứng chính                                                           |
| ---------------------------------------- | -------------------------------------------------------------------------- |
| FR-001..006/019..021; AC-001/003/005/008 | Contract validation, pipeline, compile/test order, IDs/mode và empty tests |
| FR-007..012/018; AC-002/004/009          | Comparator/verdict/score/runtime/memory; metric chỉ khi đáng tin           |
| FR-013..016/025; AC-006                  | Result field filtering, diagnostics/log không lộ dữ liệu ẩn                |
| FR-017/022..024; AC-007/010              | Cleanup, publish confirm/ACK, retry/redelivery và duplicate delivery       |

Khi triển khai, kiểm chứng unit cho policy core, integration cho RabbitMQ/Sandbox, contract với Submission và các script `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` theo definition of done.

## Thứ tự triển khai và điều kiện chặn

1. Chốt câu hỏi JDG-001 về stop/score/comparator/Run status/output/memory/timeout/message delivery; đồng bộ với SUB-001/SUB-002/SUB-003 và duyệt spec.
2. Hoàn tất các port/adapter thật của JDG-002/JDG-005, cập nhật contract nếu quyết định đòi hỏi.
3. Implement validation/core pipeline/result filtering, rồi consumer delivery theo policy đã duyệt.
4. Kiểm chứng FR/AC, bảo mật và biên dịch từng language; cập nhật tasks/worked entry.

## Rủi ro và tuân thủ kiến trúc

Rủi ro lớn nhất là JudgeResult chứa stdout Submit có thể làm lộ input ẩn, và Rabbit redelivery có thể chạy lại code hoặc tạo result khác nếu state bên ngoài thay đổi. Spec Approved chốt: Judge gửi stdout/stderr cho cả hai mode, quyền xem thuộc SUB-003; trùng executionId không tính lại. Consumer mỏng; core không phụ thuộc Docker/RabbitMQ/ConfigService; adapters triển khai các port; không có truy cập DB service khác hoặc entity dùng chung.

## Lát cắt triển khai và điểm chạm dự kiến

Thứ tự dưới đây là thứ tự phụ thuộc, không thay đổi yêu cầu trong spec. Tên file là điểm bắt đầu dựa trên cấu trúc hiện tại; chỉ thêm file mới khi có trách nhiệm riêng được chứng minh.

| Lát cắt                   | Điểm chạm dự kiến                                                                                                         | Đầu ra review được                                                       | Điều kiện bắt đầu                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------ |
| 1. Contract/validation    | `libs/contracts/src/judge.contracts.ts`, `apps/judge-service/src/modules/judge/judge.consumer.ts`, validation mới nếu cần | Request/result shape và validation trước side effect                     | D-01..D-07 + SUB/LRN contract đã chốt            |
| 2. Pipeline orchestration | `apps/judge-service/src/modules/judge/judge.engine.ts`, evaluator/policy chỉ khi cần                                      | Stage order rõ: validate → prepare/compile → execute → evaluate → result | JDG-002/005 ports và outcome contracts ổn định   |
| 3. Output/verdict policy  | `output-normalizer.ts`, `compiler-error.parser.ts`, policy/test tương ứng                                                 | Comparator, verdict precedence, score/metrics và result field allowlist  | Comparator/scoring/output policy Approved        |
| 4. Execution boundary     | Sandbox port/adapter theo JDG-005; runner registry theo JDG-002                                                           | Core gọi boundary thay vì Docker trực tiếp                               | Sandbox/runner implementation reviewed           |
| 5. Message delivery       | consumer/publisher boundary và contract tests; shared Rabbit adapter chỉ nếu scope được duyệt                             | Confirm trước ACK, poison/retry/duplicate behavior được chứng minh       | D-07 và Submission idempotency contract Approved |
| 6. Verification/docs      | tests cạnh module, `tasks.md`, `.docs/worked/judge/`                                                                      | Traceability FR/AC, DoD và remaining risks                               | Tất cả lát cắt code hoàn tất                     |

Không tạo repository/entity/database/API/realtime cho JDG-001. Contract enum/field change là dependency liên service và phải hoàn tất trước lát cắt 1; plan này không mặc định có migration hay field mới.
