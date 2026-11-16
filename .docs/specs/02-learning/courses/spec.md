> **Bản sửa đổi Course content 1.1, Approved 2026-11-12:** Course có thể xuất bản khi có ít nhất
> một Problem hoặc Quiz đang `PUBLISHED` và chưa xoá. Mỗi Problem/Quiz hiển thị là một đơn vị tiến
> độ theo LRN-006 1.1. Quyết định này thay điều kiện Problem-only của bản 1.0 và amendment LRN-009
> trước đó; không thêm bảng hay gộp thứ tự Problem/Quiz.
>
> **Bản sửa đổi LRN-009 1.3, Approved 2026-11-11:** LECTURER có quyền quản lý nội dung Learning mình tạo; ADMIN có quyền tương ứng quản lý mọi nội dung. Quy tắc này thay các câu ADMIN-only hoặc bỏ kiểm created_by trước đó. Course hỗ trợ liên kết nhiều Quiz/Chapter theo LRN-009. Không khôi phục Class/Enrollment/Assignment.

# LRN-003 Quản lý Course

## Trạng thái

Approved

> Cập nhật 2026-11-07: [LRN-008](../self-study/spec.md) thay thế mọi quy định về LECTURER, sở hữu riêng của người tạo, Class, Enrollment, Assignment và tiến độ theo lớp trong tài liệu này. Các yêu cầu còn lại vẫn áp dụng.

Phiên bản `1.1`, amendment Course content được chủ sở hữu phê duyệt ngày `2026-11-12`; phiên bản
`1.0` được phê duyệt ngày `2026-09-30`.

Giá trị hợp lệ: `Proposed` | `Approved` | `Implemented` | `Verified`

## Mục tiêu

Cho phép Giảng viên xây dựng khung nội dung của một môn học — Course gồm các Chapter có thứ tự, mỗi
Chapter có danh sách Problem và Quiz — và cho phép người học đã xác thực xem cấu trúc của các
Course đã xuất bản, trong khi Learning vẫn sở hữu toàn bộ dữ liệu và chính sách, và không để lộ
Problem chưa công khai.

## Tác nhân

- **LECTURER:** Người dùng giảng dạy đã xác thực, tạo và quản lý Course của chính mình khi có quyền
  Learning cần thiết.
- **STUDENT:** Người học đã xác thực, xem các Course đã xuất bản theo chính sách hiển thị.
- **ADMIN:** Giống LRN-001, không mặc nhiên có thẩm quyền với nội dung Course.
- **Khách chưa xác thực:** Không có quyền truy cập nào.
- **API Gateway:** Xác minh access token, loại bỏ header định danh do client gửi, chuyển tiếp ngữ
  cảnh định danh, vai trò và quyền đã xác minh (ID-003 0.4).
- **Learning Service:** Chủ sở hữu Course, Chapter và việc xếp Problem vào Chapter.

## Bối cảnh

Trong BKPractice, **Course là khung nội dung của một môn học** (ví dụ "Lập trình C"), dùng lại qua
nhiều học kỳ. **Class là lớp học phần cụ thể** của một kỳ, có giảng viên, mã tham gia và sinh viên
đăng ký. LRN-003 chỉ định nghĩa Course và Chapter; Class và Enrollment thuộc LRN-004, Assignment
thuộc LRN-005, Progress thuộc LRN-006.

Nền tảng hiện có:

- Bảng `courses` có `title` (≤ 200), `slug` duy nhất (≤ 220), `description` cho phép null,
  `created_by`, `created_at`. Chưa có trạng thái vòng đời, `updated_at` hay dấu xoá.
- Bảng `chapters` có `course_id` (xoá theo Course), `title` (≤ 200), `display_order`. Chưa có quan
  hệ nào giữa Chapter và Problem.
- Bảng `classes` và `enrollments` tham chiếu `courses`; bảng `assignments` có `course_id` cho phép
  null với `ON DELETE SET NULL`.
- Chưa có API nào cho Course hay Chapter.

LRN-003 tái dùng các quyết định của LRN-001 ở những chỗ tương đồng (quyền sở hữu, `ADMIN` không có
thẩm quyền ngầm, slug do giảng viên cung cấp, Markdown hạn chế, danh mục chỉ cho người đã xác thực).
Mã nguồn hiện tại là hành vi nền tảng, không phải bản triển khai của đặc tả này.

