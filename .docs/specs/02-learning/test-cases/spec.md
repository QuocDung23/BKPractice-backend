> **Bản sửa đổi LRN-009 1.3, Approved 2026-11-11:** LECTURER có quyền quản lý nội dung Learning mình tạo; ADMIN có quyền tương ứng quản lý mọi nội dung. Quy tắc này thay các câu ADMIN-only hoặc bỏ kiểm created_by trước đó. Course hỗ trợ liên kết nhiều Quiz/Chapter theo LRN-009; tiến độ Problem hiện có không đổi. Không khôi phục Class/Enrollment/Assignment.

# LRN-002 Quản lý Test Case

## Trạng thái

Approved

> Cập nhật 2026-11-07: [LRN-008](../self-study/spec.md) thay thế mọi quy định về LECTURER, sở hữu riêng của người tạo, Class, Enrollment, Assignment và tiến độ theo lớp trong tài liệu này. Các yêu cầu còn lại vẫn áp dụng.

Phiên bản `1.2`. Bản `1.1` được chủ sở hữu sản phẩm phê duyệt ngày `2026-09-29`; các thay đổi của
`1.2` (FR-011, FR-012, AC-025, AC-026) do DuongPham-Barca sửa sau review code và phê duyệt ngày
`2026-10-28`.

Giá trị hợp lệ: `Proposed` | `Approved` | `Implemented` | `Verified`

## Mục tiêu

Cho phép Giảng viên sở hữu một Problem soạn và quản lý bộ Test Case dùng để chấm Problem đó, đồng
thời cung cấp cho Submission một gói dữ liệu judge đầy đủ, ổn định và được bảo vệ, mà không bao giờ
để lộ đầu vào ẩn, kết quả mong đợi hay harness cho người học.

## Tác nhân

- **LECTURER:** Người dùng giảng dạy đã xác thực, sở hữu Problem, tạo và quản lý Test Case của
  Problem đó khi có quyền Learning cần thiết.
- **STUDENT:** Người học đã xác thực. Thấy những gì LRN-001 cho phép cộng với Test Case `SAMPLE` của
  Problem đã xuất bản; không bao giờ đọc Test Case `HIDDEN` hay sửa Test Case.
- **ADMIN:** Quản trị viên nền tảng đã xác thực. Giống LRN-001, `ADMIN` không mặc nhiên có thẩm
  quyền với Test Case.
- **Khách chưa xác thực:** Không có quyền truy cập nào.
- **API Gateway:** Xác minh access token, loại bỏ header định danh do client gửi, và chuyển tiếp
  ngữ cảnh định danh/vai trò đã xác minh.
- **Learning Service:** Chủ sở hữu Test Case, dữ liệu harness ẩn và chính sách của chúng, bên trong
  khu vực Problems.
- **Submission Service:** Tác nhân service tin cậy lấy gói dữ liệu judge qua luồng nội bộ được bảo
  vệ. Không sở hữu Test Case và không đọc trực tiếp cơ sở dữ liệu của Learning.
- **Judge Service:** Nhận Test Case gián tiếp qua `JudgeRequest` do Submission gửi. Không sở hữu và
  không lưu Test Case.

## Bối cảnh

LRN-001 đã định nghĩa Problem, vòng đời, ví dụ hiển thị và starter code, và hoãn tường minh sang
LRN-002: CRUD Test Case, quản lý test ẩn, kết quả mong đợi, trọng số, harness, mức độ sẵn sàng Test
Case khi xuất bản, và việc đọc đáp án Test Case ở phía quản lý (LRN-001-FR-009, LRN-001-FR-012,
quyết định đã phê duyệt 10).

Nền tảng hiện có mà LRN-002 phải tính tới:

- Bảng `test_cases` trong `bkpractice_learning` có đầu vào, kết quả mong đợi, cờ ẩn, điểm và thứ tự
  hiển thị, gắn với một Problem. Chưa có API nào để tạo hay sửa chúng.
- Harness ẩn hiện nằm cạnh starter code theo từng ngôn ngữ và không bao giờ được chọn ra trong truy
  vấn thông thường.
- Route nội bộ judge-package hiện trả về giới hạn, loại Problem, harness của ngôn ngữ được yêu cầu
  và toàn bộ Test Case theo thứ tự, cho bất kỳ Problem nào, không kiểm tra trạng thái vòng đời.
- Transport contract `JudgeTestCase` dùng chung (`stdin`, `expectedOutput`, `score`). Judge so khớp
  output đã chuẩn hoá, cộng điểm các Test Case qua, và dừng ở Test Case sai đầu tiên.
- Run Code hiện chỉ chạy với `stdin` do người học tự nhập, không dùng Test Case nào.

Mã nguồn hiện tại là hành vi nền tảng, không phải bản triển khai của đặc tả này.

## Yêu cầu chức năng

