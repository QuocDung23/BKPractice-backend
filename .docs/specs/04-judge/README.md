# Judge Service — Tổng quan SRS

## Mục đích

Judge là worker tính toán bất đồng bộ của BKPractice. Nó nhận yêu cầu chấm đáng tin cậy từ
Submission, biên dịch và chạy mã người học trong sandbox, đánh giá các Test Case, phân loại kết quả,
rồi gửi kết quả lại Submission. Judge không cung cấp API công khai, không sở hữu Problem/Test Case,
lịch sử nộp bài hay tiến độ học tập, và không có cơ sở dữ liệu nghiệp vụ.

## Bối cảnh dự án

BKPractice là nền tảng luyện tập lập trình, gồm API Gateway và các service Identity, Learning,
Submission, Judge, Community. Learning sở hữu Problem, loại Problem, ngôn ngữ được bật, giới hạn
thực thi, Test Case, expected output và harness ẩn. Submission xác thực yêu cầu người dùng, lấy
judge package từ Learning, sở hữu vòng đời Run/Submit và lưu kết quả chính thức. Judge chỉ nhận
payload nội bộ từ Submission; Gateway/client không được gửi hoặc nhận dữ liệu judge ẩn.

Luồng chính:

```text
Client -> Gateway -> Submission -> Learning (judge package nội bộ)
                              -> RabbitMQ judge.request -> Judge
                              <- RabbitMQ judge.result <- Judge
                  -> lưu kết quả / realtime / sự kiện tiến độ
```

Run và Submit cùng dùng Judge. Run dùng stdin của người dùng và không tạo tiến độ; Submit dùng bộ
Test Case của Problem. Judge thực thi cả hai theo yêu cầu được gửi, nhưng không quyết định ý nghĩa
nghiệp vụ của Run/Submit hay trạng thái tiến độ.

### Vai trò và quyền sở hữu

| Thành phần | Sở hữu / trách nhiệm                                                                  | Không sở hữu                                                 |
| ---------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Gateway    | Xác thực người dùng, định tuyến REST và realtime                                      | Thực thi mã, dữ liệu Problem, trạng thái bài nộp             |
| Learning   | Problem, loại Problem, language được bật, limits, Test Case, expected output, harness | Mã nguồn, thực thi và kết quả Submission                     |
| Submission | Run/Submit, gọi Learning, tạo request, lưu và áp dụng kết quả                         | Compiler, sandbox, truy cập DB Learning                      |
| Judge      | Chọn runner, compile/execute, evaluate, phân loại, publish kết quả                    | Problem/Test Case lâu dài, lịch sử, tiến độ, điểm Assignment |
| RabbitMQ   | Chuyển message tin cậy giữa Submission và Judge                                       | Nguồn chân lý cho trạng thái Submission                      |

### Luồng xử lý

1. Gateway chuyển yêu cầu người dùng đến Submission. Với Run, Submission chuẩn bị một testcase từ
   stdin đã được người dùng cung cấp; với Submit, Submission lấy judge package qua kênh nội bộ của
   Learning.
2. Submission tạo `JudgeRequest` mang execution/submission IDs, mode, problem type, language,
   source, testcase/harness và limits; request được gửi lên exchange `bkpractice.judge` với routing
   key `judge.request`.
3. Judge consumer đọc queue `judge.requests`. Core kiểm tra request trước khi mở workspace, chọn
   language adapter, compile nếu cần, chạy các testcase và dựng `JudgeResult`.
4. Judge publish result lên exchange `bkpractice.submission` với routing key `judge.result` và
   message ID lấy từ `executionId`. Submission tiêu thụ queue `submission.results`, xác thực/áp dụng
   kết quả và tự quyết định persistence, realtime và progress event.
5. Judge không nhận phản hồi đồng bộ tới người học. Mọi trường có thể công khai đều đi qua các policy
   của Submission/Gateway; dữ liệu judge ẩn không được trả về client.

