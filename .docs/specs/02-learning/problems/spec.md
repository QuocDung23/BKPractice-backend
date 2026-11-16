> **Bản sửa đổi LRN-009 1.3, Approved 2026-11-11:** LECTURER có quyền quản lý nội dung Learning mình tạo; ADMIN có quyền tương ứng quản lý mọi nội dung. Quy tắc này thay các câu ADMIN-only hoặc bỏ kiểm created_by trước đó. Course hỗ trợ liên kết nhiều Quiz/Chapter theo LRN-009; tiến độ Problem hiện có không đổi. Không khôi phục Class/Enrollment/Assignment.

# LRN-001 Quản lý Problem

## Trạng thái

Approved

> Cập nhật 2026-11-07: [LRN-008](../self-study/spec.md) thay thế mọi quy định về LECTURER, sở hữu riêng của người tạo, Class, Enrollment, Assignment và tiến độ theo lớp trong tài liệu này. Các yêu cầu còn lại vẫn áp dụng.

Phiên bản này (1.1) thay thế vòng đời của phiên bản Approved 1.0 theo bản sửa đổi ngày 2026-09-06.
Việc phê duyệt được ghi lại trong Lịch sử sửa đổi.

Giá trị hợp lệ: `Proposed` | `Approved` | `Implemented` | `Verified`

## Mục tiêu

Cho phép đội ngũ giảng dạy có thẩm quyền tạo và quản lý các bài tập lập trình, đồng thời cho phép
người học khám phá và đọc các problem đã xuất bản, trong khi vẫn bảo toàn quyền sở hữu của Learning
Service, bảo vệ dữ liệu judge ẩn, và cung cấp metadata problem ổn định cho các tính năng Assignment,
Submission, Judge, Progress và Recommendation trong tương lai.

## Tác nhân

- **STUDENT:** Người học đã xác thực, khám phá và đọc các problem khả dụng theo chính sách hiển thị
  đã được phê duyệt.
- **LECTURER:** Người dùng giảng dạy đã xác thực, có thể tạo và quản lý problem khi quyền Learning
  cần thiết và chính sách sở hữu tài nguyên cho phép.
- **ADMIN:** Quản trị viên nền tảng đã xác thực. `ADMIN` không mặc nhiên có thẩm quyền đối với nội
  dung Problem; mọi khả năng quản lý Problem phải được đặc tả này phê duyệt tường minh.
- **Khách chưa xác thực:** Người gọi không có ngữ cảnh định danh tin cậy. Trong v1, danh mục và chi
  tiết đã xuất bản không đọc được bởi khách chưa xác thực; việc khám phá của người học đòi hỏi ngữ
  cảnh xác thực tin cậy.
- **API Gateway:** Cổng vào công khai, xác minh access token của BKPractice, loại bỏ các header định
  danh tin cậy do client gửi, và chuyển tiếp ngữ cảnh định danh/vai trò đã được xác minh.
- **Learning Service:** Chủ sở hữu state của Problem, policy, metadata, đề bài, liên kết Topic/Tag,
  các ngôn ngữ được hỗ trợ cho problem, starter code, giới hạn thực thi và quan hệ với Test Case.
- **Submission Service:** Bên tiêu thụ tin cậy của gói dữ liệu judge được bảo vệ do Learning sở hữu.
  Nó chỉ lưu ID Problem bên ngoài và không bao giờ đọc trực tiếp cơ sở dữ liệu của Learning.
- **Judge Service:** Worker tính toán tin cậy, nhận đầu vào thực thi đã được phê duyệt thông qua
  luồng Submission. Nó không sở hữu state của Problem.

## Bối cảnh

Quản lý Problem là đặc tả tính năng Learning đầu tiên. Learning dùng **DDD + Hexagonal
Architecture** và sở hữu Problem cùng với Test Case, Topic, Tag, starter code, các ngôn ngữ
được hỗ trợ cho problem, Course, Assignment, Progress và Recommendation. LRN-001 định nghĩa vòng đời
Problem cùng hành vi công khai/quản lý mà không tách ra một service Problem mới và không triển khai
các tính năng Learning lân cận.

Nền tảng hiện có thiết lập các từ vựng và ràng buộc mô hình sau, mà LRN-001 tái sử dụng thay vì
định nghĩa lại:

- Loại problem: `STANDARD`, `FUNCTION` và `OOP`.
- Giá trị độ khó: `EASY`, `MEDIUM` và `HARD`.
- Trạng thái vòng đời: `DRAFT`, `PUBLISHED` và `ON_HOLD`, cộng thêm một dấu xoá mềm (soft-delete)
  giúp ẩn một Problem mà không phá huỷ bản ghi hay định danh ổn định của nó.
- Một định danh Problem nội bộ dạng UUID ổn định và một slug duy nhất dễ đọc cho người.
- Các liên kết Topic và Tag do Learning sở hữu.
- Một tập con các ngôn ngữ trong danh mục ngôn ngữ được Judge hỗ trợ đã phê duyệt, theo từng Problem.
- Starter code theo từng ngôn ngữ và một ranh giới harness ẩn nội bộ.
- Giới hạn thời gian và bộ nhớ dương theo từng Problem, được cung cấp qua luồng judge được bảo vệ.
- Một định danh người dùng Identity bên ngoài `createdBy`, không có quan hệ cơ sở dữ liệu xuyên
  service.

Mã nguồn hiện tại là hành vi nền tảng, không phải bản triển khai của đặc tả LRN-001 đã Approved này.
Các route hoặc hình dạng lưu trữ hiện có không cấu thành thẩm quyền về chính sách sản phẩm và cần
được căn chỉnh trong giai đoạn triển khai, sau khi hoàn tất các giai đoạn plan/tasks.

## Yêu cầu chức năng

- **LRN-001-FR-001 — Quyền sở hữu của Learning:** Learning MUST sở hữu mọi Problem và chính sách
  phía Problem của nó. Submission và Judge MUST tham chiếu Problem bằng ID ngoài ổn định và MUST NOT
  sở hữu hay lưu trữ trực tiếp thực thể Problem của Learning.
- **LRN-001-FR-002 — Định danh ổn định:** Mọi Problem MUST có một định danh duy nhất, ổn định, vẫn
  dùng được bởi Assignment và lịch sử Submission. Tiêu đề MUST NOT đóng vai trò định danh Problem.
- **LRN-001-FR-003 — Các loại problem được phê duyệt:** Một Problem MUST dùng đúng một loại được
  phê duyệt: `STANDARD`, `FUNCTION`, hoặc `OOP`. Các loại không xác định hoặc do client tự định
  nghĩa MUST bị từ chối.
- **LRN-001-FR-004 — Tạo bản nháp:** Một LECTURER có thẩm quyền MUST có thể tạo một Problem ở trạng
  thái `DRAFT`. Việc tạo MUST suy ra người tạo từ ngữ cảnh xác thực tin cậy và MUST NOT chấp nhận ID
  người tạo có tính thẩm quyền từ client.
- **LRN-001-FR-005 — Cách ly bản nháp:** Một Problem `DRAFT` MUST NOT xuất hiện trong danh sách, tìm
  kiếm, bộ lọc hay phản hồi chi tiết hướng tới người học. Khả năng hiển thị ở phía quản lý vẫn tuân
  theo chính sách chủ sở hữu/Admin đã được phê duyệt.
- **LRN-001-FR-006 — Khám phá nội dung đã xuất bản:** Một STUDENT được chính sách hiển thị danh mục
  đã phê duyệt cho phép MUST có thể liệt kê và truy xuất các Problem ở trạng thái `PUBLISHED`.
- **LRN-001-FR-007 — Tìm kiếm:** Việc khám phá Problem đã xuất bản MUST hỗ trợ tìm kiếm theo tiêu đề
  không phân biệt hoa thường và tra cứu chính xác theo định danh ổn định hoặc slug, mà không để lộ
  các Problem chưa xuất bản.
