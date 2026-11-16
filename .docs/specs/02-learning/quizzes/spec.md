# LRN-009 — Quiz và ngân hàng câu hỏi

## Trạng thái

Approved

Phiên bản `1.6`; amendment Progress/Course được chủ sở hữu phê duyệt ngày `2026-11-12`. Toàn bộ
phương án MVP 1.5 được chủ sở hữu phê duyệt ngày `2026-11-11`; hợp đồng
Idempotency-Key được chủ sở hữu duyệt ngày `2026-11-12`; ngân hàng câu hỏi dùng chung theo mặc
định được chủ sở hữu xác nhận ngày `2026-11-12`.
Phiên bản `1.0` đã được phê duyệt cùng ngày. Các quyết định chia sẻ Q-001 tới Q-008 được ghi ở
bảng quyết định; amendment 1.5 thay đổi chính sách visibility của Question, còn scope Quiz giữ
nguyên.

Giá trị hợp lệ: `Proposed` | `Approved` | `Implemented` | `Verified`.

Lần soạn spec ban đầu chỉ đặc tả sản phẩm. Theo yêu cầu tiếp theo ngày 2026-11-11, đã bổ sung
[plan](./plan.md) và [tasks](./tasks.md) ở trạng thái draft để review; chưa tạo code, migration
hoặc thay đổi cấu hình. Plan và tasks đã được review và cho phép triển khai cùng phê duyệt 1.3
ngày 2026-11-11; trạng thái hiện hành của hai file đó ghi ở đầu từng file.

## Mục tiêu

Cho phép người quản lý soạn câu hỏi một lần trong ngân hàng, chọn lại chúng để tạo nhiều Quiz,
và gắn Quiz vào các Chapter của Course. Người học làm Quiz trên mobile, nhận kết quả và giải
thích ngay sau mỗi câu, rồi xem tổng kết. Quiz đạt từ 90% trở lên được ghi nhận hoàn thành.

## Tác nhân

- **LECTURER:** tạo và quản lý câu hỏi, Quiz do mình tạo; quản lý liên kết Quiz trong Course
  thuộc phạm vi của mình.
- **ADMIN:** quản lý nội dung Learning của mọi người tạo, với quyền tương ứng.
- **Người học đã xác thực:** làm Quiz, tiếp tục lượt đang làm, xem kết quả của chính mình.
- **Learning:** sở hữu ngân hàng câu hỏi, Quiz, liên kết Chapter, lượt làm, chấm và lịch sử.
- **Identity / API Gateway:** cung cấp danh tính, vai trò, quyền đã xác minh và định tuyến.

## Bối cảnh

Learning hiện có Problem, Test Case, Course/Chapter và Progress cá nhân. LRN-003 hiện chỉ mô tả
Chapter chứa danh sách Problem; chưa có ngân hàng câu hỏi hay luồng Quiz. Quiz là phần nội dung
mới, không phải một loại Problem cần chạy mã qua Submission/Judge.

### Quyết định đã được chủ sở hữu xác nhận

1. Quiz thuộc Learning và phục vụ trải nghiệm mobile.
2. Một Chapter có nhiều Quiz; một Quiz có thể ở nhiều Chapter, kể cả khác Course.
3. Điểm từ 90% trở lên thì Quiz được tính là hoàn thành.
4. Chấm trắc nghiệm bằng bộ đáp án phía Learning, không qua Judge.
5. Chọn đáp án thì trả kết quả và giải thích ngay; cuối lượt tổng hợp thông số.
6. LECTURER chỉ sửa nội dung mình tạo; ADMIN sửa mọi nội dung Learning.
7. Có ngân hàng câu hỏi dùng lại; tạo Quiz bằng cách chọn câu có sẵn để giảm nhập lặp.
8. Câu hỏi ngân hàng dùng chung cho mọi LECTURER theo mặc định. Chủ sở hữu có thể đánh dấu câu
   hỏi riêng tư và cấp quyền dùng/nhân bản cho từng LECTURER. Người khác có thể dùng câu hỏi chung
   hoặc nhân bản thành bản riêng để chỉnh sửa; không sửa trực tiếp bản gốc. LECTURER chỉ sửa nội
   dung mình tạo; ADMIN quản lý mọi nội dung. Quiz vẫn riêng tư mặc định và chia sẻ có kiểm soát.

### Phạm vi bản đề xuất

Phần còn lại mô tả bản đầu để review: câu hỏi chọn một đáp án, mỗi câu một điểm; tạo Quiz nháp,
chọn nhiều câu, sắp xếp, xuất bản, liên kết Chapter, làm từng câu và tổng kết. Nhân bản nội dung
được phép đã được yêu cầu ở FR-026; cách clone tham chiếu, import và các tiện ích khác chờ Q-002.

### Quan hệ với đặc tả hiện hànhx

- Quyết định mới về LECTURER/ADMIN **trái với** LRN-008 FR-001/002/003 và kiến trúc Learning hiện
  mô tả ADMIN-only. Trước triển khai phải đồng bộ chính sách này trong LRN-008, các spec
  Problem/Test Case/Course, Identity RBAC và tài liệu kiến trúc liên quan. Spec này ghi nhận yêu
  cầu mới; không tự sửa các tài liệu Approved hoặc khẳng định code hiện tại đã hỗ trợ.
- LRN-003 cần bổ sung liên kết và hiển thị Quiz trong Chapter. Giới hạn 50 Problem/Chapter hiện
  có không mặc nhiên là giới hạn Quiz hoặc tổng số nội dung trong Chapter.