## Yêu cầu chức năng

- **LRN-003-FR-001 — Quyền sở hữu của Learning:** Learning MUST sở hữu Course, Chapter và việc xếp
  Problem/Quiz vào Chapter. Không service nào khác lưu hay sửa các dữ liệu này.
- **LRN-003-FR-002 — Định danh ổn định:** Mọi Course và Chapter MUST có định danh ổn định. Course
  MUST có một slug duy nhất do Giảng viên cung cấp khi tạo và bất biến sau khi tạo, tối đa 220 ký tự; tiêu đề tối đa 200
  ký tự và không phải định danh.
- **LRN-003-FR-003 — Tạo Course:** Giảng viên có quyền `course:create` MUST có thể tạo Course ở trạng
  thái nháp với tiêu đề, slug và mô tả tuỳ chọn. Người tạo MUST lấy từ ngữ cảnh xác thực tin cậy.
- **LRN-003-FR-004 — Cập nhật Course:** Chủ sở hữu có thẩm quyền MUST có thể sửa tiêu đề và mô tả của
  Course khi Course chỉnh sửa được.
- **LRN-003-FR-005 — Quản lý Chapter:** Chủ sở hữu có thẩm quyền MUST có thể thêm, đổi tên, sửa mô
  tả, sắp xếp lại và gỡ Chapter của Course chỉnh sửa được.
- **LRN-003-FR-006 — Xếp Problem vào Chapter:** Chủ sở hữu có thẩm quyền MUST có thể thêm, sắp xếp
  lại và gỡ Problem trong một Chapter. Chỉ thêm được Problem `PUBLISHED` chưa xoá mềm của bất kỳ ai,
  hoặc Problem `DRAFT`/`ON_HOLD` chưa xoá mềm do chính giảng viên đó tạo. Mỗi Problem xuất hiện tối
  đa một lần trong một Course.
- **LRN-003-FR-007 — Vòng đời Course:** Course MUST đi theo vòng đời ở mục Quy tắc nghiệp vụ:
  `DRAFT` → `PUBLISHED`, `PUBLISHED` ⇄ `ON_HOLD`, xoá mềm từ `PUBLISHED`/`ON_HOLD`, khôi phục về đúng
  trạng thái trước khi xoá. Chuyển trạng thái là hành động riêng, không phải trường chỉnh sửa tự do.
- **LRN-003-FR-018 — Xoá hẳn Course nháp:** Chủ sở hữu có thẩm quyền MAY xoá hẳn một Course `DRAFT`
  (chưa từng xuất bản) khi không có Class hay Assignment nào tham chiếu nó. Có tham chiếu thì bị từ
  chối. Course đã từng xuất bản chỉ xoá mềm được.
- **LRN-003-FR-008 — Điều kiện xuất bản:** Course MUST chỉ được xuất bản hoặc xuất bản lại khi tiêu
  đề không rỗng, có ít nhất một Chapter, và có ít nhất một Learning Item khả dụng trong toàn Course.
  Learning Item khả dụng là Problem hoặc Quiz `PUBLISHED` chưa xoá mềm. Chapter rỗng được phép.
  Việc xuất bản MUST nguyên tử và kiểm tra trạng thái hiện tại trên state đã lưu.
- **LRN-003-FR-009 — Xem Course đã xuất bản:** Mọi người dùng đã xác thực MUST có thể liệt
  kê Course đã xuất bản và xem cấu trúc của một Course (Chapter, Problem và Quiz theo thứ tự riêng
  đã lưu của từng loại).
- **LRN-003-FR-010 — Không lộ nội dung chưa công khai:** Biểu diễn hướng người học của Course MUST
  chỉ hiển thị Problem/Quiz đang `PUBLISHED` và chưa xoá mềm. Nội dung khác MUST bị bỏ qua mà không
  lộ sự tồn tại, tiêu đề hay số lượng.
- **LRN-003-FR-011 — Đọc ở phía quản lý:** Chủ sở hữu có thẩm quyền MUST có thể xem mọi Course của
  mình ở mọi trạng thái, kèm trạng thái của từng Problem/Quiz đã xếp và thông tin mức độ sẵn sàng
  xuất bản.
- **LRN-003-FR-012 — Tham chiếu Problem:** Chapter MUST tham chiếu Problem bằng định danh ổn định của
  LRN-001. LRN-003 MUST NOT sao chép hay sửa nội dung Problem.