- **LRN-001-FR-008 — Lọc và phân trang:** Việc liệt kê Problem đã xuất bản MUST hỗ trợ phân trang và
  lọc theo loại Problem, độ khó, Topic và Tag đã được phê duyệt. Tập kết quả rỗng MUST là thành công
  và MUST NOT tiết lộ số lượng bản nháp/đang tạm giữ/đã xoá mềm.
- **LRN-001-FR-009 — Đọc ở phía quản lý:** Một người quản lý Problem có thẩm quyền MUST có thể truy
  xuất biểu diễn quản lý của các Problem mà họ được phép quản lý, bao gồm nội dung bản nháp và thông
  tin về mức độ sẵn sàng xuất bản, nhưng loại trừ đáp án Test Case ẩn ở dạng thô, trừ khi một đặc tả
  Test Case sau này cho phép dữ liệu đó.
- **LRN-001-FR-010 — Cập nhật có thẩm quyền:** Một người quản lý Problem có thẩm quyền MUST chỉ có
  thể cập nhật các trường Problem được vòng đời và chính sách sở hữu đã phê duyệt cho phép. Dữ liệu
  từ client MUST NOT thay đổi người tạo hay bỏ qua một bước chuyển trạng thái.
- **LRN-001-FR-011 — Chuyển trạng thái xuất bản:** Một người quản lý Problem có thẩm quyền MUST có
  thể yêu cầu chuyển từ `DRAFT` sang `PUBLISHED`. Việc xuất bản MUST có tính nguyên tử và MUST thất
  bại mà không thay đổi trạng thái khi bất kỳ điều kiện tiên quyết xuất bản nào chưa thoả mãn.
- **LRN-001-FR-012 — Kiểm tra trước khi xuất bản:** Trước khi xuất bản, hệ thống MUST kiểm tra tiêu
  đề và đề bài không rỗng, loại và độ khó hợp lệ, slug duy nhất và hợp lệ, giới hạn thực thi dương,
  ít nhất một ngôn ngữ được phê duyệt đang bật, và contract đặc thù theo loại Problem. Mức độ sẵn
  sàng của Test Case là phụ thuộc vào LRN-002 trong tương lai và KHÔNG bắt buộc để xuất bản ở phiên
  bản này. Starter code là bắt buộc ở mọi ngôn ngữ đang bật đối với `FUNCTION`/`OOP` và tuỳ chọn đối
  với `STANDARD`.
- **LRN-001-FR-013 — Hành vi khám phá với trạng thái tạm giữ và xoá mềm:** Một Problem `ON_HOLD` và
  một Problem đã xoá mềm MUST bị loại khỏi việc khám phá mới của người học, đồng thời giữ lại định
  danh ổn định cho các tham chiếu lịch sử. Xoá mềm là cơ chế gỡ bỏ duy nhất trong v1: nó đánh dấu
  bản ghi là đã xoá mà không phá huỷ bản ghi, và chỉ có thể đảo ngược bằng thao tác khôi phục đã
  được phê duyệt. Không cung cấp xoá cứng.
- **LRN-001-FR-014 — Đề bài của Problem:** Một Problem MUST cung cấp tiêu đề, đề bài chính, các ví
  dụ hiển thị, các ràng buộc khi có liên quan, và thông tin contract phù hợp với loại. Một Problem
  `STANDARD` còn MUST mô tả contract đầu vào và đầu ra của nó trước khi xuất bản.
- **LRN-001-FR-015 — Ví dụ hiển thị:** Các ví dụ hướng tới người học MUST phân biệt được với Test
  Case và MUST chỉ chứa nội dung được chủ ý hiển thị cho người học. Ví dụ hiển thị MUST NOT để lộ
  kết quả mong đợi ẩn, harness hay lời giải nội bộ.
- **LRN-001-FR-016 — Độ khó:** Mọi Problem MUST dùng một trong các giá trị `EASY`, `MEDIUM` hoặc
  `HARD`. Độ khó là metadata của Problem phục vụ khám phá và Recommendation trong tương lai; nó
  không phải là kết quả từ Judge.
- **LRN-001-FR-017 — Liên kết Topic và Tag:** Một Problem MAY được liên kết với không hoặc nhiều
  Topic và Tag do Learning sở hữu. Các tham chiếu không hợp lệ hoặc không tồn tại MUST NOT được một
  request Problem âm thầm tạo ra.
- **LRN-001-FR-018 — Các ngôn ngữ được hỗ trợ:** Một Problem MUST chỉ dùng các giá trị từ danh mục
  ngôn ngữ được Judge hỗ trợ dùng chung đã phê duyệt. Một Problem đã xuất bản MUST bật ít nhất một
  ngôn ngữ được hỗ trợ, và người gọi MUST NOT cung cấp lệnh biên dịch hay cấu hình runtime dưới danh
  nghĩa một ngôn ngữ.
- **LRN-001-FR-019 — Ranh giới starter code:** Một Problem MAY cung cấp starter code hiển thị cho
  người học đối với một ngôn ngữ đang bật. Starter code của một ngôn ngữ đang tắt MUST NOT được quảng
  bá, và nội dung harness ẩn MUST NOT được trả về trong các phản hồi hướng tới người học.
- **LRN-001-FR-020 — Giới hạn thực thi:** Mỗi Problem MUST định nghĩa giới hạn thời gian và bộ nhớ
  dương, nằm trong biên an toàn đã phê duyệt của nền tảng. Learning sở hữu các giá trị riêng của
  Problem; Judge vẫn chịu trách nhiệm thực thi các giới hạn sandbox và MAY áp dụng trần nền tảng
  chặt hơn.
- **LRN-001-FR-021 — Slug:** Mọi Problem MUST có một slug duy nhất và hợp lệ để tra cứu dễ đọc cho
  người. Slug do Giảng viên cung cấp khi tạo, phải duy nhất và hợp lệ, và bất biến sau khi tạo.
- **LRN-001-FR-022 — Tham chiếu người tạo:** Learning MUST lưu người tạo dưới dạng ID người dùng
  Identity bên ngoài, không có khoá ngoại xuyên service và không nhân bản dữ liệu User/Profile.
- **LRN-001-FR-023 — Metadata quan sát được:** Biểu diễn quản lý của một Problem MUST thể hiện trạng
  thái vòng đời hiện tại và các mốc thời gian tạo/cập nhật cơ bản. Phản hồi công khai MUST chỉ thể
  hiện metadata đã được phê duyệt cho người học.
- **LRN-001-FR-024 — Xem trước:** Một người quản lý Problem có thẩm quyền MUST có thể xem trước biểu
  diễn hướng người học của một bản nháp mà họ có quyền, mà không cần xuất bản. Việc xem trước MUST
  NOT thực thi mã hay làm Problem hiển thị với người học.
- **LRN-001-FR-025 — Tách bạch công khai/nội bộ:** Phản hồi Problem hướng tới người học MUST dùng
  danh sách trường cho phép tường minh và MUST NOT để lộ Test Case ẩn, kết quả ẩn mong đợi, harness
  ẩn, lời giải nội bộ, lệnh biên dịch/Docker hay thông tin xác thực nội bộ của service.
- **LRN-001-FR-026 — Ranh giới dữ liệu judge tin cậy:** Mọi tài liệu Problem/Test Case ẩn mà
  Submission/Judge cần MUST chỉ khả dụng qua luồng nội bộ được bảo vệ đã phê duyệt. Client công khai
  MUST NOT có khả năng lấy được tài liệu đó bằng cách đổi route, tham số, header hay ngôn ngữ yêu cầu.
- **LRN-001-FR-027 — Tương thích với Assignment:** Assignment MAY tham chiếu một Problem chỉ thông
  qua ID ổn định do Learning sở hữu. LRN-001 MUST NOT sở hữu hạn chót, việc giao bài cho lớp, chính
  sách chấm điểm hay tiến độ Assignment.
- **LRN-001-FR-028 — Không sở hữu việc thực thi hay nộp bài:** Quản lý Problem MUST NOT biên dịch
  hay chạy mã, tạo bản ghi Run/Submit, phân loại kết quả thực thi, lưu mã nguồn/lịch sử nộp bài, hay
  phát kết quả realtime.
