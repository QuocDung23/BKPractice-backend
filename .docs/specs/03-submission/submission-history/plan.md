# SUB-003 Kế hoạch triển khai

## Trạng thái

**Approved — 2026-09-30, chủ sở hữu sản phẩm phê duyệt trong hội thoại.** Đây là kế hoạch triển
khai tương lai; chưa có task mã nguồn nào được thực hiện.

## Đặc tả liên quan

- [`./spec.md`](./spec.md) — SUB-003 Lịch sử nộp bài (Submission History), phiên bản 1.0,
  ngày 2026-09-30
- Trạng thái spec dùng cho kế hoạch: **`Approved`**
- Cùng nhóm: [`../run-code/spec.md`](../run-code/spec.md),
  [`../submit-code/spec.md`](../submit-code/spec.md),
  [`../realtime-result/spec.md`](../realtime-result/spec.md)

## Service đích

Service: **Submission**

Lịch sử nằm trong cùng service với bản ghi. Tách nó ra sẽ tạo một service mà không có lý do nghiệp vụ,
và SUB-003 ghi rõ ở mục Ngoài phạm vi rằng không có microservice lịch sử riêng.

## Kiến trúc service bắt buộc

Kiến trúc: **Clean Architecture + Event-Driven Architecture**

Kế hoạch này không đổi kiến trúc. Nó chỉ dùng đúng ba tầng đã có: controller cho truyền tải, use case
cho truy vấn, repository port cho lưu trữ. Không có phần tử nào của SUB-003 là event-driven, vì
đọc lịch sử không phát sự kiện nào (SUB-003-SR-011).

`submission-service.md` đã nêu tên `ListHistory` use case trong danh sách nên làm, nên kế hoạch bám
đúng tên đó.

## Ảnh hưởng tới mã nguồn hiện có

| Tệp hiện có                                         | Vấn đề cần xử lý                                                                                                                                               |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `modules/submissions/submissions.service.ts`        | `list()` trả **thẳng entity kèm quan hệ `result`**, nên `stdout` và `stderr` từ Test Case ẩn bị trả ra. Không có phân trang, không có bộ lọc, `take: 100` cứng |
| `modules/submissions/submissions.service.ts`        | `get()` cũng trả thẳng entity kèm `result`, cùng một vấn đề                                                                                                    |
| `modules/submissions/submissions.controller.ts`     | `GET /api/submissions` không có query; `GET /api/submissions/:id` dùng khoá chính database                                                                     |
| `modules/submissions/entities/submission.entity.ts` | Tra cứu chi tiết bằng khoá chính `id`, trái với SUB-003-FR-008                                                                                                 |

Rủi ro an toàn cần xử lý trước tiên: **`stdout` và `stderr` đang được trả cho người học qua cả hai
route**. Đây là rủi ro rò rỉ dữ liệu ẩn đang tồn tại trong mã hiện tại, không phải một yêu cầu mới.

Hành vi phải giữ tương thích:

- Đường dẫn `GET /api/submissions` và `GET /api/submissions/:id` không đổi.
- Gateway đã proxy tiền tố `/api/submissions`.
- Trường dữ liệu trả về phải chỉ **thêm** chi tiết, không được **xoá** trường mà client hiện dùng,
  trừ `stdout`/`stderr` vì chúng bị loại có chủ đích.

## Thay đổi ở tầng domain

- `SubmissionHistoryFilter` — giá trị miền cho bộ lọc: loại bản ghi tuỳ chọn, `problemId` tuỳ chọn.
- `HistoryCursor` — cặp `createdAt` và `publicId` dùng làm khoá phá vỡ thứ tự. Hai giá trị phải đi cùng nhau
  (SUB-003-FR-006).
- `HistoryPage<T>` — một trang kết quả kèm tổng số bản ghi khớp bộ lọc, mốc thời gian của bản ghi
  cuối trang và khoá phá vỡ thứ tự.
