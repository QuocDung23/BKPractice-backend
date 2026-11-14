# [ERR-001] Phản hồi lỗi HTTP chính xác và thống nhất toàn backend

## Trạng thái

Approved

Giá trị hợp lệ: `Proposed` | `Approved` | `Implemented` | `Verified`

## Mục tiêu

Mọi lỗi HTTP do backend BKPractice trả về MUST cho người đọc (sinh viên, giảng viên, admin, lập trình
viên frontend) biết **chuyện gì đã sai và cần làm gì tiếp**, thay vì các câu chung chung như
`Authentication failed`, `Forbidden`, `Invalid user request`, `Internal server error`. Mọi service và
Gateway dùng **cùng một định dạng** lỗi để frontend hiển thị và xử lý bằng một cách duy nhất.

## Tác nhân

- Sinh viên, giảng viên, admin (người đọc thông báo lỗi trên giao diện).
- Frontend web và mobile (đọc `code`/`message`/`details` để hiển thị và rẽ nhánh).
- Lập trình viên và người vận hành (dò lỗi bằng `requestId`).
- API Gateway, Identity, Learning, Submission, Community (nơi sinh ra lỗi). Judge không có API HTTP
  công khai nên không thuộc phạm vi.

## Bối cảnh

Hiện trạng đã khảo sát (2026-11-14):

- Không có bộ lỗi chung. Khoảng 13 `ExceptionFilter` riêng lẻ (6 ở Identity, 5 ở Learning) với hình dạng
  body khác nhau: có nơi chỉ `{ statusCode, message }`, có nơi thêm `code`, `issues`, hoặc `message` là mảng.
- Submission, Community và Gateway không có filter nào; chúng ném `HttpException` mặc định của Nest.
- Message phần lớn là tiếng Anh, ngắn và không nêu nguyên nhân: `Authentication failed`,
  `Invalid profile request`, `Account conflict`, `Forbidden`, `Unable to process Quiz request`.
- Ví dụ thực tế gây ra yêu cầu này: đăng nhập sai nhận `401 {"message":"Authentication failed"}` trong khi
  nguyên nhân thật là tài khoản đã bị xóa mềm (`deleted_at`), người dùng không có cách nào biết.
- `ValidationPipe` toàn cục (`libs/common/src/bootstrap.ts`) trả `message` là mảng chuỗi tiếng Anh theo
  `class-validator`, không nói rõ trường nào.
- Frontend hiện chỉ rẽ nhánh theo status `401` và theo chuỗi `Invalid CSRF token` (403). Đây là ràng buộc
  tương thích ngược, xem mục Tình huống biên.

### Xung đột với spec đã duyệt (cần quyết định tường minh của người có thẩm quyền)

`01-identity/authentication/spec.md` (ID-001) đang yêu cầu lỗi đăng nhập bằng mật khẩu phải **chung chung**
để chống dò tài khoản:

- Bảng "Tình huống lỗi": _"Mã số sinh viên không tồn tại hoặc mật khẩu sai → cùng một lỗi xác thực chung
  chung"_.