- **LRN-003-FR-013 — Toàn vẹn khi Problem đổi trạng thái:** Khi một Problem đã xếp chuyển sang
  `ON_HOLD` hoặc bị xoá mềm, tham chiếu MUST được giữ lại và chỉ bị ẩn khỏi người học; khi Problem
  xuất bản lại hoặc được khôi phục, nó MUST hiển thị lại ở đúng vị trí.
- **LRN-003-FR-014 — Nội dung an toàn:** Mô tả Course và Chapter MUST dùng Markdown hạn chế như
  LRN-001-FR-029: backend kiểm tra độ dài, từ chối HTML/script thô; frontend làm sạch khi render.
- **LRN-003-FR-015 — Giới hạn:** Một Course MUST có tối đa 50 Chapter; một Chapter MUST có tối đa 50
  Problem. Mô tả Course tối đa 20.000 ký tự; tiêu đề Chapter tối đa 200 ký tự; mô tả Chapter tối đa
  5.000 ký tự.
- **LRN-003-FR-019 — Sửa khi đã xuất bản:** Course `PUBLISHED` MUST sửa được tại chỗ (thông tin,
  Chapter, Problem, Quiz), miễn thay đổi không làm Course mất điều kiện xuất bản ở LRN-003-FR-008.
  Gỡ Learning Item khả dụng cuối cùng MUST bị từ chối và rollback. Course `ON_HOLD` và đã xoá mềm
  không sửa được.
- **LRN-003-FR-020 — Learning Item:** Course MUST coi mỗi Problem và mỗi Quiz hiển thị là một
  Learning Item độc lập. Trạng thái được đọc qua port hẹp của module sở hữu; Course MUST NOT sao
  chép nội dung, đáp án, tiến độ hoặc dùng chung entity/repository nội bộ của Problem/Quiz.
- **LRN-003-FR-016 — Retry xác định:** Thao tác thất bại MUST để nguyên state; thao tác đọc lặp lại
  MUST NOT làm thay đổi state.
- **LRN-003-FR-017 — Không sở hữu lớp, bài tập hay tiến độ:** LRN-003 MUST NOT tạo Class, Enrollment,
  Assignment, hạn chót, điểm hay tiến độ.

## Quy tắc nghiệp vụ

### Cấu trúc

```text
Course (môn học)
 ├── tiêu đề, slug, mô tả (Markdown hạn chế), trạng thái, người tạo, mốc thời gian
 └── Chapter 1..n (có thứ tự)
      ├── tiêu đề, mô tả (Markdown hạn chế)
      ├── Problem 0..m (có thứ tự riêng, tham chiếu theo ID của LRN-001)
      └── Quiz 0..n (có thứ tự riêng, tham chiếu theo ID của LRN-009)
```

- Chapter chỉ thuộc một Course. Chapter không có vòng đời riêng; nó hiển thị theo trạng thái của
  Course.
- Một Problem xuất hiện tối đa một lần trong một Course.
- Một Problem có thể nằm trong nhiều Course khác nhau.

### Vòng đời

| Trạng thái      | Người học thấy | Chỉnh sửa được | Ý nghĩa                                         |
| --------------- | -------------- | -------------- | ----------------------------------------------- |
| `DRAFT`         | Không          | Có             | Đang soạn; xoá hẳn được nếu không bị tham chiếu |
| `PUBLISHED`     | Có             | Có, tại chỗ    | Đã qua kiểm tra xuất bản                        |
| `ON_HOLD`       | Không          | Không          | Tạm ẩn, giữ nguyên dữ liệu và định danh         |
| `DELETED` (mềm) | Không          | Không          | Đã xoá mềm, khôi phục được về trạng thái cũ     |

- Không có bước chuyển về `DRAFT`. Các bước chuyển bị cấm (tạm giữ khi không `PUBLISHED`, xuất bản
  lại khi không `ON_HOLD`, xoá mềm `DRAFT`, khôi phục Course chưa bị xoá) trả lỗi trạng thái không hợp
  lệ và không đổi state.
- Xuất bản lại kiểm tra lại điều kiện xuất bản; khôi phục thì không kiểm tra lại nội dung.
- Chapter chỉ có tiêu đề, mô tả, danh sách Problem và danh sách Quiz; không có bài giảng hay tài
  liệu ở v1. Hai danh sách giữ thứ tự riêng vì amendment này không đổi schema.