- **LRN-002-FR-001 — Quyền sở hữu của Learning:** Learning MUST sở hữu mọi Test Case và dữ liệu
  harness ẩn. Submission và Judge MUST NOT lưu Test Case như dữ liệu của mình ngoài phạm vi một lần
  chấm.
- **LRN-002-FR-002 — Thuộc về một Problem:** Mọi Test Case MUST thuộc đúng một Problem và MUST có
  định danh ổn định. Test Case không tồn tại độc lập và không dùng chung giữa các Problem.
- **LRN-002-FR-003 — Tạo Test Case:** Chủ sở hữu có thẩm quyền của một Problem chỉnh sửa được MUST
  có thể thêm Test Case gồm đầu vào, kết quả mong đợi, chế độ hiển thị, điểm và thứ tự.
- **LRN-002-FR-004 — Cập nhật Test Case:** Chủ sở hữu có thẩm quyền MUST có thể sửa các trường cho
  phép của một Test Case thuộc Problem chỉnh sửa được. Dữ liệu client MUST NOT chuyển Test Case sang
  Problem khác.
- **LRN-002-FR-005 — Gỡ Test Case:** Chủ sở hữu có thẩm quyền MUST có thể gỡ một Test Case khỏi
  Problem chỉnh sửa được. Gỡ là xoá hẳn Test Case, vì Submission không tham chiếu từng Test Case.
- **LRN-002-FR-006 — Thứ tự:** Test Case của một Problem MUST có thứ tự xác định, ổn định. Gói dữ
  liệu judge MUST trả Test Case theo đúng thứ tự đó.
- **LRN-002-FR-007 — Chế độ hiển thị:** Mọi Test Case MUST có đúng một chế độ hiển thị: `HIDDEN`
  (ẩn) hoặc `SAMPLE` (mẫu). Mặc định là `HIDDEN`. Chủ sở hữu có thẩm quyền MUST có thể đổi chế độ
  hiển thị khi Problem chỉnh sửa được.
- **LRN-002-FR-019 — Test Case mẫu cho người học:** Chi tiết Problem đã xuất bản và phần xem trước
  của LRN-001 MUST trả về đầu vào và kết quả mong đợi của mọi Test Case `SAMPLE`, theo đúng thứ tự
  đã lưu. Test Case `SAMPLE` cũng nằm trong gói dữ liệu judge và được chấm, tính điểm khi Submit như
  Test Case `HIDDEN`. Dữ liệu Test Case `SAMPLE` MAY được Run Code dùng; cách lấy và hành vi Run Code
  thuộc SUB-001.
- **LRN-002-FR-008 — Đọc ở phía quản lý:** Chủ sở hữu có thẩm quyền MUST có thể liệt kê và đọc Test
  Case của Problem mình sở hữu, gồm đầy đủ đầu vào, kết quả mong đợi, chế độ hiển thị, điểm và thứ
  tự, kể cả Test Case `HIDDEN`. Dữ liệu này chỉ xuất hiện trong luồng quản lý được bảo vệ của chủ sở
  hữu.
- **LRN-002-FR-009 — Không lộ cho người học:** Phản hồi hướng tới người học, kể cả chi tiết và xem
  trước của LRN-001, MUST NOT chứa đầu vào, kết quả mong đợi, điểm hay số lượng của Test Case
  `HIDDEN`, và MUST NOT chứa điểm của Test Case `SAMPLE`.
- **LRN-002-FR-010 — Điểm Test Case:** Mỗi Test Case MUST mang một điểm nguyên không âm. LRN-002 chỉ
  lưu và cung cấp điểm; cách tính điểm của bài nộp (tổng, chuẩn hoá, dừng sớm) thuộc SUB-002 và
  JDG-001.
- **LRN-002-FR-011 — Giới hạn kích thước:** Một Problem MUST có tối đa 100 Test Case. Đầu vào và kết
  quả mong đợi của mỗi Test Case MUST có kích thước tối đa 1 MiB (1.048.576 byte UTF-8) mỗi trường.
  Tổng dung lượng đầu vào, kết quả mong đợi của mọi Test Case và mọi harness đang có hiệu lực của
  một Problem MUST không vượt 8 MiB (8.388.608 byte UTF-8), để gói dữ liệu judge luôn gửi được qua
  luồng chấm hiện có. Harness đang có hiệu lực là harness của ngôn ngữ đang bật trên Problem
  `FUNCTION`/`OOP`; harness của ngôn ngữ chưa bật, đã tắt hoặc của Problem `STANDARD` không tính.
  Giới hạn chỉ chặn việc thêm dữ liệu làm tổng tăng và vượt trần; Problem đã vượt trần từ trước vẫn
  đọc và sửa các trường không liên quan được.