- LRN-006 1.1 tính mỗi Quiz hiển thị là một Learning Item: hoàn thành khi user có lượt pass ít nhất
  90%, giữ completion theo user + Quiz qua revision. Quiz không đặt điều kiện mở khoá Chapter.
- Không khôi phục Class, Enrollment, Assignment hoặc vai trò giảng viên theo mô hình lớp học.

## Yêu cầu chức năng

### Sở hữu và ngân hàng câu hỏi

- **LRN-009-FR-001 — Ranh giới:** Learning MUST sở hữu nội dung, phiên bản câu hỏi, Quiz, lượt
  làm và quy tắc chấm. Gateway chỉ xử lý transport/xác thực; Submission và Judge không chấm Quiz.
- **LRN-009-FR-002 — Quyền quản lý:** Thao tác quản lý MUST yêu cầu vai trò `LECTURER` hoặc
  `ADMIN` và quyền tương ứng. LECTURER MUST chỉ sửa nội dung mình tạo; ADMIN MUST có thể sửa nội
  dung của mọi người tạo. `createdBy` MUST lấy từ danh tính đã xác minh khi tạo.
- **LRN-009-FR-003 — Câu hỏi độc lập:** Câu hỏi MUST tồn tại độc lập với Quiz, có định danh ổn
  định và có thể được dùng trong nhiều Quiz. Tạo Quiz MUST NOT bắt buộc nhập lại câu đã có.
- **LRN-009-FR-004 — Nội dung câu hỏi:** Bản đề xuất hỗ trợ một đáp án đúng. Mỗi câu MUST có nội
  dung, các lựa chọn có định danh, đúng một lựa chọn đúng và giải thích. Nội dung MAY chứa đoạn
  code để đọc; hệ thống MUST NOT thực thi đoạn code đó.
- **LRN-009-FR-005 — Tìm và chọn hàng loạt:** Người soạn MUST có thể tìm câu hỏi, lọc theo chủ
  đề/độ khó, xem trước trong phạm vi được phép và chọn nhiều câu vào Quiz. Màn hình MUST thể
  hiện các câu đã chọn để tránh thêm trùng. Hợp đồng phân loại/giới hạn chờ Q-007/Q-008.
- **LRN-009-FR-006 — Tạo ngay khi soạn:** Người soạn MUST có thể tạo câu hỏi trong quá trình
  chọn câu cho Quiz. Câu mới MUST được lưu vào ngân hàng để dùng lại; kết quả MUST phân biệt
  rõ việc lưu câu hỏi và việc thêm nó vào Quiz, không tạo lại câu do client retry.
- **LRN-009-FR-007 — Ngân hàng câu hỏi dùng chung:** Câu hỏi mới MUST dùng chung cho mọi
  LECTURER theo mặc định; người tạo MAY đánh dấu câu hỏi riêng tư khi tạo hoặc đổi visibility.
  Câu hỏi riêng tư chỉ
  chủ sở hữu, ADMIN hoặc LECTURER được cấp quyền mới được đọc/dùng. Owner MUST có thể cấp/thu hồi
  quyền cho từng LECTURER đối với câu hỏi riêng tư. Mọi LECTURER được phép dùng câu hỏi chung để
  soạn Quiz; dùng câu hỏi MUST NOT chuyển quyền sửa bản gốc. Người không sở hữu câu hỏi MUST có
  thể nhân bản câu được phép dùng thành bản riêng có owner/ID mới; bản clone MUST riêng tư mặc
  định và chỉnh sửa MUST NOT ảnh hưởng câu nguồn. LECTURER chỉ sửa/xoá/khôi phục/revise câu do
  mình tạo; ADMIN có quyền trên mọi câu. Quiz vẫn riêng tư mặc định và chỉ dùng được theo quyền
  owner/admin/grant hiện hành; publish Quiz MUST NOT công khai quyền dùng Quiz cho giảng viên.
- **LRN-009-FR-026 — Nhân bản nội dung được phép:** Người có quyền nhân bản MUST có thể tạo câu
  hỏi hoặc Quiz mới từ nội dung được phép sử dụng. Bản sao MUST có định danh mới và người tạo
  là người thực hiện; bản clone câu hỏi MUST riêng tư mặc định; chỉnh sửa bản sao MUST NOT sửa nội
  dung gốc. Clone Quiz MUST sao chép các câu đã được phép vào các câu riêng tư độc lập.

### Soạn Quiz và liên kết Chapter

- **LRN-009-FR-008 — Tạo nháp:** Quiz MUST có định danh, tiêu đề, mô tả tuỳ chọn, người tạo và
  trạng thái. Tạo mới MUST cho phép Quiz chưa có câu hỏi, ở `DRAFT`, không hiển thị cho người học.
- **LRN-009-FR-009 — Danh sách câu:** Người có quyền MUST có thể thêm/bỏ nhiều câu và đổi thứ
  tự trong Quiz nháp. Một câu gốc MUST xuất hiện tối đa một lần trong cùng phiên bản Quiz;
  các phiên bản khác nhau của cùng câu gốc không được dùng để lách quy tắc này.
- **LRN-009-FR-010 — Xem trước:** Người quản lý MUST xem được thứ tự, nội dung, đáp án và giải
  thích trong phạm vi quản lý. Xem trước MUST NOT tạo lượt học hoặc ghi nhận hoàn thành.