- **LRN-001-FR-029 — An toàn nội dung:** Nội dung Problem do người dùng soạn MUST được trả về ở dạng
  có thể render mà không thực thi nội dung nhúng không an toàn. Đề bài được soạn dưới dạng Markdown
  hạn chế. Backend kiểm tra định dạng, độ dài và từ chối payload HTML/script thô; frontend làm sạch
  nội dung để render an toàn trước khi hiển thị.
- **LRN-001-FR-030 — Retry xác định:** Một lần kiểm tra dữ liệu, kiểm tra phân quyền hoặc chuyển
  trạng thái thất bại MUST để nguyên state của Problem. Lặp lại một thao tác đọc MUST NOT làm thay
  đổi Problem.
- **LRN-001-FR-031 — Chuyển sang tạm giữ:** Một người quản lý Problem có thẩm quyền MUST có thể
  chuyển một Problem `PUBLISHED` mà họ sở hữu sang `ON_HOLD`. Một Problem `ON_HOLD` bị loại khỏi việc
  khám phá của người học nhưng vẫn giữ định danh ổn định và MAY được xuất bản lại với quyền phù hợp.
- **LRN-001-FR-032 — Xuất bản lại:** Một người quản lý Problem có thẩm quyền MUST có thể chuyển một
  Problem `ON_HOLD` mà họ sở hữu trở lại `PUBLISHED`. Việc xuất bản lại MUST kiểm tra lại mức độ sẵn
  sàng xuất bản dựa trên state đã lưu và có tính nguyên tử như lần xuất bản đầu.
- **LRN-001-FR-033 — Xoá mềm:** Một người quản lý Problem có thẩm quyền MUST có thể xoá mềm một
  Problem `PUBLISHED` hoặc `ON_HOLD` mà họ sở hữu. Xoá mềm loại Problem khỏi mọi truy vấn của người
  học và truy vấn quản lý thông thường, ghi lại dấu xoá, và giữ lại bản ghi, giá trị `publish_status`
  đã lưu, cùng ID ổn định. Nó MUST NOT làm thay đổi Submission hay bất kỳ tham chiếu lịch sử nào.
- **LRN-001-FR-034 — Khôi phục:** Một người quản lý Problem có thẩm quyền MUST có thể khôi phục một
  Problem đã xoá mềm mà họ sở hữu. Việc khôi phục xoá dấu xoá, đưa Problem trở về đúng trạng thái mà
  nó có ngay trước khi bị xoá (`PUBLISHED` hoặc `ON_HOLD`, không đổi), và MUST NOT thay đổi nội dung
  hay Submission.

## Quy tắc nghiệp vụ

### Vòng đời

| Trạng thái      | Người học khám phá | Ý nghĩa                                                                     |
| --------------- | ------------------ | --------------------------------------------------------------------------- |
| `DRAFT`         | Không bao giờ      | Đang soạn; có thể chưa đầy đủ ngoài các trường tối thiểu khi tạo            |
| `PUBLISHED`     | Có                 | Đã qua kiểm tra xuất bản và khả dụng theo chính sách hiển thị               |
| `ON_HOLD`       | Không              | Tạm dừng; bị loại khỏi khám phá, giữ lại định danh ổn định và lịch sử       |
| `DELETED` (mềm) | Không bao giờ      | Đã đánh dấu xoá; bản ghi, ID ổn định và trạng thái trước đó được giữ lại và |
|                 |                    | có thể khôi phục bằng thao tác đã phê duyệt                                 |

- Việc khám phá của người học chỉ hiển thị các Problem có `publish_status = PUBLISHED` và không có
  dấu xoá.
- Một Problem mới tạo bắt đầu ở `DRAFT`.
- Xuất bản là một bước chuyển tường minh; lưu bản nháp không bao giờ ngầm xuất bản nó.
- Một lần xuất bản, tạm giữ, xuất bản lại, xoá hay khôi phục thất bại sẽ giữ nguyên trạng thái trước
  đó và báo cáo các điều kiện còn thiếu/không hợp lệ.
- Thay đổi trạng thái là thao tác nghiệp vụ, không phải trường tuỳ ý chỉnh sửa được trong request.
- Bước chuyển `PUBLISHED` -> `ON_HOLD` là hành động tạm giữ tường minh; `ON_HOLD` -> `PUBLISHED` là
  hành động xuất bản lại tường minh, có kiểm tra lại mức độ sẵn sàng xuất bản.
- Chỉ được xoá mềm từ `PUBLISHED` hoặc `ON_HOLD`, và đây là cơ chế gỡ bỏ duy nhất trong v1. Nó đặt
  dấu xoá, không bao giờ phá huỷ bản ghi, và không bao giờ đụng tới lịch sử Submission.
- Chỉ được khôi phục một Problem đã xoá mềm, và nó trở về đúng trạng thái trước khi bị xoá.
- Xoá cứng, khôi phục một Problem chưa bị xoá, và xoá một `DRAFT` đều không được cung cấp trong v1.

### Dữ liệu tối thiểu khi tạo

Để tương thích với nền tảng hiện tại, việc tạo bản nháp yêu cầu:

- tiêu đề tối đa 200 ký tự;
- slug duy nhất, hợp lệ, tối đa 220 ký tự;
- đề bài/mô tả chính không rỗng;
- một loại Problem được phê duyệt;
- một độ khó được phê duyệt; và
- định danh người tạo tin cậy.

Một bản nháp có thể hoãn các yêu cầu chỉ cần khi xuất bản, như các ngôn ngữ đang bật, ví dụ hoàn
chỉnh, chi tiết contract theo loại, starter code, xác nhận giới hạn thực thi và mức độ sẵn sàng của
Test Case, theo các quyết định đã ghi trong đặc tả này.

### Dữ liệu Problem dùng chung

- Tiêu đề là metadata hiển thị và không cần duy nhất toàn cục; slug mới là duy nhất.
- Đề bài chứa nhiệm vụ hướng tới người học. Phần đầu vào/đầu ra là bắt buộc với `STANDARD` và có thể
  không áp dụng với contract `FUNCTION`/`OOP`.
- Ví dụ hiển thị dùng để giải thích nhiệm vụ và không bao giờ được coi là Test Case ẩn.
- Ràng buộc mô tả ràng buộc nghiệp vụ/bài toán, không phải lệnh Docker hay lệnh biên dịch.
- Topic biểu diễn phân loại theo chương trình học của Learning. Tag là metadata linh hoạt của
  Learning. Vòng đời quản lý của chúng tách biệt khỏi payload cập nhật Problem.
- Danh mục ngôn ngữ được phê duyệt hiện tại là C, C++, Java và Python, biểu diễn bằng các giá trị kỹ
  thuật dùng chung `c`, `cpp`, `java` và `python`. LRN-001 không định nghĩa lại các language runner.
- Starter code là khung mã nguồn hiển thị cho người học. Harness ẩn là tài liệu judge nội bộ, không
  phải starter code và không bao giờ là một phần của phản hồi công khai.
- Giới hạn thời gian và bộ nhớ là cấu hình Problem do Learning sở hữu, được truyền qua các contract
  tin cậy; Judge sở hữu việc thực thi và các trần bảo mật.
- Điểm số/điểm tối đa của Problem không phải là trường Problem dùng chung trong LRN-001. Điểm tối đa
  riêng của Assignment thuộc về Assignment, còn trọng số Test Case thuộc về tính năng Test Case
  trong tương lai.

### Hành vi theo từng loại

- **STANDARD:** Người học viết một chương trình hoàn chỉnh. Một Problem đã xuất bản cần đề bài, đặc
  tả đầu vào, đặc tả đầu ra, các ví dụ hiển thị phù hợp với loại, ràng buộc khi có liên quan, giới
  hạn thực thi, và ít nhất một ngôn ngữ đang bật.