Topology đang có durable direct exchanges/queues, manual ACK, publisher confirms, prefetch 1 và
retry tối đa ba lần trước dead-letter. Đây là hiện trạng code nền; chính sách retry/duplicate/poison
đã được chốt tại [REVIEW.md](REVIEW.md) mục D-07.

## Phạm vi tài liệu

Cả năm đặc tả dưới đây đã ở trạng thái `Approved` 1.0 (2026-10-07); README này là mục lục và bối cảnh,
không thay thế chúng. Plan đã `Reviewed`, tasks là checklist triển khai; các mục quyết định trong cổng
trước triển khai đã chốt.

Kết quả duyệt và các quyết định D-01…D-11 nằm trong [phiếu duyệt](REVIEW.md). Việc triển khai vẫn phải
tuân [`.docs/agent/working-agreement.md`](../../agent/working-agreement.md).

| Mã      | Đặc tả                                       | Phạm vi                                                            |
| ------- | -------------------------------------------- | ------------------------------------------------------------------ |
| JDG-001 | [Chấm bài chuẩn](standard-judge/spec.md)     | Pipeline chấm, chuẩn hoá/so khớp output, dừng sớm, điểm và verdict |
| JDG-002 | [Language runners](language-runners/spec.md) | Danh mục ngôn ngữ, biên dịch và chạy theo adapter đáng tin cậy     |
| JDG-003 | [Function judge](function-judge/spec.md)     | Chấm bài kiểu FUNCTION bằng harness ẩn                             |
| JDG-004 | [OOP judge](oop-judge/spec.md)               | Chấm bài kiểu OOP bằng harness ẩn                                  |
| JDG-005 | [Sandbox](sandbox/spec.md)                   | Cách ly, giới hạn tài nguyên, timeout, output và dọn dẹp           |

## Thuật ngữ và contract hiện có

- Ngôn ngữ hiện có: `c`, `cpp`, `java`, `python`.
- Loại Problem: `STANDARD`, `FUNCTION`, `OOP`.
- Verdict hiện có: `ACCEPTED`, `WRONG_ANSWER`, `COMPILE_ERROR`, `RUNTIME_ERROR`,
  `TIME_LIMIT_EXCEEDED`, `MEMORY_LIMIT_EXCEEDED`, `INTERNAL_ERROR`.
- `JudgeRequest` mang `executionId`, `submissionId`, `mode`, loại Problem, ngôn ngữ, mã nguồn,
  danh sách Test Case, harness tùy chọn và giới hạn thời gian/bộ nhớ.
- `JudgeResult` mang định danh, mode, verdict và các trường kết quả tùy chọn.
- `mode=RUN` là lượt chạy thử của Submission; `mode=SUBMIT` là lượt chấm chính thức. Mode không
  thay đổi quyền sở hữu nghiệp vụ của Submission.
- `STANDARD` truyền testcase stdin cho chương trình đầy đủ. `FUNCTION`/`OOP` truyền stdin thô tới
  harness; harness in kết quả cần so với expected output theo LRN-002.
- Đây là mô tả hình dạng contract hiện có; contract không tự quyết định các chính sách sản phẩm
  còn mở trong các spec.

### Các lớp kết quả

| Nhóm         | Verdict                                                                          | Ý nghĩa cần bảo toàn                                                             |
| ------------ | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Đúng         | `ACCEPTED`                                                                       | Tất cả testcase được yêu cầu đã đạt theo policy cuối cùng                        |
| Sai đáp án   | `WRONG_ANSWER`                                                                   | Chương trình chạy nhưng output không khớp                                        |
| Lỗi lời giải | `COMPILE_ERROR`, `RUNTIME_ERROR`, `TIME_LIMIT_EXCEEDED`, `MEMORY_LIMIT_EXCEEDED` | Có thể quy cho mã người học theo bằng chứng runner/sandbox                       |
| Lỗi hệ thống | `INTERNAL_ERROR`                                                                 | Không thể kết luận do payload/runner/sandbox/hạ tầng; không phải kết quả học tập |

