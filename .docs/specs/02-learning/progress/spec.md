# LRN-006 Tiến độ học tập (Progress)

## Trạng thái

Approved

> Amendment `1.1`, được chủ sở hữu phê duyệt ngày `2026-11-12`: tiến độ Course tính mỗi Problem
> hiển thị và mỗi Quiz hiển thị là một Learning Item có trọng số bằng nhau. Problem hoàn thành khi
> đã giải; Quiz hoàn thành khi có ít nhất một lượt `passed` theo ngưỡng 90% của LRN-009. Completion
> Quiz thuộc user + Quiz và giữ qua revision. Amendment này thay quyết định Problem-only của bản 1.0.

> Cập nhật 2026-11-07: [LRN-008](../self-study/spec.md) thay thế mọi quy định về LECTURER, sở hữu riêng của người tạo, Class, Enrollment, Assignment và tiến độ theo lớp trong tài liệu này. Các yêu cầu còn lại vẫn áp dụng.

Phiên bản `1.1`; phiên bản `1.0` được chủ sở hữu phê duyệt ngày `2026-09-30`.

Giá trị hợp lệ: `Proposed` | `Approved` | `Implemented` | `Verified`

## Mục tiêu

Ghi nhận đúng và bền vững việc một người học đã giải được một Problem, từ sự kiện
`submission.accepted` do Submission phát, rồi dùng dữ liệu đó để cho người học xem tiến độ của chính
mình. Tiến độ Course tổng hợp Problem đã giải và Quiz đã đạt từ dữ liệu Learning hiện có, theo Course
và Chapter. Kết quả Problem phải giống nhau dù sự kiện bị gửi lại hay tới không theo thứ tự.
Các luồng Assignment/Class lịch sử chịu amendment LRN-008 và không được khôi phục bởi thay đổi này.

## Tác nhân

- **STUDENT (người học):** Người dùng đã xác thực. Xem tiến độ của chính mình. Không xem được tiến độ
  của người khác.
- **LECTURER là chủ sở hữu Class:** Giảng viên tạo Class (LRN-004). Xem tiến độ của sinh viên đang
  đăng ký trong Class mình sở hữu, khi có quyền `class:read-managed`.
- **Người dùng đã xác thực khác (kể cả `LECTURER`, `ADMIN`):** Xem được tiến độ của chính mình như
  người học. Không xem được tiến độ của người khác, trừ khi là chủ sở hữu Class như trên.
- **ADMIN:** Không có thẩm quyền ngầm với tiến độ của người khác.
- **Khách chưa xác thực:** Không có quyền truy cập nào.
- **API Gateway:** Xác minh access token, loại bỏ và đặt lại header tin cậy `x-auth-user-id`,
  `x-auth-roles`, `x-auth-permissions` (ID-003 0.4).
- **Submission Service:** Tác nhân service tin cậy, phát sự kiện `submission.accepted` qua RabbitMQ.
  Sở hữu contract của sự kiện này. Không đọc hay ghi tiến độ.
- **Learning Service:** Chủ sở hữu dữ liệu tiến độ và mọi phép tổng hợp tiến độ.

## Bối cảnh

Tiến độ là dữ liệu dẫn xuất: Learning không chấm bài, nó chỉ ghi nhận kết quả mà Submission đã chính
thức công nhận. Nền tảng hiện có:

- Submission phát sự kiện `submission.accepted` lên exchange `bkpractice.learning`, routing key
  `submission.accepted`, queue `learning.submission.accepted`, với payload
  `{ eventId, occurredAt, submissionId, userId, problemId, score }`. Sự kiện chỉ phát cho bài Submit
  được `ACCEPTED`; `score` hiện luôn là 100. `occurredAt` là thời điểm Submission ghi kết quả, không
  phải lúc sinh viên nộp. `eventId` ổn định cho một Submission. Learning không được đổi contract này.
- Hạ tầng RabbitMQ dùng chung thử lại một message lỗi tối đa 3 lần rồi đưa vào hàng đợi chết
  `learning.submission.accepted.dead`. Một message có thể tới hơn một lần.
- Bảng `progress` có một dòng duy nhất cho mỗi cặp (người dùng, Problem), với trạng thái
  (`ATTEMPTED`/`SOLVED`), điểm cao nhất, thời điểm giải và định danh sự kiện áp dụng gần nhất.
- Bộ tiêu thụ hiện tại đánh dấu `SOLVED`, lấy điểm cao nhất, và chỉ đặt thời điểm giải nếu chưa có.
  Nó chỉ bỏ qua sự kiện khi `eventId` trùng với sự kiện áp dụng gần nhất. Hệ quả: gửi lại một sự kiện
  cũ hơn không bị nhận ra là trùng; và nếu sự kiện tới không theo thứ tự thì thời điểm giải là của sự
  kiện được xử lý trước, không phải lần đạt sớm nhất.
