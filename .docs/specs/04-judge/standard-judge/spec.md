# JDG-001 Chấm bài chuẩn

## Trạng thái

Approved — phiên bản 1.0, ngày 2026-10-07.

## Mục tiêu

Định nghĩa cách Judge xử lý một yêu cầu chấm hợp lệ cho Problem `STANDARD`, so sánh từng kết quả
chạy với expected output, dừng hoặc tiếp tục theo chính sách đã chốt, và trả verdict cùng số liệu
kết quả nội bộ cho Submission.

## Tác nhân

- **Submission Service:** hệ thống tin cậy phát `judge.request`, nhận `judge.result` và sở hữu vòng
  đời bản ghi Run/Submit.
- **Judge Service:** worker thực thi và phân loại kết quả.
- **Learning Service:** nguồn gốc của Test Case, expected output và execution limits; không gọi Judge
  trực tiếp.
- **Người học:** tác giả mã nguồn; không giao tiếp trực tiếp với Judge.

## Bối cảnh

Judge hiện nhận một request qua RabbitMQ, tạo workspace, chọn runner, biên dịch nếu cần, chạy từng
Test Case, chuẩn hoá output, rồi publish result. `STANDARD` là chương trình hoàn chỉnh đọc stdin và
ghi stdout. Submission quyết định trạng thái nghiệp vụ và xử lý điểm theo SUB-002; Judge chỉ báo
verdict và số liệu đã đánh giá.

## Luồng chuẩn

1. Nhận message từ queue và deserialize thành `JudgeRequest`.
2. Kiểm tra trường, enum, limits và quan hệ giữa mode/problem type/testcase. Payload không hợp lệ
   không được đi tới compiler/runtime.
3. Tạo workspace riêng, ghi source bằng filename do runner định nghĩa; payload không điều khiển
   đường dẫn hay command.
4. Compile một lần nếu runner yêu cầu. Compile failure kết thúc đánh giá.
5. Duyệt testcase theo thứ tự: truyền stdin, chạy trong sandbox, phân loại process outcome; nếu
   process thành công thì chuẩn hóa stdout và so với expected output.
6. Dừng đánh giá ở testcase sai đầu tiên; cộng passed count, score và runtime theo các testcase đã
   qua.
7. Tạo result mang định danh gốc, publish tới Submission; chỉ hoàn tất delivery sau publisher confirm.
   Workspace/container được cleanup trên mọi đường đi.

Compile một lần mỗi request. Testcase dùng chung artifact đã biên dịch và workspace của request;
mỗi testcase chạy một process/container riêng nên không chia sẻ state process giữa các testcase.

## Yêu cầu chức năng

- **JDG-001-FR-001 — Nhận yêu cầu nội bộ:** Judge MUST xử lý yêu cầu đến từ luồng `judge.request` nội
  bộ với contract `JudgeRequest`; MUST NOT cung cấp endpoint công khai để gửi mã thực thi.
- **JDG-001-FR-002 — Xác thực payload:** Judge MUST kiểm tra cấu trúc, enum, định danh, giới hạn và
  trường bắt buộc trước khi tạo workspace hay chạy mã. Payload sai nhưng còn đủ định danh để đối
  chiếu MAY tạo `INTERNAL_ERROR`; payload không thể đối chiếu MUST đi theo chính sách poison message
  đã duyệt. Cả hai trường hợp MUST NOT chạy mã.
- **JDG-001-FR-003 — Cách xử lý loại STANDARD:** Với `problemType=STANDARD`, Judge MUST chạy mã như
  chương trình độc lập; dữ liệu của mỗi Test Case được cấp qua stdin và kết quả chương trình được
  lấy từ stdout.
- **JDG-001-FR-004 — Pipeline xác định:** Một request hợp lệ MUST đi qua các bước kiểm tra, chuẩn bị,
  chọn runner, biên dịch khi cần, thực thi, đánh giá và phân loại theo thứ tự. Thất bại ở bước trước
  MUST không chạy các bước sau không còn ý nghĩa.