`JudgeStatus` hiện không có verdict riêng cho invalid request, output-limit, sandbox unavailable,
harness failure hoặc cancellation. Các spec đề xuất mapping tới status hiện có và đánh dấu câu hỏi
nào cần thêm/thay contract trước khi được Approved.

## Ranh giới và ràng buộc xuyên suốt

- Judge là phép biến đổi stateless `JudgeRequest -> JudgeResult`; không có entity, repository hay
  database nghiệp vụ.
- Submission là caller và owner của vòng đời; Learning là owner của Problem và dữ liệu chấm.
- Judge không gọi Learning, Gateway hoặc client, và không truy cập database của service khác.
- Chỉ adapter ngôn ngữ và lệnh tin cậy được chọn; dữ liệu mã nguồn/stdin không được diễn giải như
  tên file, shell command, compiler command hay tham số Docker.
- Test Case ẩn, expected output, harness, compiler diagnostics thô và dữ liệu sandbox không được
  công khai qua API client. Judge result nội bộ chỉ mang thông tin cần cho Submission.
- Sandbox bắt buộc tắt mạng, giới hạn CPU/bộ nhớ/thời gian/PID/output, đặc quyền tối thiểu, workspace
  riêng và dọn dẹp tin cậy; không được chạy privileged.
- Kiến trúc bắt buộc: Hexagonal Architecture (Ports & Adapters) với pipeline trong core. Consumer
  là driving adapter; runner, sandbox và publisher là các ranh giới driven.

## Chất lượng dịch vụ và quan sát

- **Tính toàn vẹn kết quả:** mỗi result tham chiếu đúng execution/submission/mode đã nhận; Judge
  không được phát result cho một submission ID khác.
- **Cô lập:** hai request đồng thời không dùng chung writable workspace hoặc process/container.
- **Tính hữu hạn:** compile, mỗi lần execute, output capture, số process và tổng tài nguyên phải có
  giới hạn hữu hạn; giá trị cụ thể thuộc JDG-005.
- **Khả năng phục hồi:** lỗi publish không được ACK request như đã xử lý xong; delivery lại có thể
  xảy ra và không được làm mất kết quả đã publish. Semantics cụ thể phải tương thích Submission.
- **Quan sát an toàn:** log có thể chứa correlation/execution ID, stage và kết quả kỹ thuật đã lọc;
  không được chứa source, stdin/expected output ẩn, harness, access token hay bí mật cấu hình.
- **Không cam kết SLA số học:** throughput, concurrency tối đa và latency percentile chưa được
  định nghĩa; không tự suy ra từ prefetch hiện tại.

## Nguồn có thẩm quyền

- [Kiến trúc hệ thống](../../architecture/system-architecture.md)
- [Kiến trúc Judge](../../architecture/judge-service.md)
- [ADR 0002](../../adr/0002-revised-service-internal-architectures.md)
- [Bảo mật Judge](../00-system/judge-security.md)
- [Problem](../02-learning/problems/spec.md) và [Test Case](../02-learning/test-cases/spec.md)
- [Run Code](../03-submission/run-code/spec.md) và [Submit Code](../03-submission/submit-code/spec.md)

## Trạng thái và cách sử dụng

Đây là bộ SRS đã Approved dựa trên hợp đồng và tài liệu hiện có. Các mục **Quyết định khi duyệt** trong
từng spec ghi chính sách đã chủ sở hữu repo chốt ngày 2026-10-07; thay đổi chúng cần một phiên bản
spec mới và quyết định mới, không được tự giải quyết bằng cách coi hành vi code hiện tại là yêu cầu.
Plan/tasks đã được đối chiếu với spec v1.0; checklist triển khai nằm trong từng `tasks.md`. Deviation
giữa code hiện tại và spec được liệt kê trong [REVIEW.md](REVIEW.md) và phải sửa khi triển khai.