- Chưa có API nào đọc tiến độ.

Mã nguồn hiện tại là hành vi nền tảng, không phải bản triển khai của đặc tả này.

Các tính năng liên quan: Problem (LRN-001), Course và Chapter (LRN-003), Class và Enrollment
(LRN-004), Assignment (LRN-005). LRN-006 chỉ đọc chúng, không sửa chúng.

## Yêu cầu chức năng

### Ghi nhận tiến độ

- **LRN-006-FR-001 — Quyền sở hữu của Learning:** Learning MUST sở hữu dữ liệu tiến độ. Không
  service nào khác đọc hay ghi trực tiếp dữ liệu này. Learning MUST NOT đọc cơ sở dữ liệu của
  Submission.
- **LRN-006-FR-002 — Nguồn duy nhất:** Tiến độ MUST chỉ thay đổi khi Learning nhận một sự kiện
  `submission.accepted` hợp lệ. Không có API nào cho phép người dùng tự tạo, sửa hay xoá tiến độ.
- **LRN-006-FR-003 — Đánh dấu đã giải:** Khi nhận một sự kiện hợp lệ, Learning MUST ghi nhận người
  dùng `userId` đã giải Problem `problemId`, lưu điểm cao nhất đã nhận và thời điểm giải.
- **LRN-006-FR-004 — Idempotent theo `eventId`:** Một sự kiện đã được áp dụng MUST NOT làm thay đổi
  tiến độ nếu tới lại, bất kể nó tới lại bao lâu sau và bất kể đã có sự kiện khác được áp dụng ở giữa.
- **LRN-006-FR-005 — Thời điểm giải là lần đạt sớm nhất:** Thời điểm giải của một cặp (người dùng,
  Problem) MUST bằng `occurredAt` nhỏ nhất trong mọi sự kiện đã áp dụng cho cặp đó, kể cả khi sự kiện
  tới không theo thứ tự thời gian.
- **LRN-006-FR-006 — Không phụ thuộc thứ tự:** Với cùng một tập sự kiện, trạng thái đã giải, thời
  điểm giải và điểm cao nhất MUST giống nhau dù các sự kiện được xử lý theo thứ tự nào.
- **LRN-006-FR-007 — Không có trạng thái "đã thử" ở v1:** Learning MUST NOT tạo trạng thái `ATTEMPTED`
  ở v1, vì không có sự kiện nào cho bài nộp không đạt. Một cặp (người dùng, Problem) hoặc đã giải,
  hoặc chưa có tiến độ.
- **LRN-006-FR-008 — Tiến độ không bị thu hồi:** Tiến độ đã ghi MUST NOT bị xoá hay hạ xuống khi
  Problem bị tạm giữ, xoá mềm, gỡ khỏi Course hay Assignment, hoặc khi sinh viên rời Class. Việc hiển
  thị tuân theo quy tắc hiển thị ở dưới.
- **LRN-006-FR-009 — Sự kiện sai định dạng:** Sự kiện thiếu trường, sai kiểu, định danh không phải
  UUID, `occurredAt` không phải thời điểm hợp lệ, hay `score` không phải số nguyên không âm MUST NOT
  làm thay đổi tiến độ và MUST được giữ lại ở hàng đợi chết để vận hành kiểm tra.
- **LRN-006-FR-010 — Lỗi tạm thời:** Khi không ghi được tiến độ vì lỗi tạm thời (ví dụ cơ sở dữ liệu
  không sẵn sàng), sự kiện MUST NOT bị mất: nó được thử lại theo cơ chế hiện có, và khi hết lượt thì
  nằm ở hàng đợi chết. Đưa lại sự kiện từ hàng đợi chết MUST an toàn nhờ LRN-006-FR-004.

### Xem tiến độ của chính mình

- **LRN-006-FR-011 — Tiến độ theo Problem:** Người dùng đã xác thực MUST có thể liệt kê các Problem
  mình đã giải (kèm thời điểm giải), và tra trạng thái đã giải/chưa giải của một danh sách Problem cho
  trước.
- **LRN-006-FR-012 — Tiến độ theo Course:** Người dùng đã xác thực MUST có thể xem tiến độ của mình
  trên một Course `PUBLISHED`: số Learning Item đã hoàn thành trên tổng Learning Item hiển thị, cho
  toàn Course và cho từng Chapter. Mỗi Problem/Quiz hiển thị có trọng số một. Đầu ra MUST cho biết
  loại, định danh và thời điểm hoàn thành của từng item đã hoàn thành.