### Quan hệ với tính năng khác

- Class (LRN-004) tham chiếu Course. Trạng thái Course ảnh hưởng tới Class thế nào thuộc LRN-004.
- Assignment (LRN-005) có thể gắn với Course; LRN-003 không định nghĩa hành vi đó.
- Xoá mềm Course MUST NOT xoá Class, Enrollment hay Assignment đang tham chiếu nó.

## Quy tắc phân quyền

- Mọi thao tác cần người dùng đã xác thực.
- Tạo Course cần `course:create`. Thao tác quản lý khác cần quyền tương ứng cộng với quyền sở hữu (chỉ
  người tạo quản lý Course của mình):

  | Thao tác                                   | Quyền                                                 |
  | ------------------------------------------ | ----------------------------------------------------- |
  | Tạo                                        | `course:create`                                       |
  | Đọc phía quản lý, xem trước                | `course:read-managed`                                 |
  | Sửa Course, Chapter, Problem trong Chapter | `course:update`                                       |
  | Xuất bản / tạm giữ / xuất bản lại          | `course:publish` / `course:hold` / `course:republish` |
  | Xoá mềm, xoá hẳn nháp / khôi phục          | `course:delete` / `course:restore`                    |

- Tám quyền `course:*` được seed tĩnh ở Identity và chỉ gán cho `LECTURER`, theo ID-003-FR-017.
- Quyền đến từ header `x-auth-permissions` do Gateway đặt (ID-003 0.4); quyền sở hữu so
  `createdBy` với principal tin cậy.
- `ADMIN` không có thẩm quyền ngầm; `STUDENT` không quản lý được Course.
- Mọi người dùng đã xác thực xem được Course đã xuất bản; việc giới hạn theo Class thuộc LRN-004.
- Thêm Problem vào Chapter không cấp quyền nào với Problem đó.
- Phân quyền thiếu hoặc mơ hồ mặc định là từ chối.

## Đầu vào

- **Tạo Course:** tiêu đề, slug, mô tả tuỳ chọn. Không nhận người tạo, trạng thái, mốc thời gian.
- **Cập nhật Course:** tiêu đề, mô tả.
- **Chapter:** tiêu đề, mô tả tuỳ chọn, vị trí; sắp xếp lại nhận thứ tự mới của đúng tập Chapter hiện
  có.
- **Problem/Quiz trong Chapter:** định danh nội dung, vị trí; sắp xếp lại nhận thứ tự mới của đúng
  tập cùng loại hiện có trong Chapter.
- **Chuyển trạng thái:** định danh Course và ngữ cảnh tác nhân tin cậy.
- **Liệt kê/xem:** phân trang, tìm theo tiêu đề, tra theo định danh hoặc slug.

Route và DTO cụ thể thuộc `plan.md`.

## Đầu ra

- Tạo/cập nhật/chuyển trạng thái: biểu diễn quản lý của Course.
- Biểu diễn hướng người học: định danh, slug, tiêu đề, mô tả, danh sách Chapter theo thứ tự, mỗi
  Chapter kèm danh sách tóm tắt Problem và Quiz hiển thị được theo thứ tự riêng. Không có trạng thái,
  người tạo nội bộ hay nội dung bị ẩn.
- Biểu diễn quản lý: thêm trạng thái Course, mốc thời gian, trạng thái của từng Problem/Quiz đã xếp,
  và lỗi mức độ sẵn sàng xuất bản.
- Liệt kê người học: tóm tắt phân trang của Course đã xuất bản (định danh, slug, tiêu đề, số Chapter).
- LRN-003 không phát domain event nào.

## Tình huống lỗi