- **FUNCTION:** Người học hiện thực một hàm/phương thức theo một contract khả gọi tường minh. Đề bài
  đã xuất bản MUST mô tả không mơ hồ tên hàm được gọi, đầu vào/tham số, kết quả và hành vi cho mọi
  ngôn ngữ đang bật. Contract được khai báo theo từng ngôn ngữ đang bật (tên hàm, tham số/giá trị
  trả về, và ánh xạ ngôn ngữ), và starter code là bắt buộc ở mọi ngôn ngữ đang bật trước khi xuất bản.
- **OOP:** Người học hiện thực cấu trúc hướng đối tượng theo yêu cầu. Đề bài đã xuất bản MUST mô tả
  không mơ hồ các class/interface bắt buộc, constructor khi có liên quan, phương thức, tham số, hành
  vi trả về, và các ràng buộc về mức truy cập cho mọi ngôn ngữ đang bật. Contract được khai báo theo
  từng ngôn ngữ đang bật (class/interface, constructor, phương thức và mức truy cập), và starter
  code là bắt buộc ở mọi ngôn ngữ đang bật trước khi xuất bản.

### Toàn vẹn lịch sử

- ID Problem ổn định phải luôn hợp lệ đối với các tham chiếu từ Assignment và Submission.
- Quản lý Problem không sửa đổi lịch sử Submission khi nội dung hoặc vòng đời thay đổi.
- Thay đổi tiêu đề hay metadata hiển thị không bao giờ làm thay đổi định danh Problem.
- Chính sách chỉnh sửa một Problem đã xuất bản phân biệt trường bất biến và trường có thể thay đổi:
  loại và slug là bất biến sau khi xuất bản, còn metadata hiển thị, các phần của đề bài, độ khó, ví
  dụ, ràng buộc, các ngôn ngữ đang bật, starter code và các giới hạn vẫn chỉnh sửa được tại chỗ. Một
  Problem `ON_HOLD` hoặc đã xoá mềm không thể chỉnh sửa. Việc cập nhật một Problem `PUBLISHED` phải
  bảo toàn mức độ sẵn sàng xuất bản (ít nhất một ngôn ngữ đang bật và contract bắt buộc theo loại).
  Phiên bản này không đưa vào cơ chế versioning hay hành vi phá huỷ dữ liệu.

## Quy tắc phân quyền

- Việc truy cập danh mục/chi tiết đã xuất bản tuân theo quyết định hiển thị đã phê duyệt. Tối thiểu,
  một `STUDENT` đã xác thực với ngữ cảnh tin cậy hợp lệ có thể đọc các Problem khả dụng với họ.
- `STUDENT` MUST NOT tạo, cập nhật, xem trước, xuất bản, tạm giữ, xuất bản lại, xoá mềm hay khôi
  phục một Problem, và MUST NOT truy cập bản nháp, nội dung đang tạm giữ hay tài liệu nội bộ ẩn.
- Một `LECTURER` đã xác thực có quyền `problem:create` MAY tạo một bản nháp.
- Một Giảng viên MAY cập nhật, đọc, xem trước, xuất bản, tạm giữ, xuất bản lại, xoá mềm và khôi phục
  chỉ các Problem do chính mình tạo. Quyền sở hữu luôn được suy ra từ ngữ cảnh tác nhân tin cậy,
  không bao giờ từ dữ liệu client gửi lên.
- Các thao tác đọc ở phía quản lý, cập nhật và chuyển trạng thái vòng đời đòi hỏi quyền tính năng
  tường minh theo quy ước `resource:action` của ID-003. Các mã đề xuất là `problem:read-managed`
  (ngầm định cho chủ sở hữu khi đọc nội dung của chính mình), `problem:update`, `problem:publish`,
  `problem:hold`, `problem:republish`, `problem:delete` và `problem:restore`.
- `ADMIN` không mặc nhiên là người chỉnh sửa/xuất bản Problem hay chủ sở hữu được ưu tiên. Các khả
  năng của Admin đòi hỏi cùng những quyền Learning tường minh và cùng các kiểm tra sở hữu như mọi
  tác nhân khác.
- Gateway có thể thực hiện xác thực và kiểm tra route ở mức thô. Learning MUST thực thi khâu phân
  quyền, sở hữu, vòng đời và chính sách trường cuối cùng tại một ranh giới backend tin cậy.
- Learning MUST suy ra định danh và vai trò của tác nhân từ ngữ cảnh Gateway/service đã được xác
  minh. Body, query, route hay header từ client không thể thiết lập người tạo, vai trò, quyền hay
  quyền sở hữu tin cậy.
- Submission chỉ có thể lấy tài liệu judge ẩn với tư cách một tác nhân service tin cậy, theo contract
  giao tiếp nội bộ đã phê duyệt. Điều này không cấp cho nó thẩm quyền quản lý Problem.
- Phân quyền Problem bị thiếu hoặc mơ hồ sẽ mặc định là từ chối, theo ID-003.

## Đầu vào

Các route dưới đây là thao tác ở mức khái niệm, không phải thiết kế controller cuối cùng. Cách đặt
tên chính xác và cách hiện thực DTO thuộc về một `plan.md` đã được phê duyệt sau này.

### Tạo Problem bản nháp

Yêu cầu ngữ cảnh Giảng viên đã xác thực và tin cậy, có quyền `problem:create`, và chấp nhận:

- tiêu đề;
- slug hoặc dữ liệu cần thiết theo chính sách sinh slug đã phê duyệt;
- đề bài/mô tả chính;
- một loại được phê duyệt;
- một độ khó được phê duyệt; và
- metadata công khai ban đầu tuỳ chọn được phép cho một bản nháp.

Nó MUST NOT chấp nhận `createdBy` có tính thẩm quyền, mốc thời gian vòng đời, đáp án Test Case ẩn,
định danh service tin cậy, lệnh biên dịch, tham số Docker, vai trò hay các trường quyền.

### Cập nhật Problem có thẩm quyền

Chấp nhận một danh sách cho phép tường minh, lấy từ:

- tiêu đề, slug tuân theo chính sách slug đã phê duyệt, và các phần của đề bài;
- loại, tuân theo chính sách bất biến về loại đã phê duyệt;
- độ khó;
- ví dụ hiển thị và ràng buộc;
- các tham chiếu Topic/Tag;
- các ngôn ngữ được hỗ trợ đang bật;
- starter code hiển thị cho người học theo từng ngôn ngữ đang bật;
- cấu hình contract đặc thù theo loại cho từng ngôn ngữ đối với `FUNCTION`/`OOP`, tuân theo cùng
  chính sách bất biến như loại (một contract chỉ có thể thay đổi khi Problem còn chỉnh sửa được tại
  chỗ); và
- giới hạn thời gian/bộ nhớ dương nằm trong biên nền tảng.

Việc cập nhật một Problem `PUBLISHED` phải bảo toàn mức độ sẵn sàng xuất bản (ít nhất một ngôn ngữ
đang bật và contract bắt buộc theo loại). Một Problem `ON_HOLD` hoặc đã xoá mềm không thể chỉnh sửa.

Các bước chuyển vòng đời là những hành động riêng biệt và MUST NOT xảy ra thông qua gán hàng loạt.

### Xuất bản Problem

Chấp nhận định danh Problem ổn định và ngữ cảnh tác nhân tin cậy. State hiện đang lưu của Problem,
chứ không phải khẳng định của người gọi, quyết định mức độ sẵn sàng xuất bản.

### Khám phá/chi tiết Problem

Chỉ chấp nhận các giá trị phân trang, tìm kiếm, lọc, định danh hoặc slug đã được tài liệu hoá. Trạng
thái xuất bản, người tạo, vai trò, cờ dữ liệu ẩn hay cờ service nội bộ do client gửi MUST NOT làm
mở rộng kết quả.

### Xem trước

Chấp nhận một định danh Problem có thẩm quyền và trả về bản render theo hình dạng công khai mà không
thay đổi state. Nó không nhận mã nguồn để thực thi.

## Đầu ra

