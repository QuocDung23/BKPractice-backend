> **Bản sửa đổi LRN-009 1.3, Approved 2026-11-11:** LECTURER có quyền quản lý nội dung Learning mình tạo; ADMIN có quyền tương ứng quản lý mọi nội dung. Quy tắc này thay các câu ADMIN-only hoặc bỏ kiểm created_by trước đó. Course hỗ trợ liên kết nhiều Quiz/Chapter theo LRN-009; tiến độ Problem hiện có không đổi. Không khôi phục Class/Enrollment/Assignment.

# ID-003 Kiểm soát truy cập theo vai trò (RBAC)

> **SRS v3 (2026-11-08):** [ID-009](../account-administration/spec.md) thay thế các câu cấm Admin cấp/thu hồi ADMIN cho người khác và bổ sung lý do/audit cho thay đổi role. [LRN-009](../../02-learning/srs-v3-lecturer/spec.md) thay thế chính sách LRN-008 về quyền nội dung của LECTURER. Các quy tắc RBAC khác vẫn áp dụng.

## Trạng thái

Approved — phạm vi 0.5 seed riêng và user–role giữ baseline, theo yêu cầu triển khai của chủ sở hữu ngày 2026-10-25; không mở CRUD/catalog động hoặc bootstrap account Admin.

> **Cập nhật Learning LRN-008 (2026-11-07):** Mọi câu trong tài liệu này gán quyền `problem:*` hoặc
> `course:*` cho `LECTURER`, hoặc giữ quyền `class:*`/`assignment:*`, đã được thay thế bởi
> [LRN-008](../../02-learning/self-study/spec.md). Identity vẫn giữ vai trò nền tảng `LECTURER` cho
> phạm vi khác; riêng Learning chỉ cấp quyền quản lý Problem/Course cho `ADMIN`.