- **LRN-006-FR-019 — Hoàn thành Quiz:** Quiz được tính hoàn thành khi người dùng có ít nhất một
  `quiz_attempt` đã `FINISHED` và `passed=true`. Lượt fail sau đó MUST NOT thu hồi completion. Việc
  publish revision mới MUST NOT thu hồi completion theo user + Quiz đã có.
- **LRN-006-FR-020 — Hiển thị Quiz:** Chỉ Quiz `PUBLISHED`, chưa xoá mềm và đang được gắn trong
  Chapter của Course mới thuộc tử số/mẫu số. Quiz `ON_HOLD`, đã xoá hoặc đã gỡ khỏi Course không
  xuất hiện; khi hiển thị lại, completion cũ MUST được tính lại mà không cần làm lại.
- **LRN-006-FR-013 — Tiến độ theo Assignment:** Sinh viên đang đăng ký một Class MUST có thể xem điểm
  của mình trên một Assignment của Class đó khi Assignment hiển thị với sinh viên theo LRN-005, tính
  theo quy tắc chấm của LRN-005.

### Chủ sở hữu Class xem tiến độ sinh viên

- **LRN-006-FR-014 — Tổng quan theo Course của lớp:** Chủ sở hữu Class có quyền MUST có thể xem, cho
  mỗi sinh viên đang đăng ký, số Problem hiển thị đã giải trên tổng số Problem hiển thị của Course mà
  Class thuộc về.
- **LRN-006-FR-015 — Chi tiết một sinh viên:** Chủ sở hữu Class có quyền MUST có thể xem tiến độ theo
  Course (như LRN-006-FR-012) của một sinh viên đang đăng ký trong Class mình.
- **LRN-006-FR-016 — Điểm Assignment của lớp:** Chủ sở hữu Class có quyền MUST có thể xem, cho mỗi
  sinh viên đang đăng ký, điểm từng Problem và tổng điểm trên một Assignment của Class đó, ở mọi
  trạng thái mà LRN-005 cho chủ sở hữu thấy Assignment.

### Chung

- **LRN-006-FR-017 — Tính từ dữ liệu hiện tại:** Mọi phép tổng hợp MUST được tính lúc đọc từ tiến độ
  Problem đã lưu, Quiz attempt đã lưu và cấu trúc hiện tại của Course. LRN-006 MUST NOT lưu sẵn điểm,
  completion Course hay tỉ lệ hoàn thành.
- **LRN-006-FR-018 — Chỉ đọc:** Thao tác đọc tiến độ MUST NOT làm thay đổi state. LRN-006 MUST NOT
  tạo, sửa hay xoá Problem, Course, Class, Enrollment hay Assignment.

## Quy tắc nghiệp vụ

### Áp dụng một sự kiện `submission.accepted`

Cho tiến độ hiện có `P` của cặp (`userId`, `problemId`) và một sự kiện hợp lệ `E`:

1. Nếu `E.eventId` đã từng được áp dụng: không làm gì (LRN-006-FR-004).
2. Nếu chưa có `P`: tạo tiến độ đã giải với thời điểm giải `E.occurredAt` và điểm cao nhất `E.score`.
3. Nếu đã có `P`: thời điểm giải = giá trị nhỏ hơn giữa thời điểm giải hiện có và `E.occurredAt`;
   điểm cao nhất = giá trị lớn hơn giữa điểm hiện có và `E.score`; trạng thái là đã giải.
4. Ghi nhận `E.eventId` là đã áp dụng, cùng lúc với bước 2 hoặc 3.

Các phép "nhỏ hơn", "lớn hơn" và "đã giải" có tính giao hoán và luỹ đẳng, nên kết quả không phụ thuộc
thứ tự (LRN-006-FR-006). Learning coi `occurredAt` do Submission cung cấp là đáng tin, không so với
đồng hồ của mình.

Learning không kiểm tra Problem có tồn tại hay đang `PUBLISHED` khi ghi tiến độ: Submission chỉ nộp
được Problem đủ điều kiện (LRN-002-FR-015), và tiến độ của Problem không hiển thị sẽ bị lọc lúc đọc.

### Learning Item hiển thị và hoàn thành

Learning Item hiển thị của một Course là Problem hoặc Quiz đang `PUBLISHED`, chưa xoá mềm và được
xếp trong một Chapter của Course đó, đúng như biểu diễn hướng người học của LRN-003.

- Tử số: số Problem hiển thị đã giải cộng số Quiz hiển thị đã có lượt pass.
- Mẫu số: tổng số Problem và Quiz hiển thị; mỗi item có trọng số một.
- Nội dung bị tạm giữ, xoá mềm hay gỡ khỏi Course không xuất hiện ở cả tử số lẫn mẫu số. Khi hiển thị
  lại, completion cũ được tính lại ngay.