- **LRN-009-FR-011 — Kiểm tra xuất bản:** Publish MUST yêu cầu tiêu đề không rỗng, ít nhất một
  câu hợp lệ và toàn bộ câu được phép sử dụng. Mỗi câu có ít nhất hai lựa chọn, đúng một đáp án
  đúng và giải thích không rỗng. Lỗi MUST chỉ rõ nội dung cần sửa và giữ nguyên trạng thái.
- **LRN-009-FR-012 — Phiên bản đã xuất bản:** Quiz đã publish MUST cố định danh sách, thứ tự và
  phiên bản câu hỏi. Sửa câu gốc MUST NOT âm thầm sửa các Quiz đã publish. Người quản lý MUST
  có thể nhận biết có bản câu hỏi mới và chủ động chọn cập nhật qua một lần xuất bản mới.
- **LRN-009-FR-013 — Quan hệ Chapter:** Một Chapter MUST hỗ trợ nhiều Quiz và một Quiz MUST
  hỗ trợ nhiều Chapter/Course. Cặp Chapter/Quiz MUST không trùng; liên kết MUST có thứ tự và
  MUST NOT sao chép nội dung Quiz. Quyền gắn/gỡ dựa trên Course sở hữu Chapter và quyền sử dụng
  Quiz; không dựa riêng vào quyền sửa Quiz.
- **LRN-009-FR-014 — Gỡ liên kết:** Gỡ Quiz khỏi Chapter MUST NOT xoá Quiz, câu hỏi hoặc lịch sử
  lượt làm. Gắn lại MUST NOT nhân bản các nội dung đó.
- **LRN-009-FR-015 — Hiển thị:** Luồng người học trong Course MUST chỉ hiển thị Quiz được phép
  học trong Course công khai; bản nháp hoặc nội dung bị ẩn MUST không lộ qua danh sách, số lượng
  hay lookup trực tiếp. Phạm vi truy cập độc lập và hành vi ẩn/rút nội dung chờ Q-005.

### Làm bài và chấm từng câu

- **LRN-009-FR-016 — Bắt đầu lượt:** Người học MUST bắt đầu một lượt có định danh, gắn với chính
  người gọi và một phiên bản Quiz được phép học. Lượt MUST giữ nguyên đề, lựa chọn, đáp án và
  giải thích đã nhận dù nội dung nguồn thay đổi; không gửi bộ đáp án đầy đủ cho mobile.
- **LRN-009-FR-017 — Tiếp tục:** Người học MUST có thể mở lại lượt đang làm, nhận tiến độ và
  phản hồi của những câu đã trả lời. Các câu chưa trả lời MUST vẫn được giữ kín đáp án.
- **LRN-009-FR-018 — Chấm ngay:** Mỗi lần gửi lựa chọn hợp lệ, Learning MUST kiểm tra câu và
  lựa chọn thuộc lượt đó, chấm bằng đáp án đã cố định, lưu lựa chọn/kết quả rồi trả ngay đúng/sai,
  đáp án đúng và giải thích của **câu vừa trả lời**. Không chờ nộp cả Quiz mới chấm.
- **LRN-009-FR-019 — Lựa chọn đầu tiên:** Bản đề xuất chỉ tính lựa chọn đầu tiên của mỗi câu
  trong lượt. Câu đã chấm MUST bị khoá; người học không được đổi lựa chọn sau khi thấy đáp án.
- **LRN-009-FR-020 — Retry và đồng thời:** Gửi lại cùng câu và lựa chọn MUST trả kết quả đã lưu,
  không cộng điểm hoặc tạo bản ghi trùng. Gửi lựa chọn khác cho câu đã chấm MUST bị từ chối.
  Nhiều request đồng thời MUST không khiến một câu được ghi nhận hai lần. Phản hồi chấm chỉ được
  xác nhận thành công sau khi lựa chọn và kết quả được lưu thành công.
- **LRN-009-FR-021 — Kết thúc:** Người học MUST có thể kết thúc lượt sau khi mọi câu đã có câu
  trả lời. Kết thúc MUST tổng hợp từ kết quả phía server, không nhận điểm do mobile gửi. Retry
  kết thúc MUST trả cùng kết quả; hoàn tất và trả lời đồng thời không được làm sai điểm.
- **LRN-009-FR-022 — Ngưỡng 90%:** Lượt kết thúc MUST đạt khi số câu đúng chia tổng số câu từ
  90% trở lên. MUST xét giá trị thực, không làm tròn tỷ lệ hiển thị để quyết định đạt.
- **LRN-009-FR-023 — Hoàn thành Quiz:** Lượt đã kết thúc và đạt MUST ghi nhận việc người học
  hoàn thành Quiz. Lượt dưới ngưỡng vẫn MUST được lưu, nhưng không ghi nhận hoàn thành mới.
  Phạm vi công nhận giữa các phiên bản và các Chapter/Course chờ Q-003/Q-004.
- **LRN-009-FR-024 — Tổng kết:** Kết thúc MUST trả số đúng, số sai, tổng số câu, tỷ lệ đúng,
  ngưỡng 90%, đạt/chưa đạt và thời điểm bắt đầu/kết thúc. MUST cho phép xem lại câu trả lời,
  đáp án và giải thích của lượt đó. Thời gian hoạt động thực và chuỗi trả lời đúng là tiện ích
  chưa được chốt, không được suy ra từ thời gian mở app.
- **LRN-009-FR-025 — Lịch sử và làm lại:** Người học MUST xem được lịch sử và kết quả tốt nhất
  của chính mình, tiếp tục lượt chưa kết thúc hoặc bắt đầu lượt mới theo chính sách Q-006.
  Làm lại MUST NOT ghi đè lượt cũ hoặc sửa lựa chọn đã chấm.