- **JDG-001-FR-005 — Biên dịch một lần:** Runner cần biên dịch MUST được biên dịch một lần cho mỗi
  request trước khi chạy Test Case. Lỗi biên dịch MUST kết thúc request với `COMPILE_ERROR`; biên
  dịch quá thời hạn MUST kết thúc với `TIME_LIMIT_EXCEEDED` theo JDG-002/JDG-005.
- **JDG-001-FR-006 — Test Case có thứ tự:** Judge MUST đánh giá Test Case theo thứ tự nhận từ
  Learning qua request; Judge MUST NOT sắp xếp lại. Test Case `SAMPLE` và `HIDDEN` do Learning gửi
  đều được đánh giá như nhau khi Submit theo LRN-002.
- **JDG-001-FR-007 — So sánh output:** Judge MUST so sánh stdout với `expectedOutput`; không so
  sánh stderr như output đáp án. Trước khi so, Judge MUST chuẩn hóa CRLF thành LF rồi loại bỏ toàn
  bộ whitespace cuối chuỗi (`trimEnd()`); whitespace ở giữa chuỗi MUST được giữ nguyên. Judge MUST
  KHÔNG áp chuẩn hóa Unicode. Testcase không có `expectedOutput` (RUN) MUST được coi là đạt phần
  so sánh này.
- **JDG-001-FR-008 — Verdict:** Judge MUST phân biệt ít nhất các trạng thái contract hiện có:
  `ACCEPTED`, `WRONG_ANSWER`, `COMPILE_ERROR`, `RUNTIME_ERROR`, `TIME_LIMIT_EXCEEDED`,
  `MEMORY_LIMIT_EXCEEDED`, `INTERNAL_ERROR`.
- **JDG-001-FR-009 — Đếm kết quả:** Result MUST báo `passedTests` và `totalTests` khi đánh giá bộ
  Test Case; test bị lỗi hoặc sai không được tính là passed.
- **JDG-001-FR-010 — Điểm:** Judge MUST báo điểm là tổng `score` của các Test Case đã đạt, cộng dồn
  theo thứ tự cho tới khi dừng; Judge MUST KHÔNG chuẩn hoá về thang cố định và MUST NOT dùng điểm
  để suy ra verdict. Judge MUST NOT biến một bộ Test Case rỗng thành một lần chấm đạt. Kết quả
  `ACCEPTED` với điểm 0 là hợp lệ theo SUB-002; Judge chỉ báo đúng số đo, không tự gán điểm mặc định.
- **JDG-001-FR-011 — Thời gian:** `runtimeMs` MUST là tổng thời gian thực thi của các Test Case đã
  chạy, MAY gồm thời gian startup của từng lần chạy trong giới hạn đó; MUST KHÔNG tính thời gian
  biên dịch hay thời gian setup workspace. Giá trị MUST không vượt giới hạn nền tảng.
- **JDG-001-FR-012 — Bộ nhớ:** Judge KHÔNG đo số liệu bộ nhớ; result MUST KHÔNG gửi `memoryKb`.
  Submission lưu giá trị chưa có khi trường vắng theo SUB-002/SUB-003. Judge MUST KHÔNG giả lập số
  đo.
- **JDG-001-FR-013 — Bảo toàn định danh:** Result MUST giữ đúng `executionId`, `submissionId` và
  `mode` từ request.
- **JDG-001-FR-014 — Không trả dữ liệu ẩn:** Result MUST NOT chứa trường Test Case, expected output,
  harness, source code, tên file nội bộ hay Docker command. stdout/stderr đại diện lần execute cuối
  cùng được chạy (với RUN là lần execute duy nhất) và bị kẹp bởi trần output; Judge MUST gửi chúng
  cho cả RUN và SUBMIT để Submission lưu theo SUB-002-FR-019. Việc chỉ trả stdout/stderr của RUN cho
  người học và không bao giờ trả của SUBMIT là chính sách xem của SUB-003, không phải của Judge.
- **JDG-001-FR-015 — Chẩn đoán biên dịch:** Với `COMPILE_ERROR`, result MAY có thông báo biên dịch
  đã được lọc phù hợp; Judge MUST loại đường dẫn workspace tuyệt đối, tham số lệnh và thông tin
  sandbox khỏi thông báo trước khi gửi. Nếu không phân tích được line/column thì vẫn trả thông báo
  tổng quát. Submission lưu theo SUB-002-FR-019 và SUB-003 quyết định quyền xem.