| Trường hợp                                                        | Hành vi quan sát được                                 |
| ----------------------------------------------------------------- | ----------------------------------------------------- |
| Thiếu hoặc sai xác thực                                           | `401`; không thay đổi state                           |
| Thiếu quyền hoặc không phải chủ sở hữu                            | `403`; không thay đổi state                           |
| Course/Chapter không tồn tại hoặc không hiển thị với người gọi    | `404`; không lộ trạng thái chưa công khai             |
| Slug trùng hoặc không hợp lệ                                      | Lỗi xung đột/kiểm tra dữ liệu; không tạo Course       |
| Course không ở trạng thái cho phép thao tác                       | Lỗi trạng thái không hợp lệ; không thay đổi state     |
| Problem không tồn tại hoặc không thoả chính sách thêm vào Chapter | Lỗi kiểm tra dữ liệu; không lộ Problem chưa công khai |
| Problem đã có trong Course                                        | Lỗi xung đột; không thay đổi state                    |
| Xoá hẳn Course nháp đang bị Class/Assignment tham chiếu           | Lỗi xung đột; không thay đổi state                    |
| Thay đổi làm Course `PUBLISHED` không còn Learning Item khả dụng  | Lỗi mức độ sẵn sàng; không thay đổi state             |
| Vượt giới hạn Chapter/Problem                                     | Lỗi kiểm tra dữ liệu; không thay đổi state            |
| Thứ tự mới không khớp tập hiện có                                 | Lỗi kiểm tra dữ liệu; thứ tự cũ giữ nguyên            |
| Xuất bản khi chưa đủ điều kiện                                    | Lỗi mức độ sẵn sàng; giữ trạng thái cũ                |
| Mô tả có HTML/script thô hoặc quá dài                             | Lỗi kiểm tra dữ liệu                                  |

LRN-003 không đưa vào cấu trúc lỗi mới.

## Tình huống biên

- Chapter không có Problem hiển thị được vẫn xuất hiện trong biểu diễn người học (với danh sách
  rỗng).
- Mọi Problem/Quiz trong một Course đã xuất bản bị tạm giữ sau đó: Course vẫn xuất bản, các nội
  dung đó bị ẩn và tiến độ được tính lại từ nội dung còn hiển thị; không tự đổi trạng thái Course.
- Hai lần sắp xếp đồng thời để lại một thứ tự nhất quán.
- Gỡ một Chapter gỡ luôn các tham chiếu Problem của nó, không đụng tới Problem.
- Tiêu đề tiếng Việt có dấu được hỗ trợ; slug vẫn là định danh.

## Yêu cầu bảo mật

- **LRN-003-SR-001 — Phân quyền phía server:** Quyền, sở hữu và trạng thái kiểm tra tại backend.
- **LRN-003-SR-002 — Ngữ cảnh tin cậy:** Định danh và quyền chỉ từ header Gateway đã xác minh.
- **LRN-003-SR-003 — Không lộ nội dung chưa công khai:** Course nháp/tạm giữ/đã xoá và Problem/Quiz chưa
  công khai MUST NOT lộ qua liệt kê, tìm kiếm, chi tiết, lỗi hay số đếm của người học.
- **LRN-003-SR-004 — Không lộ dữ liệu judge:** Biểu diễn Course MUST NOT chứa Test Case, harness hay
  dữ liệu judge của Problem.
- **LRN-003-SR-005 — Chống gán hàng loạt:** Đầu vào liệt kê tường minh các trường được phép.
- **LRN-003-SR-006 — Nội dung an toàn:** Mô tả không thể thực thi script trên client.
- **LRN-003-SR-007 — Cách ly service:** Không truy vấn CSDL của service khác; không khoá ngoại xuyên
  service.
- **LRN-003-SR-008 — Thất bại an toàn:** Ngữ cảnh thiếu hoặc mơ hồ thì từ chối và giữ nguyên state.

## Tiêu chí nghiệm thu

- **LRN-003-AC-001:** Cho trước Giảng viên có `course:create`, khi tạo Course hợp lệ, thì Course được
  tạo ở `DRAFT` với định danh ổn định và người tạo tin cậy.
- **LRN-003-AC-002:** Cho trước `STUDENT`, `ADMIN` chưa được cấp quyền, hoặc Giảng viên không phải chủ
  sở hữu, khi thử thao tác quản lý, thì nhận `403` và state không đổi.
- **LRN-003-AC-003:** Cho trước người chưa xác thực, khi gọi bất kỳ thao tác nào, thì nhận `401`.
- **LRN-003-AC-004:** Cho trước một Course đã xuất bản chứa Problem `PUBLISHED`, `ON_HOLD` và đã xoá
  mềm, khi người học xem, thì chỉ Problem `PUBLISHED` chưa xoá xuất hiện, đúng thứ tự, và không có
  dấu vết của Problem bị ẩn.
