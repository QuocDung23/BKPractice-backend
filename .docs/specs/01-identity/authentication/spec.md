# ID-001 Authentication

## Trạng thái

Approved

Phiên bản `1.2`, được chủ sở hữu sản phẩm phê duyệt ngày `2026-10-24`. Bản sửa đổi
[1.2 — Access token trong cookie](#bản-sửa-đổi-12--access-token-trong-cookie) thay thế contract
giao access token qua JSON và bổ sung cách xác thực request trình duyệt; bản 1.1 về claim quyền vẫn
có hiệu lực.

Giá trị hợp lệ: `Proposed` | `Approved` | `Implemented` | `Verified`

## Mục tiêu

Cho phép một sinh viên đã được nhà trường cấp sẵn tài khoản BKPractice thiết lập và kết thúc một
phiên đã xác thực, bằng mã số sinh viên kèm mật khẩu hoặc bằng nhà cung cấp định danh Microsoft của
trường. Việc xác thực xác định người gọi là ai mà không cấp đặc quyền trái phép và không để lộ thông
tin đăng nhập.

## Tác nhân

- **Sinh viên đã được cấp tài khoản:** Người có tài khoản BKPractice được tạo từ đợt import sinh
  viên do quản trị viên kiểm soát.
- **Khách chưa xác thực:** Người gọi đang thử một luồng đăng nhập hoặc làm mới phiên được hỗ trợ.
  Tác nhân này không thể tự đăng ký hay tạo tài khoản thông qua ID-001.
- **Người dùng đã xác thực:** Người dùng đã được cấp tài khoản và có access token BKPractice hợp lệ.
- **Microsoft Entra ID của trường:** Nhà cung cấp định danh tin cậy cho các tài khoản Microsoft do
  trường cấp.
- **API Gateway:** Cổng vào công khai, xác minh access token BKPractice và chuyển tiếp metadata định
  danh và vai trò đã tin cậy.
- **Identity Service:** Chủ sở hữu thông tin xác thực, các định danh nhà cung cấp đã liên kết, trạng
  thái tài khoản, việc phát hành token, và state của phiên làm mới.

## Bối cảnh

Xác thực trả lời câu hỏi **“Bạn là ai?”** Phân quyền trả lời câu hỏi **“Bạn được phép làm gì?”**
ID-001 chỉ bao phủ việc xác thực và vòng đời phiên. Vai trò, quyền, hồ sơ, import sinh viên và các
luồng quản trị tài khoản vẫn là những tính năng riêng.

BKPractice sẽ không cung cấp đăng ký công khai trong đợt triển khai đầu tiên cho trường. Tài khoản
sinh viên được cấp trước khi đăng nhập, từ một file Excel import do quản trị viên kiểm soát. Một
sinh viên đã được cấp tài khoản có thể xác thực bằng:

1. mã số sinh viên (`MSSV`) và mật khẩu; hoặc
2. một tài khoản Microsoft do trường cấp và được kiểm chứng với tenant Microsoft Entra đã cấu hình
   của trường.

Đăng nhập Google, tài khoản Microsoft ngoài tenant của trường, việc tự động tạo người dùng bên
ngoài, và quyền truy cập cho người ngoài trường đều được hoãn sang một đặc tả sau này.

Nền tảng hiện tại đang phơi bày việc đăng ký và đăng nhập bằng email/mật khẩu. Đoạn mã đó không phải
hành vi đích đã được phê duyệt và sẽ chỉ được thay thế trong giai đoạn triển khai. Sinh viên được
import nhận mật khẩu ban đầu dùng chung là `123456`; quá trình cấp tài khoản chỉ lưu bản băm Argon2
của nó, và ID-001 không bắt buộc đổi mật khẩu trong lần đăng nhập đầu tiên. Chủ sở hữu sản phẩm đã
phê duyệt tường minh hành vi này và chấp nhận rủi ro bảo mật còn lại đã được ghi nhận.

## Yêu cầu chức năng

- **ID-001-FR-001 — Không có đăng ký công khai:** Hệ thống MUST NOT phơi bày một thao tác công khai
  tạo tài khoản người dùng BKPractice trong đợt triển khai đầu tiên cho trường.
- **ID-001-FR-002 — Bắt buộc tài khoản đã được cấp:** Việc xác thực MUST chỉ phát hành token
  BKPractice cho một tài khoản đã tồn tại, được tạo qua quy trình cấp tài khoản đã phê duyệt. Việc
  xác thực MUST NOT âm thầm tạo tài khoản khi đăng nhập không tìm thấy người dùng khớp.
- **ID-001-FR-003 — Đăng nhập bằng mã số sinh viên:** Hệ thống MUST cho phép một sinh viên đã được
  cấp tài khoản xác thực bằng mã số sinh viên và mật khẩu.
- **ID-001-FR-004 — Kiểm tra dữ liệu đăng nhập sinh viên:** Hệ thống MUST từ chối mã số sinh viên
  hoặc mật khẩu bị thiếu, sai định dạng hoặc không được hỗ trợ, trước khi thay đổi state xác thực.
- **ID-001-FR-005 — Bảo mật thông tin khi đăng nhập thất bại:** Mã số sinh viên không tồn tại và mật
  khẩu sai MUST nhận cùng một hành vi thất bại xác thực công khai, để phản hồi không xác nhận liệu
  một tài khoản sinh viên có tồn tại hay không.
- **ID-001-FR-006 — Đăng nhập Microsoft của trường:** Hệ thống MUST cho phép một sinh viên đã được
  cấp tài khoản xác thực thông qua tenant Microsoft Entra ID của trường.
- **ID-001-FR-007 — Kiểm chứng tenant Microsoft:** Việc xác thực Microsoft MUST chỉ chấp nhận một
  identity token hoặc kết quả uỷ quyền do tenant đã cấu hình của trường phát hành cho ứng dụng
  BKPractice đã cấu hình.
- **ID-001-FR-008 — Đối sánh tài khoản Microsoft:** Trong lần đăng nhập Microsoft đầu tiên, tài
  khoản Microsoft đã xác minh MUST khớp với email trường được lưu trên đúng một tài khoản BKPractice
  đã được cấp. Một định danh không khớp hoặc khớp nhập nhằng MUST bị từ chối mà không tạo người dùng.
- **ID-001-FR-009 — Liên kết Microsoft ổn định:** Sau lần khớp thành công đầu tiên, hệ thống MUST
  gắn tài khoản BKPractice với định danh tenant và định danh object của Microsoft, để các lần xác
  thực sau không chỉ phụ thuộc vào một địa chỉ email có thể thay đổi.
- **ID-001-FR-010 — Thực thi trạng thái tài khoản:** Hệ thống MUST chỉ phát hành token BKPractice
  mới cho tài khoản `ACTIVE`. Tài khoản ở trạng thái `LOCKED` hoặc `PENDING` MUST NOT đăng nhập được
  bằng cả hai phương thức và MUST NOT làm mới được phiên.
- **ID-001-FR-011 — Kết quả đăng nhập thành công:** Đăng nhập thành công bằng mã số sinh viên hoặc
  bằng Microsoft MUST xác thực cùng một người dùng BKPractice và tạo ra một cặp access
  token/refresh token BKPractice, mà không trả về dữ liệu mật khẩu hay bí mật của nhà cung cấp.
- **ID-001-FR-012 — Định danh trong access token:** Một access token BKPractice MUST xác định đúng
  một người dùng đã xác thực, tự nhận diện là access token, chỉ chứa các vai trò cần cho việc phân
  quyền ở phía sau, và có thời hạn cấu hình được.
- **ID-001-FR-013 — Xác thực cho API được bảo vệ:** API Gateway MUST chấp nhận một access token
  BKPractice hợp lệ qua lược đồ Bearer, từ chối token bị thiếu, sai định dạng, hết hạn, sai loại
  hoặc không hợp lệ theo cách khác, và MUST chỉ suy ra metadata định danh tin cậy từ các claim đã
  được xác minh.
- **ID-001-FR-014 — Tách bạch loại token:** Một access token MUST NOT hoạt động như refresh token,
  một refresh token MUST NOT xác thực được một request API được bảo vệ, và một token của nhà cung
  cấp Microsoft MUST NOT được chấp nhận như một token API của BKPractice.
- **ID-001-FR-015 — Làm mới phiên:** Một refresh token BKPractice hợp lệ, chưa hết hạn, chưa bị thu
  hồi, thuộc một tài khoản `ACTIVE` MUST có thể lấy được một cặp access token/refresh token thay thế.
- **ID-001-FR-016 — Xoay vòng refresh token:** Việc làm mới thành công MUST thu hồi refresh token đã
  gửi lên trước khi phát hành bản thay thế trong cùng một họ phiên. Một refresh token đã tiêu thụ
  MUST NOT được chấp nhận lần nữa.
- **ID-001-FR-017 — Từ chối làm mới không hợp lệ:** Một refresh token sai định dạng, hết hạn, bị thu
  hồi, không tồn tại, bị dùng lại, sai loại hoặc không kiểm chứng được MUST bị từ chối mà không phát
  hành token nào.
- **ID-001-FR-018 — Đăng xuất phiên hiện tại:** Việc đăng xuất MUST thu hồi họ refresh token của
  phiên hiện tại được gửi lên, mà không thu hồi các phiên độc lập trên thiết bị khác. Lặp lại việc
  đăng xuất cho phiên đó MUST NOT khôi phục hay thay thế nó.
- **ID-001-FR-019 — Access token sau khi đăng xuất:** ID-001 MUST NOT đưa vào một danh sách đen
  access token phân tán. Một access token đã phát hành vẫn dùng được cho tới khi hết hạn theo cấu
  hình, trừ khi một yêu cầu được phê duyệt riêng thay đổi quy tắc này.
- **ID-001-FR-020 — Bảo vệ mật khẩu:** Việc xác thực bằng mật khẩu MUST dùng cơ chế băm mật khẩu an
  toàn đã được phê duyệt. Mật khẩu ở dạng thô và bản băm mật khẩu MUST không bao giờ được trả về cho
  client.
- **ID-001-FR-021 — Ranh giới xác thực/phân quyền:** Việc xác thực MAY phơi bày các vai trò đã lưu
  dưới dạng claim định danh có giới hạn thời gian, nhưng ID-001 MUST NOT tạo, cấp, phê duyệt hay thu
  hồi vai trò hoặc quyền.
- **ID-001-FR-022 — Mật khẩu mặc định khi import:** Contract cấp tài khoản MUST khởi tạo thông tin
  đăng nhập cục bộ của mỗi sinh viên được import là `123456`, và Identity MUST chỉ lưu bản băm Argon2
  của nó. ID-001 MUST NOT bắt buộc đổi mật khẩu trong lần đăng nhập đầu tiên.
- **ID-001-FR-023 — Các phiên đồng thời độc lập:** Mỗi lần đăng nhập thành công MUST tạo một họ
  refresh token độc lập, để một người dùng có thể duy trì đăng nhập trên nhiều thiết bị.
- **ID-001-FR-024 — Bàn giao phiên Microsoft:** Một callback Microsoft thành công MUST tạo một mã
  đăng nhập mờ dùng một lần, hết hạn sau 60 giây. Frontend MUST đổi mã đó lấy cặp token BKPractice;
  không token nào của nhà cung cấp hay bearer token của BKPractice được phép xuất hiện trong URL
  chuyển hướng.
- **ID-001-FR-025 — Người dùng đã xác thực hiện tại:** ID-001 MUST cung cấp một thao tác trả về
  thông tin người dùng đã xác thực, chỉ gồm `userId`, `studentId`, các vai trò đã lưu và trạng thái
  tài khoản hiện tại.
- **ID-001-FR-026 — Khoanh vùng khi refresh token bị dùng lại:** Việc dùng lại một refresh token đã
  tiêu thụ MUST chỉ thu hồi họ phiên liên quan tới nó. Các họ phiên khác được tạo độc lập MUST vẫn
  dùng được.

## Quy tắc nghiệp vụ

- Chỉ các tài khoản được tạo bởi quy trình cấp tài khoản đã phê duyệt của trường mới được xác thực
  trong đợt triển khai đầu tiên.
- Mã số sinh viên là định danh đăng nhập thuộc sở hữu của nhà trường và phải xác định duy nhất một
  tài khoản đã được cấp, sau khi áp dụng quy tắc chuẩn hoá đã phê duyệt.
- Email trường dùng cho lần đối sánh Microsoft đầu tiên phải xác định duy nhất một tài khoản đã được
  cấp, sau khi cắt khoảng trắng và chuẩn hoá hoa thường.
- Việc xác thực Microsoft đòi hỏi đồng thời một kết quả hợp lệ từ nhà cung cấp và một tài khoản
  BKPractice khớp. Chỉ riêng việc thuộc tenant Microsoft không tạo ra một người dùng BKPractice.
- Khoá định danh Microsoft ổn định là tổ hợp của định danh tenant và định danh object của nhà cung
  cấp. Một định danh Microsoft không thể liên kết với nhiều người dùng BKPractice.
- Cả hai phương thức đăng nhập được hỗ trợ đều dẫn tới cùng một người dùng BKPractice, cùng vai trò,
  cùng trạng thái tài khoản và cùng mô hình phiên.
- Từ vựng về trạng thái tài khoản hiện có vẫn là `ACTIVE`, `LOCKED` và `PENDING`. ID-001 không đưa
  vào trạng thái `DISABLED`.
- Chỉ tài khoản `ACTIVE` nhận token mới. Các access token đang tồn tại tuân theo ID-001-FR-019 và
  hết hạn một cách tự nhiên, kể cả khi tài khoản bị khoá hoặc chuyển sang chờ duyệt sau đó.
- Thông tin làm mới phiên là thông tin đăng nhập dùng một lần cho phiên, có thời hạn cấu hình được
  và dài hơn thời hạn của access token.
- Mỗi lần đăng nhập thành công tạo ra một họ refresh token độc lập. Việc xoay vòng refresh vẫn nằm
  trong cùng họ; việc đăng xuất và khoanh vùng khi bị dùng lại chỉ ảnh hưởng tới họ đó.
- Thông tin đăng nhập cục bộ khi import khởi đầu là `123456`. Quá trình cấp tài khoản chỉ lưu bản
  băm Argon2 của nó, và ID-001 không bắt buộc đổi mật khẩu ở lần đăng nhập đầu. Việc Đổi mật khẩu tự
  nguyện là một tính năng riêng.
- Claim vai trò là ảnh chụp có giới hạn thời gian. Việc quản lý vai trò thuộc về ID-003 RBAC.
- Contract của file cấp tài khoản là `stt`, `mssv`, `họ tên`, `lớp` và `emailTruong`. `stt` chỉ phục
  vụ hiển thị, còn `lớp` thuộc về Learning; Identity nhận MSSV duy nhất, dữ liệu tên/hồ sơ, và email
  trường đã chuẩn hoá. Việc phân tích file import, kiểm tra từng dòng, ghi danh vào lớp và báo cáo
  quản trị không thuộc trách nhiệm của Authentication.

## Quy tắc phân quyền

- Đăng nhập bằng mã số sinh viên, khởi tạo/callback đăng nhập Microsoft, và làm mới phiên là các
  thao tác công khai ở tầng truyền tải, nhưng chỉ một tài khoản đã được cấp hợp lệ mới nhận được
  token BKPractice.
- Contract Gateway hiện tại yêu cầu một access token Bearer BKPractice hợp lệ cộng với thông tin
  refresh để đăng xuất.
- Người gọi công khai không thể cung cấp vai trò tin cậy, quyền, trạng thái tài khoản, định danh
  tenant Microsoft, định danh object của nhà cung cấp, hay các header định danh tin cậy.
- Gateway MUST loại bỏ các header định danh tin cậy do người gọi gửi lên và chỉ thay thế chúng bằng
  dữ liệu suy ra từ một access token BKPractice đã được xác minh.
- Việc xác thực thành công không đồng nghĩa với quyền truy cập mọi khoá học, lớp, bài tập hay thao
  tác quản trị. Việc phân quyền tài nguyên vẫn thuộc về service sở hữu.
- Quy trình cấp tài khoản sinh viên có thể gán vai trò `STUDENT` hiện có, nhưng ID-001 không triển
  khai quy trình cấp tài khoản hay gán vai trò đó.

## Đầu vào

### Đăng nhập sinh viên — route đề xuất `POST /api/auth/login`

| Trường      | Bắt buộc | Yêu cầu                                                            |
| ----------- | -------- | ------------------------------------------------------------------ |
| `studentId` | Có       | MSSV đã tồn tại, được import từ file do quản trị viên kiểm soát    |
| `password`  | Có       | Chuỗi thông tin đăng nhập không rỗng; không bị âm thầm cắt hay sửa |

Request MUST NOT chấp nhận vai trò, quyền, trạng thái tài khoản, bản băm mật khẩu, cấu hình token,
định danh nhà cung cấp, hay metadata định danh tin cậy.

### Khởi tạo đăng nhập Microsoft — route đề xuất `GET /api/auth/microsoft`

Người gọi không cung cấp thuộc tính định danh tin cậy hay URL chuyển hướng nào. Hệ thống chỉ dùng
callback và địa chỉ quay về frontend đã được cấu hình cố định của nó.

### Callback Microsoft — route đề xuất `GET /api/auth/microsoft/callback`

Callback chỉ chấp nhận phản hồi uỷ quyền của nhà cung cấp và các giá trị tương quan mà luồng uỷ
quyền Microsoft đã phê duyệt yêu cầu. Email, tenant, object ID, vai trò và trạng thái tài khoản do
trình duyệt gửi trực tiếp đều không đáng tin cậy.

### Đổi mã đăng nhập Microsoft — route đề xuất `POST /api/auth/microsoft/exchange`

| Trường      | Bắt buộc | Yêu cầu                                                |
| ----------- | -------- | ------------------------------------------------------ |
| `loginCode` | Có       | Mã mờ, không rỗng, dùng một lần, do Identity phát hành |

Mã hết hạn sau 60 giây và MUST NOT được chấp nhận quá một lần.

### Làm mới phiên — `POST /api/auth/refresh`

| Trường         | Bắt buộc | Yêu cầu                                      |
| -------------- | -------- | -------------------------------------------- |
| `refreshToken` | Có       | Thông tin refresh của BKPractice, không rỗng |

### Đăng xuất — `POST /api/auth/logout`

| Đầu vào                     | Bắt buộc | Yêu cầu                                                           |
| --------------------------- | -------- | ----------------------------------------------------------------- |
| Bearer token của BKPractice | Có       | Access token hợp lệ, chưa hết hạn, theo contract Gateway hiện tại |
| `refreshToken` trong body   | Có       | Thông tin refresh xác định phiên cần thu hồi                      |

### Người dùng đã xác thực hiện tại — route đề xuất `GET /api/auth/me`

Request yêu cầu một access token Bearer BKPractice hợp lệ và không chấp nhận trường định danh tin
cậy nào do người gọi cung cấp.

## Đầu ra

- Đăng nhập bằng mã số sinh viên thành công trả về HTTP `200` kèm `userId` của BKPractice,
  `accessToken` và `refreshToken`.
- Việc khởi tạo đăng nhập Microsoft chỉ chuyển hướng trình duyệt tới endpoint uỷ quyền Microsoft đã
  cấu hình.
- Callback Microsoft xác thực thành công sẽ phân giải ra `userId` BKPractice đã liên kết, tạo một mã
  đăng nhập mờ dùng một lần, và chuyển hướng tới frontend đã cấu hình kèm mã đó. Việc đổi mã trong
  vòng 60 giây trả về cùng hình dạng cặp token như đăng nhập sinh viên.
- Làm mới phiên thành công trả về HTTP `200` kèm `accessToken` và `refreshToken` thay thế.
- Đăng xuất thành công hoặc lặp lại một cách idempotent trả về HTTP `204` không có phần thân, sau
  khi họ refresh được gửi lên trở nên không dùng được; các họ đăng nhập khác vẫn dùng được.
- Thao tác lấy thông tin người dùng đã xác thực hiện tại chỉ trả về `userId`, `studentId`, các vai
  trò đã lưu và trạng thái tài khoản hiện tại.
- Một access token BKPractice tối thiểu chứa định danh người dùng chủ thể, các vai trò đã lưu, loại
  access token, và thời điểm hết hạn. Nó không chứa mật khẩu, bản băm mật khẩu, token của nhà cung
  cấp Microsoft, thông tin refresh, hay dữ liệu hồ sơ không cần thiết.

## Tình huống lỗi

| Trường hợp                                                                                            | Hành vi quan sát được                                                                                      |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Có yêu cầu đăng ký công khai                                                                          | Thao tác không khả dụng; không tạo người dùng hay phiên nào.                                               |
| JSON sai định dạng, trường không được hỗ trợ, mã số sinh viên không hợp lệ, hoặc hình dạng trường sai | Request bị từ chối theo quy ước kiểm tra dữ liệu/lỗi hiện có mà không thay đổi state xác thực.             |
| Mã số sinh viên không tồn tại hoặc mật khẩu sai                                                       | Cả hai trường hợp nhận cùng một lỗi xác thực chung chung và không token nào được phát hành.                |
| Tài khoản `LOCKED` hoặc `PENDING` thử đăng nhập hoặc làm mới phiên                                    | Thao tác bị từ chối và không token nào được phát hành.                                                     |
| Việc uỷ quyền Microsoft bị từ chối hoặc trả về lỗi                                                    | Đăng nhập thất bại mà không tạo hay liên kết tài khoản nào.                                                |
| Issuer, audience, tenant, chữ ký, thời hạn, state, nonce hoặc loại token của Microsoft không hợp lệ   | Đăng nhập bị từ chối mà không tin cậy bất kỳ claim nào của nhà cung cấp.                                   |
| Định danh Microsoft hợp lệ của trường nhưng không khớp duy nhất một tài khoản đã được cấp             | Đăng nhập bị từ chối mà không tiết lộ liệu một email hay hồ sơ sinh viên cụ thể có tồn tại hay không.      |
| Định danh Microsoft đã được liên kết với một người dùng khác                                          | Đăng nhập bị từ chối và xung đột định danh được ghi nhận an toàn để quản trị viên rà soát.                 |
| Refresh token không hợp lệ, hết hạn, bị thu hồi, bị dùng lại, hoặc sai loại                           | Việc làm mới bị từ chối và không token thay thế nào được phát hành.                                        |
| Access token BKPractice bị thiếu, hết hạn hoặc không hợp lệ ở một thao tác được bảo vệ                | Gateway từ chối request và không chuyển tiếp metadata định danh tin cậy nào.                               |
| Đăng xuất nhận thông tin refresh đã bị vô hiệu nhưng đầu vào còn lại vẫn hợp lệ                       | Việc đăng xuất vẫn idempotent và không tiết lộ state phiên trước đó.                                       |
| Lỗi xác thực hoặc lỗi nhà cung cấp ngoài dự kiến                                                      | Dùng quy ước lỗi chuẩn hoá hiện có, không kèm thông tin đăng nhập, token, bản băm hay bí mật nhà cung cấp. |

ID-001 không đưa ra cấu trúc lỗi mới. HTTP và việc tuần tự hoá lỗi vẫn tương thích với Gateway hiện
có, với phần kiểm tra dữ liệu của NestJS, và với contract đăng nhập qua nhà cung cấp sẽ được phê
duyệt sau này.

## Tình huống biên

- Việc chuẩn hoá mã số sinh viên không được khiến hai định danh khác nhau của nhà trường cùng phân
  giải về một người dùng.
- Nếu nhiều bản ghi import chứa cùng một mã số sinh viên hoặc cùng một email trường, việc xác thực
  từ chối đối sánh nhập nhằng; quy trình cấp tài khoản phải xử lý dữ liệu đó.
- Các lần đăng nhập đồng thời tạo ra các họ refresh token độc lập.
- Việc dùng đồng thời một refresh token chỉ cho phép nhiều nhất một lần xoay vòng thành công.
- Việc dùng lại một refresh token đã tiêu thụ sẽ thu hồi họ phiên của nó mà không thu hồi các họ độc
  lập khác.
- Lần liên kết Microsoft đầu tiên có tính nguyên tử: thất bại không thể để lại một liên kết nhà cung
  cấp dở dang hay một phiên BKPractice thành công.
- Sau khi đã liên kết, một thay đổi email trường đã được phê duyệt không tạo ra người dùng khác; các
  định danh tenant/object ổn định vẫn tiếp tục xác định tài khoản đã liên kết.
- Việc lặp lại đăng xuất là an toàn và không bao giờ phát hành thông tin đăng nhập.
- Một thay đổi về vai trò hay trạng thái tài khoản không làm thay đổi một access token đã phát hành.
  Việc phát hành token mới dùng vai trò và trạng thái hiện tại.
- Khoảng trắng và ký tự Unicode trong mật khẩu được coi là dữ liệu đăng nhập và không bị âm thầm cắt
  bỏ.

## Yêu cầu bảo mật

- **ID-001-SR-001 — Bảo mật mật khẩu:** Mật khẩu MUST không bao giờ được lưu ở dạng thô, trả về cho
  client, đưa vào log, hay nhúng trong thông báo lỗi.
- **ID-001-SR-002 — Băm mật khẩu:** Thông tin đăng nhập cục bộ đã lưu MUST dùng Argon2 — cơ chế mà
  nền tảng đã chọn — và việc kiểm tra mật khẩu MUST sử dụng nó một cách an toàn.
- **ID-001-SR-003 — An toàn của thông tin đăng nhập khi import:** Quá trình cấp tài khoản MUST băm
  mật khẩu dùng chung đã phê duyệt `123456` bằng Argon2 trước khi lưu. ID-001 MUST NOT ghi log hay
  trả về nó, và MUST áp dụng biện pháp chống lạm dụng cấu hình được cho việc đăng nhập bằng mật
  khẩu. Chủ sở hữu chấp nhận tường minh rủi ro còn lại của việc không bắt buộc đổi mật khẩu ở lần
  đăng nhập đầu.
- **ID-001-SR-004 — Kiểm chứng giao thức Microsoft:** Việc đăng nhập Microsoft MUST kiểm chứng chữ
  ký của nhà cung cấp, issuer, audience của ứng dụng đã cấu hình, tenant đã cấu hình của trường,
  thời hạn, mục đích của token, và giá trị tương quan của luồng uỷ quyền, trước khi tin cậy các
  claim định danh.
- **ID-001-SR-005 — Cách ly mật khẩu Microsoft:** BKPractice MUST không bao giờ yêu cầu, nhận, lưu,
  trung chuyển hay kiểm tra mật khẩu Microsoft của người dùng.
- **ID-001-SR-006 — Toàn vẹn của việc liên kết tài khoản:** Việc liên kết Microsoft MUST dùng các
  claim đã xác minh của nhà cung cấp và một kết quả đối sánh duy nhất với tài khoản đã được cấp;
  email hay định danh nhà cung cấp do trình duyệt gửi lên không bao giờ được tin cậy.
- **ID-001-SR-007 — Bảo vệ bí mật của nhà cung cấp:** Thông tin xác thực ứng dụng Microsoft và cấu
  hình ký MUST được cung cấp qua cấu hình phía server đã được kiểm chứng, và bị loại khỏi client, hệ
  thống quản lý mã nguồn, phản hồi và log.
- **ID-001-SR-008 — Lưu trữ refresh token:** Một thông tin refresh được lưu trữ MUST ở dạng không
  thể dùng trực tiếp làm thông tin bearer nếu kho lưu trữ bị lộ.
- **ID-001-SR-009 — Bảo mật token:** Access/refresh token của BKPractice, token của nhà cung cấp, mã
  uỷ quyền, bí mật ký, và header Authorization MUST bị loại khỏi log.
- **ID-001-SR-010 — Claim tối thiểu của BKPractice:** Token BKPractice chỉ chứa các claim cần cho
  định danh, kiểm chứng, thời hạn, xoay vòng, và phân quyền theo vai trò ở phía sau.
- **ID-001-SR-011 — Chống leo thang đặc quyền:** Đầu vào của việc xác thực không thể điều khiển vai
  trò, quyền, header định danh tin cậy, tham số ký, liên kết nhà cung cấp, hay trạng thái tài khoản.
- **ID-001-SR-012 — Chống rò rỉ thông tin:** Các lỗi đăng nhập không phân biệt giữa một hồ sơ sinh
  viên không tồn tại, một mật khẩu sai, và một email nhà cung cấp không khớp.
- **ID-001-SR-013 — Thực thi trạng thái:** Người dùng `LOCKED` và `PENDING` không thể lấy được
  access token hay refresh token BKPractice mới.
- **ID-001-SR-014 — Kiểm chứng mục đích của token:** Mọi thao tác tiêu thụ token đều kiểm chứng tính
  toàn vẹn, thời hạn, issuer/audience dự kiến khi có liên quan, và mục đích của token, trước khi tin
  cậy các claim.
- **ID-001-SR-015 — Bảo vệ ở tầng truyền tải:** Trong môi trường production, thông tin đăng nhập, mã
  uỷ quyền và token chỉ được truyền qua kênh mã hoá và không bao giờ được đặt trong URL.
- **ID-001-SR-016 — Chống lạm dụng:** Các thao tác công khai gồm khởi tạo xác thực, callback, đăng
  nhập bằng thông tin đăng nhập, và làm mới phiên SHOULD dùng cơ chế giới hạn tần suất cấu hình được
  ở Gateway, mà không thêm chấm điểm rủi ro hay hạ tầng định danh cấp doanh nghiệp.
- **ID-001-SR-017 — An toàn của mã đăng nhập dùng một lần:** Mã bàn giao của Microsoft MUST không
  đoán trước được về mặt mật mã, hết hạn sau 60 giây, được tiêu thụ nguyên tử đúng một lần, và chỉ
  ánh xạ tới lượng state định danh cục bộ tối thiểu cần để phát hành một phiên BKPractice.
- **ID-001-SR-018 — Khoanh vùng khi refresh bị dùng lại:** State của họ refresh token MUST cho phép
  một lần dùng lại bị phát hiện thu hồi được họ bị ảnh hưởng mà không tiết lộ chi tiết token/phiên
  và không thu hồi các họ độc lập khác.

## Tiêu chí nghiệm thu

- **ID-001-AC-001:** Cho trước một yêu cầu tạo tài khoản công khai bất kỳ, khi nó tới BKPractice,
  thì không người dùng hay phiên nào được tạo vì đăng ký công khai không khả dụng.
- **ID-001-AC-002:** Cho trước một sinh viên `ACTIVE` đã được cấp tài khoản và mã số sinh viên/mật
  khẩu đúng, khi thử đăng nhập, thì đúng người dùng BKPractice và cặp token được trả về.
- **ID-001-AC-003:** Cho trước một mã số sinh viên không tồn tại hoặc mật khẩu sai, khi thử đăng
  nhập, thì cả hai trường hợp nhận cùng một lỗi chung chung và không token nào được phát hành.
- **ID-001-AC-004:** Cho trước các trường đăng nhập sinh viên sai định dạng hoặc thừa, khi việc kiểm
  tra dữ liệu chạy, thì request bị từ chối trước khi state xác thực thay đổi.
- **ID-001-AC-005:** Cho trước một sinh viên `ACTIVE` đã được cấp tài khoản, dùng tenant Microsoft
  đã cấu hình của trường và email trường khớp, khi đăng nhập Microsoft hoàn tất, thì định danh
  Microsoft được liên kết một cách nguyên tử và một phiên BKPractice được thiết lập cho chính người
  dùng đó.
- **ID-001-AC-006:** Cho trước một tài khoản Microsoft hợp lệ từ một tenant khác, khi thử đăng nhập,
  thì BKPractice từ chối nó và không tạo người dùng lẫn phiên.
- **ID-001-AC-007:** Cho trước một định danh Microsoft hợp lệ của trường nhưng không khớp đúng một
  tài khoản đã được cấp, khi thử đăng nhập, thì nó bị từ chối mà không tự động tạo người dùng và
  không tiết lộ sự tồn tại của hồ sơ sinh viên.
- **ID-001-AC-008:** Cho trước một định danh Microsoft đã liên kết với một người dùng đã được cấp
  tài khoản, khi một lần đăng nhập hợp lệ sau đó diễn ra, thì các định danh tenant/object ổn định
  phân giải về cùng một người dùng BKPractice.
- **ID-001-AC-009:** Cho trước một phản hồi Microsoft bị giả mạo, hết hạn, sai đối tượng hoặc sai
  giá trị tương quan, khi việc xử lý callback diễn ra, thì không claim nào của nhà cung cấp được tin
  cậy và không token BKPractice nào được phát hành.
- **ID-001-AC-010:** Cho trước một tài khoản ở trạng thái `LOCKED` hoặc `PENDING`, khi thử một trong
  hai phương thức đăng nhập hoặc thử làm mới phiên, thì không token mới nào được phát hành.
- **ID-001-AC-011:** Cho trước một trong hai phương thức đăng nhập thành công, khi kiểm tra access
  token BKPractice, thì nó chỉ chứa các claim bắt buộc về định danh, vai trò, loại và thời hạn,
  không chứa thông tin đăng nhập hay token của nhà cung cấp.
- **ID-001-AC-012:** Cho trước một refresh token hợp lệ của tài khoản `ACTIVE`, khi việc làm mới
  thành công, thì một cặp thay thế được trả về và refresh token đã tiêu thụ không dùng lại được.
- **ID-001-AC-013:** Cho trước một refresh token không hợp lệ, hết hạn, bị thu hồi, bị dùng lại hoặc
  sai loại, khi yêu cầu làm mới, thì không token nào được phát hành.
- **ID-001-AC-014:** Cho trước một yêu cầu đăng xuất đã xác thực hợp lệ, khi việc đăng xuất hoàn
  tất, thì phản hồi không có phần thân và phiên refresh đã gửi lên không dùng lại được.
- **ID-001-AC-015:** Cho trước một request API được bảo vệ không kèm access token BKPractice hợp lệ,
  khi nó tới Gateway, thì nó bị từ chối và không header định danh tin cậy nào được chuyển tiếp.
- **ID-001-AC-016:** Cho trước các header định danh hay vai trò tin cậy do người gọi gửi lên, khi
  Gateway xử lý request, thì chúng bị loại bỏ và chỉ được thay thế từ một access token BKPractice đã
  xác minh.
- **ID-001-AC-017:** Cho trước một thao tác xác thực thành công hoặc thất bại bất kỳ, khi rà soát
  phản hồi và log ứng dụng, thì chúng không chứa mật khẩu dạng thô, bản băm mật khẩu, thông tin xác
  thực ứng dụng của nhà cung cấp, mã uỷ quyền, token của nhà cung cấp, hay token BKPractice ngoài ý
  muốn.
- **ID-001-AC-018:** Cho trước một luồng đăng nhập Microsoft, khi kiểm tra các lần chuyển hướng
  trình duyệt, thì không token của nhà cung cấp hay bearer token BKPractice nào bị lộ trong URL.
- **ID-001-AC-019:** Cho trước một tài khoản sinh viên đã import, khi kiểm tra lớp lưu trữ thông tin
  đăng nhập, thì chuỗi `123456` dạng thô không xuất hiện và chỉ bản băm Argon2 của nó được lưu; lần
  đăng nhập đầu có thể hoàn tất mà không bị chặn bởi bước bắt buộc đổi mật khẩu.
- **ID-001-AC-020:** Cho trước một callback Microsoft thành công, khi mã đăng nhập mờ của nó được
  đổi đúng một lần trong vòng 60 giây, thì một cặp token BKPractice được trả về; một lần đổi muộn
  hoặc lần thứ hai bị từ chối mà không phát hành token khác.
- **ID-001-AC-021:** Cho trước hai lần đăng nhập thành công của cùng một người dùng, khi một phiên
  đăng xuất, thì họ refresh của phiên đó không dùng được nữa trong khi phiên còn lại vẫn làm mới
  được.
- **ID-001-AC-022:** Cho trước một refresh token đã tiêu thụ bị dùng lại, khi việc xử lý dùng lại
  hoàn tất, thì họ của nó bị thu hồi và một họ khác được tạo độc lập vẫn dùng được.
- **ID-001-AC-023:** Cho trước một access token BKPractice hợp lệ, khi gọi thao tác lấy thông tin
  người dùng hiện tại, thì nó chỉ trả về `userId`, `studentId`, các vai trò và trạng thái; khi không
  có access token hợp lệ thì nó trả về lỗi xác thực.
- **ID-001-AC-024:** Cho trước dữ liệu file với `stt`, `mssv`, `họ tên`, `lớp` và `emailTruong`, khi
  ranh giới cấp tài khoản riêng biệt cung cấp dữ liệu cho Identity, thì Authentication dùng MSSV cho
  việc đăng nhập cục bộ và `emailTruong` đã chuẩn hoá cho lần đối sánh Microsoft đầu tiên, mà không
  sở hữu `stt` hay việc ghi danh vào lớp.

## Ngoài phạm vi

- Đăng ký công khai và tự tạo tài khoản
- Đăng nhập Google và xác thực cho người ngoài trường
- Tài khoản Microsoft cá nhân hoặc các tenant tổ chức Microsoft khác ngoài tenant đã cấu hình của
  trường
- Phân tích Excel, tải file lên, kiểm tra từng dòng, báo cáo import, và việc triển khai cấp tài khoản
- Ghi danh vào lớp hoặc cập nhật Learning Service từ file import
- Quên mật khẩu và Đặt lại mật khẩu
- Hành vi Đổi mật khẩu nói chung và trang giao diện của nó
- Xác minh email
- MFA / 2FA
- Quản lý hồ sơ đầy đủ
- Quản lý vai trò, quản lý quyền, và quản trị người dùng
- Cấp tài khoản cho Giảng viên/Quản trị viên
- Quản lý thiết bị và giao diện quản lý phiên nâng cao
- Danh sách đen access token phân tán
- Keycloak, các identity broker bên ngoài, device fingerprinting, chấm điểm rủi ro, CQRS và Event
  Sourcing

## Phụ thuộc

- [Kiến trúc hệ thống BKPractice](../../../architecture/system-architecture.md)
- [Kiến trúc Identity Service](../../../architecture/identity-service.md)
- [Ma trận kiến trúc service](../../../architecture/service-architectures.md)
- [Quy tắc phụ thuộc](../../../architecture/dependency-rules.md)
- [ADR 0001: Kiến trúc nội bộ riêng theo từng service](../../../adr/0001-service-specific-internal-architectures.md)
- [Quy trình SDD](../../README.md)
- [Tham chiếu kiến trúc cho SDD](../../00-system/architecture-reference.md)
- [Ranh giới service](../../00-system/service-boundaries.md)
- [Vai trò và quyền](../../00-system/roles-permissions.md)
- [Chiến lược cơ sở dữ liệu](../../00-system/database-strategy.md)
- [Định nghĩa Hoàn thành](../../00-system/definition-of-done.md)
- Một đặc tả cấp tài khoản do quản trị viên kiểm soát trong tương lai phải hiện thực contract file
  đã phê duyệt (`stt`, `mssv`, `họ tên`, `lớp`, `emailTruong`) và đảm bảo dữ liệu định danh
  MSSV/email là duy nhất, trước khi ID-001 có thể được chạy trọn vẹn end-to-end.
- ID-002 Profile và ID-003 RBAC vẫn là các đặc tả riêng.

## Câu hỏi mở

Không còn. Các quyết định sản phẩm đã được chủ sở hữu giải quyết và phê duyệt ngày 2026-09-01. Các
giá trị triển khai như tenant ID và client ID của Microsoft vẫn là cấu hình môi trường bắt buộc,
không phải yêu cầu sản phẩm còn bỏ ngỏ.

## Bản sửa đổi 1.1 — Claim quyền

Đi kèm [ID-003 bản sửa đổi 0.4](../rbac/spec.md#bản-sửa-đổi-04--truyền-quyền-hiệu-lực).
Các yêu cầu sau được thay thế:

- **ID-001-FR-012 (sửa):** Một access token BKPractice MUST xác định đúng một người dùng đã xác thực,
  tự nhận diện là access token, chỉ chứa các vai trò và **ảnh chụp quyền hiệu lực** cần cho việc
  phân quyền ở phía sau (ID-003-FR-020), và có thời hạn cấu hình được.
- **ID-001-SR-010 (sửa):** Token BKPractice chỉ chứa các claim cần cho định danh, kiểm chứng, thời
  hạn, xoay vòng, và phân quyền theo vai trò/quyền ở phía sau.
- **ID-001-AC-011 (sửa):** Cho trước một trong hai phương thức đăng nhập thành công, khi kiểm tra
  access token BKPractice, thì nó chỉ chứa các claim bắt buộc về định danh, vai trò, quyền, loại và
  thời hạn, không chứa thông tin đăng nhập hay token của nhà cung cấp.
- **Đầu ra (sửa):** Access token tối thiểu chứa định danh chủ thể, các vai trò đã lưu, các quyền hiệu
  lực, loại access token và thời điểm hết hạn.

Làm mới phiên MUST phát hành access token với quyền hiệu lực hiện tại, như với vai trò. Refresh token
không đổi. Thao tác lấy thông tin người dùng hiện tại (`/auth/me`) không đổi.

## Bản sửa đổi 1.2 — Access token trong cookie

Được chủ sở hữu sản phẩm phê duyệt ngày `2026-10-24` cho frontend và API Gateway cùng site.
Các quy tắc dưới đây thay thế các phần liên quan của FR-011, FR-013, FR-015, phần Đầu vào/Đầu ra,
Quy tắc phân quyền, AC-012, AC-014, AC-015 và AC-023 ở trên; các quy tắc khác tiếp tục có hiệu lực.

- **ID-001-FR-027 — Giao access token cho trình duyệt:** Sau đăng nhập bằng MSSV, đổi mã Microsoft
  hoặc làm mới phiên thành công, Identity MUST đặt access token BKPractice vào một cookie host-only
  tên `__Host-bk_access`, với `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/` và thời hạn không dài hơn
  thời hạn access token. `accessToken` MUST NOT xuất hiện trong JSON phản hồi. Đăng nhập/đổi mã vẫn
  trả `userId` và `refreshToken`; làm mới phiên vẫn trả `refreshToken` thay thế. Refresh token tiếp
  tục được gửi qua JSON/body theo contract hiện có, không được đưa vào cookie bởi bản sửa đổi này.
- **ID-001-FR-028 — Xác thực bằng cookie tại Gateway:** API Gateway MUST chấp nhận access token
  BKPractice hợp lệ từ cookie đó cho các API được bảo vệ. Gateway MUST kiểm chứng chữ ký, thời hạn,
  loại token và claim như với Bearer, rồi mới chuyển định danh/quyền tin cậy và Bearer nội bộ cho
  service đích. Gateway tiếp tục chấp nhận Bearer tường minh cho client tương thích; nếu cả Bearer
  lẫn cookie cùng có mặt, Bearer được ưu tiên và token Bearer sai không được rơi về cookie. Gateway
  MUST NOT chuyển tiếp header Cookie thô tới service đích.
- **ID-001-FR-029 — Kết thúc cookie:** Đăng xuất thành công MUST xoá access cookie với cùng phạm vi
  và thuộc tính, đồng thời tiếp tục thu hồi họ refresh được gửi lên. Access token JWT đã phát hành
  vẫn tuân thời hạn hết hạn tự nhiên của FR-019; việc xoá cookie chỉ kết thúc phiên ở trình duyệt đó.
- **ID-001-FR-030 — Bảo vệ request dùng cookie:** Gateway MUST từ chối các request thay đổi state
  được xác thực bằng cookie khi Origin, hoặc Referer dùng thay thế, không khớp một origin frontend
  đã cấu hình trong `CORS_ORIGINS`. Các thao tác POST phát hành/đổi cookie cũng MUST từ chối origin
  không được phép. `SameSite=Lax` không thay thế kiểm tra này. Frontend khác origin nhưng cùng site
  MUST gửi request với credentials để trình duyệt lưu và gửi cookie.
- **ID-001-FR-031 — Xác thực realtime bằng cookie:** Kết nối Socket.IO tới Gateway MUST có thể dùng
  cùng access cookie đã kiểm chứng mà không yêu cầu JavaScript đọc access token. Cách gửi token
  tường minh hiện có MAY tiếp tục hoạt động; khi dùng cookie, origin kết nối MUST thuộc
  `CORS_ORIGINS`.
- **ID-001-SR-019 — Phạm vi cookie:** Cookie MUST không có thuộc tính Domain, chỉ được đặt qua
  HTTPS trong production và không lộ cho JavaScript. Gateway chỉ chuyển tiếp `Set-Cookie` do Identity
  phát hành trên phản hồi thành công của login, Microsoft exchange, refresh và logout; các
  `Set-Cookie` khác từ upstream MUST bị loại bỏ.
- **ID-001-SR-020 — Không rò rỉ token:** Cookie/access token thô MUST NOT xuất hiện trong JSON,
  redirect URL, log, lỗi, metadata định danh chuyển tiếp hoặc header Cookie chuyển tới service
  đích. CORS chỉ cho phép các origin đã cấu hình và credentials; không dùng wildcard origin.
- **ID-001-AC-025:** Login bằng MSSV hoặc Microsoft exchange thành công trả cookie có đủ thuộc tính
  trên và JSON không chứa `accessToken`.
- **ID-001-AC-026:** Refresh hợp lệ xoay vòng refresh token và thay cookie access; refresh thất bại
  không phát hành cookie/token mới.
- **ID-001-AC-027:** Browser gửi cookie hợp lệ gọi `/auth/me` và API được bảo vệ khác thành công mà
  không tự thêm header Authorization; cookie sai, hết hạn hoặc sai loại bị từ chối.
- **ID-001-AC-028:** Logout qua cookie hợp lệ xoá cookie và giữ ngữ nghĩa thu hồi họ refresh hiện có;
  request browser sau đó không còn được xác thực bằng cookie đã xoá.
- **ID-001-AC-029:** Request thay đổi state bằng cookie từ origin không được cấu hình hoặc thiếu cả
  Origin/Referer bị từ chối; request Bearer tường minh tiếp tục dùng contract hiện có.
- **ID-001-AC-030:** Gateway không chuyển tiếp Cookie thô hoặc `Set-Cookie` tuỳ ý của upstream; bản
  thân cookie và các trường nhạy cảm không xuất hiện trong log hay phản hồi JSON.
- **ID-001-AC-031:** Socket.IO nhận cookie access hợp lệ từ frontend đã cấu hình và từ chối cookie
  sai/hết hạn/sai loại hoặc origin không được phép mà không đòi `handshake.auth.token`.

Một GET hồ sơ công khai vẫn công khai. Nếu nó có cookie/Bearer Admin hợp lệ, Gateway có thể chuyển
ngữ cảnh đã kiểm chứng để Identity trả góc nhìn Admin; cookie không hợp lệ trên GET công khai chỉ
nhận góc nhìn công khai. Không thêm refresh cookie, phiên server-side, danh sách đen access token
hay thay đổi claim quyền của bản 1.1.

## Làm rõ contract cấp tài khoản ngày 2026-10-25

Chủ sở hữu chốt file Excel của [ID-004](../student-provisioning/spec.md) gồm `mssv`, `name`, `email`, `role`, thay cho bộ cột cũ được nhắc trong quy tắc nghiệp vụ, AC-024 và phụ thuộc cấp tài khoản phía trên. Role từng dòng chỉ là `STUDENT` hoặc `LECTURER`; Student bắt buộc có MSSV, Lecturer để trống MSSV. `name` là tên chính thức, `email` cung cấp email trường đã chuẩn hoá. Không có cột lớp hoặc ghi danh trong luồng này.

Đây là phần làm rõ contract đầu vào của ID-004 đang Proposed, chưa phê duyệt toàn bộ chức năng import. Giữ login Student theo MSSV và đối sánh Microsoft theo email; credential/cách login Lecturer vẫn chờ quyết định, không được suy ra từ việc cột role nhận LECTURER. Role/permission/role–permission được seed riêng; file không tạo danh mục hay cấp ADMIN.

## Lịch sử sửa đổi

| Ngày       | Phiên bản | Tác giả/Người review | Tóm tắt                                                                                                                                                                                                                                                           |
| ---------- | --------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-01 | 0.1       | Codex / TBD          | Đặc tả Proposed ban đầu cho việc đăng ký bằng email/mật khẩu                                                                                                                                                                                                      |
| 2026-09-01 | 0.2       | Codex / TBD          | Thay đăng ký bằng mã số sinh viên đã được cấp và đăng nhập Microsoft của trường                                                                                                                                                                                   |
| 2026-09-01 | 1.0       | Chủ sở hữu sản phẩm  | Giải quyết các quyết định về xác thực và phê duyệt ID-001                                                                                                                                                                                                         |
| 2026-09-29 | 1.1       | Chủ sở hữu sản phẩm  | Thêm claim `permissions` vào access token, đi kèm ID-003 0.4. Đã phê duyệt.                                                                                                                                                                                       |
| 2026-10-24 | 1.2       | Chủ sở hữu sản phẩm  | Access token chỉ ở HttpOnly Secure SameSite=Lax cookie cho FE/Gateway cùng site. Đã phê duyệt.                                                                                                                                                                    |
| 2026-11-14 | 1.3       | Chủ sở hữu sản phẩm  | `POST /api/auth/login` được báo chi tiết lý do theo `00-system/error-responses` ERR-001 FR-007 (ngoại lệ với dòng "MSSV không tồn tại hoặc mật khẩu sai", `ID-001-AC-003` và ghi chú nhánh Lecturer). Microsoft, refresh, quên mật khẩu giữ nguyên. Đã phê duyệt. |

> `spec.md` mô tả CÁI GÌ. Chi tiết thư mục, class, cách hiện thực repository, thư viện Microsoft,
> ánh xạ TypeORM, transaction và thứ tự thực thi thuộc về một `plan.md` sau này, sau khi có phê
> duyệt của con người.

## Bản sửa đổi được duyệt ngày 2026-10-25 — Lecturer local login

Chủ sở hữu chốt Lecturer được cấp account/mật khẩu ban đầu như Student và đăng nhập bằng email + mật khẩu vì không có MSSV. Bổ sung nhánh Lecturer cho POST /api/auth/login: đúng một trong studentId hoặc email cùng password. Email được trim/lowercase để tra account có role LECTURER; thiếu account/sai mật khẩu/không có LECTURER/trạng thái không ACTIVE trả cùng lỗi xác thực. Student vẫn dùng MSSV. Không đổi OAuth, web/mobile delivery, CSRF hoặc session policy. Credential ban đầu chỉ lưu Argon2 hash; API không trả mật khẩu/hash. Yêu cầu và AC Student-only ở baseline không cấm nhánh Lecturer được duyệt này.