- **JDG-001-FR-016 — Output người dùng:** Judge MUST NOT dùng stdout/stderr làm kênh trao đổi với
  client công khai; việc lưu/hiển thị output Run thuộc Submission.
- **JDG-001-FR-017 — Dọn workspace:** Mọi đường kết thúc thành công, lỗi, timeout hoặc exception MUST
  cố gắng dọn workspace tạm của request. Việc dọn thất bại MUST được ghi log và MUST KHÔNG làm mất
  result đã tính hay khiến request bị tính lại; result vẫn được publish và request được ACK.
- **JDG-001-FR-018 — Ưu tiên lỗi thực thi:** Nếu execution không kết thúc thành công, Judge MUST phân
  loại timeout/resource/exit outcome trước khi so output; testcase bị terminate MUST NOT được so với
  expected output.
- **JDG-001-FR-019 — Đếm testcase:** `totalTests` MUST là số testcase hợp lệ nhận được. `passedTests`
  MUST chỉ đếm testcase chạy xong và được comparator chấp nhận. Test chưa chạy do compile failure hay
  early stop MUST NOT tính là passed.
- **JDG-001-FR-020 — Biểu diễn kết quả chưa hoàn tất:** Khi dừng sớm hoặc gặp lỗi terminal, result
  MUST phân biệt test đã qua với tổng test; test chưa chạy MUST NOT bị tính như test đã chạy sai.
- **JDG-001-FR-021 — Bảo toàn mode:** Result MUST giữ nguyên `RUN` hoặc `SUBMIT` của request.
- **JDG-001-FR-022 — Result ổn định khi publish retry:** Nếu publish result thất bại, lần thử publish
  tiếp theo MUST giữ nguyên executionId, submissionId, mode, status và các số liệu đã tính.
- **JDG-001-FR-023 — ACK sau publish:** Request MUST NOT được ACK thành công trước khi publish result
  được broker xác nhận.
- **JDG-001-FR-024 — Payload lỗi không retry vô hạn:** Request không thể parse hoặc không còn đủ
  định danh để tạo result tương quan MUST không chạy mã; Judge MUST ghi log an toàn (không kèm
  payload) rồi ACK và bỏ message. Request sai validation nhưng còn đủ định danh MUST tạo
  `INTERNAL_ERROR` và publish trước khi ACK. Lỗi hạ tầng khác (publish, consume) đi theo bounded
  retry tối đa ba lần rồi DLQ theo contract messaging hiện có.
- **JDG-001-FR-025 — Log an toàn:** Judge MUST NOT ghi source, stdin/expected output ẩn, harness,
  credentials hay raw payload vào log vận hành.

## Quy tắc nghiệp vụ

- `ACCEPTED` có nghĩa chương trình hoàn tất mọi Test Case theo semantics của loại Problem; nó không
  tự quyết định hoàn tất Submission hoặc cập nhật tiến độ.
- Với `mode=RUN`, Judge báo chạy thành công bằng `ACCEPTED` kèm `mode=RUN` theo contract hiện có;
  Submission ánh xạ thành `EXECUTED` cho Run theo SUB-001. Judge không mở rộng enum `JudgeStatus`.
- `INTERNAL_ERROR` biểu thị Judge không thể kết luận do lỗi hệ thống, không phải lỗi lời giải.
- Test Case rỗng không được coi là bằng chứng lời giải đúng. LRN-002 yêu cầu Problem xuất bản có
  Test Case ẩn và tổng điểm dương; Judge từ chối request Submit không có testcase trước khi chạy và
  báo `INTERNAL_ERROR` khi còn đủ định danh.
- **Dừng ở testcase sai đầu tiên:** khi một testcase báo sai, Judge dừng ngay, không chạy các
  testcase sau; `passedTests` chỉ đếm các testcase đã đạt và điểm là tổng score của chúng. Giao
  trùng cùng `executionId` không tính lại; Submission giữ kết quả đến trước theo SUB-001-FR-015/
  SUB-002-FR-018.