- **LRN-002-FR-012 — Harness ẩn:** Với Problem `FUNCTION` và `OOP`, chủ sở hữu có thẩm quyền MUST
  có thể thiết lập, thay thế và gỡ harness ẩn theo từng ngôn ngữ được hỗ trợ khi Problem chỉnh sửa
  được, kể cả ngôn ngữ chưa bật để đặt trước. Harness chỉ có hiệu lực (tính vào FR-011, FR-013 và
  gói judge) khi ngôn ngữ của nó đang bật. Tắt ngôn ngữ hoặc đổi Problem sang `STANDARD` MUST NOT
  xoá harness đã lưu; harness đó chỉ ngừng có hiệu lực và có hiệu lực lại khi ngôn ngữ được bật lại.
  Problem `STANDARD` MUST NOT thiết lập thêm harness. Harness MUST NOT xuất hiện trong phản hồi
  hướng tới người học; chủ sở hữu đọc được harness trong luồng quản lý của mình.
- **LRN-002-FR-013 — Mức độ sẵn sàng khi xuất bản:** Ngoài các điều kiện của LRN-001, một Problem
  chỉ được xuất bản hoặc xuất bản lại khi: có ít nhất một Test Case `HIDDEN`; tổng điểm của mọi Test
  Case lớn hơn 0; và, với `FUNCTION`/`OOP`, có harness cho mọi ngôn ngữ đang bật. Các điều kiện này
  dùng cùng kiểm tra xuất bản và cùng cơ chế báo lỗi mức độ sẵn sàng của LRN-001.
- **LRN-002-FR-014 — Gói dữ liệu judge được bảo vệ:** Learning MUST cung cấp cho tác nhân service
  tin cậy một gói gồm loại Problem, giới hạn thực thi, harness của ngôn ngữ được yêu cầu (nếu có) và
  toàn bộ Test Case theo thứ tự. Gói này MUST chỉ khả dụng qua luồng nội bộ được bảo vệ.
- **LRN-002-FR-015 — Gói judge theo trạng thái:** Learning MUST chỉ cấp gói dữ liệu judge cho Problem
  `PUBLISHED` chưa bị xoá mềm, và chỉ cho ngôn ngữ đang bật trên Problem đó. Problem `DRAFT`,
  `ON_HOLD`, đã xoá mềm, hoặc ngôn ngữ đang tắt MUST bị từ chối.
- **LRN-002-FR-016 — Không chấm lại:** Thay đổi Test Case MUST NOT sửa, chấm lại hay xoá kết quả
  Submission đã có. Việc chấm lại là Ngoài phạm vi.
- **LRN-002-FR-017 — Retry xác định:** Một lần kiểm tra dữ liệu, kiểm tra phân quyền hay thao tác
  Test Case thất bại MUST để nguyên bộ Test Case. Thao tác đọc lặp lại MUST NOT làm thay đổi state.
- **LRN-002-FR-018 — Không thực thi:** Quản lý Test Case MUST NOT biên dịch, chạy mã, sinh kết quả
  mong đợi bằng cách chạy lời giải, hay phân loại kết quả thực thi.

## Quy tắc nghiệp vụ

### Khả năng chỉnh sửa theo vòng đời Problem

Theo LRN-001, chỉ Problem `DRAFT` và `PUBLISHED` là chỉnh sửa được; Problem `ON_HOLD` và đã xoá mềm
thì không. Quy tắc tương tự áp dụng cho Test Case:

| Trạng thái Problem | Thêm/sửa/gỡ Test Case | Chủ sở hữu đọc Test Case  |
| ------------------ | --------------------- | ------------------------- |
| `DRAFT`            | Có                    | Có                        |
| `PUBLISHED`        | Có, tại chỗ           | Có                        |
| `ON_HOLD`          | Không                 | Có                        |
| Đã xoá mềm         | Không                 | Không (chỉ qua khôi phục) |

- Một thay đổi Test Case trên Problem `PUBLISHED` MUST NOT làm Problem mất điều kiện sẵn sàng xuất
  bản (ví dụ gỡ Test Case `HIDDEN` cuối cùng, đưa tổng điểm về 0, hay gỡ harness của một ngôn ngữ
  đang bật).
- Một cập nhật LRN-001 bật thêm ngôn ngữ cho Problem `FUNCTION`/`OOP` đã xuất bản MUST bị từ chối nếu
  ngôn ngữ đó chưa có harness (đã đặt trước theo FR-012), vì nó làm Problem mất điều kiện sẵn sàng.
  Việc kiểm tra dùng trạng thái sau cập nhật, gồm cả harness vừa trở nên có hiệu lực.
- Sửa Test Case của Problem `PUBLISHED` là chỉnh sửa tại chỗ, không có versioning và không chấm lại.
- Xoá mềm và khôi phục Problem không tạo, sửa hay xoá Test Case nào.

### Dữ liệu của Test Case