- **LRN-003-AC-005:** Cho trước Course `DRAFT`, `ON_HOLD` hoặc đã xoá mềm, khi người học liệt kê hoặc
  xem, thì Course không xuất hiện và tra cứu trực tiếp trả `404`.
- **LRN-003-AC-006:** Cho trước Course chưa thoả điều kiện xuất bản, khi yêu cầu xuất bản, thì thất
  bại nguyên tử và lỗi nêu rõ điều kiện còn thiếu.
- **LRN-003-AC-007:** Cho trước Course thoả điều kiện, khi chủ sở hữu xuất bản, thì Course thành
  `PUBLISHED` và người học thấy được.
- **LRN-003-AC-008:** Cho trước một Problem không thoả chính sách thêm vào Chapter, khi thêm, thì bị
  từ chối mà không lộ thông tin của Problem đó.
- **LRN-003-AC-009:** Cho trước yêu cầu sắp xếp lại không khớp tập hiện có, khi kiểm tra, thì bị từ
  chối và thứ tự cũ giữ nguyên.
- **LRN-003-AC-010:** Cho trước một Problem đã xếp bị tạm giữ rồi xuất bản lại, khi người học xem
  Course, thì nó ẩn trong lúc tạm giữ và xuất hiện lại đúng vị trí sau đó.
- **LRN-003-AC-011:** Cho trước slug trùng, khi tạo Course, thì nhiều nhất một Course sở hữu slug đó.
- **LRN-003-AC-012:** Cho trước mô tả có HTML/script thô, khi lưu, thì bị từ chối.
- **LRN-003-AC-013:** Cho trước vượt giới hạn Chapter hoặc Problem, khi thêm, thì bị từ chối và state
  không đổi.
- **LRN-003-AC-014:** Cho trước một Course bị xoá mềm có Class tham chiếu, khi xoá, thì Class và
  Assignment không bị xoá.
- **LRN-003-AC-015:** Cho trước biểu diễn Course bất kỳ, khi kiểm tra, thì không chứa Test Case,
  harness hay dữ liệu judge.
- **LRN-003-AC-016:** Cho trước request chứa trường không được phép (người tạo, trạng thái, mốc thời
  gian), khi kiểm tra, thì các trường đó không làm thay đổi state.
- **LRN-003-AC-017:** Cho trước một Course `DRAFT` không bị tham chiếu, khi chủ sở hữu xoá hẳn, thì
  Course và các Chapter của nó bị xoá; nếu có Class hoặc Assignment tham chiếu, thì bị từ chối.
- **LRN-003-AC-018:** Cho trước một Problem đã có trong Course, khi thêm lần nữa vào bất kỳ Chapter
  nào của Course đó, thì bị từ chối.
- **LRN-003-AC-019:** Cho trước Course `PUBLISHED` chỉ còn một Problem `PUBLISHED`, khi chủ sở hữu gỡ
  Problem đó, thì bị từ chối và state không đổi.
- **LRN-003-AC-020:** Cho trước Giảng viên thêm Problem `DRAFT` của chính mình vào Chapter, khi người
  học xem Course, thì Problem đó không xuất hiện; Problem `DRAFT` của giảng viên khác thì không thêm
  được.
- **LRN-003-AC-021:** Cho trước Course chỉ có một Quiz `PUBLISHED` chưa xoá trong một Chapter, khi
  chủ sở hữu publish, thì Course thành `PUBLISHED` và người học thấy Quiz đó.
- **LRN-003-AC-022:** Cho trước Course có cả Problem và Quiz khả dụng, khi gỡ một loại nhưng vẫn còn
  loại kia, thì Course giữ readiness; khi gỡ Learning Item khả dụng cuối cùng thì bị từ chối nguyên tử.
- **LRN-003-AC-023:** Cho trước Course `ON_HOLD` có Quiz đã bị hold/xoá hoặc đổi revision, khi
  republish, thì readiness dùng trạng thái Quiz hiện tại; revision mới vẫn là cùng một Quiz reference.

## Ngoài phạm vi