- Submission sở hữu ý nghĩa lưu trữ/chính thức của điểm, tiến độ và trạng thái bản ghi.

## Quyền và ranh giới

Chỉ thông điệp service-to-service được xác thực/được bảo vệ mới là nguồn request đáng tin cậy. Dữ
liệu nhận từ queue vẫn phải được kiểm tra. Client không được chọn Test Case, expected output,
harness, runner command hay giới hạn để vượt chính sách Learning/Judge.

## Đầu vào

`JudgeRequest`: `executionId`, `submissionId`, `mode`, `problemType`, `language`, `sourceCode`,
`testCases[]` (`stdin`, `expectedOutput`, `score`), tùy chọn `hiddenHarness`, `timeLimitMs`,
`memoryLimitMb`. Ràng buộc byte tối đa của LRN-002 áp dụng cho gói Test Case/harness; `sourceCode`
tối đa 1 MiB (1.048.576 byte UTF-8), đồng nhất với trần từng trường của LRN-002; trần message
RabbitMQ 16 MiB là giới hạn bao ngoài.

| Trường                        | Kiểm tra tối thiểu đề xuất                             | Ghi chú                                                                                 |
| ----------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `executionId`, `submissionId` | Có, không rỗng, định dạng ID hợp lệ                    | Tương quan request/result                                                               |
| `mode`                        | Chỉ `RUN` hoặc `SUBMIT`                                | Giá trị khác bị từ chối                                                                 |
| `problemType`                 | Chỉ `STANDARD`, `FUNCTION`, `OOP`                      | Type-specific ở JDG-003/004                                                             |
| `language`                    | Nằm trong registry được hỗ trợ                         | Không nhận compiler/image tùy ý                                                         |
| `sourceCode`                  | Chuỗi UTF-8 tối đa 1 MiB                               | Trần thống nhất với LRN-002                                                             |
| `testCases`                   | Mảng có thứ tự, không rỗng; với Submit tối đa 100 item | Giới hạn gói Learning trong LRN-002                                                     |
| `stdin`, `expectedOutput`     | Với Submit là chuỗi UTF-8; mỗi trường tối đa 1 MiB     | Gói Test Case/harness tối đa 8 MiB theo LRN-002; `expectedOutput` có thể vắng trong RUN |
| `score`                       | Với Submit là số nguyên không âm ở mỗi testcase        | Learning sở hữu trọng số; tổng điểm của Problem xuất bản dương                          |
| limits                        | Số dương và bị kẹp bởi platform ceiling                | Request không thể nới trần                                                              |
| `hiddenHarness`               | Chỉ dùng cho FUNCTION/OOP khi bắt buộc                 | Không log hoặc đưa vào result                                                           |

Các kiểm tra này mô tả hành vi cần có, không chọn thư viện hay DTO implementation.

## Đầu ra

`JudgeResult`: cùng định danh/mode; verdict; tùy chọn `passedTests`, `totalTests`, `score`,
`runtimeMs`, `memoryKb`, chẩn đoán compile. Kết quả gửi trên `judge.result` về Submission. Kết quả
không tạo bản ghi tại Judge.

| Trường                      | Quy tắc hiện đề xuất                                                                                |
| --------------------------- | --------------------------------------------------------------------------------------------------- |
| ID, mode, status            | Có trên mọi result có thể tương quan                                                                |
| `passedTests`, `totalTests` | Có khi request chứa testcase array hợp lệ; dùng đúng nghĩa ở trên                                   |
| `score`                     | Chỉ có theo scoring policy; không tự gán 100/default khi thiếu dữ liệu                              |
| `runtimeMs`                 | Tổng thời gian execute các test đã chạy; không gồm compile/setup                                    |
| `memoryKb`                  | Judge không gửi trường này; Submission lưu "chưa có" khi vắng                                       |
| stdout/stderr               | Đại diện lần execute cuối cùng; RUN để người học xem, SUBMIT Submission lưu, SUB-003 quyết định xem |
| `compileOutput`, `error`    | Có thể vắng mặt; nếu có phải giới hạn và lọc nội dung                                               |

stdout/stderr đại diện lần execute cuối cùng được chạy; với RUN đó là output duy nhất mà người học
cần, với SUBMIT đó là dữ liệu lưu trữ thô do Submission quản lý quyền xem.

