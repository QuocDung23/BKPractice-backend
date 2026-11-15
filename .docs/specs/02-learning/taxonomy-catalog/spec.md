# LRN-010 Danh mục chủ đề (Topic Catalog)

## Trạng thái

Approved

Phiên bản `1.0`. Chủ sở hữu sản phẩm phê duyệt ngày `2026-11-15` và yêu cầu triển khai cùng ngày.
Các quyết định được duyệt cùng đặc tả:

1. Danh mục ban đầu được nạp bằng **seed script** `seed:learning:taxonomy`, không dùng migration.
2. Danh mục ban đầu gồm 10 Topic: Mảng, Sắp xếp, Chuỗi, OOP, Đồ thị, Cấu trúc cây, Quy hoạch động,
   Đệ quy, Tìm kiếm nhị phân, Ngăn xếp/Hàng đợi.
3. v1 chỉ có `GET /api/topics`; **không** có endpoint cho Tag.
4. Endpoint yêu cầu người dùng đã xác thực, không yêu cầu mã quyền riêng.

Giá trị hợp lệ: `Proposed` | `Approved` | `Implemented` | `Verified`

## Mục tiêu

Cho người dùng đã xác thực đọc được danh mục Topic mà Learning sở hữu, để giao diện luyện tập render
bộ lọc Problem theo Topic bằng dữ liệu thật. Tính năng chỉ đọc: không tạo, sửa, xoá Topic; không thay
đổi Problem, Course, Progress hay bất kỳ state nào khác; không để lộ nội dung chưa công khai hay dữ
liệu judge.

## Tác nhân

- **Người dùng đã xác thực (STUDENT, LECTURER, ADMIN):** Đọc danh mục Topic. Không vai trò nào bị
  chặn riêng và không vai trò nào thấy thêm dữ liệu.
- **Khách chưa xác thực:** Không có quyền truy cập.
- **API Gateway:** Xác minh access token của BKPractice, loại bỏ header định danh do client gửi, đặt
  ngữ cảnh định danh/vai trò/quyền đã xác minh trước khi chuyển tiếp tới Learning.
- **Learning Service:** Chủ sở hữu bảng `topics` và là bên duy nhất trả danh mục.

## Bối cảnh

- Migration `1700000003000-InitialLearningSchema.ts` đã tạo bảng
  `topics ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "name" varchar(80) NOT NULL UNIQUE)`.
  Bảng không có trạng thái xuất bản, không có dấu xoá mềm, không có `created_by`.
- LRN-001 dùng Topic/Tag làm liên kết metadata của Problem nhưng không định nghĩa endpoint danh mục.
  Module `problems` đọc Topic qua `TopicTagReader` để kiểm tra `topicIds` và lấy tên Topic.
- Trước đặc tả này, không có endpoint, seed hay migration nào ghi dữ liệu vào bảng `topics`; vì vậy
  danh mục rỗng trên một cơ sở dữ liệu mới.
- Giao diện Practice cần danh sách Topic thật để lọc Problem. Không thể suy ra danh mục từ danh sách
  Problem đã tải vì mỗi trang chỉ chứa một phần Topic và không có catalog ổn định.
- Mã nguồn hiện tại là hành vi nền tảng, không phải bản triển khai của đặc tả này.

## Thuật ngữ

- **Topic:** Một dòng trong bảng `topics` của `bkpractice_learning`, gồm định danh UUID và tên duy
  nhất tối đa 80 ký tự.
- **Danh mục:** Toàn bộ các dòng `topics` hiện có, không phân trang.
- **Người gọi:** Người dùng đã xác thực thực hiện yêu cầu, được xác định bởi ngữ cảnh định danh tin
  cậy do Gateway đặt.

## Yêu cầu chức năng

- **LRN-010-FR-001 — Đọc danh mục:** Người dùng đã xác thực MUST có thể lấy danh mục Topic qua
  `GET /api/topics`.
- **LRN-010-FR-002 — Hình dạng tối thiểu:** Mỗi phần tử MUST chỉ gồm `id` (UUID dạng chuỗi) và `name`
  (chuỗi). Phản hồi MUST NOT chứa số lượng Problem, trạng thái, người tạo, dấu thời gian hay bất kỳ
  metadata nào khác.
- **LRN-010-FR-003 — Thứ tự xác định:** Danh mục MUST sắp theo `name` tăng dần bằng đúng biểu thức
  `ORDER BY "name" ASC` của cơ sở dữ liệu. Vì `name` là duy nhất, hai lần gọi trên cùng state MUST
  trả cùng thứ tự. Đặc tả không quy định thứ tự chữ cái cụ thể cho tiếng Việt; collation hiện hành của
  cơ sở dữ liệu quyết định và thứ tự đó phải ổn định.
