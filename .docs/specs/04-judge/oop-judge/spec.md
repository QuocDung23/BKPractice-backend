# JDG-004 OOP Judge

## Trạng thái

Approved — phiên bản 1.0, ngày 2026-10-07.

## Mục tiêu

Định nghĩa cách chấm Problem `OOP`, nơi người học hiện thực cấu trúc hướng đối tượng và harness ẩn
kiểm tra hành vi theo contract của Problem.

## Tác nhân và bối cảnh

Submission chuyển Judge package được Learning cung cấp. Learning sở hữu mô tả contract, starter code
và harness ẩn theo language; Judge chạy code ghép trong sandbox. LRN-001 quy định Problem OOP có
contract hướng đối tượng và starter code/harness cho mọi language được bật.

## Yêu cầu chức năng

- **JDG-004-FR-001:** Với `problemType=OOP`, Judge MUST thực thi code người học theo contract OOP
  tương ứng language, sử dụng harness do Learning cấp.
- **JDG-004-FR-002:** Request OOP thiếu harness bắt buộc MUST bị từ chối, không fallback sang
  STANDARD/FUNCTION.
- **JDG-004-FR-003:** Judge MUST chạy submission và harness trong cùng giới hạn sandbox; nguồn gốc
  tin cậy của harness không loại trừ nó khỏi resource/security controls.
- **JDG-004-FR-004:** Judge MUST không tiết lộ harness, expected output hay dữ liệu Test Case ẩn qua
  JudgeResult hoặc kênh client.
- **JDG-004-FR-005:** Judge MUST áp dụng thứ tự Test Case, chuẩn hoá output, verdict và số liệu theo
  JDG-001. Contract OOP theo từng language (class, constructor, method, signature, cú pháp chuỗi
  thao tác trong stdin) do Learning định nghĩa, sở hữu và xác thực trước publish; JDG-004 thực thi
  contract đó chứ không tự định nghĩa.
- **JDG-004-FR-006:** Compile failure của mã người học là `COMPILE_ERROR`; compile failure do
  harness/configuration là `INTERNAL_ERROR`. Nguồn lỗi được xác định theo vùng code: `sourceCode`
  đứng trước, `hiddenHarness` nối sau trong cùng một file; dòng lỗi thuộc vùng harness →
  `INTERNAL_ERROR`, thuộc vùng người học → `COMPILE_ERROR`. Runtime failure, timeout và
  resource-limit outcomes theo JDG-001/JDG-005: crash có chẩn đoán nằm trong vùng harness →
  `INTERNAL_ERROR`, vùng người học → `RUNTIME_ERROR`, không chẩn đoán được → `RUNTIME_ERROR`;
  exit 0 nhưng stdout sai → `WRONG_ANSWER`.
- **JDG-004-FR-007:** Một harness không tương thích với language/contract phải tạo kết quả lỗi rõ
  ràng, không gán lỗi sai cho lời giải nếu lỗi thuộc dữ liệu cấu hình.
- **JDG-004-FR-008 — Input testcase:** Judge MUST chuyển nguyên văn `stdin` tới harness; harness là
  bên diễn giải chuỗi thành chuỗi thao tác/đối số theo contract OOP của Problem.
- **JDG-004-FR-009 — Expected output:** `expectedOutput` là stdout do harness in ra sau khi kiểm tra
  hành vi OOP; Judge áp comparator chung JDG-001.
- **JDG-004-FR-010 — Harness trust boundary:** Dù Learning quản lý harness, nội dung harness MUST
  được kiểm tra kích thước/encoding và thực thi trong sandbox; không được cấp quyền host hay network.
- **JDG-004-FR-011 — Nguồn lỗi:** Judge MUST phân biệt compile failure, runtime/timeout/resource
  outcome và infrastructure/configuration failure theo các quy tắc phân loại đã duyệt.

## Quy tắc nghiệp vụ