## Tình huống lỗi

| Trường hợp                                        | Kết quả yêu cầu                                                            |
| ------------------------------------------------- | -------------------------------------------------------------------------- |
| Payload sai hoặc thiếu trường                     | Không chạy mã; còn đủ ID thì `INTERNAL_ERROR`, thiếu ID thì log + ACK + bỏ |
| Ngôn ngữ không hỗ trợ                             | Không chạy mã; `INTERNAL_ERROR`                                            |
| Compile thất bại                                  | `COMPILE_ERROR`; không chạy Test Case                                      |
| Compile quá thời hạn                              | `TIME_LIMIT_EXCEEDED`; không chạy Test Case                                |
| Runtime quá thời hạn                              | `TIME_LIMIT_EXCEEDED` cho testcase đó                                      |
| Output vượt trần                                  | Kết thúc tiến trình; `RUNTIME_ERROR`                                       |
| Mismatch                                          | `WRONG_ANSWER`; dừng ngay, các testcase sau không chạy                     |
| Sandbox/container không sẵn sàng hoặc lỗi hạ tầng | `INTERNAL_ERROR`, không gán lỗi cho lời giải                               |
| Lỗi bất ngờ                                       | `INTERNAL_ERROR`; không phát raw secret hay dữ liệu test ẩn                |

Message JSON không parse được hoặc thiếu định danh không có JudgeRequest để tạo JudgeResult có thể
tương quan; Judge ghi log an toàn rồi ACK và bỏ message, không chạy mã, không retry vô hạn. Broker
retry handler failure tối đa ba lần rồi dead-letter áp dụng cho lỗi hạ tầng còn lại (publish,
consume). Request sai validation nhưng còn đủ định danh được publish dưới `INTERNAL_ERROR` trước khi
ACK.

## Tình huống biên

- Một Test Case, stdin/expected output rỗng, output chỉ có newline, whitespace cuối dòng, UTF-8 và
  output rất lớn.
- Request Test Case rỗng, test có `expectedOutput` bị thiếu, score bằng 0 hoặc tổng score khác 100.
- Nhiều Test Case, lỗi ở test đầu/giữa/cuối, và một executionId được giao lại.
- Timeout khi compile, timeout khi khởi động, timeout khi chạy test; tiến trình bị kill nhưng container
  còn sống.
- Submission gửi `RUN` chỉ có một Test Case và không có expected output: hợp lệ, không so output,
  chạy thành công là `ACCEPTED` kèm `mode=RUN` theo SUB-001.

## Tiêu chí nghiệm thu

- **JDG-001-AC-001:** Cho request STANDARD hợp lệ và mọi output khớp sau chuẩn hoá, result là
  `ACCEPTED` và báo đúng số test.
- **JDG-001-AC-002:** Cho một output không khớp, result là `WRONG_ANSWER` và không đếm test đó là đạt.
- **JDG-001-AC-003:** Cho lỗi biên dịch, result là `COMPILE_ERROR` và không có Test Case nào được chạy.
- **JDG-001-AC-004:** Cho lỗi runtime, timeout hoặc cạn bộ nhớ, result dùng verdict tương ứng đã
  định nghĩa và không báo `ACCEPTED`.
- **JDG-001-AC-005:** Result giữ nguyên execution/submission/mode từ request.
- **JDG-001-AC-006:** Không trường hợp nào trong result làm lộ stdin ẩn, expected output hoặc harness.
- **JDG-001-AC-007:** Workspace được dọn sau cả success và các đường lỗi có thể phục hồi.
- **JDG-001-AC-008:** Bộ Test Case rỗng không thể nhận `ACCEPTED` hay điểm tối đa theo mặc định.
- **JDG-001-AC-009:** Result không bao giờ chứa `memoryKb`; Submission ghi giá trị chưa có cho bản
  ghi tương ứng.
- **JDG-001-AC-010:** Khi publish result thất bại, request không được ACK; khi message được giao lại,
  result vẫn giữ cùng executionId/submissionId/mode và Submission có thể bỏ kết quả terminal trùng.