- **LRN-010-FR-004 — Toàn bộ danh mục:** Phản hồi MUST chứa mọi Topic hiện có. Không phân trang,
  không tìm kiếm, không lọc theo Problem.
- **LRN-010-FR-005 — Không tham số:** Endpoint MUST NOT có tham số đường dẫn, không đọc tham số truy
  vấn và không đọc body. Nếu client gửi body cho `GET` thì body MUST bị bỏ qua. Tham số truy vấn
  không được hỗ trợ MUST bị từ chối bằng lỗi kiểm tra dữ liệu (`400`), không được bỏ qua im lặng.
- **LRN-010-FR-006 — Rỗng là thành công:** Khi bảng `topics` rỗng, phản hồi MUST là `200` với
  `items` rỗng, không phải lỗi.
- **LRN-010-FR-007 — Chỉ đọc:** Yêu cầu MUST NOT tạo, sửa hay xoá dòng nào; MUST NOT phát domain
  event; MUST NOT thay đổi state của Problem, Course, Progress hay Recommendation.
- **LRN-010-FR-008 — Danh mục ban đầu bằng seed:** Hệ thống MUST có script `seed:learning:taxonomy`
  nạp 10 Topic ở mục Trạng thái. Script MUST idempotent theo `name` và MUST NOT dùng migration để nạp
  dữ liệu.

## Quy tắc nghiệp vụ

```text
danh mục = SELECT id, name FROM topics ORDER BY name ASC
phản hồi = { items: [ { id, name }, ... ] }
```

- `name` duy nhất toàn bảng và tối đa 80 ký tự; ràng buộc do schema hiện có bảo đảm.
- v1 không có trạng thái xuất bản hay xoá mềm cho Topic: mọi dòng trong `topics` đều xuất hiện.
- Topic chưa gắn với Problem nào vẫn xuất hiện, vì danh mục là từ điển dùng cho bộ lọc.
- Tên tiếng Việt có dấu được trả nguyên vẹn; thứ tự do collation của cơ sở dữ liệu quyết định và phải
  ổn định giữa hai lần gọi.
- Seed chỉ thêm Topic còn thiếu; không đổi tên, không xoá Topic đã tồn tại.

## Quy tắc phân quyền

- Thao tác cần người dùng đã xác thực. Định danh lấy từ header Gateway tin cậy, không bao giờ từ tham
  số, body hay header do client đặt.
- Không cần mã quyền nào; không thêm quyền mới ở Identity.
- Mọi vai trò đã xác thực nhận cùng một danh mục; không có lọc theo vai trò.

## Đầu vào

- Ngữ cảnh định danh tin cậy của người gọi (do Gateway đặt).
- Không có tham số đường dẫn, tham số truy vấn hay body.

Route cụ thể thuộc `plan.md`.

## Đầu ra

```json
{
  "items": [{ "id": "0b0f2f4e-7f41-4a0e-9a5b-6f0d8d2c1a11", "name": "Mảng" }]
}
```

- `items` luôn có mặt; có thể rỗng.
- Không có nội dung đề, Test Case, harness, thông tin Problem, thông tin người dùng hay dữ liệu của
  service khác.

## Tình huống lỗi

| Trường hợp                                | Hành vi quan sát được                                         |
| ----------------------------------------- | ------------------------------------------------------------- |
| Thiếu hoặc sai xác thực                   | `401`; không trả dữ liệu                                      |
| Định danh tin cậy thiếu hoặc không hợp lệ | `401`; không trả dữ liệu                                      |
| Có tham số truy vấn không được hỗ trợ     | Lỗi kiểm tra dữ liệu (`400`); không trả danh mục              |
| Danh mục rỗng                             | `200` với `items: []`                                         |
| Lỗi hạ tầng khi đọc `topics`              | Lỗi máy chủ theo quy ước hiện có; không trả danh mục một phần |

LRN-010 không đưa vào cấu trúc lỗi mới.

## Tình huống biên

- Cơ sở dữ liệu chưa chạy seed: `items` rỗng, không phải lỗi.
- Chạy seed hai lần: số Topic không đổi.
- Seed chạy trên danh mục đã có Topic trùng tên: không tạo bản ghi mới, không đổi tên.
- Tên Topic tiếng Việt có dấu: giữ nguyên khi trả về.
- Hai Topic cùng tên: bị chặn bởi ràng buộc duy nhất của schema, không phải lỗi của endpoint.
- Người gọi đồng thời là `LECTURER` hoặc `ADMIN`: nhận cùng danh mục như `STUDENT`.

## Yêu cầu bảo mật

- **LRN-010-SR-001 — Định danh tin cậy:** Người gọi MUST được xác thực từ ngữ cảnh Gateway đã xác
  minh, không bao giờ từ dữ liệu client cung cấp.