## Quy tắc nghiệp vụ

### Mô hình nội dung

```text
Ngân hàng câu hỏi
 └── Câu hỏi → các phiên bản nội dung, lựa chọn, đáp án và giải thích
                 ↑
Quiz → danh sách câu hỏi/phiên bản đã chọn, có thứ tự
 ↑
Liên kết Chapter/Quiz có thứ tự ← Chapter ← Course

Người học → Lượt làm → các lựa chọn đầu tiên và kết quả chấm
```

Ngân hàng là khả năng quản lý/tái sử dụng câu hỏi; spec không bắt buộc một service riêng,
một bảng tên `banks`, một ngân hàng cho mỗi Course hay mô hình ngân hàng nhiều cấp.
Schema, index, cách lưu phiên bản/snapshot và API cụ thể thuộc plan sau review.

### Chấm và hoàn thành

- Bản đề xuất: một câu một điểm, không trừ điểm câu sai, không trọng số.
- Với `N > 0` câu, số đúng tối thiểu là `ceil(N × 90 / 100)`. Có thể kiểm bằng
  `correctCount × 100 >= totalQuestions × 90` để không phụ thuộc làm tròn hiển thị.
- 5 câu cần đúng 5; 10 câu cần đúng 9; 15 câu cần đúng 14; 20 câu cần đúng 18.
- `IN_PROGRESS` và `FINISHED` mô tả lượt làm; đạt/chưa đạt là kết quả riêng. Kết thúc lượt
  không đồng nghĩa đã hoàn thành Quiz.
- Ví dụ 8/10 câu đúng: lượt kết thúc, tổng kết 80%, chưa đạt. 9/10: đạt, ghi nhận hoàn thành.
- Mở lại phần giải thích hoặc ôn câu sai MUST NOT thay đổi điểm lượt đã chấm. Chế độ ôn câu sai
  riêng chưa nằm trong yêu cầu triển khai bắt buộc; xem Q-002.

### Nội dung và phiên bản

- Phiên bản đã được Quiz xuất bản tham chiếu và dữ liệu dùng để chấm lịch sử MUST được giữ
  đủ để tái hiện nội dung/kết quả. Không xoá lan lịch sử khi bỏ câu hoặc gỡ liên kết Chapter.
- Sửa câu gốc tạo nội dung mới để review/cập nhật; không thay đáp án của lượt đang làm.
- Trạng thái đề xuất cho Quiz là `DRAFT`, `PUBLISHED`, `ON_HOLD`, có xoá mềm. Quy tắc chuyển
  trạng thái, sửa Quiz đã publish và ảnh hưởng tới lượt đang làm chưa Approved; xem Q-005.
- Câu hỏi ngân hàng dùng chung mặc định; chủ sở hữu có thể tạo câu riêng tư. Quiz riêng tư mặc
  định. Publish cho người học không cấp quyền dùng lại Quiz cho LECTURER. Dùng câu hỏi không cấp
  quyền sửa gốc; clone câu riêng tư để người dùng tự chỉnh sửa.

## Quy tắc phân quyền

| Hành động                       | STUDENT | LECTURER                           | ADMIN                        |
| ------------------------------- | ------- | ---------------------------------- | ---------------------------- |
| Tạo câu hỏi/Quiz                | Không   | Có, với quyền tương ứng            | Có, với quyền tương ứng      |
| Sửa/xuất bản/ẩn/xoá nội dung    | Không   | Chỉ nội dung mình tạo              | Nội dung của mọi người tạo   |
| Chọn câu hỏi của người khác     | Không   | Câu dùng chung hoặc được cấp quyền | Có, với quyền tương ứng      |
| Gắn/gỡ Quiz trong Chapter       | Không   | Course mình tạo + quyền dùng Quiz  | Mọi Course + quyền tương ứng |
| Làm Quiz và xem lịch sử cá nhân | Có      | Có                                 | Có                           |
| Xem lượt làm cá nhân người khác | Không   | Chưa có yêu cầu cho phép           | Chưa có yêu cầu cho phép     |

Mã permission cụ thể và ánh xạ sang catalog Identity phải được chốt cùng Q-007. ADMIN quản lý
nội dung không mặc nhiên được mở lịch sử học cá nhân của mọi người.

## Đầu vào

| Luồng                     | Dữ liệu nghiệp vụ                                          |
| ------------------------- | ---------------------------------------------------------- |
| Tạo/sửa câu hỏi           | Nội dung, lựa chọn, đáp án đúng, giải thích, chủ đề/độ khó |
| Tìm trong ngân hàng       | Từ khoá, bộ lọc và phân trang trong phạm vi được xem       |
| Tạo/sửa Quiz              | Tiêu đề, mô tả, các ID câu hỏi/phiên bản có thứ tự         |
| Cập nhật câu trong Quiz   | Lựa chọn phiên bản mới một cách tường minh                 |
| Gắn/gỡ/sắp xếp            | Course/Chapter đích, Quiz và vị trí/danh sách thứ tự       |
| Bắt đầu/tiếp tục/kết thúc | Quiz hoặc lượt làm; danh tính luôn lấy từ principal        |
| Trả lời                   | Lượt làm, câu hỏi và lựa chọn trong lượt đó                |