- **Đầu vào (stdin):** văn bản, được phép rỗng.
- **Kết quả mong đợi:** văn bản bắt buộc. Việc so khớp dùng quy tắc chuẩn hoá output hiện có của
  Judge; LRN-002 không định nghĩa lại cách so khớp.
- **Chế độ hiển thị:** `HIDDEN` (mặc định) hoặc `SAMPLE`. Test Case `SAMPLE` là dữ liệu công khai
  với người học của Problem đã xuất bản; mọi thứ khác của Test Case vẫn là dữ liệu judge.
- **Điểm:** số nguyên không âm.
- **Thứ tự:** vị trí xác định trong Problem.

Test Case `SAMPLE` khác với ví dụ hiển thị của LRN-001. Ví dụ hiển thị là phần giải thích trong đề
bài và không bao giờ được dùng để chấm. Cả hai cùng tồn tại; LRN-002 không sửa khái niệm ví dụ hiển
thị của LRN-001.

### Theo từng loại Problem

- **STANDARD:** Chương trình của người học đọc đầu vào Test Case từ stdin và in ra stdout.
- **FUNCTION / OOP:** Harness ẩn của từng ngôn ngữ gọi code của người học. Đầu vào Test Case là dữ
  liệu stdin thô mà harness tự đọc, kết quả mong đợi là output mà harness in ra. LRN-002 không định
  nghĩa định dạng đầu vào có cấu trúc và giữ nguyên transport contract `JudgeTestCase` hiện có.

## Quy tắc phân quyền

- Chỉ chủ sở hữu Problem (`createdBy` khớp principal tin cậy) được quản lý Test Case của Problem đó,
  đúng như quyết định sở hữu của LRN-001.
- Mọi thao tác quản lý Test Case đòi hỏi quyền tường minh theo quy ước `resource:action` của ID-003,
  tái dùng quyền của LRN-001 vì Test Case là một phần của Problem: thêm, sửa, gỡ, sắp xếp Test Case
  và thiết lập/gỡ harness đòi hỏi `problem:update`; đọc Test Case và harness ở phía quản lý đòi hỏi
  `problem:read-managed`. LRN-002 không thêm mã quyền mới.
- `STUDENT` MUST NOT tạo, sửa hay gỡ Test Case, và chỉ đọc được Test Case `SAMPLE` qua chi tiết
  Problem đã xuất bản.
- `ADMIN` không có thẩm quyền ngầm và chịu cùng kiểm tra quyền và sở hữu như mọi tác nhân.
- Quyền sở hữu và định danh luôn lấy từ ngữ cảnh Gateway đã xác minh, không bao giờ từ body, query,
  route hay header do client gửi.
- Chỉ tác nhân service tin cậy (Submission) được lấy gói dữ liệu judge, theo contract nội bộ. Điều
  này không cấp cho nó quyền quản lý Test Case.
- Phân quyền bị thiếu hoặc mơ hồ mặc định là từ chối.

## Đầu vào

Các thao tác dưới đây là thao tác ở mức khái niệm; route và DTO thuộc về `plan.md`.

### Thêm / cập nhật Test Case

Chấp nhận định danh Problem, định danh Test Case (khi cập nhật) và danh sách cho phép tường minh:
đầu vào, kết quả mong đợi, chế độ hiển thị, điểm, thứ tự. MUST NOT chấp nhận định danh Problem khác
trong body, người tạo, mốc thời gian, lệnh biên dịch, tham số Docker, vai trò hay quyền.

### Gỡ Test Case

Chấp nhận định danh Problem và định danh Test Case.

### Sắp xếp lại

Chấp nhận định danh Problem và thứ tự mới của các Test Case hiện có. Thứ tự mới MUST chứa đúng tập
Test Case hiện có của Problem.

### Harness

Chấp nhận định danh Problem `FUNCTION`/`OOP`, một ngôn ngữ được hỗ trợ (không nhất thiết đang bật)
và nội dung harness (khi thiết lập/thay thế). Harness có cùng giới hạn kích thước 1 MiB.

### Gói dữ liệu judge (nội bộ)

Chấp nhận định danh Problem, một ngôn ngữ được hỗ trợ và thông tin xác thực service nội bộ.

## Đầu ra

- Thêm/cập nhật thành công trả về biểu diễn quản lý của Test Case, gồm định danh ổn định.
- Liệt kê ở phía quản lý trả về Test Case của Problem theo thứ tự, trong phạm vi chủ sở hữu.
- Biểu diễn quản lý của Problem (LRN-001) bổ sung số lượng Test Case và các lỗi mức độ sẵn sàng liên
  quan tới Test Case.
- Gói dữ liệu judge trả về đúng các trường mà transport contract hiện có mong đợi.
- Chi tiết Problem đã xuất bản và phần xem trước của LRN-001 bổ sung danh sách Test Case `SAMPLE`
  (đầu vào, kết quả mong đợi, thứ tự). Ngoài phần này, phản hồi hướng tới người học không đổi.