- `matchesFilter(record, filter)` — bất biến lọc phía domain, để điều kiện lọc không bị rò rỉ xuống
  truy vấn SQL với các điều kiện khác nhau ở từng lớp truyền tải.
- Không thay đổi aggregate. Lịch sử là chế độ chỉ đọc, nên không thêm quy tắc chuyển trạng thái nào.

V1 không thêm lọc trạng thái/thời gian, không đếm attempt và không xóa tự động.

## Tầng application / Use case

`modules/submissions/list-submission-history.use-case.ts`:

- `ListSubmissionHistoryUseCase.execute({ userId, filter, cursor, limit })` trả về `HistoryPage`.
  Chủ sở hữu lấy từ tham số đã được xác minh ở tầng truyền tải, không lấy từ bộ lọc.

`modules/submissions/get-submission-detail.use-case.ts`:

- `GetSubmissionDetailUseCase.execute({ userId, publicId })` trả về chi tiết đã ánh xạ, hoặc báo
  không tìm thấy khi bản ghi không tồn tại **hoặc** không thuộc sở hữu (SUB-003-FR-020, SR-003).

Điểm quan trọng: cả hai use case phải **không** trả entity TypeORM. Việc ánh xạ sang hình dạng trả về
được phê duyệt nằm ở tầng application, vì danh sách trường cho phép là một quyết định của phía
đọc chứ không phải của schema lưu trữ.

Các port:

| Port                       | Phục vụ yêu cầu                        |
| -------------------------- | -------------------------------------- |
| `SubmissionRepositoryPort` | FR-001, FR-004, FR-005, FR-006, FR-020 |

Không cần port khác. Lịch sử không gọi service nào khác (SUB-003-FR-018).

## Lưu trữ

`SubmissionRepositoryPort` bổ sung:

- `listByOwner(ownerId, filter, cursor, limit, total)` — lọc theo chủ sở hữu **trước**, áp bộ lọc
  theo loại và Problem, sắp xếp `createdAt DESC, publicId DESC`, rồi phân trang bằng điều kiện con trỏ.
- `findByPublicIdAndOwner(publicId, ownerId)` — tra cứu chi tiết; alias UUID khoá chính cũ chỉ được
  dùng khi không tìm thấy publicId và vẫn phải kèm `ownerId`.

Nguyên tắc bắt buộc cho câu truy vấn danh sách:

1. `ownerId` là điều kiện bắt buộc và không bao giờ nằm trong nhánh tuỳ chọn.
2. Bộ lọc và con trỏ chỉ có thể **thu hẹp** tập kết quả. Không có tham số nào mở rộng nó.
3. Điều kiện con trỏ là một so sánh ghép: `created_at < $cursor OR (created_at = $cursor AND public_id <
$cursorId)`. Tách riêng hai điều kiện sẽ bỏ sót hoặc lặp bản ghi khi nhiều bản ghi trùng mốc
   thời gian.

Về tổng số bản ghi: SUB-003-FR-004 yêu cầu trả về tổng số. Với tập bản ghi lớn, một truy vấn `COUNT`
riêng là chi phí chấp nhận được vì lịch sử là dữ liệu cá nhân, không phải truy vấn công khai theo
người dùng. Trả `total` chính xác và `totalPages = ceil(total / limit)`.

## Thay đổi cơ sở dữ liệu

Phân trang bằng con trỏ theo `(created_at, public_id)` với điều kiện sở hữu cần một chỉ mục phù hợp để không
quét toàn bảng khi lịch sử dài.

| Thay đổi | Chi tiết                                                                                      |
| -------- | --------------------------------------------------------------------------------------------- |
| Index    | `IDX_submissions_owner_created` trên `submissions (user_id, created_at DESC, public_id DESC)` |
| Bảng     | Không thêm bảng                                                                               |
| Cột      | Thêm `public_id` UUID UNIQUE NOT NULL cho bản ghi mới và cũ                                   |