OOP là kiểu Problem của Learning. Judge không tự quyết định class/API yêu cầu; nó chỉ thực hiện
contract được truyền trong package tin cậy. Reflection, serialization và dependency ngoài image mặc
định không được phép, trừ khi chính contract OOP của Problem cho phép tường minh. Mỗi testcase chạy
một process/container riêng, không chia sẻ state process giữa các testcase. `sourceCode` và
`hiddenHarness` ghép thành một file nguồn duy nhất; multi-file ngoài phạm vi và phải mở rộng
contract qua duyệt với Learning/Submission.

## Đầu vào/đầu ra

JudgeRequest với `problemType=OOP`, source, language, harness, Test Case và limits; JudgeResult chuẩn.
LRN-002 xác định stdin là input thô harness tự đọc và expectedOutput là output harness in ra. Cú pháp
biểu diễn chuỗi thao tác OOP bên trong stdin do contract OOP của Learning định nghĩa; Judge truyền
nguyên văn, không parse.

## Lỗi và biên

Sai tên class/package, thiếu method/constructor, nhiều source file, visibility, exception trong
harness, thứ tự thao tác stateful, encoding, test không độc lập, harness compile error, timeout hoặc
memory exhaustion.

## Tiêu chí nghiệm thu

- **JDG-004-AC-001:** Request OOP dùng đúng harness và contract theo language.
- **JDG-004-AC-002:** Thiếu/sai harness không được diễn giải thành STANDARD.
- **JDG-004-AC-003:** OOP evaluation không làm lộ nội dung harness/hidden tests.
- **JDG-004-AC-004:** Submission và harness đều chịu cùng isolation/resource ceiling.
- **JDG-004-AC-005:** Mọi trạng thái lỗi được phân biệt theo nguồn gốc user code, cấu hình hoặc
  hạ tầng theo quy ước đã chốt.

## Ngoài phạm vi

Thiết kế contract/harness và CRUD (Learning), FUNCTION semantics (JDG-003), toolchain (JDG-002),
sandbox mechanics (JDG-005), điểm và vòng đời chính thức (Submission).

## Phụ thuộc

[LRN-001](../../02-learning/problems/spec.md), [LRN-002](../../02-learning/test-cases/spec.md),
[JDG-001](../standard-judge/spec.md), [JDG-002](../language-runners/spec.md),
[JDG-005](../sandbox/spec.md), `JudgeRequest`.

## Quyết định khi duyệt

Phiên bản này được duyệt ngày 2026-10-07 theo phiếu [`.docs/specs/04-judge/REVIEW.md`](../REVIEW.md):

| Quyết định | Nội dung chốt                                                                                                                                                                                                              |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-10.1     | Contract OOP (class/constructor/method/signature, cú pháp stdin) do Learning định nghĩa, sở hữu và xác thực trước publish; JDG-004 chỉ thực thi.                                                                           |
| D-10.2     | Một request = một file: `sourceCode` + `hiddenHarness` nối thành chuỗi; multi-file ngoài phạm vi, mở rộng transport phải duyệt Learning/Submission.                                                                        |
| D-10.3     | Mỗi testcase một process/container riêng; không giữ state giữa testcase.                                                                                                                                                   |
| D-10.4     | Quy tắc lỗi theo vùng code giống JDG-003: compile lỗi vùng harness → `INTERNAL_ERROR`, vùng người học → `COMPILE_ERROR`; crash theo chẩn đoán vùng → `INTERNAL_ERROR`/`RUNTIME_ERROR`; exit 0 stdout sai → `WRONG_ANSWER`. |
| D-10.5     | Reflection/serialization/package ngoài image mặc định: cấm, trừ khi contract OOP của Problem cho phép tường minh.                                                                                                          |

## Lịch sử sửa đổi

| Ngày       | Phiên bản | Tác giả/Người review    | Tóm tắt                                                       |
| ---------- | --------- | ----------------------- | ------------------------------------------------------------- |
| 2026-09-30 | 0.1       | Codex / chờ review      | SRS đề xuất                                                   |
| 2026-09-30 | 0.2       | Codex / chờ review      | Làm rõ input/output testcase theo LRN-002                     |
| 2026-10-07 | 1.0       | Codex / Chủ sở hữu repo | Duyệt: single-file, lỗi theo vùng code, scope contract (D-10) |