- LRN-002 không phát ra domain event nào.

## Tình huống lỗi

| Trường hợp                                                              | Hành vi quan sát được                                               |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Thiếu hoặc sai xác thực                                                 | `401`; không thay đổi state                                         |
| Thiếu quyền hoặc không phải chủ sở hữu                                  | `403`; không thay đổi state                                         |
| Problem hoặc Test Case không tồn tại, hoặc không hiển thị với người gọi | `404`; không lộ sự tồn tại của nội dung chưa công khai              |
| Test Case thuộc Problem khác với Problem trong route                    | `404`; không thay đổi state                                         |
| Problem không ở trạng thái cho phép chỉnh sửa Test Case                 | Lỗi nghiệp vụ trạng thái không hợp lệ; không thay đổi state         |
| Thiếu kết quả mong đợi, điểm âm, vượt giới hạn kích thước/số lượng      | Lỗi kiểm tra dữ liệu; không thay đổi state                          |
| Thứ tự mới không khớp tập Test Case hiện có                             | Lỗi kiểm tra dữ liệu; thứ tự cũ giữ nguyên                          |
| Thay đổi làm Problem `PUBLISHED` mất điều kiện sẵn sàng                 | Lỗi mức độ sẵn sàng; không thay đổi state                           |
| Harness cho ngôn ngữ không được hỗ trợ                                  | Lỗi kiểm tra dữ liệu; không lưu harness                             |
| Gói judge không kèm hoặc sai thông tin xác thực nội bộ                  | Từ chối; không trả về dữ liệu ẩn nào                                |
| Gói judge cho Problem không đủ điều kiện nộp bài hoặc ngôn ngữ đang tắt | Từ chối theo quy ước hiện có; không trả về dữ liệu ẩn               |
| Lỗi lưu trữ hoặc phụ thuộc ngoài dự kiến                                | Lỗi chuẩn hoá hiện có, không kèm nội dung ẩn hay thông tin xác thực |

LRN-002 không đưa vào cấu trúc lỗi mới.

## Tình huống biên

- Một Problem có thể không có Test Case nào khi còn `DRAFT`.
- Đầu vào rỗng là hợp lệ; kết quả mong đợi rỗng tuân theo quy tắc chuẩn hoá output của Judge.
- Hai lần sắp xếp lại đồng thời để lại một thứ tự nhất quán, không trùng vị trí.
- Gỡ Test Case trong lúc Submission đang lấy gói judge: gói đã cấp không bị ảnh hưởng, lần lấy sau
  phản ánh bộ Test Case mới.
- Đầu vào và kết quả mong đợi có ký tự Unicode hoặc xuống dòng kiểu Windows vẫn được lưu nguyên
  vẹn; việc chuẩn hoá khi so khớp thuộc về Judge.
- Nếu một Problem `FUNCTION`/`OOP` đã xuất bản vẫn thiếu harness của ngôn ngữ được yêu cầu (ví dụ dữ
  liệu cũ trước LRN-002), yêu cầu gói judge MUST bị từ chối theo hướng đóng thay vì trả gói không có
  harness.

## Yêu cầu bảo mật

- **LRN-002-SR-001 — Phân quyền phía server:** Learning MUST thực thi quyền, sở hữu và trạng thái
  tại ranh giới backend tin cậy.
- **LRN-002-SR-002 — Ngữ cảnh tác nhân tin cậy:** Định danh và vai trò MUST chỉ đến từ ngữ cảnh
  Gateway đã xác minh.
- **LRN-002-SR-003 — Bảo mật dữ liệu ẩn:** Đầu vào ẩn, kết quả mong đợi và harness MUST NOT xuất hiện
  trong phản hồi hướng tới người học, log, thông báo lỗi hay ví dụ Swagger.
- **LRN-002-SR-004 — Bảo vệ endpoint nội bộ:** Gói dữ liệu judge MUST chỉ trả về cho service tin
  cậy đã xác thực; người gọi công khai và header nội bộ giả mạo MUST bị từ chối.
- **LRN-002-SR-005 — Chống gán hàng loạt:** Đầu vào Test Case MUST liệt kê tường minh các trường
  được phép. Problem sở hữu, người tạo, mốc thời gian, vai trò và quyền không thể bị thay đổi qua
  request.
- **LRN-002-SR-006 — Cách ly lệnh runtime:** Nội dung Test Case và harness là dữ liệu, MUST NOT trở
  thành lệnh biên dịch, shell, tên file hay cấu hình Docker/sandbox do client điều khiển.
- **LRN-002-SR-007 — Cách ly service/cơ sở dữ liệu:** Không service nào khác truy vấn trực tiếp Test
  Case trong `bkpractice_learning`; không có khoá ngoại xuyên service.