- Việc tạo bản nháp trả về định danh Problem ổn định, trạng thái `DRAFT` hiện tại, metadata quản lý
  an toàn, và thông tin kiểm tra/mức độ sẵn sàng, không kèm đáp án Test Case ẩn.
- Việc liệt kê nội dung đã xuất bản trả về một tập phân trang các bản tóm tắt công khai gồm ID ổn
  định, slug, tiêu đề, loại, độ khó, tóm tắt Topic/Tag đã phê duyệt, các ngôn ngữ đang bật và các mốc
  thời gian đã phê duyệt. Nó loại trừ các mục bản nháp, đang tạm giữ, đã xoá mềm và các trường
  ẩn/nội bộ.
- Chi tiết nội dung đã xuất bản trả về đề bài hiển thị cho người học, contract theo loại, ví dụ hiển
  thị, ràng buộc, các giới hạn phù hợp để hiển thị, các ngôn ngữ đang bật, và starter code hiển thị
  cho người học.
- Chi tiết ở phía quản lý có thể bao gồm trạng thái vòng đời và các lỗi về mức độ sẵn sàng xuất bản,
  nhưng không lấy dữ liệu vai trò/hồ sơ từ kho lưu trữ của Identity và không trả về đáp án Test Case
  ẩn ở dạng thô thông qua LRN-001.
- Xem trước trả về đúng hình dạng hướng người học mà việc xuất bản sẽ phơi bày, nhưng không thay đổi
  trạng thái vòng đời hay khả năng hiển thị trong danh mục.
- Xuất bản thành công trả về trạng thái `PUBLISHED` kết quả và biểu diễn Problem an toàn.
- Tạm giữ thành công trả về trạng thái `ON_HOLD`; xuất bản lại thành công trả về trạng thái
  `PUBLISHED` sau khi kiểm tra lại mức độ sẵn sàng.
- Xoá mềm thành công trả về xác nhận kèm dấu xoá và không kèm tài liệu ẩn; khôi phục thành công trả
  về trạng thái đã khôi phục (`PUBLISHED` hoặc `ON_HOLD`).
- Tài liệu judge ẩn không bao giờ được đưa vào phản hồi công khai/quản lý chỉ vì người gọi biết ID
  Problem hay ngôn ngữ đang bật.
- LRN-001 không phát ra domain event bắt buộc nào ở phiên bản này. Nhu cầu event cho
  Assignment/Recommendation trong tương lai cần đặc tả được phê duyệt riêng.

## Tình huống lỗi

| Trường hợp                                                                         | Hành vi quan sát được                                                                                 |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Thiếu hoặc sai xác thực ở thao tác được bảo vệ                                     | Quy ước Gateway/xác thực hiện có trả về `401`; không thay đổi state                                   |
| Tác nhân đã xác thực nhưng thiếu quyền/quyền sở hữu                                | Quy ước từ chối hiện có trả về `403`; không thay đổi state                                            |
| Problem không tồn tại hoặc không hiển thị với người gọi                            | Quy ước không tìm thấy/hiển thị hiện có trả về `404` mà không lộ state chưa công khai                 |
| Loại, độ khó, ngôn ngữ, Topic hoặc Tag không xác định                              | Lỗi kiểm tra dữ liệu/nghiệp vụ; không thay đổi state Problem                                          |
| Slug trùng hoặc không hợp lệ                                                       | Quy ước xung đột/kiểm tra dữ liệu hiện có; không tạo Problem trùng                                    |
| Đầu vào phân trang/tìm kiếm/lọc sai định dạng                                      | Quy ước kiểm tra dữ liệu hiện có trả về lỗi phía client; không lộ dữ liệu ẩn                          |
| Yêu cầu xuất bản một Problem không phải bản nháp hoặc chưa đủ                      | Lỗi chuyển trạng thái/kiểm tra xuất bản; trạng thái trước đó được giữ nguyên                          |
| Yêu cầu tạm giữ/xuất bản lại/xoá/khôi phục khi Problem không ở trạng thái bắt buộc | Lỗi nghiệp vụ về trạng thái không hợp lệ; trạng thái trước đó được giữ nguyên                         |
| Cung cấp các trường người tạo/trạng thái không được phép                           | Các trường bị từ chối hoặc bỏ qua bởi kiểm tra danh sách cho phép và không ảnh hưởng phân quyền/state |
| Cung cấp starter code cho ngôn ngữ đang tắt/không được hỗ trợ                      | Lỗi kiểm tra dữ liệu; không lưu trạng thái starter code không nhất quán                               |
| Cung cấp giới hạn thực thi không dương hoặc không an toàn                          | Lỗi kiểm tra dữ liệu; state của Problem không đổi                                                     |
| Yêu cầu ID bản nháp/tạm giữ/đã xoá mềm qua API người học                           | Phản hồi không tìm thấy/hiển thị mà không tiết lộ nội dung hay trạng thái chưa công khai              |
| Yêu cầu khôi phục hoặc dấu xoá qua API công khai                                   | Request bị từ chối hoặc trường bị bỏ qua; không trả về state ẩn                                       |
| Xung đột cập nhật/chuyển trạng thái đồng thời                                      | Không lộ state dở dang; hành vi tuân theo chính sách đồng thời đã phê duyệt khi được định nghĩa       |
| Lỗi lưu trữ hoặc lỗi phụ thuộc ngoài dự kiến                                       | Quy ước lỗi chuẩn hoá hiện có, không kèm nội dung ẩn, thông tin xác thực hay chi tiết xuyên service   |

LRN-001 không đưa ra cấu trúc lỗi mới. Việc tuần tự hoá ở tầng truyền tải tuân theo quy ước
Gateway/Learning/NestJS hiện có.

## Tình huống biên

- Hai lần tạo bản nháp đồng thời không thể tạo ra cùng một slug; nhiều nhất một lần thành công cho
  một slug duy nhất.
- Một Problem có thể không có Topic hay Tag nào, trừ khi chính sách xuất bản về sau yêu cầu; bộ lọc
  rỗng vẫn hợp lệ.
- Một Topic hoặc Tag bị gỡ bởi luồng Learning sở hữu nó không được âm thầm để lộ hay làm hỏng một
  phản hồi Problem.
- Việc gỡ một ngôn ngữ đang bật không được để lại starter code hiển thị cho người học của ngôn ngữ đó.
- Đổi loại sau khi xuất bản là bị cấm (loại là bất biến); một contract ngôn ngữ chỉ có thể thay đổi
  khi Problem còn chỉnh sửa được tại chỗ, và thao tác đó tôn trọng chính sách bất biến đã phê duyệt
  thay vì nhận một hành vi tự bịa.
- Việc xem trước một bản nháp không bao giờ làm thay đổi mốc thời gian/trạng thái ngoài hành vi gắn
  liền với một thao tác đọc.
- Tìm kiếm và lọc không bao giờ tiết lộ rằng có một Problem bản nháp, tạm giữ hay đã xoá mềm khớp
  điều kiện.
- Tiêu đề/đề bài tiếng Việt có dấu vẫn được hỗ trợ; việc chuẩn hoá slug phải bảo toàn tính duy nhất
  mà không dùng tiêu đề làm định danh.
- Nội dung tạm giữ và đã xoá mềm vẫn bị loại khỏi việc khám phá mới của người học, kể cả khi được
  dữ liệu Assignment/Submission lịch sử tham chiếu tới.
- Hai lần xoá mềm đồng thời, hoặc một lần xoá chạy đua với một lần khôi phục, để lại kết quả nhất
  quán: dấu xoá được đặt hoặc xoá một cách nguyên tử và nhiều nhất một lần cho mỗi thao tác thành công.
- Một trần nền tảng chặt hơn của Judge có thể từ chối một giới hạn Problem tuy dương nhưng không an
  toàn; một Problem không thể làm suy yếu các ràng buộc bảo mật của Judge.
- Harness ẩn và kết quả mong đợi vẫn ẩn, kể cả khi chúng đang tồn tại trong lớp lưu trữ hiện tại
  hoặc được một `ADMIN` yêu cầu thông qua một thao tác Problem công khai.

## Yêu cầu bảo mật