Vì sao thêm index: truy vấn hiện tại chỉ có `IDX_submissions_user_id`, nên Postgres vẫn phải sắp xếp
mọi bản ghi của một người học rồi mới cắt trang. Với lịch sử dài, đó là chi phí không chấp nhận được
mỗi lần lật trang.

Index `IDX_submissions_problem_id` hiện có vẫn dùng được cho bộ lọc Problem khi không phân trang, và
không cần thay đổi.

## Migration

- Tệp: `apps/submission-service/src/database/migrations/<timestamp>-AddSubmissionPublicIdAndIndex.ts`
- Lệnh sinh: `pnpm migration:generate:submission`
- `up`: thêm `public_id` nullable với default `gen_random_uuid()`, backfill bản ghi cũ bằng UUID
  mới khác `id`, đặt `NOT NULL` và `UNIQUE`, rồi tạo index `(user_id, created_at DESC, public_id DESC)`.
- `down`: `DROP INDEX "IDX_submissions_owner_created"`
- `down` không được xoá `public_id` khi API đã phát ID công khai; rollback cần bảo toàn mapping
  hoặc kế hoạch dữ liệu riêng.
- Migration `1700000001000-InitialSubmissionSchema` không được sửa; `synchronize` tiếp tục tắt.
- Migration này tạo index trên bảng đang có dữ liệu, nên cần chạy ngoài giờ cao điểm.

## API

| Route                        | Method | Mã thành công | Ghi chú                                      |
| ---------------------------- | ------ | ------------- | -------------------------------------------- |
| `/api/submissions`           | `GET`  | `200`         | Thêm query; đường dẫn giữ nguyên             |
| `/api/submissions/:publicId` | `GET`  | `200`         | Tham số giờ mang ý nghĩa định danh công khai |

Query của danh sách:

| Tham số     | Bắt buộc | Ý nghĩa                                        |
| ----------- | -------- | ---------------------------------------------- |
| `kind`      | Không    | Lọc theo loại bản ghi                          |
| `problemId` | Không    | Lọc theo Problem                               |
| `cursor`    | Không    | Mốc thời gian ISO của bản ghi cuối trang trước |
| `cursorId`  | Không    | Định danh phá vỡ thứ tự, đi cùng `cursor`      |
| `limit`     | Không    | Kích thước trang                               |

Phản hồi danh sách gồm: `items`, `total`, `totalPages`, và `nextCursor` gồm `createdAt` và
`publicId` khi còn trang kế tiếp. `nextCursor` là `null` ở trang cuối. `id` trong item là `publicId`.

Phản hồi chi tiết gồm các trường ở nhóm "Chi tiết" của bảng trong `spec.md`.

Danh sách không chứa output thô. Chi tiết chỉ trả `stdout`/`stderr` cho `kind=RUN`, không trả
output thô cho Submit.

## DTO / Kiểm tra dữ liệu

### Hình dạng trả về

Hai DTO tường minh, liệt kê trường:

- `SubmissionHistoryItemDto` — định danh công khai, loại, `problemId`, tiêu đề Problem nếu có,
  ngôn ngữ, kích thước mã nguồn, trạng thái, điểm, số Test Case đạt, tổng số Test Case, thời gian
  chạy, bộ nhớ, mốc thỡi gian.
- `SubmissionDetailDto` — các trường trên, cộng nội dung mã nguồn, thông báo lỗi biên dịch, thông
  báo lỗi runtime, thông tin chẩn đoán lỗi biên dịch và output thô chỉ khi `kind=RUN`.

**Không** có output thô cho Submit; DTO Run mới cho phép `stdout`/`stderr`. Không dùng `class-transformer`
`@Exclude` để che lại, vì cách đó phụ thuộc vào việc quên thêm một trường vào entity sau này
(SUB-003-SR-008). Danh sách cho phép phải là danh sách dương.

### Về tiêu đề Problem

SUB-003-FR-017 và FR-018 yêu cầu lịch sử đọc được khi Learning không sẵn sàng. Vì vậy Submission
**không** gọi Learning để lấy tiêu đề. Bản ghi lưu `problem_id`; tiêu đề hiển thị ở phiên bản này là
`null` nếu Submission chưa lưu một bản sao.