Client MUST NOT được gán người tạo, người làm, đáp án có thẩm quyền trong luồng học, kết quả
đúng/sai, điểm, trạng thái hoàn thành hoặc thời gian server. Kiểu ID, giới hạn độ dài, số lựa
chọn/câu, kích thước bộ chọn và phân trang chờ Q-007; không coi thiếu giới hạn là cho phép vô hạn.

## Đầu ra

- Quản lý: định danh, dữ liệu được phép xem, trạng thái, thứ tự, phiên bản, người tạo và lỗi
  readiness; đủ để tìm/chọn hàng loạt, tiếp tục soạn và biết câu đang được Quiz nào sử dụng.
- Trước trả lời: nội dung và lựa chọn của đề được phép học, không có đáp án/giải thích chưa mở.
- Sau trả lời: lựa chọn đã ghi nhận, đúng/sai, đáp án đúng, giải thích của câu đó và tiến độ lượt.
- Tổng kết/lịch sử: dữ liệu FR-024/025, đủ phân biệt kết thúc lượt với hoàn thành Quiz.
- Không có event RabbitMQ, Socket.IO hay luồng Judge bắt buộc. Progress đọc trực tiếp completion
  Quiz đã lưu trong Learning; không thêm event hoặc contract liên service.

## Tình huống lỗi

| Tình huống                                                             | Hành vi quan sát được                                                         |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Thiếu/hỏng danh tính                                                   | `401`, không tạo/sửa dữ liệu                                                  |
| Thiếu role/quyền hoặc LECTURER sửa nội dung người khác                 | `403`, không đổi nội dung                                                     |
| Nội dung hoặc định danh sai, lựa chọn ngoài câu, publish chưa sẵn sàng | `400`, lỗi có thể sửa và không ghi một phần                                   |
| Tài nguyên không tồn tại/không được hiển thị trong luồng học           | `404`, không tiết lộ nội dung ẩn                                              |
| Thêm trùng câu vào Quiz hoặc trùng Quiz trong Chapter                  | Từ chối trùng, không sinh liên kết thừa; hợp đồng retry cụ thể chờ plan/Q-007 |
| Đổi lựa chọn sau khi đã chấm hoặc trả lời lượt đã kết thúc             | `409`, giữ lựa chọn/điểm cũ                                                   |
| Kết thúc khi còn câu chưa trả lời                                      | `409`, lượt vẫn đang làm                                                      |
| Lượt làm thuộc người khác                                              | `404`, không lộ danh tính, câu trả lời hoặc đáp án                            |
| Lưu/chấm thất bại hoặc cập nhật đồng thời không hợp lệ                 | Rollback phần thay đổi, lỗi an toàn; retry không nhân đôi kết quả             |

Thông báo lỗi MUST NOT chứa đáp án các câu chưa trả lời, snapshot đầy đủ, SQL, thông tin nhạy
cảm hoặc dữ liệu cá nhân người khác. Những mã HTTP trên là hợp đồng đề xuất cho review.

## Tình huống biên

- Ngân hàng rỗng: vẫn tạo nháp được, tạo câu ngay trong luồng soạn; không publish Quiz rỗng.
- Cùng câu gốc được chọn hai lần qua hai phiên bản: không cho phép trùng trong Quiz.
- Hai thiết bị trả lời cùng câu với hai lựa chọn: chỉ một lựa chọn được ghi nhận, bên còn lại
  nhận kết quả retry cùng lựa chọn hoặc xung đột nếu khác lựa chọn.
- Mobile mất mạng sau khi server lưu nhưng trước nhận response: gửi lại phải nhận kết quả cũ.
- Lưu thất bại trước commit: không trả phản hồi chấm thành công; người học có thể retry.
- Câu nguồn bị sửa, Quiz xuất bản phiên bản mới hoặc liên kết Chapter bị gỡ: lịch sử không
  bị chấm lại. Quyền tiếp tục lượt đang làm khi nội dung bị ẩn chờ Q-005.
- Giải thích của một câu chứa đáp án câu khác có thể phá ý nghĩa tỷ lệ đúng; người soạn cần
  review nội dung, không có yêu cầu tự động phát hiện quan hệ ngữ nghĩa này.
- Có thể lặp lại một Quiz đã thấy đáp án; điểm là chỉ báo luyện tập, không phải chứng nhận thi
  chống gian lận. Không bổ sung proctoring hoặc chặn làm lại ngoài Q-006.

## Yêu cầu bảo mật

- **LRN-009-SR-001:** Principal MUST chỉ lấy từ hợp đồng Gateway đã xác minh; không tin role,
  userId, createdBy hoặc score do client tự gán. Chính sách bảo vệ cổng Learning phải theo hợp
  đồng triển khai được duyệt, không mặc nhiên coi header client là đáng tin.
- **LRN-009-SR-002:** Mọi thao tác quản lý MUST kiểm cả quyền và sở hữu; danh sách quản lý của
  LECTURER MUST không trở thành cách đọc dữ liệu riêng của LECTURER khác.
- **LRN-009-SR-003:** Ngân hàng, preview và response quản lý có đáp án MUST không truy cập được
  bằng quyền người học. Chia sẻ câu cho người soạn khác không cho STUDENT đọc bộ đáp án.
- **LRN-009-SR-004:** API, log, lỗi và ví dụ Swagger phía người học MUST không lộ đáp án hoặc
  giải thích trước khi câu đó được trả lời; raw snapshot MUST không được trả nguyên khối.
- **LRN-009-SR-005:** Đọc/ghi lượt làm MUST luôn giới hạn theo chính người gọi. Quyền ADMIN sửa
  nội dung không được dùng để vượt kiểm tra lượt cá nhân.