- **LRN-001-SR-001 — Phân quyền phía server:** Learning MUST thực thi quyền Problem, quyền sở hữu,
  chính sách trường và các bước chuyển vòng đời tại một ranh giới backend tin cậy; giao diện frontend
  không phải là biện pháp kiểm soát bảo mật.
- **LRN-001-SR-002 — Ngữ cảnh tác nhân tin cậy:** Định danh người tạo và tác nhân MUST chỉ đến từ
  ngữ cảnh Gateway/service đã được xác minh. Định danh, vai trò, quyền, quyền sở hữu hay header nội
  bộ tin cậy do client gửi MUST NOT ảnh hưởng tới phân quyền.
- **LRN-001-SR-003 — Bảo mật nội dung bản nháp/tạm giữ/đã xoá:** Nội dung bản nháp, tạm giữ và đã
  xoá mềm MUST NOT bị lộ qua hành vi liệt kê, tìm kiếm, lọc, chi tiết, lỗi hay đếm ở phía công khai.
  Các bản ghi đã xoá mềm bị loại khỏi truy vấn quản lý thông thường và chỉ xuất hiện trong luồng
  xem/khôi phục nội dung đã xoá tường minh của chủ sở hữu.
- **LRN-001-SR-004 — Bảo mật dữ liệu judge ẩn:** Test Case ẩn, kết quả mong đợi, harness, lời giải
  nội bộ và chi tiết thực thi MUST NOT xuất hiện trong phản hồi công khai hay quản lý, trong log,
  lỗi hay ví dụ Swagger.
- **LRN-001-SR-005 — Bảo vệ endpoint nội bộ:** Tài liệu judge được bảo vệ MUST chỉ được trả về cho
  một service tin cậy đã xác thực qua contract nội bộ đã phê duyệt; người gọi công khai và các header
  nội bộ giả mạo MUST bị từ chối.
- **LRN-001-SR-006 — Chống gán hàng loạt:** Đầu vào của Problem MUST liệt kê tường minh các trường
  được phép thay đổi. Người tạo, mốc thời gian, trạng thái vòng đời, dấu xoá, cờ dữ liệu ẩn, vai trò
  và quyền không thể bị thay đổi thông qua các trường request tuỳ ý.
- **LRN-001-SR-007 — An toàn nội dung:** Nội dung Problem MUST được kiểm tra và render sao cho
  script nhúng, HTML không an toàn, liên kết độc hại hay các payload tương đương không thể thực thi
  trên client của người học hay người quản lý.
- **LRN-001-SR-008 — Cách ly lệnh runtime:** Đầu vào về ngôn ngữ/giới hạn/starter code của Problem
  MUST NOT trở thành lệnh biên dịch, shell, tên file, Docker, mạng hay sandbox do client điều khiển.
- **LRN-001-SR-009 — Cách ly service/cơ sở dữ liệu:** Learning MUST NOT truy vấn cơ sở dữ liệu của
  Identity, Submission hay Judge, và MUST NOT tạo khoá ngoại xuyên service. Các service khác MUST
  NOT truy vấn trực tiếp `bkpractice_learning`.
- **LRN-001-SR-010 — Danh sách cho phép ở đầu ra:** Phản hồi Problem công khai MUST được ánh xạ
  tường minh và MUST NOT tuần tự hoá thực thể lưu trữ theo cách làm rò rỉ các trường bị ẩn khỏi
  select hoặc các trường nội bộ mới thêm.
- **LRN-001-SR-011 — Ghi log an toàn:** Header xác thực, bí mật của service, tài liệu judge ẩn, toàn
  bộ body request nhạy cảm và nội dung render không tin cậy MUST NOT được ghi vào log/lỗi.
- **LRN-001-SR-012 — Thất bại an toàn/mặc định từ chối:** Ngữ cảnh phân quyền/hiển thị bị thiếu, lỗi
  thời, sai định dạng hay mơ hồ MUST thất bại theo hướng đóng và giữ nguyên state trước đó của Problem.

## Tiêu chí nghiệm thu

- **LRN-001-AC-001:** Cho trước một Giảng viên có thẩm quyền, khi họ tạo dữ liệu Problem tối thiểu
  hợp lệ, thì một Problem được tạo ở `DRAFT` với ID ổn định và tham chiếu người tạo tin cậy.
- **LRN-001-AC-002:** Cho trước một Học viên hoặc người gọi danh mục công khai, khi Problem được
  liệt kê hoặc tìm kiếm, thì chỉ các Problem hiển thị theo chính sách đã phê duyệt và ở trạng thái
  `PUBLISHED` được trả về.
- **LRN-001-AC-003:** Cho trước một Problem bản nháp, tạm giữ hoặc đã xoá mềm khớp với tìm
  kiếm/bộ lọc, khi việc khám phá của người học chạy, thì nội dung và sự tồn tại của nó không bị lộ
  trong kết quả hay số đếm.
- **LRN-001-AC-004:** Cho trước một Problem đã xuất bản, khi một người học có thẩm quyền truy xuất
  nó theo ID ổn định hoặc slug, thì đề bài công khai, metadata, ngôn ngữ, giới hạn, ví dụ và starter
  code đã phê duyệt được trả về.
- **LRN-001-AC-005:** Cho trước một tác nhân chưa xác thực hoặc không có thẩm quyền, khi một thao tác
  quản lý Problem được bảo vệ được yêu cầu, thì nó nhận `401` hoặc `403` tuỳ trường hợp và không có
  thay đổi state.
- **LRN-001-AC-006:** Cho trước một Học viên, khi thử tạo/cập nhật/xem trước/xuất bản/tạm giữ/xuất
  bản lại/xoá mềm/khôi phục, thì thao tác bị từ chối và Problem không đổi.
- **LRN-001-AC-007:** Cho trước một yêu cầu cập nhật Problem chứa trường người tạo, vòng đời, vai
  trò, quyền, dữ liệu ẩn hoặc trường không xác định, khi việc kiểm tra dữ liệu chạy, thì các trường
  đó không thể làm thay đổi state của Problem.
- **LRN-001-AC-008:** Cho trước một bản nháp thiếu bất kỳ điều kiện tiên quyết xuất bản đã phê duyệt
  nào, khi yêu cầu xuất bản, thì việc xuất bản thất bại một cách nguyên tử và Problem vẫn ở `DRAFT`.
- **LRN-001-AC-009:** Cho trước một bản nháp hoàn chỉnh thoả mãn mọi điều kiện tiên quyết đã phê
  duyệt, khi một người quản lý có thẩm quyền xuất bản nó, thì trạng thái trở thành `PUBLISHED` và nó
  trở nên khám phá được theo chính sách hiển thị đã phê duyệt.
- **LRN-001-AC-010:** Cho trước một loại Problem nằm ngoài `STANDARD`, `FUNCTION` hoặc `OOP`, khi
  thử tạo hoặc cập nhật, thì việc kiểm tra dữ liệu từ chối nó mà không thay đổi state.
- **LRN-001-AC-011:** Cho trước một độ khó nằm ngoài `EASY`, `MEDIUM` hoặc `HARD`, khi thử tạo hoặc
  cập nhật, thì việc kiểm tra dữ liệu từ chối nó mà không thay đổi state.
- **LRN-001-AC-012:** Cho trước một ngôn ngữ nằm ngoài danh mục dùng chung đã phê duyệt, hoặc một
  Problem không có ngôn ngữ nào đang bật, khi thử xuất bản, thì nó bị từ chối mà không thay đổi state.
- **LRN-001-AC-013:** Cho trước một Problem `STANDARD` không có contract đầu vào/đầu ra đầy đủ, khi
  yêu cầu xuất bản, thì nó bị từ chối mà không thay đổi state.
- **LRN-001-AC-014:** Cho trước một Problem `FUNCTION` hoặc `OOP`, khi yêu cầu xuất bản, thì contract
  khả gọi/cấu trúc theo loại của nó được kiểm tra cho mọi ngôn ngữ đang bật theo chính sách biểu diễn
  đã phê duyệt.