- `ID-001-AC-003` và ghi chú sửa đổi nhánh Lecturer (_"thiếu account/sai mật khẩu/không có LECTURER/trạng
  thái không ACTIVE trả cùng lỗi xác thực"_).

Chủ sở hữu yêu cầu đã quyết định (2026-11-14): **riêng `POST /api/auth/login` báo chi tiết từng lý do**,
chấp nhận đánh đổi là lộ việc một MSSV/email có tồn tại hay không, và đã phê duyệt spec này kèm ngoại lệ đó
(FR-007). Vì vậy, **chỉ đối với `POST /api/auth/login`**, FR-007 có hiệu lực thay cho dòng "MSSV không tồn tại
hoặc mật khẩu sai", `ID-001-AC-003` và ghi chú nhánh Lecturer của ID-001. Dòng ghi nhận tương ứng trong
`01-identity/authentication/spec.md` (Lịch sử sửa đổi) sẽ được thêm khi chủ sở hữu xác nhận việc sửa file đó.
Các luồng khác của ID-001 (Microsoft, refresh, quên mật khẩu) **giữ nguyên nguyên tắc không tiết lộ**.

## Yêu cầu chức năng

- **FR-001 — Định dạng lỗi chung:** Mọi phản hồi lỗi HTTP (status 4xx/5xx) của Gateway, Identity, Learning,
  Submission và Community MUST có body JSON dạng:

  ```json
  {
    "statusCode": 400,
    "code": "VALIDATION_FAILED",
    "message": "Dữ liệu gửi lên chưa hợp lệ: 2 trường cần sửa.",
    "details": [
      { "field": "password", "code": "TOO_SHORT", "message": "Mật khẩu phải có ít nhất 8 ký tự." }
    ],
    "requestId": "b7d1c0de-0000-4000-8000-000000000000"
  }
  ```

  `statusCode` (số, trùng HTTP status), `code` (chuỗi UPPER_SNAKE ổn định), `message` (chuỗi), `requestId`
  là bắt buộc. `details` là tùy chọn (mảng, có khi lỗi gắn với trường hoặc dòng cụ thể).

- **FR-002 — `code` ổn định:** `code` MUST là định danh máy đọc được, không đổi giữa các phiên bản, duy nhất
  cho từng nguyên nhân (danh mục ở mục Đầu ra). Frontend rẽ nhánh theo `code`, không theo `message`.
- **FR-003 — `message` chính xác, tiếng Việt:** `message` MUST nêu nguyên nhân cụ thể và, khi có, hướng xử lý
  ("Tài khoản đã bị xóa. Liên hệ quản trị viên để được khôi phục."). `message` MUST là chuỗi (không bao giờ
  là mảng); danh sách chi tiết đi vào `details`.
- **FR-004 — Lỗi kiểm tra dữ liệu:** Request sai định dạng/thiếu trường/trường lạ MUST trả `400
VALIDATION_FAILED` với `details` liệt kê từng trường vi phạm: tên trường, `code` ràng buộc (ví dụ
  `REQUIRED`, `TOO_SHORT`, `TOO_LONG`, `INVALID_FORMAT`, `NOT_ALLOWED`) và thông báo tiếng Việt.
- **FR-005 — Lỗi không lường trước:** Lỗi 5xx chưa phân loại MUST trả `500 INTERNAL_ERROR` với message nêu
  rõ là lỗi hệ thống và kèm `requestId` để báo người vận hành. Body MUST NOT chứa stack trace, câu SQL, tên
  bảng/cột, đường dẫn file, token, hash, bí mật hay giá trị cấu hình. Chi tiết đầy đủ chỉ ghi vào log phía
  server, gắn cùng `requestId`.
- **FR-006 — Phụ thuộc không khả dụng:** Khi một dịch vụ hoặc thành phần mà request cần (Gateway tới service,
  service tới DB/Redis/RabbitMQ/Learning nội bộ) không phản hồi, hệ thống MUST trả `502`/`503` với `code`
  nêu đúng loại sự cố (`UPSTREAM_UNAVAILABLE`, `DEPENDENCY_UNAVAILABLE`) và message cho biết đang thiếu thành
  phần nào ở mức tên logic (ví dụ "dịch vụ Identity"), không nêu host/port/chuỗi kết nối.
- **FR-007 — Đăng nhập bằng mật khẩu báo chi tiết (ngoại lệ có chủ đích):** `POST /api/auth/login` MUST phân
  biệt các lý do sau bằng `code`, status và message riêng:

  | `code`                      | Status | Khi nào                                                                                                        |
  | --------------------------- | ------ | -------------------------------------------------------------------------------------------------------------- |
  | `AUTH_ACCOUNT_NOT_FOUND`    | 401    | Không có tài khoản nào khớp MSSV/email (kể cả khi email là tài khoản hệ thống, vốn không đăng nhập bằng email) |
  | `AUTH_WRONG_PASSWORD`       | 401    | Có đúng một tài khoản, mật khẩu sai                                                                            |
  | `AUTH_IDENTIFIER_AMBIGUOUS` | 409    | MSSV/email khớp nhiều hơn một tài khoản                                                                        |
  | `AUTH_ACCOUNT_DELETED`      | 403    | Tài khoản đã bị xóa mềm                                                                                        |
  | `AUTH_ACCOUNT_LOCKED`       | 403    | Tài khoản `LOCKED`                                                                                             |
  | `AUTH_ACCOUNT_PENDING`      | 403    | Tài khoản `PENDING` (chưa kích hoạt)                                                                           |

  Các lý do về **trạng thái tài khoản** (`DELETED`, `LOCKED`, `PENDING`) MUST chỉ được báo **sau khi mật khẩu
  đã được xác minh đúng**; mật khẩu sai luôn nhận `AUTH_WRONG_PASSWORD` bất kể trạng thái. Lý do: chỉ người
  nắm mật khẩu đúng mới biết trạng thái, giảm bề mặt dò tài khoản so với báo trạng thái cho mọi người.

- **FR-008 — Giữ chống dò ở các luồng khác:** Đăng nhập Microsoft, refresh phiên, quên mật khẩu (send-otp,
  verify-otp, reset) và đăng xuất MUST giữ nguyên nguyên tắc không tiết lộ của ID-001/ID-007, nhưng vẫn dùng
  định dạng FR-001 với `code` và message tiếng Việt rõ nghĩa ở mức cho phép (ví dụ `AUTH_SESSION_INVALID`:
  "Phiên đăng nhập không hợp lệ hoặc đã hết hạn, hãy đăng nhập lại.").
- **FR-009 — Lỗi nghiệp vụ có tên riêng:** Mỗi lỗi nghiệp vụ hiện có (RBAC, quản lý user, hồ sơ, import tài
  khoản, khóa học, bài tập, quiz, tiến độ, submission, bài viết, bình luận) MUST có `code` riêng và message
  nêu đối tượng/điều kiện vi phạm, thay cho các message chung hiện nay. Mỗi service sở hữu danh mục `code`
  nghiệp vụ của mình.
- **FR-010 — Lỗi xung đột dữ liệu:** Vi phạm ràng buộc duy nhất (trùng email, MSSV, slug…) MUST trả `409` với
  `code` nêu loại trùng (ví dụ `USER_EMAIL_ALREADY_EXISTS`) và `details.field`; không lộ tên ràng buộc/bảng.
- **FR-011 — Gateway giữ nguyên lỗi từ service:** Khi Gateway chuyển tiếp một phản hồi lỗi từ service, nó MUST
  giữ nguyên body (đã đúng FR-001). Lỗi do chính Gateway sinh ra (thiếu/hết hạn token, sai CSRF, origin không
  tin cậy, đường dẫn không an toàn, bị throttle, không có route, upstream lỗi) MUST theo FR-001 với `code` riêng.
- **FR-012 — `requestId`:** `requestId` MUST là giá trị `x-request-id` do Gateway cấp (hoặc sinh mới nếu thiếu
  trong chế độ chạy trực tiếp một service) và MUST xuất hiện cả trong body lỗi lẫn log phía server.
- **FR-013 — Tài liệu API:** Swagger của mọi service MUST mô tả schema lỗi chung và liệt kê `code` có thể trả
  của từng route công khai quan trọng.

## Quy tắc nghiệp vụ

- Không bao giờ đưa vào body lỗi: mật khẩu, hash, token, OTP, API key, bí mật Microsoft, chuỗi kết nối, câu
  SQL, stack trace (ID-001-AC-*, ID-007-AC-006 tiếp tục áp dụng).
- Một nguyên nhân thật chỉ tương ứng một `code`; một `code` không được dùng cho nguyên nhân khác.
- Đổi status HTTP của một lỗi đã tồn tại chỉ được làm khi spec này nêu rõ (FR-007); các lỗi khác giữ nguyên
  status hiện tại, chỉ bổ sung `code`, `message`, `requestId`, `details`.
- Danh mục `code` chung (do Gateway/hạ tầng sinh): `VALIDATION_FAILED`, `INTERNAL_ERROR`, `NOT_FOUND`,
  `METHOD_NOT_ALLOWED`, `TOO_MANY_REQUESTS`, `UPSTREAM_UNAVAILABLE`, `DEPENDENCY_UNAVAILABLE`,
  `UNSAFE_REQUEST_PATH`, `ORIGIN_NOT_ALLOWED`, `CSRF_TOKEN_INVALID`, `AUTH_TOKEN_MISSING`,
  `AUTH_TOKEN_INVALID_OR_EXPIRED`, `FORBIDDEN_PERMISSION`. Danh mục `code` nghiệp vụ theo service nằm trong
  `plan.md` và được bổ sung trong code, mỗi `code` mới phải kèm test.

## Quy tắc phân quyền

Không đổi bất kỳ quy tắc phân quyền nào. Lỗi `403` do thiếu quyền MUST nêu **quyền hoặc vai trò còn thiếu**
nếu thông tin đó đã nằm trong tài liệu `roles-permissions.md` (ví dụ "Cần quyền `USER_MANAGE`"), nhưng
MUST NOT tiết lộ dữ liệu của tài nguyên mà người gọi không được xem (ví dụ không nói "bài viết của người X").

## Đầu vào

Không thêm đầu vào mới. Mọi route hiện có giữ nguyên request.

## Đầu ra

Định dạng ở FR-001. Bảng ánh xạ ví dụ (danh mục đầy đủ do `plan.md` chốt):

| Tình huống                               | Status | `code`                      | `message` (ví dụ)                                                             |
| ---------------------------------------- | ------ | --------------------------- | ----------------------------------------------------------------------------- |
| Login: không có tài khoản                | 401    | `AUTH_ACCOUNT_NOT_FOUND`    | Không tìm thấy tài khoản với MSSV/email này.                                  |
| Login: sai mật khẩu                      | 401    | `AUTH_WRONG_PASSWORD`       | Mật khẩu không đúng.                                                          |
| Login: tài khoản đã xóa (mật khẩu đúng)  | 403    | `AUTH_ACCOUNT_DELETED`      | Tài khoản này đã bị xóa. Liên hệ quản trị viên để được khôi phục.             |
| Login: tài khoản bị khóa (mật khẩu đúng) | 403    | `AUTH_ACCOUNT_LOCKED`       | Tài khoản đang bị khóa. Liên hệ quản trị viên.                                |
| Thiếu quyền                              | 403    | `FORBIDDEN_PERMISSION`      | Bạn cần quyền `USER_MANAGE` để thực hiện thao tác này.                        |
| Gán vai trò không tồn tại                | 400    | `RBAC_ROLE_INVALID`         | Vai trò `XYZ` không tồn tại.                                                  |
| Gỡ admin cuối cùng                       | 409    | `RBAC_LAST_ADMIN`           | Không thể gỡ quyền quản trị viên cuối cùng của hệ thống.                      |
| Tạo user trùng email                     | 409    | `USER_EMAIL_ALREADY_EXISTS` | Email `a@b.c` đã được dùng bởi một tài khoản khác.                            |
| Sai CSRF                                 | 403    | `CSRF_TOKEN_INVALID`        | Phiên bảo mật hết hạn. Tải lại trang rồi thử lại.                             |
| Service không phản hồi                   | 502    | `UPSTREAM_UNAVAILABLE`      | Không kết nối được tới dịch vụ Learning. Thử lại sau.                         |
| Lỗi không lường trước                    | 500    | `INTERNAL_ERROR`            | Hệ thống gặp lỗi. Vui lòng báo mã tham chiếu `<requestId>` cho quản trị viên. |

## Tình huống lỗi

| Trường hợp                                             | Hành vi quan sát được                                                                     |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Exception không thuộc loại nào đã biết                 | `500 INTERNAL_ERROR` (FR-005); chi tiết chỉ nằm trong log kèm `requestId`.                |
| Response từ service không phải JSON hoặc sai định dạng | Gateway trả `502 UPSTREAM_INVALID_RESPONSE`, không chuyển tiếp thân nguyên văn.           |
| Body request không phải JSON hợp lệ                    | `400 INVALID_JSON` kèm vị trí lỗi nếu parser cung cấp.                                    |
| Thiếu `x-request-id` khi gọi trực tiếp một service     | Service sinh `requestId` mới, vẫn trả đúng FR-001.                                        |
| Nhiều lỗi kiểm tra dữ liệu cùng lúc                    | Trả toàn bộ trong `details`, không dừng ở lỗi đầu tiên.                                   |
| Lỗi import tài khoản theo dòng                         | Giữ `issues` hiện có (row, field, code) và đưa vào `details`, bổ sung message tiếng Việt. |

## Tình huống biên

- **Tương thích frontend (ràng buộc cứng):** frontend hiện nhận diện 403 CSRF bằng chuỗi `Invalid CSRF token`
  và 401 bằng status. Trước khi backend đổi message CSRF, frontend MUST được cập nhật để nhận diện bằng
  `code === "CSRF_TOKEN_INVALID"` (chấp nhận cả `code` mới lẫn chuỗi cũ trong giai đoạn chuyển tiếp). Việc này
  thuộc repo frontend, là một PR riêng, nằm ngoài spec này nhưng là điều kiện triển khai (xem Phụ thuộc).
- `message` đổi từ mảng sang chuỗi ở lỗi kiểm tra dữ liệu: mọi nơi đọc `message` như mảng MUST chuyển sang
  `details`. Khảo sát hiện chỉ thấy frontend dùng status, cần xác nhận lại khi triển khai.
- Lỗi do Nest sinh ra cho route không tồn tại (`404`), method sai (`405`), payload quá lớn (`413`) cũng MUST
  theo FR-001.
- Tên người dùng, email, MSSV được phép xuất hiện trong `message` khi đó chính là dữ liệu người gọi vừa gửi
  lên (ví dụ báo trùng email họ vừa nhập), nhưng MUST NOT chứa dữ liệu của người khác.

## Tiêu chí nghiệm thu

- **ERR-001-AC-001:** Cho trước bất kỳ route nào của 5 service/Gateway, khi nó trả status ≥ 400, thì body có
  đủ `statusCode`, `code`, `message` (chuỗi), `requestId` và khớp schema chung.
- **ERR-001-AC-002:** Cho trước `POST /api/auth/login` với MSSV không tồn tại, thì nhận `401
AUTH_ACCOUNT_NOT_FOUND`; với mật khẩu sai, thì nhận `401 AUTH_WRONG_PASSWORD`.
- **ERR-001-AC-003:** Cho trước tài khoản đã xóa mềm và mật khẩu **đúng**, thì nhận `403 AUTH_ACCOUNT_DELETED`;
  với mật khẩu **sai**, thì vẫn nhận `401 AUTH_WRONG_PASSWORD` (không lộ trạng thái).
- **ERR-001-AC-004:** Cho trước tài khoản `LOCKED` hoặc `PENDING` và mật khẩu đúng, thì nhận `403` với `code`
  tương ứng và không token nào được phát hành.
- **ERR-001-AC-005:** Cho trước request đăng nhập sai MSSV khớp nhiều tài khoản, thì nhận `409
AUTH_IDENTIFIER_AMBIGUOUS`.
- **ERR-001-AC-006:** Cho trước body đăng ký/đổi mật khẩu có hai trường sai, thì nhận `400
VALIDATION_FAILED` với `details` gồm cả hai trường, mỗi mục có `field`, `code` và message tiếng Việt.
- **ERR-001-AC-007:** Cho trước lỗi không lường trước (ví dụ DB ngắt kết nối giữa chừng), thì nhận `500` hoặc
  `503` đúng FR-005/FR-006 và body không chứa chuỗi `SELECT`, `at `, đường dẫn file hay chuỗi kết nối.
- **ERR-001-AC-008:** Cho trước luồng Microsoft, refresh, quên mật khẩu với đầu vào sai, thì phản hồi vẫn
  không tiết lộ tài khoản có tồn tại hay không (FR-008) và vẫn đúng định dạng FR-001.
- **ERR-001-AC-009:** Cho trước một lỗi do service sinh ra đi qua Gateway, thì client nhận đúng body của
  service (không bị Gateway bọc lại hay làm mất `code`).
- **ERR-001-AC-010:** Cho trước một vi phạm duy nhất ở DB (email trùng), thì nhận `409` với `code` trùng loại
  và body không chứa tên constraint hay bảng.
- **ERR-001-AC-011:** Cho trước một `requestId` trong body lỗi, khi tra log của service, thì tìm thấy dòng log
  lỗi với cùng `requestId` (log không chứa dữ liệu bị cấm ở Quy tắc nghiệp vụ).
- **ERR-001-AC-012:** Swagger của mỗi service mô tả schema lỗi chung.

## Ngoài phạm vi

- Thay đổi quy tắc phân quyền, xác thực, throttling, thời hạn token hay chính sách mật khẩu.
- Phản hồi lỗi của Judge qua RabbitMQ và payload kết quả chấm; lỗi Socket.IO/realtime.
- Đa ngôn ngữ (i18n) của message; spec này chỉ tiếng Việt. Frontend có thể ánh xạ `code` sang ngôn ngữ khác.
- Cập nhật giao diện frontend, màn hình lỗi, thông báo toast (repo `bkpractice-frontend`, PR riêng).
- Sửa spec ID-001 và các spec khác (việc của người có thẩm quyền, xem mục Bối cảnh).
- Tự động khôi phục tài khoản đã xóa; thay đổi chính sách xóa mềm.
- Chống dò tài khoản bằng cơ chế khác (CAPTCHA, khóa tạm theo số lần sai) cho đăng nhập: chỉ giữ throttling
  hiện có (xem Câu hỏi mở).

## Phụ thuộc

- `01-identity/authentication/spec.md` (ID-001): xung đột FR-007, cần phê duyệt sửa đổi.
- `01-identity/password-reset/spec.md` (ID-007): giữ nguyên nguyên tắc không tiết lộ (FR-008).
- `00-system/roles-permissions.md`: tên quyền/vai trò dùng trong lỗi 403.
- `00-system/service-boundaries.md`, `.docs/architecture/dependency-rules.md`, ADR 0002: ranh giới nơi đặt
  mã dùng chung.
- Repo `bkpractice-frontend`: PR riêng, phải được phát hành **trước hoặc cùng lúc** để nhận diện CSRF theo
  `code` và hiển thị `message` từ backend.

## Câu hỏi mở

Không còn. Các câu hỏi ban đầu đã được chốt ngày 2026-11-14 (chủ sở hữu ủy quyền Claude duyệt, chấp nhận
đề xuất; có thể đổi bằng một bản sửa đổi spec):

1. **Throttling đăng nhập:** giữ nguyên mức hiện tại ở Gateway, không siết thêm trong đợt này; ghi nhận rủi ro
   dò tài khoản đã được chấp nhận.
2. **Thứ tự kiểm tra trạng thái:** chỉ báo `DELETED/LOCKED/PENDING` sau khi mật khẩu đúng (đúng FR-007).
3. **Ngôn ngữ `message`:** chỉ tiếng Việt; không thêm `messageEn`. Frontend dùng `code` nếu cần đa ngôn ngữ.
4. **Tên dịch vụ trong lỗi 502/503:** chấp nhận dùng tên logic ("dịch vụ Identity"), không nêu host/port.
5. **Status tài khoản bị xóa/khóa/chưa kích hoạt:** `403`. Phải kiểm tra lại khi triển khai rằng frontend
   không có nhánh nào khác dựa vào `403` ở màn hình đăng nhập (ngoài CSRF, xem Tình huống biên).
6. **Tiền tố `code` nghiệp vụ theo module** (`RBAC_`, `USER_`, `COURSE_`, `QUIZ_`...): chấp nhận.

## Lịch sử sửa đổi

| Ngày       | Phiên bản | Tác giả/Người review                        | Tóm tắt                                                                                           |
| ---------- | --------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 2026-11-14 | 0.1       | Claude (đề xuất) / chủ repo (chờ duyệt)     | Đề xuất ban đầu. Chủ sở hữu chọn báo chi tiết lý do ở login (FR-007).                             |
| 2026-11-14 | 1.0       | Chủ sở hữu sản phẩm (ủy quyền Claude duyệt) | Chốt 6 câu hỏi mở theo đề xuất; trạng thái chuyển `Approved`. ID-001 chưa được sửa, chờ xác nhận. |

> `spec.md` mô tả CÁI GÌ. Chi tiết thư mục, class và thứ tự thực thi thuộc về `plan.md`.