- **LRN-009-SR-006:** Nội dung có định dạng MUST tuân thủ Markdown hạn chế của Learning; không
  chấp nhận HTML/script thô và không thực thi code nhúng.
- **LRN-009-SR-007:** Chấm, ghi nhận lựa chọn và hoàn tất MUST bảo đảm nguyên tử và retry an toàn;
  client không được thao túng thứ tự request để nâng điểm hoặc mở đáp án câu chưa trả lời.

## Tiêu chí nghiệm thu

- **LRN-009-AC-001 (FR-001):** Quiz được chấm trong Learning bằng đáp án; không tạo JudgeRequest
  hoặc Submission cho lựa chọn trắc nghiệm.
- **LRN-009-AC-002 (FR-002, SR-002):** LECTURER A sửa được nội dung A tạo, không sửa được của B;
  ADMIN có quyền sửa được của cả A và B. STUDENT không quản lý nội dung.
- **LRN-009-AC-003 (FR-003):** Một câu được chọn vào hai Quiz mà không nhập/sao chép lại câu gốc.
- **LRN-009-AC-004 (FR-004, FR-011):** Không xuất bản được câu thiếu giải thích, ít hơn hai lựa
  chọn, không có đáp án đúng hoặc có nhiều đáp án đúng.
- **LRN-009-AC-005 (FR-005):** Người soạn tìm/lọc, xem trước và chọn nhiều câu được phép vào Quiz;
  danh sách gồm câu dùng chung và câu riêng tư trong scope của họ, lọc quyền trước count/page.
- **LRN-009-AC-006 (FR-006):** Tạo câu khi đang soạn lưu được vào ngân hàng để dùng lại; retry
  thao tác không sinh câu mới ngoài ý muốn và không báo nhầm đã gắn khi việc gắn thất bại.
- **LRN-009-AC-007 (FR-007):** Câu hỏi A tạo mặc định xuất hiện trong bộ chọn của B là LECTURER;
  B dùng được câu đó nhưng không sửa gốc. Nếu A tạo câu private thì chỉ A/ADMIN/grantee truy cập
  được. B có thể clone câu được phép dùng; bản clone private và sửa không đổi nguồn. ADMIN quản lý
  mọi câu. Quiz vẫn không tự mở quyền dùng lại cho mọi LECTURER khi publish.
- **LRN-009-AC-026 (FR-026):** B được phép nhân bản nội dung A thì nhận bản mới có ID/người tạo
  riêng; B sửa bản sao không đổi bản gốc. B không được nhân bản bằng cách đoán ID nội dung riêng
  tư chưa được chia sẻ. Bản clone câu là private theo mặc định. Chính sách sao chép các câu trong
  Quiz đã được review trước kiểm thử.
- **LRN-009-AC-008 (FR-008, FR-011):** Tạo Quiz rỗng trả bản nháp; publish bị từ chối với lỗi rõ
  ràng và bản nháp giữ nguyên.
- **LRN-009-AC-009 (FR-009):** Có thể thêm/bỏ/sắp xếp câu; không thêm trùng cùng câu gốc bằng
  cách chọn hai phiên bản khác nhau.
- **LRN-009-AC-010 (FR-010):** Preview không tạo attempt hoặc thay đổi thành tích.
- **LRN-009-AC-011 (FR-012):** Sửa câu trong ngân hàng không đổi Quiz đã publish; chủ động xuất
  bản bản cập nhật không thay nội dung/kết quả của lượt đã bắt đầu trước đó.
- **LRN-009-AC-012 (FR-013):** Một Chapter có nhiều Quiz, một Quiz gắn được vào các Chapter của
  nhiều Course; không có hai liên kết giống nhau trong cùng Chapter.
- **LRN-009-AC-013 (FR-014):** Gỡ liên kết giữ nguyên câu hỏi, Quiz và lịch sử cá nhân.
- **LRN-009-AC-014 (FR-015, SR-004):** Quiz nháp/ẩn không xuất hiện hoặc lộ số lượng trong luồng
  người học; không thể mở trực tiếp để lấy nội dung bị ẩn.
- **LRN-009-AC-015 (FR-016):** Bắt đầu lượt cố định phiên bản đề và bộ chấm; response không chứa
  đáp án/giải thích chưa được mở của bất kỳ câu nào.
- **LRN-009-AC-016 (FR-017):** Mở lại lượt đang làm giữ lựa chọn/phản hồi đã lưu và không mở
  đáp án câu chưa làm.
- **LRN-009-AC-017 (FR-018):** Chọn đúng hoặc sai đều nhận ngay kết quả, đáp án đúng và giải
  thích câu đó sau khi server lưu, không cần kết thúc Quiz.
- **LRN-009-AC-018 (FR-019, FR-020):** Retry cùng lựa chọn trả kết quả cũ; đổi lựa chọn sau khi đã
  chấm bị từ chối; request đồng thời không làm một câu được tính hai lần.
- **LRN-009-AC-019 (FR-020, FR-021):** Khi lưu thất bại, không có điểm/câu trả lời ghi một phần;
  retry hoàn tất hoặc hoàn tất đồng thời vẫn chỉ tạo một kết quả nhất quán.
- **LRN-009-AC-020 (FR-021):** Chưa trả lời đủ không thể kết thúc; đủ câu thì tổng hợp từ dữ
  liệu server, bỏ qua/từ chối điểm giả do client gửi.