- Quiz pass ở revision bất kỳ hoàn thành Quiz root đó ở mọi Chapter/Course; publish revision mới
  không reset completion.
- Course không có Learning Item hiển thị nào cho kết quả 0/0; biểu diễn không coi đó là lỗi.

Danh sách Problem đã giải của chính người dùng (LRN-006-FR-011) chỉ trả Problem đang `PUBLISHED` chưa
xoá mềm; tiến độ của Problem khác vẫn được giữ và xuất hiện lại khi Problem hiển thị lại.

### Điểm Assignment (theo LRN-005)

- Một Problem của Assignment được tính là đạt nếu người học có thời điểm giải ≤ `deadlineAt` của
  Assignment (giải trước khi Assignment được giao cũng tính).
- Điểm Problem = `maxScore` của Problem đó trong Assignment nếu đạt, 0 nếu không.
- Điểm Assignment = tổng điểm các Problem. Điểm tối đa = tổng `maxScore`.
- Không có nộp trễ ở v1: giải sau `deadlineAt` không được tính.
- Trước `deadlineAt`, điểm là điểm tạm tính và có thể tăng; sau `deadlineAt`, điểm là điểm cuối cùng
  và không đổi trừ khi LRN-005 cho phép sửa Assignment.
- Tập Problem, `maxScore`, `deadlineAt` và Problem nào được hiển thị với sinh viên lấy đúng như LRN-005
  định nghĩa. LRN-006 không định nghĩa lại các quy tắc này.

### Phạm vi sinh viên của một Class

Chỉ sinh viên đang đăng ký Class (LRN-004) xuất hiện trong tiến độ của lớp. Sinh viên đã rời lớp hoặc
bị gỡ không xuất hiện; tiến độ của họ vẫn được giữ vì nó thuộc về người dùng, không thuộc về Class.
Class ở trạng thái `ARCHIVED` vẫn xem được tiến độ.

## Quy tắc phân quyền

| Thao tác                                     | Ai được phép                                         | Quyền                          |
| -------------------------------------------- | ---------------------------------------------------- | ------------------------------ |
| Xem tiến độ của chính mình (Problem, Course) | Mọi người dùng đã xác thực                           | Không cần mã quyền             |
| Xem điểm Assignment của chính mình           | Sinh viên đang đăng ký Class của Assignment          | Không cần mã quyền             |
| Xem tiến độ sinh viên trong Class            | Chủ sở hữu Class (`lecturer_id` = principal tin cậy) | `class:read-managed` (LRN-004) |
| Ghi tiến độ                                  | Chỉ Learning, khi nhận sự kiện `submission.accepted` | Không có API                   |

- "Chính mình" luôn là `x-auth-user-id` do Gateway đặt. Không route, query hay body nào chọn được
  người dùng khác cho các thao tác "của chính mình".
- LRN-006 không thêm mã quyền mới. `class:read-managed` do LRN-004 định nghĩa và seed.
- `ADMIN` không có thẩm quyền ngầm; `ADMIN` không phải chủ sở hữu Class thì không xem được tiến độ
  của người khác.
- Chủ sở hữu Class chỉ thấy tiến độ trong phạm vi Class mình: tiến độ của sinh viên trên Course của
  Class và trên Assignment của Class. Họ không thấy tiến độ của sinh viên ở Problem, Course hay Class
  khác.
- Sinh viên cùng lớp không xem được tiến độ của nhau.
- Thiếu quyền trong header tin cậy thì coi là rỗng; phân quyền thiếu hoặc mơ hồ mặc định là từ chối.

## Đầu vào

### Sự kiện `submission.accepted` (từ Submission)

`{ eventId, occurredAt, submissionId, userId, problemId, score }` theo contract hiện có. Learning chỉ
dùng `eventId`, `occurredAt`, `userId`, `problemId`, `score`; `submissionId` không bắt buộc cho hành vi
nhưng vẫn được kiểm tra định dạng.

### Đọc tiến độ

- **Theo Problem:** phân trang; tuỳ chọn một danh sách tối đa 100 định danh Problem để tra trạng thái.
- **Theo Course:** định danh Course.
- **Theo Assignment (của mình):** định danh Assignment.
- **Theo Class (chủ sở hữu):** định danh Class; phân trang theo sinh viên; định danh sinh viên khi xem
  chi tiết; định danh Assignment khi xem điểm Assignment.

Không đầu vào nào nhận định danh người dùng cho thao tác "của chính mình". Route và DTO cụ thể thuộc
`plan.md`.

## Đầu ra