- **LRN-001-AC-015:** Cho trước các ví dụ hiển thị cho người học, khi chi tiết Problem công khai được
  trả về, thì các ví dụ có mặt nhưng Test Case ẩn, kết quả ẩn mong đợi, harness và lời giải nội bộ
  đều vắng mặt.
- **LRN-001-AC-016:** Cho trước starter code cho một ngôn ngữ đang tắt hoặc không được hỗ trợ, khi
  việc kiểm tra cập nhật hoặc xuất bản chạy, thì cấu hình không nhất quán bị từ chối hoặc được chuyển
  thành không công khai mà không làm rò rỉ dữ liệu harness ẩn.
- **LRN-001-AC-017:** Cho trước giới hạn thời gian/bộ nhớ không dương hoặc không an toàn với nền
  tảng, khi việc kiểm tra dữ liệu chạy, thì request bị từ chối và các giá trị hiện có không đổi.
- **LRN-001-AC-018:** Cho trước một slug trùng, khi một thao tác tạo/cập nhật đồng thời cố lưu nó,
  thì nhiều nhất một Problem sở hữu slug đó và thao tác xung đột thất bại một cách an toàn.
- **LRN-001-AC-019:** Cho trước một lần xem trước bản nháp có thẩm quyền, khi nó được yêu cầu, thì
  biểu diễn hướng người học được trả về mà không xuất bản, không thực thi và không khám phá công khai.
- **LRN-001-AC-020:** Cho trước một phản hồi, lỗi, log hay ví dụ Swagger công khai của Problem, khi
  kiểm tra, thì nó không chứa Test Case ẩn, kết quả ẩn mong đợi, harness, lời giải nội bộ, thông tin
  xác thực hay lệnh runtime nào.
- **LRN-001-AC-021:** Cho trước một request tin cậy từ Submission để lấy dữ liệu judge, khi việc xác
  thực nội bộ đã phê duyệt vắng mặt hoặc bị giả mạo, thì Learning không trả về tài liệu Problem/Test
  Case ẩn nào.
- **LRN-001-AC-022:** Cho trước một tham chiếu từ Assignment hoặc Submission, khi định danh Problem
  được sử dụng, thì nó vẫn là một ID ngoài ổn định và không có quan hệ/truy vấn cơ sở dữ liệu xuyên
  service nào được đưa vào.
- **LRN-001-AC-023:** Cho trước hành vi Quản lý Problem, khi quyền sở hữu service được kiểm tra, thì
  Learning sở hữu việc lưu trữ Problem và không có microservice Problem/Judge/Recommendation nào
  được thêm vào.
- **LRN-001-AC-024:** Cho trước nội dung đề bài độc hại, khi nó được kiểm tra và render qua contract
  nội dung đã phê duyệt, thì nó không thể thực thi nội dung nhúng không an toàn.
- **LRN-001-AC-025:** Cho trước một lần kiểm tra dữ liệu, kiểm tra phân quyền hoặc chuyển trạng thái
  thất bại, khi thao tác kết thúc, thì không có thay đổi Problem dở dang nào được commit.
- **LRN-001-AC-026:** Cho trước một Problem `PUBLISHED` thuộc sở hữu, khi chủ sở hữu có thẩm quyền
  tạm giữ nó, thì trạng thái trở thành `ON_HOLD` và nó bị loại khỏi việc khám phá của người học trong
  khi vẫn giữ ID ổn định.
- **LRN-001-AC-027:** Cho trước một Problem `ON_HOLD`, khi chủ sở hữu có thẩm quyền xuất bản lại, thì
  mọi kiểm tra mức độ sẵn sàng xuất bản đều qua, trạng thái trở lại `PUBLISHED`, và nó lại khám phá
  được.
- **LRN-001-AC-028:** Cho trước một Problem `PUBLISHED` hoặc `ON_HOLD` thuộc sở hữu, khi chủ sở hữu
  có thẩm quyền xoá mềm nó, thì nó bị loại khỏi mọi truy vấn, bản ghi, ID ổn định và trạng thái trước
  đó được giữ lại, và lịch sử Submission không đổi.
- **LRN-001-AC-029:** Cho trước một Problem đã xoá mềm, khi chủ sở hữu có thẩm quyền khôi phục nó,
  thì nó trở về đúng trạng thái trước khi bị xoá (`PUBLISHED` hoặc `ON_HOLD`) và dấu xoá được gỡ bỏ.
- **LRN-001-AC-030:** Cho trước một người không phải chủ sở hữu hoặc một tác nhân thiếu quyền cần
  thiết, khi thử tạm giữ/xuất bản lại/xoá mềm/khôi phục, thì nó nhận `403` và trạng thái Problem không
  đổi.
- **LRN-001-AC-031:** Cho trước một Problem đã xoá mềm, khi các truy vấn của người học hoặc truy vấn
  quản lý thông thường chạy mà không có chủ đích khôi phục tường minh, thì Problem chỉ được trả về
  qua luồng xem/khôi phục nội dung đã xoá tường minh của chủ sở hữu.

## Ngoài phạm vi

- CRUD Test Case, quản lý test ẩn, chỉnh sửa kết quả mong đợi, trọng số Test Case, checker tuỳ chỉnh,
  và import/export Test Case
- Việc biên dịch, thực thi, sandbox, chọn runner, sinh harness, so sánh và phân loại kết quả của Judge
- Run Code, Submit Code, vòng đời/lịch sử nộp bài, lưu mã nguồn, và kết quả realtime
- Quản lý Course, Chapter, Class, Enrollment, Assignment, hạn chót, chấm điểm và tiến độ Assignment
- Trạng thái đã giải, tiến độ Learning, tổng hợp điểm và hành vi Recommendation
- Lịch sử phiên bản Problem, soạn thảo cộng tác, giao diện khoá lạc quan, hội đồng duyệt, và phê
  duyệt nội dung nhiều giai đoạn
- Lời giải biên tập, lời giải chính thức, phát hiện đạo văn, sinh đề/lời giải bằng AI, và chợ bài tập
- Elasticsearch hoặc công cụ tìm kiếm toàn văn bên ngoài khác
- Nhập từ các online judge hoặc danh mục Problem bên ngoài
- Quản trị Topic/Tag lúc chạy, ngoài việc liên kết với các giá trị sẵn có do Learning sở hữu
- Hệ thống đánh số dễ đọc cho người tách biệt với ID ổn định và slug hiện có
- Điểm tối đa ở mức Problem; việc chấm điểm của Assignment và Test Case vẫn tách biệt
- Xoá cứng (gỡ bỏ phá huỷ / xoá hẳn bản ghi) không được cung cấp; xoá mềm là cơ chế gỡ bỏ duy nhất
  và được định nghĩa trong phiên bản này.
- Các microservice mới cho Problem, Topic, Recommendation hay quản lý nội dung

## Phụ thuộc

- [Kiến trúc hệ thống BKPractice](../../../architecture/system-architecture.md)
- [Kiến trúc Learning Service](../../../architecture/learning-service.md)
- [Ma trận kiến trúc service](../../../architecture/service-architectures.md)
- [Quy tắc phụ thuộc](../../../architecture/dependency-rules.md)
- [ADR 0001: Kiến trúc nội bộ riêng theo từng service](../../../adr/0001-service-specific-internal-architectures.md)
- [ADR 0002: Sửa lại kiến trúc nội bộ của các service](../../../adr/0002-revised-service-internal-architectures.md)
- [Quy trình SDD](../../README.md)
- [Tham chiếu kiến trúc](../../00-system/architecture-reference.md)
- [Ranh giới service](../../00-system/service-boundaries.md)
- [Vai trò và quyền](../../00-system/roles-permissions.md)
- [Chiến lược cơ sở dữ liệu](../../00-system/database-strategy.md)
- [Chiến lược giao tiếp](../../00-system/communication.md)
- [Bảo mật Judge](../../00-system/judge-security.md)
- [Định nghĩa Hoàn thành](../../00-system/definition-of-done.md)
- [ID-001 Authentication](../../01-identity/authentication/spec.md) cho định danh đã xác thực, ngữ
  cảnh Gateway tin cậy, hành vi theo trạng thái tài khoản, và các claim vai trò.