V1 không snapshot tiêu đề; giá trị `null` là contract được phê duyệt, không gọi Learning lúc đọc.

### Kiểm tra đầu vào

- `kind`: `@IsIn(['RUN', 'SUBMIT'])`, `@IsOptional()`.
- `problemId` dùng `@IsProblemId()` cho UUID v4 và v5 và `@IsOptional()`.
- `cursor`: `@IsISO8601()`, `@IsOptional()`.
- `cursorId`: `@IsUUID('4')`, `@IsOptional()`.
- `limit`: `@Type(() => Number)`, `@IsInt()`, `@Min(1)`, `@Max(MAX_PAGE_SIZE)`, `@IsOptional()`.

`cursor` và `cursorId` phải xuất hiện cùng nhau. Nếu chỉ có một, truy vấn phải bị từ chối bằng lỗi
kiểm tra dữ liệu, không âm thầm bỏ qua con trỏ và trả trang đầu, vì hành đó tạo ảo giác đang lật trang
đúng.

`DEFAULT_PAGE_SIZE = 20`, `MAX_PAGE_SIZE = 100`; `limit` ngoài 1..100 bị từ chối.

## Phân quyền

- Chủ sở hữu lấy từ header tin cậy `x-auth-user-id`. Controller không bao giờ nhận nó từ query.
- Danh sách không có tham số nào để chỉ định chủ sở hữu khác.
- Tra cứu chi tiết dùng định danh công khai. Khi bản ghi không tồn tại và khi bản ghi thuộc về người
  khác, phản hồi phải **giống hệt nhau** (SUB-003-SR-003).
- Không thêm quyền `submission:history:read`; mọi vai trò đã xác thực chỉ xem bản ghi của mình.
- Xác thực thực sự vẫn nằm ở Gateway. Submission chỉ kiểm tra sự hiện diện của ngữ cảnh tin cậy;
  tài khoản bị khoá không làm mất hiệu lực access token còn hạn theo
  [`ID-001`](../../01-identity/authentication/spec.md).

## Messaging / Sự kiện

N/A. Lịch sử là chế độ chỉ đọc (SUB-003-FR-015) và không phát, không tiêu thụ sự kiện nào
(SUB-003-SR-011).

## Realtime

N/A cho phần ghi. Phần đọc lịch sử là cơ chế kéo mà SUB-004 dựa vào làm bảo đảm, nên nó phải hoạt
động mà không cần bất kỳ phụ thuộc nào vào Redis (SUB-003-SR-013, AC-015).

## Adapter hạ tầng

Chỉ cần một adapter đã có: `TypeormSubmissionRepository`. Không thêm adapter mới.

Nếu tổng số bản ghi cần truy vấn riêng, dùng `COUNT` trong cùng repository, không thêm một lớp trừu
tượng đếm số.

## Xử lý lỗi

| Tình huống                           | Hành vi                                               |
| ------------------------------------ | ----------------------------------------------------- |
| Thiếu `x-auth-user-id`               | `401`                                                 |
| Token hết hạn sau khi khoá tài khoản | `401`; token cũ còn hạn tiếp tục hiệu lực theo ID-001 |
| Loại bản ghi không hợp lệ            | `400`, không bỏ qua bộ lọc âm thầm                    |
| Con trỏ thiếu một nửa                | `400`, không âm thầm trả trang đầu                    |
| `limit` vượt tối đa                  | `400`                                                 |
| Không có bản ghi nào                 | Danh sách rỗng với `total = 0`, mã `200`              |
| Định danh không tồn tại              | `404` với thông điệp chung                            |
| Định danh thuộc về người khác        | Phản hồi **giống hệt** trường hợp không tồn tại       |

Không đưa ra cấu trúc lỗi mới theo SUB-003. Dùng exception hiện có của NestJS.

## Bảo mật

