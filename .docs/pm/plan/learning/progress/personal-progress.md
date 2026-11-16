# Progress cá nhân — API và vận hành

Nguồn: [LRN-006 spec](../../../../specs/02-learning/progress/spec.md), [plan](../../../../specs/02-learning/progress/plan.md) và [LRN-008](../../../../specs/02-learning/self-study/spec.md). Progress phục vụ tự học theo Learning Item Problem/Quiz trong Course.

## API

Mọi route cần access token qua Gateway. Learning dùng principal do Gateway chuyển tiếp; không nhận userId do client chọn. Mọi vai trò đã xác thực đều xem được tiến độ của chính mình, không có quyền ADMIN để xem người khác.

| GET route                            | Query                                                              | Kết quả                                                                                                                        |
| ------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `/api/progress/me/problems`          | `page` mặc định 1; `limit` mặc định 20, tối đa 100                 | `{ items: [{ problemId, solvedAt }], page, limit, total }`                                                                     |
| `/api/progress/me/problems/status`   | `problemIds` là chuỗi 1..100 UUID duy nhất phân cách bằng dấu phẩy | `[{ problemId, solved, solvedAt }]` theo thứ tự đầu vào                                                                        |
| `/api/progress/me/courses/:courseId` | Không có                                                           | `{ courseId, completed, total, chapters: [{ chapterId, completed, total }], completedItems: [{ type, itemId, completedAt }] }` |

Response Course tạm giữ alias deprecated `solved` (bằng `completed`), Chapter `solved` và
`solvedProblems` chỉ chứa Problem để client cũ không vỡ. Client mới dùng `completed/completedItems`.

- `solvedAt` là ISO UTC; UUID danh sách được chuẩn hoá thành chữ thường. Thiếu/trùng UUID, query lặp dạng mảng, trường lạ hoặc phân trang không hợp lệ trả `400`.
- Danh sách đã giải sắp `solved_at DESC, problem_id ASC`; lọc Problem `PUBLISHED` chưa xoá mềm trước phân trang và đếm tổng.
- Status của Problem bị ẩn, không tồn tại, chưa giải hoặc chỉ có trạng thái ATTEMPTED đều là `solved: false, solvedAt: null`.
- Course phải đang `PUBLISHED` và chưa xoá mềm; trường hợp khác trả `404`. Mỗi Problem/Quiz hiển thị có trọng số một; giữ Chapter rỗng. `0/0` là kết quả hợp lệ.
- Item bị hold, xoá hoặc gỡ khỏi Course không còn tính vào Course; completion gốc vẫn được giữ. Khi item xuất hiện lại, tiến độ được tính lại ngay. Quiz hoàn thành khi từng có attempt `FINISHED` với `passed=true`, không bị thu hồi bởi fail sau hoặc revision mới.
- Mọi API chỉ SELECT, không cập nhật `updated_at`, không tạo receipt và không lưu tổng hợp. Không có điểm Assignment hay endpoint Class.
- Response chỉ có định danh, thời điểm và số đếm; không trả nội dung bài, source, test case, harness, eventId, bestScore hoặc hồ sơ người học.
- Lỗi hạ tầng đọc trả `500` chung; log của filter không ghi thông tin kết nối hoặc raw exception.

## Luồng code

`MyProgressController` gọi một inbound port cho mỗi request. Use case dùng repository/reader port và `CourseCompletionCalculator` thuần domain; mapper HTTP chuyển Date sang ISO và chọn trường response.

`ProgressRepository.listSolved` kết hợp lọc công khai với phân trang. `PublishedProblemFilter` giới hạn tập định danh cho tra trạng thái. `CourseStructureReader` là projection chỉ đọc Problem/Quiz; `QuizCompletionReader` đọc pass đầu tiên từ attempt hiện có. Các reader không import entity/repository ghi của module khác.

Storage transaction của Progress dùng chung hạ tầng Learning theo DataSource; thao tác đọc bình thường dùng manager mặc định. Không mở transaction ghi để đọc.

## Kiểm thử cách ly

- Unit: `pnpm exec jest apps/learning-service/src/modules/progress --runInBand`.
- PostgreSQL: đặt `TEST_DATABASE_URL` trỏ đến database dùng một lần có tên kết thúc `_test`, chạy cùng lệnh trên. Không trỏ tới database đang dùng cho development/production: các integration suite tạo dữ liệu mẫu và chạy migration.
- RabbitMQ: thêm `TEST_RABBITMQ_URL` trỏ tới broker riêng trên localhost, vhost kết thúc `_test`. Suite consumer dùng topology thật và kiểm accepted/duplicate, retry/DLQ, rollback/replay. Không dùng broker hoặc vhost có message thật.
- Không cần URL test cho unit; các integration suite tương ứng sẽ skip nếu thiếu URL.
- Test migration thực hiện down/up trong transaction rồi rollback, kiểm receipt lịch sử và CHECK mà không sửa migration lịch sử.

## Retry và dead-letter queue

- Exchange: `bkpractice.learning`; routing key: `submission.accepted`; queue: `learning.submission.accepted`.
- Handler thành công trả APPLIED hoặc DUPLICATE rồi ACK. Log consumer chỉ chứa eventId, problemId và kết quả; không log raw payload/header.
- Payload sai hoặc ghi lỗi đi qua 3 lần retry của hạ tầng hiện có rồi vào `learning.submission.accepted.dead`. Không có backoff mới trong tính năng này.
- Dùng giao diện quản trị RabbitMQ hiện có để theo dõi độ dài queue/DLQ và số lần thử. Khi điều tra, chỉ ghi định danh sự kiện; không đưa thông tin xác thực vào log/ticket.
- Sau khi khắc phục lỗi hạ tầng, vận hành dùng chức năng chuyển lại message về exchange/routing key ban đầu, giữ nguyên payload/eventId. Không tạo eventId mới để né duplicate. Biên nhận và tiến độ cùng transaction nên đưa lại message là an toàn.
- Không backfill từ database Submission, không xoá receipt/progress để thử lại và không thêm công cụ replay riêng.

## Schema và triển khai

Migration LRN-006 hiện có tạo receipt và CHECK, migration LRN-008 gỡ các bảng lớp/bài tập. Amendment Learning Item không thêm schema, migration hoặc quyền mới. Gateway đã có allowlist ba route; không thêm biến môi trường triển khai.