- **Theo Problem:** danh sách (định danh Problem, thời điểm giải) của Problem đã giải đang hiển thị;
  khi tra theo danh sách, mỗi định danh trả đã giải/chưa giải và thời điểm giải nếu có. Problem không
  hiển thị trả như chưa giải, không lộ sự tồn tại.
- **Theo Course:** định danh Course, `completed`, `total`, danh sách Chapter theo thứ tự với
  `completed/total`, và `completedItems` gồm `type` (`PROBLEM`/`QUIZ`), `itemId`, `completedAt`.
- **Theo Assignment (của mình):** định danh Assignment, `deadlineAt`, điểm, điểm tối đa, cờ điểm đã
  cuối cùng hay còn tạm tính, và cho mỗi Problem hiển thị với sinh viên: đạt/không đạt, điểm, thời
  điểm giải nếu có.
- **Tổng quan lớp theo Course:** danh sách phân trang (định danh sinh viên, thời điểm đăng ký, số đã
  giải), cùng tổng số Problem hiển thị của Course.
- **Điểm Assignment của lớp:** danh sách phân trang (định danh sinh viên, điểm, điểm từng Problem),
  cùng điểm tối đa và cờ điểm đã cuối cùng.
- Tên, email hay hồ sơ của sinh viên không có trong đầu ra; chúng thuộc Identity.
- LRN-006 không phát domain event nào.

## Tình huống lỗi

| Trường hợp                                                                     | Hành vi quan sát được                                                 |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| Thiếu hoặc sai xác thực                                                        | `401`                                                                 |
| Thiếu `class:read-managed` hoặc không phải chủ sở hữu Class                    | `403`                                                                 |
| Course không tồn tại hoặc không `PUBLISHED` (hoặc đã xoá mềm)                  | `404`; không lộ trạng thái chưa công khai                             |
| Class không tồn tại                                                            | `404`                                                                 |
| Assignment không tồn tại, không thuộc Class, hoặc chưa hiển thị với sinh viên  | `404`; không lộ Assignment chưa công khai                             |
| Sinh viên xem Assignment của Class mình không đăng ký                          | `404`                                                                 |
| Sinh viên được hỏi không đang đăng ký Class                                    | `404`                                                                 |
| Tham số sai định dạng (UUID sai, quá 100 định danh, phân trang ngoài giới hạn) | `400`                                                                 |
| Sự kiện sai định dạng                                                          | Không đổi tiến độ; message vào hàng đợi chết sau khi hết lượt thử     |
| Sự kiện trùng `eventId`                                                        | Được xác nhận xử lý xong, không đổi tiến độ                           |
| Lỗi lưu trữ khi áp dụng sự kiện                                                | Không đổi tiến độ; thử lại theo cơ chế hiện có, rồi vào hàng đợi chết |
| Lỗi lưu trữ ngoài dự kiến khi đọc                                              | Lỗi chuẩn hoá hiện có                                                 |

LRN-006 không đưa vào cấu trúc lỗi mới.

## Tình huống biên

- Hai sự kiện khác nhau của cùng cặp (người dùng, Problem) tới đồng thời: cả hai đều được áp dụng, kết
  quả như khi áp dụng tuần tự.
- Sự kiện của lần đạt sớm hơn tới sau: thời điểm giải lùi về `occurredAt` sớm hơn.
- Cùng `eventId` tới lại với `occurredAt` khác (ví dụ Submission phát lại): lần sau bị bỏ qua như sự
  kiện trùng.
- `occurredAt` đúng bằng `deadlineAt`: được tính đạt.
- Người học giải Problem trước khi Assignment được tạo: được tính đạt nếu thời điểm giải ≤
  `deadlineAt`.
- Problem/Quiz bị tạm giữ sau khi hoàn thành: không còn trong tử số và mẫu số của Course; xuất bản
  lại thì được tính lại. Quiz đổi revision không làm mất completion.
- Class không có sinh viên: danh sách rỗng.
- Dữ liệu tiến độ ghi trước LRN-006 có thể có thời điểm giải không phải lần đạt sớm nhất; nó được sửa
  dần khi sự kiện sớm hơn tới lại, và không được sửa ngược vì Learning không đọc Submission.
- Người dùng không phải `STUDENT` (ví dụ giảng viên tự nộp thử) vẫn có tiến độ của riêng mình.

## Yêu cầu bảo mật

- **LRN-006-SR-001 — Phân quyền phía server:** Quyền, quyền sở hữu Class và việc đăng ký MUST được
  kiểm tra tại backend Learning.
- **LRN-006-SR-002 — Ngữ cảnh tin cậy:** Định danh và quyền MUST chỉ đến từ header Gateway đã xác
  minh. Không tham số nào của client chọn được người dùng cho thao tác "của chính mình".