- **JDG-001-AC-011:** Cho một request ba Test Case sai ở testcase thứ hai, result là
  `WRONG_ANSWER`, `passedTests=1`, `totalTests=3`, điểm bằng `score` của testcase đầu và testcase
  thứ ba không được thực thi.
- **JDG-001-AC-012:** Cho biên dịch quá thời hạn, result là `TIME_LIMIT_EXCEEDED` và không có Test
  Case nào được chạy.

## Ngoài phạm vi

- Quản lý Problem/Test Case/harness (Learning).
- Tạo Run/Submit, lưu lịch sử, trạng thái bản ghi, tiến độ và realtime (Submission).
- Ngôn ngữ mới hay chi tiết compiler/runtime cụ thể (JDG-002).
- Semantics FUNCTION/OOP và thiết kế harness tương ứng (JDG-003/JDG-004).
- Chính sách/cơ chế isolation chi tiết (JDG-005).
- Chấm thủ công, leaderboard, plagiarism detection, rejudge hoặc lưu trữ lịch sử Judge.

## Phụ thuộc

- [LRN-001 Problem](../../02-learning/problems/spec.md), [LRN-002 Test Case](../../02-learning/test-cases/spec.md)
- [SUB-001 Run](../../03-submission/run-code/spec.md), [SUB-002 Submit](../../03-submission/submit-code/spec.md)
- `libs/contracts/src/judge.contracts.ts`, [Kiến trúc Judge](../../../architecture/judge-service.md),
  [Judge security](../../00-system/judge-security.md)

## Quyết định khi duyệt

Phiên bản này được duyệt ngày 2026-10-07 theo phiếu [`.docs/specs/04-judge/REVIEW.md`](../REVIEW.md).
Các câu hỏi mở của bản 0.2 đã được chốt như sau:

| Quyết định | Nội dung chốt                                                                                                                                       |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-01       | Dừng ở testcase sai đầu tiên; điểm là tổng `score` các testcase đã qua, không chuẩn hoá thang.                                                      |
| D-02       | RUN thành công báo `ACCEPTED` kèm `mode=RUN` (không mở rộng enum); Submission ánh xạ `EXECUTED`.                                                    |
| D-03       | Giữ comparator CRLF→LF rồi `trimEnd()`; không thêm Unicode normalization.                                                                           |
| D-04       | Judge gửi stdout/stderr cho cả RUN và SUBMIT; SUB-002-FR-019 lưu, SUB-003-FR-011 quyết định quyền xem.                                              |
| D-05       | `runtimeMs` không gồm compile/setup; compile quá hạn → `TIME_LIMIT_EXCEEDED`; vượt output → `RUNTIME_ERROR`.                                        |
| D-06       | Không đo bộ nhớ; result không gửi `memoryKb`.                                                                                                       |
| D-07       | Retry ≤3 rồi DLQ cho lỗi hạ tầng; thiếu định danh → log + ACK + bỏ; trùng `executionId` không tính lại; cleanup fail → log + ACK, không mất result. |
| D-08       | Nguồn tối đa 1 MiB; toolchain/limits chi tiết ở [JDG-002](../language-runners/spec.md).                                                             |
| D-09/D-10  | Phân loại lỗi theo vùng code; semantics FUNCTION/OOP ở [JDG-003](../function-judge/spec.md)/[JDG-004](../oop-judge/spec.md).                        |
| D-11       | Trần sandbox giữ theo hiện trạng; ở [JDG-005](../sandbox/spec.md).                                                                                  |

## Lịch sử sửa đổi

| Ngày       | Phiên bản | Tác giả/Người review    | Tóm tắt                                                                                          |
| ---------- | --------- | ----------------------- | ------------------------------------------------------------------------------------------------ |
| 2026-09-30 | 0.1       | Codex / chờ review      | Bản SRS đề xuất dựa trên tài liệu và code hiện có                                                |
| 2026-09-30 | 0.2       | Codex / chờ review      | Bổ sung pipeline, validation, result semantics và messaging                                      |
| 2026-10-07 | 1.0       | Codex / Chủ sở hữu repo | Duyệt: chốt dừng-sai-đầu, comparator, runtime, memory, output policy, poison message (D-01…D-08) |