- **LRN-010-SR-002 — Chỉ dữ liệu công khai:** Phản hồi MUST NOT chứa nội dung đề, Test Case,
  harness, trạng thái vòng đời Problem, người tạo hay thông tin tiến độ.
- **LRN-010-SR-003 — Cách ly service:** Learning MUST chỉ đọc `bkpractice_learning`; không truy vấn
  cơ sở dữ liệu của service khác.
- **LRN-010-SR-004 — Thất bại an toàn:** Ngữ cảnh thiếu hoặc mơ hồ thì từ chối; lỗi đọc dữ liệu
  không trả danh mục một phần.
- **LRN-010-SR-005 — Không log bí mật:** Log MUST NOT chứa token, cookie hay header Authorization.

## Tiêu chí nghiệm thu

- **LRN-010-AC-001:** Cho trước người chưa xác thực, khi gọi `GET /api/topics`, thì nhận `401` và
  không có danh mục.
- **LRN-010-AC-002:** Cho trước người dùng đã xác thực, khi gọi `GET /api/topics`, thì nhận `200`
  với `items` là mọi Topic hiện có, mỗi phần tử chỉ có `id` và `name`.
- **LRN-010-AC-003:** Cho trước danh mục có nhiều Topic, khi gọi hai lần, thì hai phản hồi giống hệt
  nhau và thứ tự phần tử khớp kết quả `ORDER BY "name" ASC` của cơ sở dữ liệu.
- **LRN-010-AC-004:** Cho trước bảng `topics` rỗng, khi gọi, thì nhận `200` với `items: []`.
- **LRN-010-AC-005:** Cho trước yêu cầu kèm tham số truy vấn không được hỗ trợ, khi kiểm tra, thì bị
  từ chối bằng lỗi kiểm tra dữ liệu.
- **LRN-010-AC-006:** Cho trước cơ sở dữ liệu đã chạy `seed:learning:taxonomy` hai lần, khi đọc danh
  mục, thì mọi Topic trong danh mục ban đầu đã duyệt đều có mặt đúng một lần, và số dòng `topics`
  không tăng thêm sau lần chạy thứ hai.
- **LRN-010-AC-007:** Cho trước một yêu cầu đọc danh mục, khi kiểm tra state, thì không có dòng
  `topics`, `problems` hay bảng nào khác bị thay đổi.
- **LRN-010-AC-008:** Cho trước phản hồi bất kỳ, khi kiểm tra, thì không chứa nội dung đề, Test Case,
  harness hay dữ liệu của service khác.

## Ngoài phạm vi

- Endpoint danh mục Tag (`GET /api/tags`) và mọi thay đổi cho Tag.
- Tạo, sửa, xoá, đổi tên hay gộp Topic qua API.
- Giao diện quản trị Topic.
- Số lượng Problem theo Topic, thống kê, tìm kiếm hay phân trang danh mục.
- Lọc danh mục theo vai trò, theo Course hay theo Problem hiển thị được.
- Thay đổi phản hồi của `/api/problems`, `/api/courses` hay route hiện có.
- Nạp danh mục bằng migration hoặc bằng dữ liệu mẫu trong test production.
- Đồng bộ danh mục sang service khác.

## Phụ thuộc

- [Kiến trúc Learning Service](../../../architecture/learning-service.md)
- [Quy tắc phụ thuộc](../../../architecture/dependency-rules.md)
- [ADR 0002](../../../adr/0002-revised-service-internal-architectures.md)
- [Ranh giới service](../../00-system/service-boundaries.md)
- [Vai trò và quyền](../../00-system/roles-permissions.md)
- [Chiến lược cơ sở dữ liệu](../../00-system/database-strategy.md)
- [Định nghĩa Hoàn thành](../../00-system/definition-of-done.md)
- [LRN-001 Quản lý Problem](../problems/spec.md): Topic/Tag là liên kết metadata của Problem.
- [ID-003 RBAC](../../01-identity/rbac/spec.md): header định danh tin cậy do Gateway đặt.

## Câu hỏi mở

Không còn. Các câu hỏi đã được chủ sở hữu sản phẩm chốt ngày `2026-11-15`:

1. **Nguồn dữ liệu ban đầu:** Seed script `seed:learning:taxonomy`, không migration.
2. **Danh mục ban đầu:** 10 Topic tại mục Trạng thái.
3. **Phạm vi endpoint:** Chỉ `GET /api/topics`; Tag ngoài phạm vi.
4. **Ai được đọc:** Mọi người dùng đã xác thực, không cần mã quyền.

## Lịch sử sửa đổi

| Ngày       | Phiên bản | Tác giả/Người review | Tóm tắt                                                                |
| ---------- | --------- | -------------------- | ---------------------------------------------------------------------- |
| 2026-11-15 | 1.0       | Chủ sở hữu sản phẩm  | Bản đầu tiên: đọc danh mục Topic, seed 10 Topic, chỉ `GET /api/topics` |