- **LRN-006-SR-003 — Cách ly dữ liệu giữa người học:** Người học MUST NOT đọc được tiến độ của người
  khác; chủ sở hữu Class MUST NOT đọc được tiến độ ngoài phạm vi Class mình.
- **LRN-006-SR-004 — Không lộ nội dung chưa công khai:** Biểu diễn tiến độ MUST NOT lộ sự tồn tại,
  tiêu đề hay số lượng của Problem, Course hay Assignment chưa công khai với người gọi.
- **LRN-006-SR-005 — Không lộ dữ liệu judge hay Submission:** Biểu diễn tiến độ MUST NOT chứa mã nguồn,
  Test Case, harness hay kết quả chấm chi tiết.
- **LRN-006-SR-006 — Tin cậy nguồn sự kiện:** Tiến độ MUST chỉ thay đổi qua sự kiện nhận từ queue nội
  bộ `learning.submission.accepted`; không có đường HTTP nào ghi tiến độ.
- **LRN-006-SR-007 — Cách ly service:** Learning MUST NOT truy vấn cơ sở dữ liệu của Submission hay
  Identity; không khoá ngoại xuyên service.
- **LRN-006-SR-008 — Ghi log an toàn:** Log MUST NOT chứa header xác thực, token hay bí mật; log sự
  kiện chỉ ghi định danh.
- **LRN-006-SR-009 — Thất bại an toàn:** Ngữ cảnh phân quyền thiếu, sai định dạng hay mơ hồ MUST bị từ
  chối.

## Tiêu chí nghiệm thu

- **LRN-006-AC-001:** Cho trước người dùng chưa có tiến độ với một Problem, khi Learning nhận một sự
  kiện hợp lệ cho cặp đó, thì cặp đó được ghi là đã giải với thời điểm giải bằng `occurredAt` và điểm
  cao nhất bằng `score`.
- **LRN-006-AC-002:** Cho trước một sự kiện đã được áp dụng, khi đúng sự kiện đó tới lại ngay sau hoặc
  sau khi đã áp dụng các sự kiện khác, thì tiến độ không thay đổi.
- **LRN-006-AC-003:** Cho trước sự kiện B (`occurredAt` muộn hơn) đã được áp dụng, khi sự kiện A
  (`occurredAt` sớm hơn, `eventId` khác) tới, thì thời điểm giải thành `occurredAt` của A.
- **LRN-006-AC-004:** Cho trước sự kiện A (sớm hơn) đã được áp dụng, khi sự kiện B (muộn hơn) tới, thì
  thời điểm giải vẫn là của A.
- **LRN-006-AC-005:** Cho trước cùng một tập sự kiện, khi xử lý theo mọi hoán vị (kể cả có sự kiện lặp
  lại), thì trạng thái, thời điểm giải và điểm cao nhất cuối cùng như nhau.
- **LRN-006-AC-006:** Cho trước hai sự kiện khác nhau cho cùng một cặp chưa có tiến độ, khi chúng được
  xử lý đồng thời, thì có đúng một dòng tiến độ và kết quả như khi xử lý tuần tự.
- **LRN-006-AC-007:** Cho trước một sự kiện sai định dạng, khi Learning xử lý, thì tiến độ không đổi và
  message nằm ở hàng đợi chết sau khi hết lượt thử.
- **LRN-006-AC-008:** Cho trước cơ sở dữ liệu tạm thời lỗi, khi một sự kiện hợp lệ tới rồi được đưa lại
  (qua thử lại hoặc từ hàng đợi chết) sau khi cơ sở dữ liệu phục hồi, thì sự kiện được áp dụng đúng một
  lần.
- **LRN-006-AC-009:** Cho trước bất kỳ luồng nào, khi kiểm tra, thì Learning không bao giờ tạo tiến độ
  `ATTEMPTED`.
- **LRN-006-AC-010:** Cho trước người dùng đã giải một số Problem, trong đó có Problem đang `ON_HOLD`,
  khi họ liệt kê Problem đã giải, thì chỉ Problem đang `PUBLISHED` chưa xoá mềm xuất hiện, kèm thời
  điểm giải.
- **LRN-006-AC-011:** Cho trước một Course `PUBLISHED` có Problem và Quiz ở trạng thái `PUBLISHED`,
  `ON_HOLD` và đã xoá mềm, khi người học xem tiến độ theo Course, thì tử số và mẫu số chỉ tính
  Learning Item `PUBLISHED` chưa xoá, cho toàn Course và từng Chapter.
- **LRN-006-AC-012:** Cho trước một Course `DRAFT`, `ON_HOLD` hoặc đã xoá mềm, khi người học xem tiến
  độ theo Course, thì nhận `404`.