- **LRN-002-SR-008 — Ghi log an toàn:** Nội dung Test Case, harness, bí mật service và header xác
  thực MUST NOT được ghi vào log.
- **LRN-002-SR-009 — Thất bại an toàn:** Ngữ cảnh phân quyền bị thiếu, sai định dạng hay mơ hồ MUST
  thất bại theo hướng đóng và giữ nguyên state.

## Tiêu chí nghiệm thu

- **LRN-002-AC-001:** Cho trước chủ sở hữu có thẩm quyền của một Problem `DRAFT`, khi họ thêm Test
  Case hợp lệ, thì Test Case được lưu với định danh ổn định và thuộc đúng Problem đó.
- **LRN-002-AC-002:** Cho trước một Giảng viên không phải chủ sở hữu, một `STUDENT` hoặc một `ADMIN`
  chưa được cấp quyền, khi thử thêm/sửa/gỡ/đọc Test Case, thì nhận `403` và bộ Test Case không đổi.
- **LRN-002-AC-003:** Cho trước một tác nhân chưa xác thực, khi gọi bất kỳ thao tác Test Case nào,
  thì nhận `401` và không có thay đổi state.
- **LRN-002-AC-004:** Cho trước một Problem `ON_HOLD` hoặc đã xoá mềm, khi chủ sở hữu thử thêm/sửa/gỡ
  Test Case, thì bị từ chối với lỗi trạng thái không hợp lệ và bộ Test Case không đổi.
- **LRN-002-AC-005:** Cho trước Test Case thiếu kết quả mong đợi, có điểm âm, hoặc vượt giới hạn kích
  thước/số lượng, khi kiểm tra dữ liệu chạy, thì request bị từ chối và state không đổi.
- **LRN-002-AC-006:** Cho trước một Problem có Test Case ẩn, khi người học gọi danh sách, chi tiết
  hoặc chủ sở hữu gọi xem trước, thì phản hồi không chứa đầu vào, kết quả mong đợi, điểm hay số lượng
  Test Case ẩn.
- **LRN-002-AC-007:** Cho trước một yêu cầu gói judge không có hoặc có thông tin xác thực nội bộ giả
  mạo, khi Learning xử lý, thì không có dữ liệu ẩn nào được trả về.
- **LRN-002-AC-008:** Cho trước một yêu cầu gói judge hợp lệ cho Problem đủ điều kiện nộp bài và một
  ngôn ngữ đang bật, khi Learning xử lý, thì gói chứa toàn bộ Test Case theo đúng thứ tự đã lưu.
- **LRN-002-AC-009:** Cho trước một yêu cầu gói judge cho Problem không đủ điều kiện nộp bài hoặc cho
  ngôn ngữ đang tắt, khi Learning xử lý, thì yêu cầu bị từ chối.
- **LRN-002-AC-010:** Cho trước một Problem không thoả điều kiện Test Case khi xuất bản, khi chủ sở
  hữu yêu cầu xuất bản hoặc xuất bản lại, thì thao tác thất bại nguyên tử và lỗi mức độ sẵn sàng nêu
  rõ điều kiện Test Case còn thiếu.
- **LRN-002-AC-011:** Cho trước một Problem `PUBLISHED`, khi một thay đổi Test Case làm nó mất điều
  kiện sẵn sàng, thì thay đổi bị từ chối và bộ Test Case không đổi.
- **LRN-002-AC-012:** Cho trước một yêu cầu sắp xếp lại không khớp đúng tập Test Case hiện có, khi
  kiểm tra dữ liệu chạy, thì bị từ chối và thứ tự cũ giữ nguyên.
- **LRN-002-AC-013:** Cho trước các Submission đã được chấm, khi Test Case của Problem bị thay đổi,
  thì kết quả của các Submission đó không đổi.
- **LRN-002-AC-014:** Cho trước một request chứa trường không được phép (Problem khác, người tạo,
  mốc thời gian, vai trò, quyền), khi kiểm tra dữ liệu chạy, thì các trường đó không làm thay đổi
  state.
- **LRN-002-AC-015:** Cho trước phản hồi, lỗi, log hay ví dụ Swagger của thao tác Test Case, khi kiểm
  tra, thì không chứa bí mật service, header xác thực hay nội dung harness.
- **LRN-002-AC-016:** Cho trước một Problem đã xuất bản có Test Case `SAMPLE` và `HIDDEN`, khi người
  học đọc chi tiết, thì phản hồi chứa đầu vào và kết quả mong đợi của mọi Test Case `SAMPLE` theo thứ
  tự, và không chứa bất kỳ dữ liệu, điểm hay số lượng nào của Test Case `HIDDEN`.
- **LRN-002-AC-017:** Cho trước một Test Case mới tạo không chỉ định chế độ hiển thị, khi được lưu,
  thì chế độ của nó là `HIDDEN`.