- [ID-003 RBAC](../../01-identity/rbac/spec.md) cho mặc-định-từ-chối, quy ước đặt tên quyền
  `resource:action`, ngữ nghĩa vai trò, và phân quyền tài nguyên do service sở hữu.
- Đặc tả Test Case của Learning trong tương lai, cho vòng đời Test Case ẩn, mức độ sẵn sàng, trọng
  số, harness, kết quả mong đợi, và phụ thuộc khi xuất bản.
- Đặc tả Assignment trong tương lai, cho các tham chiếu Problem, quy tắc khả dụng, và chấm điểm.
- Các đặc tả Submission/Judge trong tương lai, cho gói dữ liệu judge được bảo vệ và hành vi thực thi.

## Câu hỏi mở

Không còn. Các quyết định sản phẩm đã được chủ sở hữu sản phẩm giải quyết và phê duyệt ngày
2026-09-05:

1. **Quyền sở hữu của Giảng viên:** Một Giảng viên chỉ quản lý các Problem do chính mình tạo.
2. **Thẩm quyền nội dung của Admin:** `ADMIN` không mặc nhiên có thẩm quyền với Problem; cùng những
   quyền và kiểm tra sở hữu được áp dụng cho mọi tác nhân.
3. **Đối tượng của danh mục:** Danh mục/chi tiết đã xuất bản chỉ đọc được bởi người dùng đã xác thực;
   khách chưa xác thực không thể đọc danh mục đã xuất bản.
4. **Các bước chuyển vòng đời:** Chỉ cung cấp `DRAFT -> PUBLISHED` và `PUBLISHED -> ARCHIVED`. Không
   có gỡ xuất bản, khôi phục hay xoá cứng trong v1. _(Bị thay thế bởi bản sửa đổi ngày 2026-09-06
   bên dưới.)_
5. **Giao bài từ bản nháp:** `Assignment` chỉ được tham chiếu các Problem `PUBLISHED`.
6. **Chỉnh sửa sau xuất bản và tính bất biến của loại:** `type` và `slug` là bất biến sau khi xuất
   bản; các trường khác vẫn chỉnh sửa được tại chỗ.
7. **Thay đổi lịch sử:** Chỉnh sửa tại chỗ đơn giản cho các trường thay đổi được; versioning Problem
   là Ngoài phạm vi.
8. **Xoá:** Lưu trữ (archive) là cơ chế gỡ bỏ duy nhất; không cung cấp xoá cứng.
   _(Bị thay thế bởi bản sửa đổi ngày 2026-09-06 bên dưới.)_
9. **Định dạng nội dung:** Đề bài được soạn dưới dạng Markdown hạn chế; backend kiểm tra định
   dạng/độ dài và từ chối payload HTML/script thô; frontend làm sạch trước khi render.
10. **Mức độ sẵn sàng khi xuất bản/Test Case:** LRN-001 không yêu cầu Test Case khi xuất bản; cổng
    kiểm tra mức độ sẵn sàng thuộc về đặc tả Test Case LRN-002 trong tương lai.
11. **Starter code:** Tuỳ chọn với `STANDARD`; bắt buộc với `FUNCTION` và `OOP` ở mọi ngôn ngữ đang
    bật trước khi xuất bản.
12. **Biểu diễn contract FUNCTION/OOP:** Contract được khai báo theo từng ngôn ngữ đang bật (hàm/lớp,
    tham số, giá trị trả về, mức truy cập) thay vì một contract chuẩn tắc trung lập với ngôn ngữ.
13. **Chính sách slug:** Giảng viên cung cấp slug khi tạo; nó phải duy nhất, hợp lệ và bất biến sau
    khi tạo.
14. **Chính sách Topic/Tag:** Cả hai đều tuỳ chọn, không bắt buộc cái nào khi xuất bản; LRN-001 chỉ
    liên kết tới các giá trị sẵn có do Learning sở hữu. Việc quản trị danh mục thuộc về một tính năng
    Learning trong tương lai.
15. **Mô hình hiển thị:** Mọi Problem `PUBLISHED` đều hiển thị toàn cục trong nền tảng ở v1; hiển thị
    dạng `COURSE_ONLY` được hoãn sang các đặc tả Course/Assignment.

### Bản sửa đổi vòng đời ngày 2026-09-06 (phiên bản 1.1, đã phê duyệt)

Mục 4 và 8 ở trên bị thay thế bởi bản sửa đổi này.

16. **Bỏ `ARCHIVED`:** Trạng thái vòng đời `ARCHIVED` bị loại bỏ và được thay bằng `ON_HOLD` cộng với
    cơ chế xoá mềm/khôi phục.
17. **Khám phá khi tạm giữ:** Một Problem `ON_HOLD` bị loại khỏi việc khám phá của người học và có
    thể được xuất bản lại mà không cần tạo lại.
18. **Các bước chuyển:** `PUBLISHED -> ON_HOLD` (tạm giữ), `ON_HOLD -> PUBLISHED` (xuất bản lại, có
    kiểm tra lại mức độ sẵn sàng xuất bản), và xoá mềm từ `PUBLISHED` hoặc `ON_HOLD`.
19. **Xoá mềm:** Xoá mềm đặt một dấu xoá trên bản ghi; bản ghi, ID ổn định, nội dung và
    `publish_status` trước đó được giữ lại và lịch sử Submission không bị đụng tới. Đây là cơ chế gỡ
    bỏ duy nhất; không cung cấp xoá cứng. Không thể xoá một `DRAFT`.
20. **Khôi phục:** Khôi phục gỡ dấu xoá và đưa Problem trở về đúng trạng thái mà nó có ngay trước khi
    bị xoá (`PUBLISHED` hoặc `ON_HOLD`).
21. **Quyền:** Bổ sung các quyền tường minh mới `problem:hold`, `problem:republish`, `problem:delete`
    và `problem:restore`, tất cả đều giới hạn trong các Problem do chính mình tạo và không có thẩm
    quyền ngầm cho `ADMIN`.
22. **Khả năng chỉnh sửa:** Chỉ các Problem `DRAFT` và `PUBLISHED` là chỉnh sửa được; các Problem
    `ON_HOLD` và đã xoá mềm thì không.

## Lịch sử sửa đổi

| Ngày       | Phiên bản | Tác giả/Người review | Tóm tắt                                                                                                                                                                                                        |
| ---------- | --------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-02 | 0.1       | Codex / TBD          | Đặc tả Quản lý Problem ban đầu ở trạng thái Proposed                                                                                                                                                           |
| 2026-09-05 | 1.0       | Chủ sở hữu sản phẩm  | Giải quyết 15 Câu hỏi mở và phê duyệt LRN-001                                                                                                                                                                  |
| 2026-09-06 | 1.1       | Chủ sở hữu sản phẩm  | Sửa đổi vòng đời: thay ARCHIVED bằng ON_HOLD + xoá mềm + khôi phục; bổ sung các quyền hold/republish/delete/restore. Đã phê duyệt.                                                                             |
| 2026-09-23 | 1.1       | Codex                | Khôi phục nội dung revision 1.1 vào repository (bản trước đó chưa từng được commit và mất khi reset nhánh) và cập nhật nhãn kiến trúc Learning sang DDD + Hexagonal theo ADR 0002. Không thay đổi yêu cầu nào. |
| 2026-09-29 | 1.1       | DuongPham-Barca      | Bổ sung ADR 0002 vào mục Phụ thuộc. Không thay đổi yêu cầu nào.                                                                                                                                                |

> `spec.md` mô tả CÁI GÌ. Controller, DTO, entity, repository, migration, chiến lược truy vấn, hình
> dạng lưu trữ, thư viện làm sạch nội dung, contract service và thứ tự thực thi thuộc về một
> `plan.md` sau này, sau khi có phê duyệt của con người.