- **LRN-006-AC-013:** Cho trước một Problem đã giải bị tạm giữ rồi xuất bản lại, khi người học xem tiến
  độ theo Course, thì nó không được tính trong lúc tạm giữ và được tính lại là đã giải sau đó, không cần
  nộp lại.
- **LRN-006-AC-014:** Cho trước một Assignment có `deadlineAt` và các Problem có `maxScore`, khi sinh
  viên có thời điểm giải ≤ `deadlineAt` ở một số Problem và > `deadlineAt` ở Problem khác, thì điểm
  bằng tổng `maxScore` của các Problem giải đúng hạn, Problem giải trễ được 0.
- **LRN-006-AC-015:** Cho trước sinh viên đã giải một Problem trước khi Assignment chứa nó được tạo,
  khi xem điểm Assignment, thì Problem đó được tính đạt.
- **LRN-006-AC-016:** Cho trước thời điểm giải đúng bằng `deadlineAt`, khi tính điểm, thì Problem được
  tính đạt.
- **LRN-006-AC-017:** Cho trước một Assignment chưa hiển thị với sinh viên theo LRN-005, hoặc sinh viên
  không đăng ký Class của nó, khi sinh viên xem điểm của mình, thì nhận `404`.
- **LRN-006-AC-018:** Cho trước chủ sở hữu Class có `class:read-managed`, khi xem tổng quan theo Course
  hoặc điểm Assignment của lớp, thì chỉ sinh viên đang đăng ký xuất hiện, với số liệu đúng quy tắc.
- **LRN-006-AC-019:** Cho trước một giảng viên không phải chủ sở hữu Class, một `ADMIN` chưa được cấp,
  hoặc một `STUDENT` (kể cả sinh viên của lớp), khi xem tiến độ của lớp, thì nhận `403`.
- **LRN-006-AC-020:** Cho trước người chưa xác thực, khi gọi bất kỳ thao tác đọc tiến độ nào, thì nhận
  `401`.
- **LRN-006-AC-021:** Cho trước một request "của chính mình" kèm định danh người dùng khác trong query
  hoặc body, khi xử lý, thì kết quả vẫn chỉ là tiến độ của người gọi, hoặc request bị từ chối vì trường
  không được phép.
- **LRN-006-AC-022:** Cho trước chủ sở hữu Class hỏi chi tiết một sinh viên không đăng ký Class đó, khi
  xử lý, thì nhận `404`.
- **LRN-006-AC-023:** Cho trước một sinh viên rời Class, khi chủ sở hữu xem tiến độ lớp, thì sinh viên
  đó không xuất hiện; khi sinh viên đó xem tiến độ theo Problem của mình, thì tiến độ vẫn còn.
- **LRN-006-AC-024:** Cho trước mọi biểu diễn tiến độ, khi kiểm tra, thì không chứa mã nguồn, Test Case,
  harness, tên hay email của sinh viên.
- **LRN-006-AC-025:** Cho trước Course chỉ có Quiz hiển thị, khi chưa pass thì tiến độ là 0/1; sau
  lượt đạt ít nhất 90% thì là 1/1 và item hoàn thành có type `QUIZ`.
- **LRN-006-AC-026:** Cho trước Course hỗn hợp có một Problem đã giải và một Quiz đã pass, khi đọc
  tiến độ thì kết quả là 2/2; lượt Quiz fail sau đó và publish revision mới không làm giảm kết quả.
- **LRN-006-AC-027:** Cho trước Quiz đã pass bị hold/xoá/gỡ rồi xuất hiện lại, khi đọc tiến độ thì
  item bị loại khỏi mẫu số trong thời gian ẩn và completion cũ xuất hiện lại sau khi khả dụng.

## Ngoài phạm vi

- Trạng thái "đã thử" (`ATTEMPTED`), số lần nộp, lần nộp gần nhất (cần sự kiện mới từ Submission)
- Đổi contract `submission.accepted`, hoặc thêm `submittedAt` (thuộc đội Submission)
- Tiến độ theo Topic/Tag, chuỗi ngày học, huy hiệu, bảng xếp hạng
- Xuất bảng điểm (CSV/Excel), gửi điểm sang hệ thống khác
- Nộp trễ, gia hạn riêng từng sinh viên, chấm tay, sửa điểm tay
- Lưu sẵn (cache/snapshot) điểm hay tỉ lệ hoàn thành
- Tính lại tiến độ từ lịch sử của Submission (backfill)
- Công cụ đưa lại message từ hàng đợi chết (vận hành dùng công cụ RabbitMQ hiện có)
- Thông báo realtime khi tiến độ thay đổi
- Gợi ý bài (LRN-007)
- Tiến độ cho Run Code