- **LRN-009-AC-021 (FR-022, FR-023):** 8/10 câu đúng cho lượt kết thúc nhưng chưa đạt; 9/10 đạt và
  ghi nhận hoàn thành; 13/15 chưa đạt, 14/15 đạt; không dùng tỷ lệ làm tròn để xét ngưỡng.
- **LRN-009-AC-022 (FR-024):** Tổng kết có số đúng/sai/tổng, tỷ lệ, ngưỡng, đạt/chưa đạt,
  thời điểm và khả năng xem lại lời giải; không nhầm kết thúc lượt với đạt Quiz.
- **LRN-009-AC-023 (FR-025):** Người học xem được lịch sử và kết quả tốt nhất của mình; làm lại
  tạo lượt mới, không ghi đè lịch sử. Chính sách giới hạn theo Q-006 đã được chốt trước test.
- **LRN-009-AC-024 (SR-001, SR-005):** Giả userId/role/score hoặc biết attemptId người khác không
  cho phép thao tác hay xem lời giải của lượt đó.
- **LRN-009-AC-025 (SR-003, SR-004, SR-006):** Không lộ đáp án chưa mở qua ngân hàng, preview, response,
  lỗi, log, Swagger hoặc HTML/script nhúng trong nội dung.

Nguyên tắc Q-001 đã ghi trong FR-007/AC-007; nhân bản có FR-026/AC-026. Q-001 tới Q-008 đã được
chốt trong quyết định dưới đây và amendment 1.5.

## Ngoài phạm vi

- Thiết kế pixel/màn hình mobile hoặc xây frontend quản trị trong đợt đặc tả backend này.
- Chạy code, chấm tự luận, nhiều đáp án đúng hoặc điểm trọng số ở bản đầu đề xuất.
- Class, Enrollment, Assignment, lịch thi, báo cáo điểm theo lớp hoặc proctoring.
- Offline và đồng bộ xung đột nhiều thiết bị khi không có mạng.
- XP, năng lượng, bảng xếp hạng, streak ngày học, phần thưởng và AI sinh/chấm câu hỏi.
- Tự chọn đề ngẫu nhiên theo từng lượt, adaptive learning hoặc tự sinh đề theo tỷ lệ độ khó.
- Tự thay đổi tỷ lệ hoàn thành Course, điều kiện mở khoá hoặc LRN-007 Recommendation.
- Cố định schema sáu bảng đã trao đổi trước: mô hình đó thuộc đề xuất trước ngân hàng câu hỏi;
  plan mới phải xét quan hệ câu hỏi/Quiz nhiều-nhiều và phiên bản, không chép nguyên schema cũ.
- Import Excel/CSV, chế độ ôn câu sai riêng và danh sách Quiz độc lập: quyết định phạm
  vi chờ Q-002/Q-005; chưa được coi là có yêu cầu triển khai chỉ từ các gợi ý trong hội thoại.

## Phụ thuộc

- [Learning architecture](../../../architecture/learning-service.md) và
  [ADR 0002](../../../adr/0002-revised-service-internal-architectures.md): DDD tactical +
  Hexagonal trong một bounded context Learning; không tạo Quiz Service riêng.
- [Dependency rules](../../../architecture/dependency-rules.md) và
  [Database strategy](../../00-system/database-strategy.md): Learning sở hữu dữ liệu, không
  truy cập DB Identity; userId/createdBy là định danh bên ngoài.
- [LRN-003 Course](../courses/spec.md): mở rộng liên kết/hiển thị Chapter và kiểm quyền Course.
- [LRN-006 Progress](../progress/spec.md): amendment 1.1 tính Quiz pass vào tiến độ Course.
- [LRN-008 Self-study](../self-study/spec.md): cần bản sửa đổi chính sách LECTURER/ADMIN trước
  triển khai; chưa sửa file Approved trong đợt này.
- [ID-001 Authentication](../../01-identity/authentication/spec.md),
  [ID-003 RBAC](../../01-identity/rbac/spec.md): principal và quyền cần được đồng bộ.
- [Gateway Course](../../gateway/learning/courses/spec.md): cần hợp đồng route Quiz/ngân hàng
  và liên kết Chapter trước triển khai transport; không coi route dự kiến là đã tồn tại.
- [Definition of Done](../../00-system/definition-of-done.md) và
  [working agreement](../../../agent/working-agreement.md).

## Quyết định đã chốt (Q-001 tới Q-008)

Chủ sở hữu phê duyệt toàn bộ gói MVP trong hội thoại ngày 2026-11-11. Phần này thay mọi câu
“chờ Q”/“chưa chốt” trong bản 1.2 ở trên; không còn câu hỏi chặn implementation.