> Phạm vi mới theo yêu cầu ngày 2026-10-24 nằm ở [Bản sửa đổi 0.5](#bản-sửa-đổi-05--seed-danh-mục-và-quản-lý-userrole). Không triển khai seed/user–role 0.5 chỉ từ các quyết định phạm vi khi câu hỏi mở chưa được giải quyết.

## Baseline 0.4 — lịch sử phê duyệt

Phiên bản `0.4`, được chủ sở hữu sản phẩm phê duyệt ngày `2026-09-29`. Bản sửa đổi ở mục
[Bản sửa đổi 0.4 — Truyền quyền hiệu lực](#bản-sửa-đổi-04--truyền-quyền-hiệu-lực) bổ sung cho phiên
bản `0.3`; khi mâu thuẫn, bản sửa đổi được ưu tiên.

Giá trị hợp lệ: `Proposed` | `Approved` | `Implemented` | `Verified`

## Mục tiêu

Định nghĩa mô hình phân quyền do Identity sở hữu, dùng để xác định một người dùng BKPractice đã xác
thực có được phép thực hiện một hành động hay không, trong khi vẫn giữ việc xác thực, quyền sở hữu
Profile và phân quyền nghiệp vụ theo từng tính năng ở đúng các bounded context hiện có của chúng.

## Tác nhân

- **STUDENT:** Vai trò nền tảng cho người học. Một Sinh viên chỉ nhận các quyền được gán tường minh
  cho vai trò và vẫn chịu ràng buộc về quyền sở hữu tài nguyên cùng chính sách của tính năng.
- **LECTURER:** Vai trò nền tảng cho đội ngũ giảng dạy. Một Giảng viên chỉ nhận các quyền được gán
  tường minh và không mặc nhiên là Quản trị viên.
- **ADMIN:** Vai trò nền tảng cho việc quản trị nền tảng. Quyền truy cập của Admin vẫn chịu ràng buộc
  bởi các quy tắc nghiệp vụ của service sở hữu thao tác, trừ khi một chính sách đã phê duyệt cấp
  thao tác đó.
- **Người dùng đã xác thực:** Người dùng được xác định bởi ngữ cảnh ID-001 Authentication đã được
  kiểm chứng. Chỉ riêng một access token hợp lệ không hàm ý được phép thực hiện mọi thao tác.
- **API Gateway:** Xác minh access token BKPractice và có thể chuyển tiếp metadata định danh/vai trò
  tin cậy; nó không sở hữu việc gán vai trò hay state phân quyền nghiệp vụ.
- **Learning, Submission và Community Service:** Các service tiêu thụ đáng tin cậy, tự thực thi quyết
  định phân quyền tại ranh giới nghiệp vụ của mình. Chúng không sở hữu vai trò hay quyền.
- **Identity Service:** Sở hữu các vai trò nền tảng, quyền, các phép gán và chính sách phân quyền.
- **Người gọi chưa xác thực:** Không có ngữ cảnh phân quyền và không thể thực hiện các hành động được
  bảo vệ.

## Bối cảnh

Xác thực trả lời câu hỏi **“Bạn là ai?”** và được định nghĩa bởi
[ID-001 Authentication](../authentication/spec.md). Profile trả lời câu hỏi **“Người dùng này trình
bày thông tin hồ sơ cá nhân nào?”** và được định nghĩa bởi [ID-002 Profile](../profile/spec.md).
RBAC trả lời câu hỏi **“Người dùng đã xác thực này được phép làm gì?”**.

Các tài liệu hệ thống có thẩm quyền định nghĩa `STUDENT`, `LECTURER` và `ADMIN` là các vai trò RBAC
do Identity sở hữu, không phải service. Nền tảng Identity hiện tại có một enum vai trò với ba giá trị
này, một model quyền với mã duy nhất, một quan hệ nhiều-nhiều giữa User và Role, và một quan hệ
nhiều-nhiều giữa Role và Permission. ID-003 định nghĩa hành vi và ranh giới của model đó mà không quy
định bảng hay một công nghệ phân quyền mới.

ID-001 cung cấp chủ thể đã xác thực, trạng thái tài khoản và ảnh chụp vai trò có giới hạn thời gian.
ID-002 cấm tường minh việc các thao tác Profile thay đổi vai trò, quyền hay trạng thái tài khoản. Các
đặc tả tính năng của Learning, Submission và Community sẽ định nghĩa các chính sách hành động/tài
nguyên chi tiết, tiêu thụ nền tảng RBAC dùng chung này.

## Yêu cầu chức năng

- **ID-003-FR-001 — Quyền sở hữu của Identity:** Identity MUST sở hữu danh mục vai trò nền tảng, các
  định nghĩa quyền và các phép gán User-vai trò/vai trò-quyền. Các service khác MUST NOT tạo bảng vai
  trò trùng lặp hay gán vai trò nền tảng trong cơ sở dữ liệu của chính chúng.
- **ID-003-FR-002 — Từ vựng vai trò đã phê duyệt:** Từ vựng vai trò của ID-003 v1 MUST chỉ chứa
  `STUDENT`, `LECTURER` và `ADMIN`. Một người gọi MUST NOT tạo hay tự đưa vào một vai trò nền tảng
  khác thông qua một request phân quyền.
- **ID-003-FR-003 — Nhiều vai trò:** Một User MAY giữ nhiều hơn một vai trò đã phê duyệt. Việc có
  nhiều vai trò sẽ hợp nhất các quyền được các vai trò đó cấp tường minh; nó không cấp các quyền nằm
  ngoài các phép gán vai trò-quyền.
- **ID-003-FR-004 — Phân quyền theo vai trò-quyền:** Một quyết định phân quyền MUST đánh giá các vai
  trò hiện được công nhận của User đã xác thực và các quyền được gán cho những vai trò đó, cùng với
  chính sách hành động/tài nguyên do service tính năng sở hữu cung cấp.
- **ID-003-FR-005 — Ranh giới xác thực:** Một định danh từ access token ID-001 hợp lệ MUST được phân
  biệt với việc phân quyền. Một người dùng đã xác thực nhưng thiếu vai trò/quyền cần thiết MUST bị từ
  chối hành động được bảo vệ.
- **ID-003-FR-006 — Thực thi phía server:** Các hành động nghiệp vụ được bảo vệ MUST được thực thi
  phân quyền tại một ranh giới backend tin cậy. Các kiểm tra vai trò phía client, việc ẩn nút trên
  giao diện, và các trường vai trò/quyền do trình duyệt gửi lên MUST NOT là quyết định bảo mật.
- **ID-003-FR-007 — Mặc định từ chối:** Khi không có chính sách vai trò/quyền nào cho phép tường minh
  một hành động, quyết định phân quyền MUST từ chối nó.
- **ID-003-FR-008 — Đặc quyền tối thiểu:** Một vai trò hay quyền MUST chỉ cấp những khả năng được gắn
  với nó một cách tường minh. `LECTURER` MUST NOT bị coi là `ADMIN`, và `ADMIN` MUST NOT mặc định đi
  vòng qua các quy tắc về quyền sở hữu tài nguyên hay kiểm tra dữ liệu không liên quan.
- **ID-003-FR-009 — Thay đổi vai trò được bảo vệ:** Các phép gán vai trò MUST chỉ thay đổi thông qua
  một luồng quản lý vai trò có thẩm quyền do Identity sở hữu. Chỉ một `ADMIN` MAY cấp hay thu hồi các
  vai trò định sẵn, và một User MUST NOT tự cấp, tự thu hồi hay tự nâng vai trò/quyền của mình thông
  qua Profile, Authentication hay dữ liệu request tuỳ ý. Một `ADMIN` chỉ được tự thu hồi vai trò qua
  luồng đó khi vẫn còn một `ADMIN` khác. Các ánh xạ vai trò-quyền vẫn là các định nghĩa tĩnh được
  seed sẵn trong ID-003 v1.
- **ID-003-FR-010 — Bảo vệ vai trò xuyên người dùng:** Một `ADMIN` MAY gán hoặc thu hồi chỉ các vai
  trò định sẵn `STUDENT` và `LECTURER` cho một User khác. Không tác nhân nào, kể cả một `ADMIN`, MAY
  cấp vai trò `ADMIN` cho một User khác thông qua luồng quản lý vai trò của ID-003.
- **ID-003-FR-010a — Duy trì liên tục quản trị viên:** Luồng quản lý vai trò MUST NOT gỡ vai trò
  `ADMIN` khỏi quản trị viên cuối cùng còn lại. Một quản trị viên MAY từ bỏ vai trò `ADMIN` của chính
  mình chỉ khi vẫn còn ít nhất một quản trị viên khác.
- **ID-003-FR-011 — Ngữ cảnh phân quyền tin cậy:** Các service tiêu thụ RBAC MUST chỉ nhận ngữ cảnh
  định danh và vai trò từ ranh giới xác thực/Gateway đã phê duyệt hoặc từ một contract service tin
  cậy. Các header vai trò, trường body hay tham số query do người gọi cung cấp MUST NOT ghi đè lên nó.
- **ID-003-FR-012 — Quyền sở hữu của tính năng:** Các đặc tả Learning, Submission, Community và
  Profile vẫn chịu trách nhiệm cho các quy tắc ở mức hành động, quyền sở hữu tài nguyên và kiểm tra
  phạm vi của riêng chúng. ID-003 cung cấp chính sách vai trò/quyền dùng chung nhưng MUST NOT mã hoá
  cứng mọi hành động của mọi tính năng trong tương lai.
- **ID-003-FR-013 — Tương tác với trạng thái tài khoản:** RBAC MUST NOT ghi đè việc thực thi trạng
  thái tài khoản của ID-001. Tài khoản `LOCKED` và `PENDING` không thể lấy token mới; hành vi của
  token hiện có tuân theo chính sách hết hạn của ID-001, và RBAC không kích hoạt lại một tài khoản.
- **ID-003-FR-014 — Ngữ nghĩa token khi đổi vai trò:** Các thay đổi vai trò MUST tuân theo chính sách
  token đã phê duyệt của ID-001: chúng ảnh hưởng tới các claim định danh mới được phát hành, còn các
  access token đã phát hành thì không bị thay đổi và hết hạn theo vòng đời đã cấu hình của chúng.
- **ID-003-FR-015 — Ranh giới của Profile:** Các thao tác Profile MUST NOT thay đổi state của vai
  trò, quyền hay trạng thái tài khoản. Một vai trò được hiển thị bởi một biểu diễn profile/community
  trong tương lai là chỉ đọc.
- **ID-003-FR-016 — Không tách service vai trò:** RBAC MUST vẫn nằm trong Identity. `STUDENT`,
  `LECTURER` và `ADMIN` MUST NOT trở thành các ứng dụng, microservice hay cơ sở dữ liệu riêng.

## Quy tắc nghiệp vụ

- Tập vai trò nền tảng là từ vựng `STUDENT`, `LECTURER`, `ADMIN` hiện có. ID-003 không đưa vào
  `SUPER_ADMIN`, `MODERATOR`, `TEACHER`, `INSTRUCTOR` hay các vai trò tuỳ biến do người dùng tạo.
- Một User có thể có nhiều vai trò đã phê duyệt, theo quan hệ vai trò hiện có của Identity. Một vai
  trò không được suy ra từ email, dữ liệu Profile, việc thuộc lớp hay dữ liệu từ client.
- Quyền là các khả năng do Identity sở hữu, gắn với các vai trò. Đặc tả tính năng định nghĩa khả năng
  nào mà một hành động đòi hỏi; ID-003 không bịa ra một danh mục quyền đầy đủ cho
  Learning/Submission/Community.
- Phân quyền là giao của: định danh đã xác thực, chính sách trạng thái tài khoản hiện tại, các vai
  trò/quyền đã gán, và các quy tắc hành động/tài nguyên/sở hữu của service sở hữu.
- Một token hợp lệ chứng minh định danh, không chứng minh quyền. Chính sách bị thiếu hoặc mơ hồ thì
  bị từ chối.
- Quyền sở hữu tài nguyên không bị thay thế bởi một vai trò rộng. Ví dụ, một tính năng có thể đòi hỏi
  quan hệ sở hữu bên cạnh một vai trò/quyền; tính năng đó sở hữu phần kiểm tra chi tiết.
- Việc gán và thu hồi vai trò là các thao tác của Identity. ID-003 v1 hỗ trợ xem các vai trò của một
  User, gán `STUDENT` hoặc `LECTURER`, và thu hồi `STUDENT` hoặc `LECTURER`. Chỉ một `ADMIN` mới được
  gọi các thao tác này; các định nghĩa vai trò và định nghĩa quyền là dữ liệu tĩnh được seed sẵn và
  không phải CRUD lúc chạy trong tính năng này.
- Việc gán `ADMIN` cho một User khác là bị cấm. Hệ thống MUST bảo toàn ít nhất một quản trị viên bằng
  cách từ chối thao tác nào sẽ gỡ vai trò `ADMIN` cuối cùng.
- Việc lặp lại một phép gán đã tồn tại và việc thu hồi một vai trò vốn không có đều là các thao tác
  thành công idempotent; chúng MUST NOT tạo các phép gán trùng lặp hay mở rộng quyền truy cập.
- Định danh quyền dùng quy ước đặt tên ổn định `resource:action`. Đặc tả tính năng định nghĩa danh
  mục quyền cụ thể cho các hành động của riêng chúng.
- Một tài khoản sinh viên đã import đáng tin cậy nhận vai trò `STUDENT` trong quá trình cấp tài
  khoản. ID-003 không tạo người dùng và không hiện thực luồng import.
- Luồng cấp tài khoản sinh viên đã import và mật khẩu mặc định của ID-001 vẫn là nguồn tạo tài khoản.
  ID-003 không tạo người dùng, không phân tích file Excel và không thay đổi thông tin đăng nhập.
- Thao tác cập nhật Profile của ID-002 không thể dùng để thay đổi vai trò, quyền hay trạng thái tài
  khoản.
- Các thay đổi vai trò không viết lại các access token đang tồn tại. Việc phát hành
  authentication/refresh mới dùng state vai trò hiện tại theo ID-001.
- Một Admin không mặc nhiên được miễn trừ khỏi các quy tắc kiểm tra dữ liệu, quyền sở hữu hay kiểm
  duyệt của service đích, trừ khi đặc tả tính năng đó cấp khả năng này một cách tường minh.

## Quy tắc phân quyền

- Một người gọi chưa xác thực không bao giờ được phép thực hiện một hành động nghiệp vụ được bảo vệ.
- Một người gọi đã xác thực nhưng không có vai trò/quyền khớp thì bị từ chối theo mặc định.
- `STUDENT` mặc định không có khả năng quản lý vai trò nào.
- `LECTURER` mặc định không có khả năng quản lý vai trò hệ thống và không được ngầm nâng lên `ADMIN`.
- `ADMIN` có thể xem các vai trò của User và gán hoặc thu hồi các vai trò định sẵn `STUDENT` và
  `LECTURER`. `ADMIN` không thể cấp `ADMIN` cho một User khác, và `ADMIN` cuối cùng còn lại không thể
  bị gỡ bỏ.
- Một tác nhân quản lý vai trò không thể dùng payload của Profile hay Authentication để cấp/thu hồi
  vai trò, quyền hay trạng thái tài khoản.
- Gateway có thể xác thực request và chuyển tiếp ngữ cảnh tin cậy, nhưng service sở hữu hành động mới
  thực hiện khâu kiểm tra phân quyền nghiệp vụ cuối cùng.
- Learning, Submission và Community tiêu thụ ngữ cảnh vai trò/quyền do Identity sở hữu và tự thực thi
  các quy tắc ở mức tài nguyên. Chúng không truy vấn trực tiếp cơ sở dữ liệu của Identity.
- Các request xuyên service dùng các contract định danh/truyền tải của service đã phê duyệt; các
  header định danh tin cậy tuỳ ý do client cung cấp không bao giờ được chấp nhận.

## Đầu vào

### Quyết định phân quyền — thao tác ở mức khái niệm

Service sở hữu cung cấp:

- User ID đã xác thực và ngữ cảnh vai trò tin cậy từ ID-001/Gateway;
- hành động/khả năng đang được yêu cầu;
- tài nguyên đích và ngữ cảnh sở hữu, khi có liên quan;
- ngữ cảnh trạng thái tài khoản hiện tại mà ranh giới xác thực đã phê duyệt đòi hỏi.

Người gọi MUST NOT cung cấp vai trò, quyền, trạng thái tài khoản, quyết định chính sách hay định danh
của một User khác mang tính thẩm quyền trong dữ liệu request.

### Đầu vào của việc quản lý vai trò

Một thao tác quản lý vai trò do Identity sở hữu có thể nhận một User ID đích, một trong các giá trị
vai trò định sẵn `STUDENT` hoặc `LECTURER`, và hành động xem/gán/thu hồi được yêu cầu. Tác nhân MUST
là một `ADMIN`; `ADMIN` không phải là vai trò đích gán được. Việc gán một vai trò đã có hoặc thu hồi
một vai trò vốn không có là thành công idempotent. Thao tác chỉ trả về state gán kết quả ở dạng an
toàn.

## Đầu ra

- Một quyết định phân quyền là **cho phép** hoặc **từ chối**, kèm một phân loại lý do an toàn cho quy
  ước lỗi của service sở hữu. Nó không phơi bày mật khẩu, refresh token, bí mật của nhà cung cấp hay
  dữ liệu chính sách nội bộ.
- Một request chưa xác thực tuân theo quy ước xác thực hiện có (`401`).
- Một request đã xác thực nhưng thiếu vai trò/quyền hoặc quyền sở hữu cần thiết nhận quy ước từ chối
  hiện có (`403`).
- Ngữ cảnh tin cậy gửi xuống phía sau chỉ chứa thông tin định danh/vai trò mà contract đã phê duyệt
  yêu cầu; client không thể thay thế nó.
- Một thao tác quản lý vai trò chỉ trả về state gán kết quả ở dạng an toàn và không bao giờ trả về
  thông tin đăng nhập hay bí mật nội bộ.
- Một thay đổi vai trò không hồi tố làm thay đổi các access token ID-001 đã phát hành.

## Tình huống lỗi

| Trường hợp                                                    | Hành vi quan sát được                                                                                       |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Access token bị thiếu, sai định dạng hoặc hết hạn             | Ranh giới xác thực hiện có trả về `401`; không quyết định phân quyền nào được tin cậy                       |
| Người dùng đã xác thực thiếu vai trò/quyền cần thiết          | Quy ước từ chối hiện có trả về `403`                                                                        |
| Không chính sách nào cho phép tường minh hành động            | Mặc định từ chối `403`                                                                                      |
| Client cung cấp các trường vai trò/quyền/định danh tin cậy    | Các trường bị bỏ qua hoặc bị quy ước kiểm tra dữ liệu hiện có từ chối; chúng không thể ảnh hưởng phân quyền |
| Sinh viên hoặc Giảng viên thử tự nâng quyền                   | `403` và không state gán nào thay đổi                                                                       |
| Tác nhân không có thẩm quyền thử đổi vai trò xuyên người dùng | `403` và không state gán nào thay đổi                                                                       |
| Giá trị vai trò không xác định được đưa vào thao tác quản lý  | Lỗi kiểm tra dữ liệu/nghiệp vụ và không thay đổi state                                                      |
| User đích không tồn tại trong một thao tác quản lý vai trò    | Quy ước `404` hiện có của Identity và không state gán nào thay đổi                                          |
| Vai trò đã được gán hoặc vai trò vắng mặt khi thu hồi         | Thao tác thành công idempotent; không tạo phép gán trùng lặp và không state không liên quan nào thay đổi    |
| Tác nhân không phải `ADMIN` thử quản lý vai trò               | `403` và không state gán nào thay đổi                                                                       |
| Bất kỳ tác nhân nào thử cấp `ADMIN` cho một User khác         | `403` hoặc quy ước lỗi kiểm tra dữ liệu/nghiệp vụ hiện có; không state gán nào thay đổi                     |
| Thao tác sẽ gỡ bỏ `ADMIN` cuối cùng còn lại                   | Quy ước lỗi xung đột/quy tắc nghiệp vụ hiện có; state gán giữ nguyên                                        |
| Tài khoản `LOCKED` hoặc `PENDING` xuất trình một vai trò      | Việc thực thi trạng thái của ID-001 vẫn là quyết định; RBAC không phát hành hay khôi phục token             |
| Metadata của Gateway bị thiếu hoặc bị giả mạo                 | Ranh giới service tin cậy từ chối request; metadata của người gọi không bao giờ được coi là có thẩm quyền   |

ID-003 không đưa ra cấu trúc lỗi mới. Việc tuần tự hoá HTTP tuân theo quy ước Identity/Gateway và
việc ánh xạ lỗi phân quyền hiện có của service sở hữu.

## Tình huống biên

- Một User có cả `STUDENT` và `LECTURER` nhận hợp của các quyền được gán tường minh; không vai trò
  nào có độ ưu tiên ngầm so với vai trò khác.
- Một User có `ADMIN` và một vai trò khác vẫn chịu ràng buộc bởi trạng thái tài khoản và chính sách
  của service đích.
- Việc gỡ một vai trò không được gỡ các quyền do một vai trò còn lại khác cung cấp.
- Một thay đổi vai trò trong lúc một access token đang hoạt động thì không làm thay đổi token đó;
  ID-001 kiểm soát việc nó hết hạn tự nhiên và việc phát hành token trong tương lai.
- Một quyền không được gán cho vai trò nào thì tự nó không thể phân quyền cho một User.
- Một vai trò không có quyền nào thì không cấp hành động được bảo vệ nào, trừ khi một tính năng định
  nghĩa tường minh một phép kiểm tra chỉ theo vai trò và an toàn.
- Một chủ sở hữu tài nguyên nhưng thiếu quyền tính năng cần thiết thì vẫn bị từ chối; chỉ riêng quyền
  sở hữu không phải là một sự cấp quyền ngầm trên toàn hệ thống.
- Một vai trò có quyền không cho phép truy cập cơ sở dữ liệu hay repository của service khác.
- Việc lặp lại một phép gán đã tồn tại hoặc thu hồi một vai trò vắng mặt là thành công idempotent;
  không tạo ra dòng trùng lặp hay thay đổi state không liên quan nào.
- `ADMIN` cuối cùng còn lại được bảo vệ. Một Admin chỉ được tự thu hồi nếu vẫn còn một Admin khác.
- Các phản hồi của Profile công khai và Authentication không bao giờ trở thành một kênh để thay đổi
  hay phơi bày toàn bộ mô hình RBAC.

## Yêu cầu bảo mật

- **ID-003-SR-001 — Không leo thang đặc quyền:** Một người gọi MUST NOT tự gán hay tự cấp các vai
  trò/quyền có đặc quyền, hoặc tự thu hồi chúng ngoài luồng quản lý vai trò có thẩm quyền của Admin,
  thông qua bất kỳ request công khai, thao tác Profile hay đầu vào của Authentication nào. Một Admin
  chỉ được tự thu hồi khi vẫn còn một Admin khác.
- **ID-003-SR-002 — Dữ liệu từ client là không tin cậy:** Các trường vai trò, quyền, trạng thái tài
  khoản và định danh tin cậy do client cung cấp MUST NOT ảnh hưởng tới một quyết định phân quyền.
- **ID-003-SR-003 — Thực thi phía server:** Mỗi hành động nghiệp vụ được bảo vệ MUST được kiểm tra
  tại một ranh giới backend tin cậy; khả năng hiển thị ở frontend không bao giờ là biện pháp kiểm
  soát bảo mật.
- **ID-003-SR-004 — Đặc quyền tối thiểu/mặc định từ chối:** Chính sách phân quyền bị thiếu, không xác
  định hay mơ hồ MUST từ chối truy cập, và các vai trò MUST chỉ cấp những khả năng được gán tường
  minh.
- **ID-003-SR-005 — Ranh giới gán được bảo vệ:** Chỉ luồng quản lý vai trò do Identity sở hữu mới có
  thể thay đổi các phép gán vai trò, và chỉ một `ADMIN` mới được gọi nó. Các service khác và các API
  Profile MUST NOT ghi vai trò/quyền; các ánh xạ vai trò-quyền vẫn là dữ liệu tĩnh được seed sẵn
  trong ID-003 v1.
- **ID-003-SR-005a — Bảo vệ quản trị viên:** Luồng này MUST từ chối việc cấp `ADMIN` cho một User
  khác và MUST từ chối việc gỡ vai trò `ADMIN` cuối cùng còn lại.
- **ID-003-SR-006 — Tách bạch vai trò:** `LECTURER` MUST NOT bị coi là `ADMIN`, và không vai trò nào
  được ngầm đi vòng qua trạng thái tài khoản, quyền sở hữu tài nguyên hay việc kiểm tra dữ liệu của
  tính năng.
- **ID-003-SR-007 — Nhất quán về token:** Việc phân quyền MUST tôn trọng các quy tắc về mục đích
  token, trạng thái tài khoản và ảnh chụp vai trò của ID-001. Một token của nhà cung cấp Microsoft
  hay một refresh token không bao giờ là một thông tin xác thực cho RBAC.
- **ID-003-SR-008 — Cách ly service:** Quyền sở hữu vai trò/quyền vẫn nằm ở Identity; các bên tiêu
  thụ MUST NOT truy vấn trực tiếp `bkpractice_identity` hay tạo khoá ngoại vai trò xuyên service.
- **ID-003-SR-009 — Tối thiểu hoá dữ liệu nhạy cảm:** Các phản hồi, log và lỗi về phân quyền MUST
  không phơi bày mật khẩu, dữ liệu token, thông tin xác thực của nhà cung cấp hay dữ liệu chính sách
  nội bộ không cần thiết.
- **ID-003-SR-010 — Thất bại an toàn:** Ngữ cảnh phân quyền không hợp lệ hoặc không khả dụng MUST
  thất bại theo hướng đóng và không được rơi về các vai trò do client cung cấp hay một quyết định
  Admin ngầm.

## Tiêu chí nghiệm thu

- **ID-003-AC-001:** Cho trước một ngữ cảnh đã xác thực ID-001 hợp lệ và một hành động có vai
  trò/quyền đã gán khớp, khi service sở hữu đánh giá phân quyền, thì quyết định là cho phép, với
  điều kiện thoả mãn các quy tắc tài nguyên/sở hữu của service đó.
- **ID-003-AC-002:** Cho trước một người dùng đã xác thực nhưng thiếu vai trò/quyền cần thiết, khi
  một hành động được bảo vệ được yêu cầu, thì request nhận `403` và hành động không được thực thi.
- **ID-003-AC-003:** Cho trước một người gọi chưa xác thực hoặc có token không hợp lệ, khi một hành
  động được bảo vệ được yêu cầu, thì ranh giới xác thực hiện có trả về `401`.
- **ID-003-AC-004:** Cho trước một hành động không có chính sách cho phép tường minh, khi việc phân
  quyền được đánh giá, thì mặc định từ chối trả về `403`.
- **ID-003-AC-005:** Cho trước một request chứa vai trò, quyền hay header định danh tin cậy do người
  gọi cung cấp, khi việc phân quyền được đánh giá, thì các giá trị đó không thể thay đổi quyết định.
- **ID-003-AC-006:** Cho trước một User được gán nhiều vai trò đã phê duyệt, khi các quyền được đánh
  giá, thì khả năng kết quả là hợp của các quyền vai trò được gán tường minh và không khả năng chưa
  được gán nào được cấp.
- **ID-003-AC-007:** Cho trước một Sinh viên, khi họ thử tự gán `LECTURER` hoặc `ADMIN`, thì thao tác
  bị từ chối và không phép gán nào thay đổi.
- **ID-003-AC-008:** Cho trước một Giảng viên, khi họ thử tự gán `ADMIN`, thì thao tác bị từ chối và
  không phép gán nào thay đổi.
- **ID-003-AC-008a:** Cho trước một `ADMIN`, khi họ thử gán `ADMIN` cho một User khác, thì thao tác
  bị từ chối và không phép gán nào thay đổi.
- **ID-003-AC-008b:** Cho trước `ADMIN` cuối cùng còn lại, khi bất kỳ thao tác nào sẽ gỡ vai trò
  `ADMIN` cuối cùng đó, thì thao tác bị từ chối và tính liên tục của quản trị viên được bảo toàn.
- **ID-003-AC-008c:** Cho trước một `ADMIN`, khi họ xem, gán `STUDENT`/`LECTURER`, hoặc thu hồi
  `STUDENT`/`LECTURER` cho một User đích, thì thao tác thành công với điều kiện thoả mãn việc kiểm
  tra đích và chính sách.
- **ID-003-AC-008d:** Cho trước một phép gán đã tồn tại hoặc một vai trò vắng mặt khi thu hồi, khi
  một `ADMIN` có thẩm quyền lặp lại thao tác, thì nó thành công idempotent mà không tạo phép gán
  trùng lặp hay thay đổi không liên quan.
- **ID-003-AC-009:** Cho trước một request Profile hoặc Authentication chứa các trường vai trò,
  quyền hay trạng thái tài khoản, khi nó được xử lý, thì các trường đó không thể thay đổi state của
  RBAC.
- **ID-003-AC-010:** Cho trước một thay đổi vai trò, khi một token ID-001 mới được phát hành, thì nó
  phản ánh state vai trò đã phê duyệt hiện tại; một access token đã phát hành thì không bị thay đổi.
- **ID-003-AC-011:** Cho trước một tài khoản `LOCKED` hoặc `PENDING`, khi việc xác thực/phát hành
  token được thử, thì ID-001 từ chối phát hành và RBAC không cấp một đường đi thay thế nào.
- **ID-003-AC-012:** Cho trước một request của Giảng viên cho một hành động quản lý vai trò hệ thống,
  khi không quyền nào đã phê duyệt cấp nó, thì hành động bị từ chối và Giảng viên không bị coi là
  Admin.
- **ID-003-AC-013:** Cho trước một hành động ở phía sau của Learning, Submission hay Community, khi
  service của nó đánh giá phân quyền, thì nó dùng ngữ cảnh Identity tin cậy và chính sách tài
  nguyên/sở hữu của riêng mình, thay vì truy vấn cơ sở dữ liệu của Identity.
- **ID-003-AC-014:** Cho trước một giá trị vai trò không xác định hoặc một ngữ cảnh phân quyền sai
  định dạng, khi nó tới một ranh giới phân quyền tin cậy, thì nó thất bại theo hướng đóng mà không
  thay đổi các phép gán.
- **ID-003-AC-015:** Cho trước một quyết định hoặc một thất bại của RBAC, khi kiểm tra phản hồi/log,
  thì không mật khẩu, token, bí mật của nhà cung cấp hay dữ liệu chính sách nội bộ không cần thiết
  nào bị phơi bày.
- **ID-003-AC-016:** Cho trước schema và các ranh giới service của Identity, khi kiểm tra quyền sở
  hữu vai trò, thì các vai trò/quyền vẫn nằm trong Identity và không tồn tại service vai trò, bảng
  trùng lặp ở bên tiêu thụ, hay khoá ngoại xuyên service nào.

## Ngoài phạm vi

- Xác thực, đăng nhập, đăng xuất, refresh token, định danh Microsoft và hành vi `/auth/me`
- Việc đọc/cập nhật Profile, lưu trữ avatar và cách hiện thực quyền riêng tư của hồ sơ
- Các quyền và chính sách tài nguyên riêng của Learning cho problem/khoá học/bài tập
- Chi tiết phân quyền cho việc thực thi/nộp bài của Submission
- Danh mục hành động kiểm duyệt của Community
- OAuth, MFA, SSO, LDAP, Active Directory và các nhà cung cấp định danh bên ngoài
- ABAC, PBAC, ReBAC, OPA, Casbin hay một policy engine động
- Các vai trò do người dùng tạo/tuỳ biến, vai trò theo tenant, vai trò tạm thời hay việc uỷ quyền
  quản trị
- CRUD định nghĩa vai trò/quyền lúc chạy và giao diện CRUD đầy đủ cho vai trò/quyền, trừ khi được phê
  duyệt riêng; ID-003 v1 dùng các định nghĩa tĩnh được seed sẵn
- Audit Service, phân tích số liệu, thông báo và báo cáo lịch sử vai trò, trừ khi được phê duyệt riêng
- Quản lý thiết bị/phiên, danh sách đen token và việc thiết kế lại cơ chế thu hồi token
- Phân tích Excel, import sinh viên, tạo tài khoản và cấp mật khẩu mặc định
- Việc tự động suy ra vai trò từ email, Profile, khoa, lớp hay hoạt động trên Community
- Một Role Service, Permission Service hay Admin Service riêng

## Phụ thuộc

- [ID-001 Authentication](../authentication/spec.md) cho định danh đã xác minh, trạng thái tài khoản,
  các ảnh chụp vai trò tin cậy và ngữ nghĩa của token.
- [ID-002 Profile](../profile/spec.md) cho lệnh cấm tường minh việc thay đổi vai trò/quyền/trạng thái
  thông qua Profile.
- [Kiến trúc Identity Service](../../../architecture/identity-service.md)
- [Ranh giới service](../../00-system/service-boundaries.md)
- [Quy tắc hệ thống về vai trò và quyền](../../00-system/roles-permissions.md)
- [Quy tắc phụ thuộc](../../../architecture/dependency-rules.md)
- [Kiến trúc hệ thống](../../../architecture/system-architecture.md)
- [Kiến trúc API Gateway](../../../architecture/api-gateway.md)
- [Quy trình SDD](../../README.md)

## Câu hỏi mở của baseline 0.4

Không còn ở baseline; các câu hỏi chặn mục tiêu 0.5 nằm cuối bản sửa đổi mới. Chính sách quản lý vai trò v1 đã được phê duyệt cho mục đích đặc tả:

- chỉ `ADMIN` được xem, gán và thu hồi vai trò;
- chỉ các vai trò định sẵn `STUDENT` và `LECTURER` được gán hoặc thu hồi qua luồng đó;
- `ADMIN` không thể được cấp cho một User khác;
- `ADMIN` cuối cùng còn lại được bảo vệ;
- định nghĩa vai trò và quyền là dữ liệu tĩnh được seed sẵn;
- định danh quyền dùng cách đặt tên `resource:action`;
- các tài khoản sinh viên đã import nhận `STUDENT` trong quá trình cấp tài khoản tin cậy; và
- việc gán/thu hồi lặp lại là idempotent.

Lịch sử audit vẫn nằm ngoài ID-003 v1 và không bắt buộc để triển khai.

## Bản sửa đổi 0.4 — Truyền quyền hiệu lực

### Lý do

LRN-001 và LRN-002 yêu cầu Learning thực thi các quyền `problem:*` theo quy ước `resource:action`
của ID-003. Access token hiện chỉ mang `sub`, `roles`, `type`, nên các service tiêu thụ không có
cách tin cậy nào để biết một người dùng có quyền gì (LRN-001-T002). Bảng `permissions` và
`role_permissions` đã có trong `bkpractice_identity` nhưng chưa được seed và chưa được truyền đi.

Bản sửa đổi này chọn cách truyền **ảnh chụp quyền hiệu lực trong access token**, cùng cơ chế với
vai trò hiện nay. Không thêm endpoint tra cứu quyền.

### Yêu cầu chức năng bổ sung

- **ID-003-FR-017 — Danh mục quyền tính năng được seed:** Identity MUST seed tĩnh (qua migration) các
  mã quyền mà một đặc tả tính năng đã Approved định nghĩa, cùng phép gán vai trò-quyền mà đặc tả đó
  phê duyệt. Mã quyền MUST theo mẫu `resource:action`, chữ thường, tối đa 64 ký tự. Không có CRUD quyền
  lúc chạy.
- **ID-003-FR-018 — Danh mục đầu tiên:** Tám quyền của LRN-001/LRN-002 — `problem:create`,
  `problem:read-managed`, `problem:update`, `problem:publish`, `problem:hold`, `problem:republish`,
  `problem:delete`, `problem:restore` — MUST được seed và chỉ gán cho `LECTURER`. `STUDENT` và
  `ADMIN` không nhận quyền nào trong số này (khớp quyết định 2 của LRN-001: `ADMIN` không có thẩm
  quyền ngầm với Problem).
- **ID-003-FR-019 — Quyền hiệu lực:** Quyền hiệu lực của một User MUST là hợp của các quyền được gán
  cho mọi vai trò hiện tại của User đó, không trùng lặp.
- **ID-003-FR-020 — Ảnh chụp quyền trong access token:** Mỗi access token BKPractice mới phát hành
  MUST mang claim `permissions` chứa danh sách quyền hiệu lực tại thời điểm phát hành, đã sắp xếp và
  không trùng. Danh sách rỗng là hợp lệ. Refresh token MUST NOT mang claim này.
- **ID-003-FR-021 — Truyền qua Gateway:** API Gateway MUST loại bỏ header `x-auth-permissions` do
  client gửi và chỉ đặt lại nó từ claim `permissions` của access token đã xác minh, theo cùng cách
  với `x-auth-roles`.
- **ID-003-FR-022 — Tiêu thụ an toàn:** Service tiêu thụ MUST chỉ đọc quyền từ header do Gateway đặt.
  Token thiếu claim `permissions` (ví dụ phát hành trước bản sửa đổi này) MUST được coi là không có
  quyền nào, tức mặc định từ chối.
- **ID-003-FR-023 — Độ tươi của quyền:** Thay đổi vai trò của User hoặc phép gán vai trò-quyền MUST
  chỉ có hiệu lực ở access token phát hành sau thay đổi đó, như ID-003-FR-014 với vai trò.

### Yêu cầu bảo mật bổ sung

- **ID-003-SR-010 — Quyền chỉ từ claim đã xác minh:** Quyền MUST NOT được suy ra từ body, query,
  header do client gửi hay dữ liệu Profile. Header `x-auth-permissions` do client gửi MUST bị loại bỏ
  trước khi xác minh token.
- **ID-003-SR-011 — Quyền không thay thế sở hữu:** Có quyền không miễn các kiểm tra sở hữu tài
  nguyên của service tính năng (ví dụ Giảng viên chỉ quản lý Problem mình tạo).

### Tiêu chí nghiệm thu bổ sung

- **ID-003-AC-017:** Cho trước một User có vai trò `LECTURER`, khi đăng nhập hoặc làm mới phiên, thì
  access token mới chứa đủ tám quyền `problem:*`, cùng các quyền khác mà đặc tả tính năng đã phê
  duyệt gán cho `LECTURER` (ví dụ `course:*`, `class:*`, `assignment:*`), đã sắp xếp và không trùng.
- **ID-003-AC-018:** Cho trước một User chỉ có `STUDENT` hoặc chỉ có `ADMIN`, khi nhận access token
  mới, thì claim `permissions` không chứa quyền `problem:*` nào; nó chỉ chứa các quyền mà đặc tả tính
  năng đã phê duyệt gán cho vai trò đó (ví dụ `community:moderate` cho `ADMIN` theo COM-005), và là
  danh sách rỗng khi không có quyền nào được gán.
- **ID-003-AC-019:** Cho trước một User có cả `STUDENT` và `LECTURER`, khi nhận access token mới, thì
  claim `permissions` là hợp không trùng của quyền hai vai trò.
- **ID-003-AC-020:** Cho trước một request có header `x-auth-permissions` do client gửi, khi đi qua
  Gateway, thì header đó bị loại bỏ và chỉ được đặt lại từ claim đã xác minh.
- **ID-003-AC-021:** Cho trước một access token không có claim `permissions`, khi service tiêu thụ
  đánh giá một hành động cần quyền, thì hành động bị từ chối.
- **ID-003-AC-022:** Cho trước `ADMIN` gán `LECTURER` cho một User, khi User đó dùng access token cũ,
  thì token cũ không có quyền mới; access token phát hành sau đó thì có.

### Ngoài phạm vi của bản sửa đổi

- Endpoint REST nội bộ tra cứu quyền
- Thu hồi quyền tức thời trên token đang hoạt động
- CRUD quyền hoặc phép gán vai trò-quyền lúc chạy
- Quyền cho Submission và Community (các đặc tả đó tự định nghĩa khi cần)

### Quyết định đã phê duyệt

Chủ sở hữu sản phẩm phê duyệt ngày 2026-09-29:

1. **Cách truyền:** claim `permissions` trong access token, không có endpoint REST nội bộ.
2. **Gán quyền:** tám quyền `problem:*` chỉ gán cho `LECTURER`; `ADMIN` không có.
3. **Token cũ:** token không có claim `permissions` được coi là không có quyền.
4. **Kèm theo:** ID-001 sửa danh sách claim tối thiểu để có `permissions` (ID-001 bản sửa đổi 1.1).
5. **Độ tươi:** thay đổi vai trò/quyền chỉ có hiệu lực ở access token phát hành sau đó.

## Lịch sử sửa đổi

| Ngày       | Phiên bản | Tác giả/Người review                | Tóm tắt                                                                                                                                                                          |
| ---------- | --------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-01 | 0.1       | Codex / TBD                         | Đặc tả RBAC ban đầu ở trạng thái Proposed                                                                                                                                        |
| 2026-09-01 | 0.2       | Chủ sở hữu sản phẩm / Codex         | Phê duyệt các quyết định v1 về quản lý vai trò và bảo vệ quản trị viên                                                                                                           |
| 2026-09-01 | 0.3       | Chủ sở hữu sản phẩm                 | Phê duyệt đặc tả ID-003 RBAC                                                                                                                                                     |
| 2026-09-29 | 0.4       | Chủ sở hữu sản phẩm                 | Truyền quyền hiệu lực qua claim `permissions`; seed tám quyền `problem:*` cho `LECTURER`. Đã phê duyệt.                                                                          |
| 2026-09-30 | 0.4       | Chủ sở hữu sản phẩm (phê duyệt gộp) | Sửa câu chữ AC-017, AC-018 để không mâu thuẫn khi các tính năng khác seed thêm quyền (`course:*`, `class:*`, `assignment:*`, `community:moderate`). Không đổi yêu cầu chức năng. |

> `spec.md` mô tả CÁI GÌ. Chi tiết về guard, decorator, permission resolver, repository, controller,
> migration và thứ tự thực thi thuộc về một `plan.md` sau này, sau khi có phê duyệt của con người.

## Bản sửa đổi 0.5 — Seed danh mục và quản lý user–role

### Trạng thái và phạm vi đã thống nhất

`Approved` cho seed riêng/user–role baseline theo yêu cầu triển khai ngày 2026-10-25 của chủ sở hữu. Role, permission và ánh xạ role–permission được seed riêng trong database Identity. FE chỉ quản lý phép gán role cho user; không CRUD hoặc import danh mục RBAC. Import hàng loạt được yêu cầu là import **tài khoản** Excel của ID-004, không phải import role/permission.

Bản làm rõ này thay thế phạm vi CRUD/danh mục động/import danh mục của bản nháp 0.5 ngày 2026-10-24. Baseline 0.4 phía trên giữ nguyên để truy vết; các bất biến không bị sửa đổi tiếp tục có hiệu lực. Không coi tài liệu Proposed là bằng chứng tính năng đã triển khai.

### Phân chia trách nhiệm

- **ID-003 / RBAC:** Seed danh mục `STUDENT`, `LECTURER`, `ADMIN`, permission và ánh xạ role–permission theo chính sách đã duyệt; xem/gán/thu hồi role của user; tính quyền hiệu lực cho Auth.
- **ID-004 / Auth:** CRUD tài khoản và import Excel với các cột `mssv`, `name`, `email`, `role`. File chỉ nhận `STUDENT`/`LECTURER`; Student bắt buộc có MSSV, Lecturer để trống MSSV. Tạo account và gán role có sẵn phải nguyên tử. File không tạo role/permission hay cấp `ADMIN`.
- **FE:** Gọi API quản trị tài khoản/user–role có bảo vệ và hiển thị kết quả import tài khoản. Không có màn hình CRUD/import danh mục RBAC trong phạm vi này.
- **Identity:** Tiếp tục sở hữu database và mọi bảng tài khoản/RBAC; Gateway xác minh/proxy/làm sạch metadata, service tính năng giữ chính sách tài nguyên/sở hữu.

### Yêu cầu 0.5

- **FR-002, FR-009, FR-010, FR-010a, FR-017, FR-018:** Giữ baseline ba role định sẵn, danh mục và ánh xạ tĩnh được seed, chỉ Admin quản lý user–role, cấm cấp `ADMIN` qua API hiện tại và bảo vệ Admin cuối cùng. Không mở role động hoặc nới quyền Admin theo suy luận từ chức năng import.
- **ID-003-FR-024 / FR-025 / FR-026 — Rút khỏi phạm vi:** Các yêu cầu CRUD role, CRUD permission và sửa role–permission lúc chạy của bản nháp 0.5 được rút bỏ. Giữ mã để truy vết, không triển khai và không tái sử dụng mã cho chức năng khác.
- **ID-003-FR-027 — User–role trên FE:** Admin MUST có thể xem/gán/thu hồi role của tài khoản đã tồn tại theo chính sách baseline. User có thể giữ nhiều role. Import cấp role ban đầu thuộc ID-004; thay đổi về sau thuộc API RBAC, không qua cập nhật Profile hoặc login.
- **ID-003-FR-028 — Seed RBAC riêng:** MUST có phần seed riêng cho role, permission và ánh xạ role–permission trong DB Identity, tách khỏi file Excel tài khoản. Seed chỉ nạp dữ liệu/chính sách được duyệt; chạy lại không tạo bản ghi hoặc phép gán trùng và không âm thầm ghi đè dữ liệu ngoài phạm vi seed. Cách chạy và hoàn tác seed phải được review trước triển khai. Seed danh mục không đồng nghĩa tạo User Admin đầu tiên.
- **ID-003-FR-029 — Toàn vẹn:** Seed và thay đổi user–role MUST bảo toàn uniqueness, tham chiếu và chính sách Admin; không tự xoá account/reset credential. ID-004 chỉ gán role đã tồn tại từ danh mục, không tự tạo role để chữa lỗi seed thiếu.

Các FR-001, FR-003–FR-008, FR-011–FR-016 và FR-019–FR-023 giữ nguyên ranh giới, hợp nhiều role, mặc định từ chối, trạng thái tài khoản và ảnh chụp role/permission trong token. Tám mã `problem:*` vẫn chỉ gán cho `LECTURER` theo baseline/feature đã duyệt; Admin không có quyền Problem ngầm.

### Đầu vào, đầu ra và bảo mật

API user–role nhận User ID đích và role định sẵn theo baseline. Actor lấy từ ID-001 đã xác minh, không từ body/file/header client. Phản hồi chỉ chứa state gán an toàn; thiếu/sai token trả 401, thiếu thẩm quyền trả 403, validation/đích không tồn tại/xung đột Admin theo contract baseline. Các thao tác gán/thu hồi lặp lại giữ tính idempotent.

Dữ liệu seed là dữ liệu kỹ thuật được review; không nhận file tài khoản như danh mục RBAC. Không có endpoint bootstrap công khai. Log/response không chứa credential/token/bí mật. Token cũ giữ snapshot; token phát hành sau thay đổi role lấy state mới. Mọi SR baseline, đặc biệt bảo vệ Admin và quyền sở hữu tài nguyên, tiếp tục áp dụng.

### Tiêu chí nghiệm thu 0.5

- **ID-003-AC-023 — Rút khỏi phạm vi:** Không triển khai tiêu chí CRUD role/permission của bản nháp trước.
- **ID-003-AC-024:** Admin xem/gán/thu hồi role của user qua FE/API theo baseline; người không có thẩm quyền không thay đổi dữ liệu; user nhiều role có hợp quyền không trùng.
- **ID-003-AC-025:** Seed nạp đúng role/permission/ánh xạ được duyệt; chạy lại không tạo trùng hoặc sửa dữ liệu ngoài phạm vi. Import Excel tài khoản không tạo danh mục hoặc role–permission.
- **ID-003-AC-026:** Seed hoặc mutation user–role thất bại không để quan hệ treo, không gỡ Admin cuối cùng hoặc làm mất dữ liệu account.
- **ID-003-AC-027:** Token cũ giữ snapshot role/permission cũ; token mới phản ánh các phép gán hợp lệ hiện tại; quyền không miễn kiểm tra sở hữu.
- **ID-003-AC-028:** ID-004 import `STUDENT`/`LECTURER` từ Excel tạo account có đúng role đã seed trong cùng transaction; từ chối role không hợp lệ/`ADMIN`; role thiếu trong DB không được tự tạo. Cập nhật role về sau dùng RBAC.

AC baseline giữ nguyên. AC-028 là tiêu chí tích hợp, phụ thuộc ID-004 được Approved và triển khai, không phải nhiệm vụ tạo account bên trong RBAC.

### Ngoài phạm vi

CRUD/import role và permission qua FE/API; sửa role–permission lúc chạy; role tuỳ biến/động; import tài khoản bên trong RBAC; cấp Admin qua Excel; public registration/bootstrap công khai; policy engine, ABAC/ReBAC, role theo tenant/thời hạn, audit service mới, DB xuyên service hoặc thu hồi quyền tức thời trên access token.

### Việc ngoài giai đoạn seed/import và quyết định đã chốt

1. Cách cấp User Admin đầu tiên và phối hợp bảo vệ Admin cuối cùng khi ID-004 xoá account. Seed role `ADMIN` không tự giải quyết cấp account Admin.
2. Seed giai đoạn này đã chốt theo mục triển khai bên dưới: các catalog/mapping feature Approved và user:import cho ADMIN, command riêng, transaction rollback khi lỗi, không down tự động hoặc bảng metadata.
3. Chốt contract FE cho user–role, tái sử dụng các route baseline khi phù hợp; không tự đổi sang thay thế toàn bộ tập role hoặc mở cấp Admin.
4. ID-004 giai đoạn 1 đã được chủ sở hữu chốt: .xlsx 5 MiB/1.000 dòng, nguyên tử toàn file và Lecturer email/mật khẩu. Parser thuộc Auth; manual CRUD account và bootstrap vẫn ngoài đợt này.

### Truy vết và lịch sử

- 2026-10-24: Bản nháp 0.5 mở rộng CRUD/import danh mục, chưa được Approved.
- 2026-10-25: Chủ sở hữu làm rõ file Excel là import tài khoản gồm `mssv`, `name`, `email`, `role`; chỉ `STUDENT`/`LECTURER`, Lecturer để trống MSSV. Role/permission/role–permission chỉ seed; FE chỉ gán role cho user. Bản làm rõ này thay thế cách hiểu import danh mục trước đó; giữ Proposed.
- T001–T050 là baseline; T051–T062 được điều chỉnh theo phạm vi hiện tại, không coi các task rút bỏ là đã triển khai.

### Chốt triển khai seed ngày 2026-10-25

Phần seed riêng được triển khai bằng command kỹ thuật được chạy có chủ đích, không tự chạy lúc boot/import. Mỗi lần chạy dùng một transaction, ON CONFLICT giữ dữ liệu có sẵn; nếu gặp mapping trái policy thì báo cần remediation và rollback toàn lần chạy, không âm thầm xoá/sửa quyền. Không có down tự động xoá dữ liệu catalog; rollback khi lỗi là rollback transaction. Nạp các mã/mapping feature đã Approved và user:import cho ADMIN theo ID-004 giai đoạn 1. Bootstrap account Admin và CRUD account vẫn ngoài phạm vi. Các mục Proposed/câu hỏi ở trên không cho phép triển khai thêm hành vi ngoài phạm vi này.