## Phụ thuộc

- [Kiến trúc Learning Service](../../../architecture/learning-service.md)
- [Quy tắc phụ thuộc](../../../architecture/dependency-rules.md)
- [ADR 0002](../../../adr/0002-revised-service-internal-architectures.md)
- [Ranh giới service](../../00-system/service-boundaries.md)
- [Vai trò và quyền](../../00-system/roles-permissions.md)
- [Chiến lược cơ sở dữ liệu](../../00-system/database-strategy.md)
- [Chiến lược giao tiếp](../../00-system/communication.md)
- [Định nghĩa Hoàn thành](../../00-system/definition-of-done.md)
- [LRN-001 Quản lý Problem](../problems/spec.md): trạng thái và xoá mềm của Problem.
- [LRN-003 Quản lý Course](../courses/spec.md): Chapter, thứ tự Problem, Problem hiển thị với người
  học.
- [LRN-009 Quiz](../quizzes/spec.md): ngưỡng pass 90%, completion user + Quiz và lifecycle Quiz.
- LRN-004 Class & Enrollment (`../enrollments/spec.md`, đang viết): chủ sở hữu Class, đăng ký, trạng
  thái `ARCHIVED`, quyền `class:read-managed`.
- LRN-005 Assignment (`../assignments/spec.md`, đang viết): Problem và `maxScore` của Assignment,
  `deadlineAt`, quy tắc hiển thị với sinh viên, quy tắc chấm.
- [ID-003 RBAC](../../01-identity/rbac/spec.md) bản 0.4: claim `permissions`, header tin cậy.
- Contract `SubmissionAcceptedEvent` trong `libs/contracts` (thuộc Submission, không đổi).

## Câu hỏi mở

Không còn. Các quyết định dưới đây là phương án đề xuất, được chủ sở hữu sản phẩm phê duyệt gộp ngày
2026-09-30:

1. **Nguồn tiến độ:** Chỉ từ `submission.accepted`; không API ghi tiến độ (FR-002, SR-006).
2. **Idempotent:** Theo `eventId` với mọi sự kiện đã áp dụng, không chỉ sự kiện gần nhất (FR-004).
3. **Thời điểm giải:** `occurredAt` nhỏ nhất trong các sự kiện đã áp dụng, không phụ thuộc thứ tự tới
   (FR-005, FR-006).
4. **`ATTEMPTED`:** Không có ở v1 vì không có sự kiện cho bài không đạt (FR-007).
5. **Tổng hợp theo Course:** Amendment 1.1 thay quyết định cũ: mỗi Problem đã giải hoặc Quiz đã pass
   là một Learning Item hoàn thành; tử số/mẫu số chỉ tính item đang hiển thị (FR-012, FR-019/020).
6. **Tổng hợp theo Assignment:** Theo quy tắc chấm của LRN-005: đạt khi thời điểm giải ≤
   `deadlineAt`, điểm `maxScore` hoặc 0, tổng là điểm Assignment; có cờ tạm tính/cuối cùng (FR-013).
7. **Ai xem:** Người học xem của chính mình; chủ sở hữu Class xem sinh viên đang đăng ký trong lớp
   mình (FR-014 tới FR-016).
8. **Quyền:** Không thêm quyền mới; người học chỉ cần đã xác thực; giảng viên dùng
   `class:read-managed` của LRN-004 cộng quyền sở hữu Class.
9. **Tiến độ khi nội dung đổi trạng thái:** Không thu hồi; chỉ lọc lúc đọc (FR-008).
10. **Sự kiện sai định dạng:** Không áp dụng, để hạ tầng hiện có đưa vào hàng đợi chết (FR-009).
11. **Lưu sẵn điểm:** Không; tính lúc đọc (FR-017).
12. **Hồ sơ sinh viên trong đầu ra:** Không; chỉ định danh, hồ sơ thuộc Identity.

## Lịch sử sửa đổi

| Ngày       | Phiên bản | Tác giả/Người review                | Tóm tắt                                                                               |
| ---------- | --------- | ----------------------------------- | ------------------------------------------------------------------------------------- |
| 2026-09-30 | 1.0       | Chủ sở hữu sản phẩm (phê duyệt gộp) | Đặc tả Tiến độ ban đầu, chọn phương án đề xuất cho 12 câu hỏi mở và phê duyệt LRN-006 |

> `spec.md` mô tả CÁI GÌ. Chi tiết thư mục, class, cách hiện thực repository và thứ tự thực thi
> thuộc về `plan.md`, trừ khi một ràng buộc kiến trúc bắt buộc phải nêu ở đây.