| Mã    | Quyết định có hiệu lực                                                                                                                                                                                                                                                                                                                                                                             |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q-001 | Câu hỏi ngân hàng dùng chung cho LECTURER theo mặc định; lúc tạo hoặc sau đó có thể đặt riêng tư. Owner/ADMIN cấp/thu hồi grant cho câu riêng tư. Mọi LECTURER được dùng câu chung; người dùng chỉ sửa bản clone riêng tư, không sửa gốc. Quiz vẫn riêng tư và chia sẻ có kiểm soát. Thu hồi câu riêng tư chặn dùng/clone/publish mới; giữ Quiz đã publish, bản sao và attempt cũ.                 |
| Q-002 | Tìm/lọc, chọn nhiều, tạo tại chỗ, clone câu/Quiz. Clone Quiz sao chép toàn bộ câu ở phiên bản được chia sẻ thành câu riêng của người clone. Không import Excel/CSV hoặc chế độ ôn riêng.                                                                                                                                                                                                           |
| Q-003 | Giữ lịch sử và dấu hoàn thành khi đổi phiên bản; hiển thị phiên bản đạt.                                                                                                                                                                                                                                                                                                                           |
| Q-004 | Hoàn thành theo user + Quiz ở mọi Chapter/Course, giữ qua revision và được tính một đơn vị trong Progress Course theo LRN-006 1.1; không mở khoá Chapter.                                                                                                                                                                                                                                          |
| Q-005 | Chỉ học qua Course PUBLISHED chưa xoá. Quiz DRAFT/PUBLISHED/ON_HOLD và xoá mềm; sửa qua draft mới. Câu ngân hàng không có publish riêng. Hide/delete chặn lượt mới, cho tiếp tục lượt cũ.                                                                                                                                                                                                          |
| Q-006 | Không giới hạn thời gian/số lượt; một IN_PROGRESS/user/Quiz, start lặp trả lượt hiện có. First answer tính điểm; trả lời đủ rồi finish tường minh; same-answer replay cả sau finish.                                                                                                                                                                                                               |
| Q-007 | Title 200; content/description/explanation 20.000 ký tự; option 5.000; 2–6 options/câu; 50 câu/Quiz; 50 Quiz/Chapter; page/limit mặc định 1/20, tối đa 100. API create/clone nhận UUID qua header `Idempotency-Key`; cùng key/payload trả cùng resource, cùng key khác payload trả 409. Không nhận key trong body. Permission question/quiz theo hành động, LECTURER/ADMIN; STUDENT không quản lý. |
| Q-008 | Tái dùng Topic/Tag và EASY/MEDIUM/HARD hiện có trong Learning qua own read port.                                                                                                                                                                                                                                                                                                                   |

Plan/tasks được chủ sở hữu cho phép triển khai cùng gói này. Chính sách LECTURER owner/ADMIN
mọi nội dung thay ADMIN-only của LRN-008; Class/Enrollment/Assignment vẫn ngoài phạm vi.

## Lịch sử sửa đổi

| Ngày       | Phiên bản | Tác giả/Người review                  | Tóm tắt                                                                                                                                                                                                       |
| ---------- | --------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-11 | 0.1       | Codex, theo yêu cầu chủ sở hữu        | Spec riêng Quiz/ngân hàng, tái sử dụng câu hỏi, nhiều Chapter/Course, LECTURER sở hữu/ADMIN quản lý mọi nội dung, phản hồi từng câu và ngưỡng 90%; giữ Proposed để chốt câu hỏi mở và đồng bộ spec hiện hành. |
| 2026-11-11 | 1.0       | Chủ sở hữu phê duyệt                  | Chuyển LRN-009 sang `Approved`. Q-001 tới Q-008 vẫn là gate phải chốt trước khi triển khai hành vi liên quan; các spec/kiến trúc phụ thuộc chưa được sửa trong đợt này.                                       |
| 2026-11-11 | 1.1       | Chủ sở hữu xác nhận, Codex ghi nhận   | Đóng Q-001: ngân hàng câu hỏi dùng chung cho LECTURER; Quiz đã publish dùng chung; quyền sửa gốc vẫn chỉ người tạo và ADMIN. Các câu hỏi khác giữ nguyên.                                                     |
| 2026-11-11 | 1.2       | Chủ sở hữu điều chỉnh, Codex ghi nhận | Thay chính sách 1.1 bằng riêng tư mặc định, chia sẻ có kiểm soát; dùng/nhân bản nhưng không sửa gốc. Thêm FR-026/AC-026 cho bản sao độc lập; scope/thu hồi chia sẻ còn cần chốt.                              |
| 2026-11-12 | 1.4       | Chủ sở hữu xác nhận                   | Chuyển idempotency key của API create/clone từ body sang header `Idempotency-Key`; giữ nguyên chống retry trùng và lưu trữ trên root hiện có, không thêm bảng.                                                |
| 2026-11-12 | 1.5       | Chủ sở hữu xác nhận, Codex ghi nhận   | Mở ngân hàng câu hỏi cho LECTURER theo mặc định; cho phép đặt câu private, clone thành bản riêng tư; Quiz tiếp tục private và chia sẻ có kiểm soát.                                                           |

> `spec.md` mô tả CÁI GÌ. Bảng/cột, endpoint, class, port, migration và thứ tự triển khai thuộc
> `plan.md` sau khi yêu cầu được review; không suy ra các phần đó đã tồn tại từ tài liệu này.

## Phê duyệt triển khai 1.3

2026-11-11 — Chủ sở hữu: “approved tất cả cho tôi”. Giữ Approved; chưa coi implementation là Verified.

## Phê duyệt hợp đồng Idempotency-Key 1.4

2026-11-12 — Chủ sở hữu yêu cầu chuyển key của API create/clone sang header `Idempotency-Key`.
Giữ UUID và semantics retry hiện có; body không còn chứa key. Key/hash tiếp tục lưu trên root
Question/Quiz, không tạo bảng mới.

## Phê duyệt chia sẻ ngân hàng câu hỏi 1.5

2026-11-12 — Chủ sở hữu xác nhận dùng ngân hàng câu hỏi chung cho feature hiện tại. Câu tạo mới
dùng chung mặc định, có thể đánh dấu riêng tư khi tạo hoặc đổi trạng thái sau đó; LECTURER khác
dùng câu chung hoặc clone sang bản riêng tư để sửa. Chỉ owner/ADMIN sửa câu gốc. Quyền Quiz không đổi.