| Mối đe doạ                            | Biện pháp                                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------------------- |
| Lộ `stdout`/`stderr` của Test Case ẩn | DTO dương phân nhánh theo `kind`; chỉ Run trả hai trường, danh sách không trả               |
| Đọc lịch sử người khác                | `ownerId` bắt buộc trong mọi truy vấn; tham số truy vấn không mở rộng phạm vi               |
| Dò sự tồn tại của bản ghi người khác  | Phản hồi 404 giống hệt cho cả hai trường hợp                                                |
| Lộ dữ liệu judge khác                 | Danh sách trường loại Test Case, kết quả mong đợi, harness, lệnh biên dịch, tham số sandbox |
| Dung lượng phản hồi bị thổi phồng     | `MAX_PAGE_SIZE` và cột `select` tường minh; không nạp quan hệ không cần thiết               |
| Nội dung không tin cậy                | Mã nguồn và thông báo lỗi là dữ liệu, không phải mã thực thi                                |
| Phụ thuộc Redis                       | Truy vấn chỉ dùng PostgreSQL                                                                |
| Ghi log                               | Không log mã nguồn; chỉ log định danh bản ghi và số lượng bản ghi trả về                    |

## Chiến lược kiểm thử

| Mã                             | Kịch bản                                                                                                              |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| FR-001, AC-001                 | Hai người học, mỗi người có bản ghi riêng → mỗi người chỉ thấy bản ghi của mình                                       |
| FR-002, AC-001                 | Bản ghi của cùng một người học gồm cả Run và Submit → mỗi bản ghi nêu rõ loại                                         |
| FR-003, AC-002                 | Lọc theo loại và theo Problem → tập trả về đúng bộ lọc, vẫn giới hạn trong sở hữu                                     |
| FR-004, AC-018                 | `limit` vượt tối đa → từ chối, phản hồi giữ kích thước đã phê duyệt                                                   |
| FR-005, FR-006, AC-003, AC-004 | Nhiều bản ghi trùng `created_at` → lật qua các trang không lặp và không bỏ sót; con trỏ ghép `createdAt` + `publicId` |
| AC-005                         | Thêm bản ghi mới giữa lúc lật trang → bản ghi cũ không bị bỏ sót hay lặp lại                                          |
| FR-006                         | `cursor` có mà không có `cursorId`, hoặc ngược lại → `400`                                                            |
| FR-007, AC-007                 | Chi tiết trả về đủ nhóm trường "Chi tiết"                                                                             |
| FR-011, SR-005, AC-008         | Submit không chứa output thô; Run có `stdout`/`stderr`; không trả dữ liệu judge ẩn                                    |
| FR-010, AC-010                 | Bản ghi chưa có phán quyết → trường kết quả là `null`, không phải `0`                                                 |
| FR-011, AC-011                 | Bản ghi `INTERNAL_ERROR` vẫn xuất hiện; xem lịch sử không phát sự kiện nào                                            |
| FR-019, AC-017                 | Khoá tài khoản không thu hồi token cũ; token hết hạn → `401`, không xoá dữ liệu                                       |
| FR-020, SR-003, AC-012         | Tra cứu bản ghi của người khác → phản hồi không cho phép phân biệt với trường hợp không tồn tại                       |
| SR-002, AC-013                 | Truyền tham số cố mở rộng phạm vi → không thu được bản ghi ngoài sở hữu                                               |
| FR-017, AC-014                 | Bản ghi của Problem đã bị gỡ → vẫn đọc được, kết quả không đổi                                                        |
| FR-018, AC-015                 | Redis dừng → lịch sử vẫn đọc được                                                                                     |
| FR-015, AC-020                 | Cố sửa hoặc xoá một bản ghi → thao tác không tồn tại trong phạm vi SUB-003                                            |

Ba kiểm thử quan trọng nhất là AC-008, AC-012 và AC-013, vì chúng bảo vệ dữ liệu ẩn và ranh giới sở
hữu, đều là điểm đang yếu trong mã hiện tại.