- **LRN-002-AC-018:** Cho trước một Problem có đủ điều kiện LRN-001 nhưng không có Test Case `HIDDEN`,
  hoặc tổng điểm bằng 0, hoặc (FUNCTION/OOP) thiếu harness của một ngôn ngữ đang bật, khi chủ sở hữu
  yêu cầu xuất bản, thì bị từ chối và lỗi mức độ sẵn sàng nêu đúng điều kiện còn thiếu.
- **LRN-002-AC-019:** Cho trước một yêu cầu gói judge hợp lệ cho Problem có cả Test Case `SAMPLE` và
  `HIDDEN`, khi Learning xử lý, thì gói chứa cả hai loại theo đúng thứ tự đã lưu.
- **LRN-002-AC-020:** Cho trước một Problem `DRAFT`, khi Submission yêu cầu gói judge của nó, thì yêu
  cầu bị từ chối.
- **LRN-002-AC-021:** Cho trước một Problem `STANDARD`, khi chủ sở hữu thử thiết lập harness, thì bị
  từ chối với lỗi kiểm tra dữ liệu.
- **LRN-002-AC-022:** Cho trước chủ sở hữu có thẩm quyền, khi đọc Test Case ở phía quản lý, thì nhận
  đầy đủ đầu vào, kết quả mong đợi, chế độ hiển thị, điểm và thứ tự của mọi Test Case, kể cả `HIDDEN`.
- **LRN-002-AC-023:** Cho trước một Problem đã có 100 Test Case, hoặc một trường vượt 1 MiB, khi thêm
  hoặc sửa Test Case, thì bị từ chối và state không đổi.
- **LRN-002-AC-024:** Cho trước một Problem mà việc thêm/sửa Test Case hoặc đặt harness sẽ làm tổng
  dung lượng vượt 8 MiB, khi thao tác chạy, thì bị từ chối với lỗi kiểm tra dữ liệu và state không
  đổi. Điều này gồm cả cập nhật bật ngôn ngữ làm harness đã đặt trước bắt đầu có hiệu lực.
- **LRN-002-AC-025:** Cho trước một Problem `FUNCTION`/`OOP` đã xuất bản đang bật `python`, khi chủ
  sở hữu đặt harness `java` rồi bật `java` qua cập nhật Problem, thì Problem vẫn `PUBLISHED` và gói
  judge `java` khả dụng; nếu bật `java` khi chưa có harness `java` thì bị từ chối bằng lỗi mức độ sẵn
  sàng và state không đổi.
- **LRN-002-AC-026:** Cho trước một Problem `FUNCTION`/`OOP` có harness `python`, khi chủ sở hữu tắt
  `python` hoặc đổi Problem sang `STANDARD`, thì harness vẫn được lưu nhưng không tính vào tổng 8 MiB
  hay điều kiện sẵn sàng; bật lại `python` thì harness có hiệu lực trở lại.

## Ngoài phạm vi

- Chấm lại (rejudge) Submission khi Test Case thay đổi
- Checker tuỳ chỉnh, so khớp số thực có sai số, so khớp nhiều đáp án đúng, interactive judge
- Sinh Test Case tự động, hoặc sinh kết quả mong đợi bằng cách chạy lời giải chuẩn
- Lưu lời giải chuẩn / lời giải biên tập
- Import/export hàng loạt Test Case (zip, file); v1 chỉ thêm từng Test Case (quyết định 10)
- Versioning bộ Test Case
- Thay đổi cách Judge chuẩn hoá output, dừng sớm, hay phân loại kết quả
- Thay đổi hành vi Run Code của Submission (thuộc SUB-001)
- Giới hạn thời gian/bộ nhớ riêng cho từng Test Case
- Nhóm Test Case (subtask) và chấm theo nhóm
- Microservice mới cho Test Case

## Phụ thuộc

- [Kiến trúc Learning Service](../../../architecture/learning-service.md)
- [Quy tắc phụ thuộc](../../../architecture/dependency-rules.md)
- [ADR 0002: Sửa lại kiến trúc nội bộ của các service](../../../adr/0002-revised-service-internal-architectures.md)
- [Ranh giới service](../../00-system/service-boundaries.md)
- [Vai trò và quyền](../../00-system/roles-permissions.md)
- [Chiến lược cơ sở dữ liệu](../../00-system/database-strategy.md)
- [Chiến lược giao tiếp](../../00-system/communication.md)
- [Bảo mật Judge](../../00-system/judge-security.md)
- [Định nghĩa Hoàn thành](../../00-system/definition-of-done.md)
- [LRN-001 Quản lý Problem](../problems/spec.md): Problem, vòng đời, quyền sở hữu, kiểm tra xuất
  bản, phép chiếu công khai/quản lý.