- Class, mã tham gia, Enrollment, danh sách sinh viên (LRN-004)
- Assignment, hạn chót, chấm điểm (LRN-005)
- Cách ghi nhận và tổng hợp tiến độ học theo Course/Chapter (LRN-006); LRN-003 chỉ cung cấp cấu trúc
- Gợi ý bài (Recommendation)
- Bài giảng dạng văn bản/video, tài liệu đính kèm, file upload
- Đồng sở hữu, chia sẻ quyền quản lý Course giữa nhiều giảng viên
- Sao chép (clone) Course, versioning Course
- Điều kiện mở khoá Chapter (phải xong Chapter trước mới mở Chapter sau)
- Microservice mới cho Course

## Phụ thuộc

- [Kiến trúc Learning Service](../../../architecture/learning-service.md)
- [Quy tắc phụ thuộc](../../../architecture/dependency-rules.md)
- [ADR 0002: Sửa lại kiến trúc nội bộ của các service](../../../adr/0002-revised-service-internal-architectures.md)
- [Ranh giới service](../../00-system/service-boundaries.md)
- [Vai trò và quyền](../../00-system/roles-permissions.md)
- [Chiến lược cơ sở dữ liệu](../../00-system/database-strategy.md)
- [Định nghĩa Hoàn thành](../../00-system/definition-of-done.md)
- [LRN-001 Quản lý Problem](../problems/spec.md): định danh, trạng thái và phép chiếu công khai của
  Problem.
- [LRN-009 Quiz](../quizzes/spec.md): định danh, trạng thái, completion và phép chiếu công khai của
  Quiz.
- [LRN-006 Progress](../progress/spec.md): tổng hợp Problem và Quiz thành tiến độ Course.
- [ID-003 RBAC](../../01-identity/rbac/spec.md) bản 0.4: claim `permissions`, seed quyền của tính
  năng (FR-017).
- LRN-004 Class & Enrollment (tương lai).

## Câu hỏi mở

Không còn. Các quyết định sản phẩm đã được chủ sở hữu sản phẩm phê duyệt ngày 2026-09-30:

1. **Mã quyền:** Tám quyền `course:*`, seed cho `LECTURER` theo ID-003-FR-017.
2. **Vòng đời:** Như LRN-001, cộng thêm xoá hẳn Course `DRAFT` không bị tham chiếu (FR-007, FR-018).
3. **Ai xem Course đã xuất bản:** Mọi người dùng đã xác thực; giới hạn theo Class thuộc LRN-004.
4. **Nội dung Chapter:** Chỉ tiêu đề, mô tả Markdown, danh sách Problem và danh sách Quiz.
5. **Problem nào được thêm:** Mọi Problem `PUBLISHED` chưa xoá, cộng Problem `DRAFT`/`ON_HOLD` của
   chính mình; người học chỉ thấy Problem `PUBLISHED` (FR-006, FR-010).
6. **Điều kiện xuất bản:** Tiêu đề không rỗng, ≥ 1 Chapter, ≥ 1 Problem hoặc Quiz `PUBLISHED` chưa
   xoá trong toàn Course (FR-008, amendment 1.1).
7. **Trùng Problem:** Tối đa một lần mỗi Course.
8. **Giới hạn:** 50 Chapter mỗi Course, 50 Problem mỗi Chapter, mô tả Course 20.000 ký tự, mô tả
   Chapter 5.000 ký tự (FR-015).
9. **Slug:** Giảng viên cung cấp, duy nhất, bất biến.
10. **Sửa khi đã xuất bản:** Được sửa tại chỗ, miễn giữ điều kiện xuất bản (FR-019).

## Lịch sử sửa đổi

| Ngày       | Phiên bản | Tác giả/Người review | Tóm tắt                                                                                      |
| ---------- | --------- | -------------------- | -------------------------------------------------------------------------------------------- |
| 2026-09-30 | 0.1       | DuongPham-Barca      | Đặc tả Quản lý Course ban đầu, Proposed                                                      |
| 2026-09-30 | 1.0       | Chủ sở hữu sản phẩm  | Chốt 10 câu hỏi mở theo đề xuất, thêm FR-018, FR-019, AC-017 tới AC-020 và phê duyệt LRN-003 |
| 2026-11-12 | 1.1       | Chủ sở hữu sản phẩm  | Cho Course quiz-only/mixed, readiness theo Learning Item và đồng bộ Progress Problem + Quiz  |

> `spec.md` mô tả CÁI GÌ. Chi tiết thư mục, class, cách hiện thực repository và thứ tự thực thi
> thuộc về `plan.md`, trừ khi một ràng buộc kiến trúc bắt buộc phải nêu ở đây.