## Khả năng quan sát

- Log `debug` cho mỗi lần đọc lịch sử: loại bộ lọc, kích thước trang, số bản ghi trả về. Không log
  mã nguồn.
- Không log truy vấn SQL với tham số ràng buộc ở mức thông tin.
- Không thêm metric mới; nền tảng hiện tại chưa có hệ thống metric.

## Thứ tự triển khai

1. Thêm `public_id` UUID riêng, backfill dữ liệu cũ và index `(user_id, created_at DESC, public_id DESC)`.
2. Tạo `HistoryFilter`, `HistoryCursor`, `HistoryPage` và `matchesFilter` ở tầng domain.
3. Chạy `pnpm migration:run:submission` khi triển khai, không sửa migration cũ.
4. Bổ sung `listByOwner` và `findByPublicIdAndOwner` vào repository port và adapter.
5. Tạo `ListSubmissionHistoryUseCase` và `GetSubmissionDetailUseCase` với DTO dương.
6. Bỏ `relations: { result: true }` khỏi danh sách; chi tiết lấy result rồi ánh xạ dương theo kind.
7. Thêm query và kiểm tra dữ liệu vào controller.
8. Viết kiểm thử theo bảng ở mục Chiến lược kiểm thử.
9. Chạy `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build:submission`.

## Rủi ro

| Rủi ro                                                           | Biện pháp giảm thiểu                                                       |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `stdout`/`stderr` đang được trả ra ở cả hai route hiện tại       | Xử lý ở bước 5 và 6, sớm hơn các hạng mục khác                             |
| Con trỏ không ghép `createdAt` với `publicId` sẽ lặp hoặc bỏ sót | Cột ghép là bắt buộc; có kiểm thử trùng mốc thời gian                      |
| Bộ lọc và con trỏ bị truyền vào SQL không kiểm soát              | Giá trị lọc đi qua domain trước; câu truy vấn chỉ nhận giá trị đã kiểm tra |
| ID cũ đã dùng trong bookmark                                     | Tra cứu alias có điều kiện sở hữu; phản hồi luôn dùng public ID            |
| Tổng số chính xác tốn chi phí với lịch sử rất dài                | Index owner+cursor và theo dõi chi phí `COUNT` khi triển khai              |
| Không hiện tiêu đề Problem                                       | Trả `null` theo spec v1, không gọi Learning                                |
| Thêm index trên bảng lớn                                         | Chạy ngoài giờ cao điểm                                                    |

## Tuân thủ kiến trúc

- **Chiều phụ thuộc:** `controller → use case → domain port ← adapter`. Lịch sử không gọi thêm tầng
  nào.
- **Quyền sở hữu:** Submission sở hữu `submissions`. Lịch sử đọc dữ liệu của chính mình, không truy
  vấn cơ sở dữ liệu của Learning.
- **Không phụ thuộc Learning:** SUB-003-FR-018 được đảm bảo bằng cách không có HTTP client nào trong
  đường đọc lịch sử. Đây là ràng buộc kiến trúc, không phải lựa chọn triển khai.
- **Không phụ thuộc Redis:** SUB-003-SR-013 được đảm bảo vì đường đọc không import ioredis.
- **Không có phần event-driven:** vì lịch sử không phát và không tiêu thụ sự kiện.
- **Ngoại lệ đã được phê duyệt:** Không có.

## Quyết định đã chốt

Public ID UUID riêng; alias đọc ID cũ với owner check; cursor `createdAt + publicId`; trang 20/tối
đa 100 với `total` chính xác; chỉ Run trả output thô. Không snapshot tiêu đề, không lọc
status/time, không tự xoá hoặc đếm attempt. Không còn câu hỏi chặn kế hoạch.

> `plan.md` mô tả NHƯ THẾ NÀO. Nó KHÔNG ĐƯỢC thêm hành vi, tác nhân hay tiêu chí nghiệm thu vượt
> ngoài `spec.md` Approved.