- [ID-003 RBAC](../../01-identity/rbac/spec.md): quy ước `resource:action`, mặc định từ chối.
- Cơ chế truyền quyền `problem:*` còn treo ở LRN-001-T002; LRN-002 chịu cùng phụ thuộc này.
- Các đặc tả Submission/Judge trong tương lai (SUB-001, SUB-002, JDG-001, JDG-003, JDG-004).

## Câu hỏi mở

Không còn. Các quyết định sản phẩm đã được chủ sở hữu sản phẩm giải quyết và phê duyệt ngày
2026-09-29:

1. **Điều kiện xuất bản:** Bắt buộc có ít nhất một Test Case `HIDDEN`, tổng điểm lớn hơn 0, và với
   `FUNCTION`/`OOP` có harness cho mọi ngôn ngữ đang bật (LRN-002-FR-013).
2. **Test Case mẫu:** Có chế độ `SAMPLE` người học nhìn thấy (LRN-002-FR-007, LRN-002-FR-019).
   - 2a. Test Case `SAMPLE` được chấm và tính điểm khi Submit như Test Case `HIDDEN`.
   - 2b. Run Code MAY dùng Test Case `SAMPLE`; hành vi Run Code thuộc SUB-001.
   - 2c. Giữ cả ví dụ hiển thị của LRN-001 lẫn Test Case `SAMPLE`; không sửa LRN-001.
3. **Chủ sở hữu đọc dữ liệu ẩn:** Đọc được đầy đủ, chỉ trong luồng quản lý của chủ sở hữu
   (LRN-002-FR-008).
4. **Harness:** LRN-002 sở hữu việc quản lý harness theo từng ngôn ngữ; đầu vào Test Case của
   `FUNCTION`/`OOP` là stdin thô do harness đọc, giữ nguyên transport contract (LRN-002-FR-012).
5. **Ý nghĩa điểm:** LRN-002 chỉ lưu điểm từng Test Case; cách tính điểm bài nộp thuộc SUB-002 và
   JDG-001 (LRN-002-FR-010).
6. **Sửa khi đã xuất bản:** Cho phép thêm/sửa/gỡ tại chỗ khi `PUBLISHED`, không chấm lại, miễn giữ
   điều kiện sẵn sàng; gỡ là xoá hẳn (LRN-002-FR-005, LRN-002-FR-016).
7. **Gói judge theo trạng thái:** Chỉ cấp cho Problem `PUBLISHED` chưa xoá mềm và ngôn ngữ đang bật
   (LRN-002-FR-015).
8. **Giới hạn kích thước:** Tối đa 100 Test Case mỗi Problem; tối đa 1 MiB cho mỗi trường đầu vào,
   kết quả mong đợi và harness; tổng mỗi Problem tối đa 8 MiB (LRN-002-FR-011, bổ sung ở 1.1).
9. **Mã quyền:** Tái dùng `problem:update` và `problem:read-managed` của LRN-001; không thêm mã mới.
10. **Import hàng loạt:** v1 chỉ thêm từng Test Case; import file/zip là Ngoài phạm vi.

## Lịch sử sửa đổi

| Ngày       | Phiên bản | Tác giả/Người review | Tóm tắt                                                                                                                                                                                                                         |
| ---------- | --------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-29 | 0.1       | DuongPham-Barca      | Đặc tả Quản lý Test Case ban đầu, Proposed                                                                                                                                                                                      |
| 2026-09-29 | 0.2       | DuongPham-Barca      | Chốt câu 2 (có Test Case mẫu, thêm FR-019, AC-016, AC-017) và câu 10 (chỉ nhập từng Test Case)                                                                                                                                  |
| 2026-09-29 | 1.0       | Chủ sở hữu sản phẩm  | Chốt toàn bộ câu hỏi mở theo đề xuất, thêm AC-018 tới AC-023 và phê duyệt LRN-002                                                                                                                                               |
| 2026-09-29 | 1.1       | Chủ sở hữu sản phẩm  | Thêm trần tổng 8 MiB mỗi Problem vào FR-011 và AC-024, vì gói judge phải vừa một message RabbitMQ (giới hạn mặc định 16 MiB). Đã phê duyệt.                                                                                     |
| 2026-10-28 | 1.2       | DuongPham-Barca      | Sau review code: cho đặt harness trước khi bật ngôn ngữ (FR-012), chỉ tính harness đang có hiệu lực vào trần 8 MiB (FR-011), thêm AC-025, AC-026. Đã phê duyệt ngày 2026-10-28 (DuongPham-Barca xác nhận trong phiên làm việc). |

> `spec.md` mô tả CÁI GÌ. Chi tiết thư mục, class, cách hiện thực repository và thứ tự thực thi
> thuộc về `plan.md`, trừ khi một ràng buộc kiến trúc bắt buộc phải nêu ở đây.
