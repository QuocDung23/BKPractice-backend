# SUB-002 Kế hoạch triển khai

## Trạng thái

**Approved — 2026-09-30, chủ sở hữu sản phẩm phê duyệt trong hội thoại.** Đây là kế hoạch triển
khai tương lai; chưa có task mã nguồn nào được thực hiện.

## Đặc tả liên quan

- [`./spec.md`](./spec.md) — SUB-002 Nộp bài chính thức (Submit Code), phiên bản 1.0,
  ngày 2026-09-30
- Trạng thái spec dùng cho kế hoạch: **`Approved`**
- Cùng nhóm: [`../run-code/spec.md`](../run-code/spec.md),
  [`../submission-history/spec.md`](../submission-history/spec.md),
  [`../realtime-result/spec.md`](../realtime-result/spec.md)

## Service đích

Service: **Submission**

Không có service mới. SUB-002 ghi rõ ở mục Ngoài phạm vi rằng không có microservice Submit riêng.

## Kiến trúc service bắt buộc

Kiến trúc: **Clean Architecture + Event-Driven Architecture**

Chép từ [`specs/00-system/architecture-reference.md`](../../00-system/architecture-reference.md)
và [`docs/architecture/submission-service.md`](../../../architecture/submission-service.md).

`submission-service.md` nêu rõ các quy tắc mà kế hoạch này phải giữ:

- Chuyển trạng thái và điều kiện tiến độ là quyết định của domain, không phải của consumer.
- Payload của Judge là contract truyền tải, không phải entity của Submission.
- Xử lý kết quả phải idempotent dưới giao lại trùng của RabbitMQ.
- `submission.accepted` chỉ được phát cho một nộp bài chính thức được chấp nhận.
- Publication realtime là tạm thời; PostgreSQL là nguồn chân lý.

`submission-service.md` cũng nêu tên port cần định nghĩa: Submit, Run, ListHistory, ApplyJudgeResult
use case, cùng repository, judge-job, learning-client, realtime và accepted-event port. Kế hoạch này
bám đúng danh sách đó.

## Ảnh hưởng tới mã nguồn hiện có

| Tệp hiện có                                         | Vấn đề cần xử lý                                                                                      |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `modules/submissions/submissions.service.ts`        | `submit()` điều phối trực tiếp repository, HTTP và RabbitMQ; cần chuyển qua use case và port          |
| `modules/submissions/judge-result.consumer.ts`      | Có 4 lỗi thật, xem bảng bên dưới                                                                      |
| `modules/submissions/learning-judge.client.ts`      | Dùng gói theo `problemId + language`; Learning chỉ cấp cho Problem/ngôn ngữ đủ điều kiện theo LRN-002 |
| `libs/contracts/src/judge.contracts.ts`             | Giữ contract hiện có; không cần thêm danh sách ngôn ngữ đang bật                                      |
| `modules/submissions/entities/submission.entity.ts` | Cột `score` không phân biệt "chưa có điểm" với "điểm bằng 0"                                          |
| `apps/learning-service`                             | Không sửa: gói judge đã được LRN-002-FR-015 ràng buộc `PUBLISHED` và ngôn ngữ đang bật                |

### Lỗi thật trong `judge-result.consumer.ts` phải sửa

| Dòng hiện tại                               | Vấn đề                                                                                  | Sửa theo                               |
| ------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------- |
| `submission.score = result.score ?? 0`      | Biến "chưa có điểm" thành 0, phủ định SUB-002-FR-011                                    | Cột cho phép `NULL`, truyền `null` qua |
| `score: submission.score \|\| 100`          | Cho ra 100 nhưng dựa nhầm vào điểm Judge; contract LRN-006 yêu cầu 100 cho mọi ACCEPTED | Đặt hằng `score: 100`                  |
| `result.status as SubmissionStatus`         | Ép kiểu không kiểm tra, vi phạm yêu cầu xử lý kết quả không hợp lệ về hình thức         | Kiểm tra hình thức rồi mới áp dụng     |
| `if (this.isTerminal(status)) { publish… }` | Kiểm tra trạng thái rồi mới ghi, không chống được hai consumer chạy đồng thời           | Cập nhật có điều kiện trong một lệnh   |

## Thay đổi ở tầng domain

Dùng chung aggregate với [`../run-code/plan.md`](../run-code/plan.md). Phần bổ sung cho Submit:

- `isOfficiallyAccepted(record)` — bất biến của SUB-002-FR-013: loại là nộp bài chính thức, trạng
  thái là `ACCEPTED`, và có `problemId`.
- `ensureAcceptedEventId(record)` — sinh `acceptedEventId` đúng một lần và giữ lại, không sinh lại
  (SUB-002-FR-014).
- `applyVerdict(record, verdict)` — chuyển bản ghi sang trạng thái cuối cùng do Judge phân loại, kèm
  điểm, số Test Case đạt, tổng số Test Case, thời gian chạy và bộ nhớ. Trạng thái cuối cùng không
  được thay đổi sau khi đã đặt (SUB-002-FR-012).
- `toJudgeVerdictStatus(judgeStatus)` — ánh xạ trạng thái của contract sang trạng thái miền, có kiểm
  tra, không ép kiểu.
- `DecidingScore` — một giá trị có thể là số hoặc chưa có, để phân biệt `0` với chưa có. Đây là
  hình dạng nội bộ của domain, không phải trường API.

Domain không chứa HTTP, RabbitMQ, Redis, TypeORM, và không biết `SubmissionKind` từ hợp đồng
truyền tải; nó chỉ nhận giá trị miền tương ứng.

## Tầng application / Use case

`modules/submissions/submit-code.use-case.ts` — `SubmitCodeUseCase.execute({ userId, problemId,
language, sourceCode })`:

1. Lấy gói judge được bảo vệ qua `LearningJudgePackagePort.getPackage(problemId, language)`
   (SUB-002-FR-003).
2. Dựa vào việc Learning cấp gói thành công làm xác nhận Problem `PUBLISHED`, chưa xoá mềm và ngôn
   ngữ đang bật tại lúc nộp (LRN-002-FR-015). Ánh xạ `404` thành lỗi Problem/ngôn ngữ không sẵn
   sàng, không đoán nguyên nhân; phân biệt với lỗi mạng/5xx. Không thêm `allowedLanguages` vào gói.
3. Dùng snapshot gói đó cho job; thay đổi sau ở Learning không làm đổi job đã nhận.
4. Lưu bản ghi ở trạng thái `PENDING`.
5. Phát `JudgeRequest` với `mode: 'SUBMIT'` và dữ liệu lấy từ gói judge.
6. Chuyển bản ghi sang `QUEUED` và trả về phản hồi `202`.

`modules/submissions/apply-judge-result.use-case.ts` — `ApplyJudgeResultUseCase.execute(result)`:

1. Kiểm tra hình thức kết quả: `submissionId` hợp lệ và trạng thái thuộc tập được phép.
2. Cập nhật bản ghi **có điều kiện**: chỉ ghi khi trạng thái hiện tại chưa phải trạng thái cuối cùng.
   Lệnh cập nhật phải trả về số hàng bị ảnh hưởng, và chỉ khi số đó bằng 1 thì mới ghi bản ghi kết
   quả (SUB-002-FR-018, AC-009).
3. Ghi bản ghi kết quả trong cùng một giao dịch với bản ghi chính (SUB-002-FR-011).
4. Nếu bản ghi chính thức được chấp nhận: tạo `acceptedEventId` và một hàng outbox duy nhất trong
   cùng giao dịch với bước 2–3.
5. Relay riêng phát `submission.accepted` từ outbox qua RabbitMQ, retry với cùng `eventId`.
6. Phát thông báo realtime tối thiểu cho chủ sở hữu (SUB-002-FR-020).

Cơ chế phát sự kiện tiến độ, thực hiện đúng SUB-002-FR-016 và AC-013:

```text
a) Trong giao dịch áp dụng ACCEPTED, INSERT outbox với UNIQUE(submission_id), eventId cố định
b) Relay đọc outbox pending, publish với broker confirm rồi đánh dấu đã gửi
c) Nếu publish lỗi: giữ pending và retry; nếu crash sau broker confirm: retry cùng eventId
```

- Ràng buộc UNIQUE và giao dịch chặn hai consumer tạo hai event logic. Relay có thể phát vật lý
  nhiều lần, nhưng cùng `messageId = acceptedEventId`; Learning khử trùng theo LRN-006-FR-004.

Các port:

| Port                       | Phục vụ yêu cầu                |
| -------------------------- | ------------------------------ |
| `SubmissionRepositoryPort` | FR-009, FR-010, FR-011, FR-018 |
| `JudgeJobPort`             | FR-008, FR-021                 |
| `LearningJudgePackagePort` | FR-002, FR-003, FR-007         |
| `AcceptedEventPort`        | FR-015, FR-016, FR-023         |
| `RealtimePort`             | FR-020                         |

## Lưu trữ

- `SubmissionRepositoryPort` bổ sung `applyVerdictOnce(id, verdict, expectedNonTerminalStatuses)`,
  trả về `boolean` cho biết có ghi hay không, để chống giao lại trùng ở tầng cơ sở dữ liệu chứ không
  chỉ ở tầng ứng dụng.
- Port repository ghi outbox cùng giao dịch phán quyết và lấy các event pending cho relay. Không
  dùng `markAcceptedEventPublishing`/`clearAcceptedEventPublishing`.
- Bảng `submissions` giữ vai trò nguồn chân lý. `problem_id` là UUID thuần túy, không có khoá ngoại
  (SUB-002-SR-010).
- Bảng `submission_results` đã có ràng buộc `UNIQUE (submission_id)`. Ràng buộc này là lớp bảo vệ thứ
  hai chống tạo bản ghi kết quả trùng, và phải được giữ nguyên.

## Thay đổi cơ sở dữ liệu

| Thay đổi        | Chi tiết                                                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `score`         | Cho phép `NULL`. Hiện là `integer NOT NULL DEFAULT 0`, khiến "chưa có điểm" không phân biệt được với 0                                           |
| `score` default | Bỏ giá trị mặc định; Submission chủ động truyền `NULL` khi Judge không báo điểm                                                                  |
| Outbox          | Bảng `submission_accepted_outbox`: `event_id` UUID UNIQUE, `submission_id` UUID UNIQUE, payload tối thiểu, `created_at`, `published_at` nullable |

Outbox được ghi trong cùng transaction với kết quả. Relay chọn hàng pending theo thứ tự tạo, khoá
`FOR UPDATE SKIP LOCKED`, dùng broker confirm; chỉ đánh dấu `published_at` sau xác nhận. Index trên
`published_at` giúp tìm hàng pending. Bảng này do Submission sở hữu, không lưu dữ liệu judge ẩn.

Ảnh hưởng tương thích: các bản ghi cũ có `score = 0` sẽ được hiểu là "điểm bằng 0 thật". Không có
cách nào suy ra lại ý nghĩa của các giá trị 0 cũ mà không có dữ liệu lịch sử. Kế hoạch ghi nhận đây là
một giới hạn không tránh được và phải được nêu trong worked entry.

## Migration

- Tệp: `apps/submission-service/src/database/migrations/<timestamp>-MakeSubmissionScoreNullable.ts`
- Lệnh sinh: `pnpm migration:generate:submission`
- `up`: `ALTER TABLE "submissions" ALTER COLUMN "score" DROP NOT NULL, ALTER COLUMN "score" DROP DEFAULT`
- `down`: `ALTER TABLE "submissions" ALTER COLUMN "score" SET NOT NULL, ALTER COLUMN "score" SET DEFAULT 0`
  — hoàn tác cần `COALESCE(score, 0)` trước nếu đã có dòng `NULL`, nên phương án `down` phải cập nhật
  dữ liệu trước khi siết ràng buộc
- Tính hoàn tác: có, kèm bước chuẩn hoá dữ liệu
- Không sửa `1700000001000-InitialSubmissionSchema`. `synchronize` tiếp tục tắt.
- Migration riêng tạo outbox và index pending. Rollback chỉ sau khi xác nhận không còn event
  pending; không xoá event chưa giao. Cột `progress_event_published_at` cũ được giữ cho tương thích
  lịch sử, không làm nguồn quyết định giao event mới.

## API

| Route              | Method | Mã thành công | Ghi chú                                |
| ------------------ | ------ | ------------- | -------------------------------------- |
| `/api/submissions` | `POST` | `202`         | Giữ nguyên đường dẫn; Gateway đã proxy |

Phản hồi `202` trả về: `id` công khai (`publicId` theo SUB-003), loại là nộp bài chính thức, trạng thái đã nhận vào hàng đợi,
định danh Problem, ngôn ngữ và mốc thời gian. Không trả phán quyết, không trả Test Case, kết quả
mong đợi, harness hay tham số runtime.

Ánh xạ qua DTO kết quả riêng, không tuần tự hoá thẳng entity, để đạt SUB-002-SR-008.

## DTO / Kiểm tra dữ liệu

`SubmitCodeRequestDto` nhận `problemId` (`@IsProblemId()` cho UUID v4 và v5), `language`
(`@IsIn(SUPPORTED_LANGUAGES)`) và `sourceCode` (`@IsString()`, `MinLength(1)`, `MaxLength(100_000)`).

Cấu hình `ValidationPipe` với `whitelist: true` và `forbidNonWhitelisted: true` là **bắt buộc** để đạt
SUB-002-AC-004 và AC-005: `testCases`, `expectedOutput`, `hiddenHarness`, `timeLimitMs`,
`memoryLimitMb`, trạng thái, điểm số, chủ sở hữu, vai trò và quyền phải bị từ chối bởi kiểm tra danh
sách cho phép. Việc này dùng chung với Run nên được làm một lần ở `main.ts`.

Kiểm tra ngôn ngữ đang bật **không** đặt ở DTO, vì cần dữ liệu của Learning và là quyết định nghiệp
vụ. Xem mục Tầng application.

## Phân quyền

- Chủ sở hữu lấy từ header tin cậy `x-auth-user-id`. Controller không nhận định danh từ body.
- Không thêm quyền `submission:submit`; mọi vai trò đã xác thực được nộp theo SUB-002.
- Không thêm hạn mức tần suất (SUB-002 ghi rõ v1 không có).
- Submission nhận dữ liệu judge qua header `x-internal-service-secret` trên một URL nội bộ. Header
  này phải ở ngoài mọi contract công khai, và URL nội bộ phải không định tuyến qua Gateway.
- Submission không có route đọc hoặc sửa bản ghi trong phạm vi này; các route đó thuộc SUB-003.

## Messaging / Sự kiện

### Ra: `judge.request`

- Exchange `bkpractice.judge`, routing key `judge.request`, `messageId = executionId`.
- `JudgeRequest` với `mode: 'SUBMIT'`, `problemType` và Test Case lấy từ gói judge, giới hạn thời
  gian và bộ nhớ lấy từ gói judge.
- Mã nguồn chỉ nằm trong trường `sourceCode`; Submission không dựng tên file hay lệnh.

### Về: `judge.result`

- Consumer chỉ làm ba việc: giải mã, gọi một use case, rồi ACK/NACK ở ranh giới adapter. Việc
  phối hợp nằm trong `ApplyJudgeResultUseCase`, đúng khuyến nghị trong `submission-service.md`.
- `mode: 'RUN'` phải được bỏ qua ở nhánh sự kiện tiến độ.
- Nếu kết quả không hợp lệ về mặt hình thức, adapter phải NACK để vào hàng chết thay vì ACK một kết
  quả rác.

### Đi: `submission.accepted`

- Exchange `bkpractice.learning`, routing key `submission.accepted`, `messageId = acceptedEventId`.
- Nội dung theo `SubmissionAcceptedEvent` hiện có: `eventId`, `occurredAt`, `submissionId`, `userId`,
  `problemId`, `score: 100`. `submissionId` là ID nội bộ ổn định của message; `publicId` phục vụ
  client và không làm thay đổi contract LRN-006.
- Không thêm trường mã nguồn, Test Case hay harness.
- **Không gọi trực tiếp API cập nhật tiến độ của Learning** (SUB-002-FR-023 và AC-017).

## Realtime

- N/A cho hợp đồng thông báo; nội dung và vòng đời kênh thuộc
  [`../realtime-result/plan.md`](../realtime-result/plan.md).
- `ApplyJudgeResultUseCase` gọi `RealtimePort` **sau khi** lưu, với một đối tượng thông báo tối thiểu.
- Đối tượng truyền cho `RealtimePort` KHÔNG được là `JudgeResult` thô, vì `JudgeResult` chứa
  `stdout` và `stderr` từ Test Case ẩn, và Gateway hiện chuyển thẳng payload nhận được xuống client.
  Đây là một rủi ro rò rỉ đang tồn tại trong mã hiện tại; xem mục Rủi ro.

## Adapter hạ tầng

- `TypeormSubmissionRepository` — hiện thực port, gồm cập nhật có điều kiện.
- `RabbitJudgeJobAdapter` — hiện thực `JudgeJobPort`.
- `RabbitAcceptedEventAdapter` — hiện thực `AcceptedEventPort`.
- `HttpLearningJudgePackageAdapter` — hiện thực `LearningJudgePackagePort`, là bản đổi tên và mở
  rộng của `LearningJudgeClient` hiện tại.
- `RedisRealtimeAdapter` — hiện thực `RealtimePort`.

## Xử lý lỗi

| Tình huống                                    | Hành vi trong kế hoạch                                                       |
| --------------------------------------------- | ---------------------------------------------------------------------------- |
| Ngôn ngữ chưa bật hoặc Problem không sẵn sàng | `404` thành lỗi Problem/ngôn ngữ không sẵn sàng; không tạo bản ghi           |
| Không lấy được gói judge                      | Từ chối trước khi tạo bản ghi; không có job Judge                            |
| Lỗi lưu trữ bản ghi                           | Không có bản ghi, không gọi Judge                                            |
| Lỗi phát việc cho Judge                       | Chuyển bản ghi sang `INTERNAL_ERROR`, không bỏ treo ở `QUEUED`               |
| Kết quả không hợp lệ về hình thức             | Giữ trạng thái cũ, log cảnh báo, NACK                                        |
| Kết quả cho bản ghi không tồn tại             | Log cảnh báo, NACK; không ghi dữ liệu rác                                    |
| Kết quả cho bản ghi đã ở trạng thái cuối cùng | Cập nhật có điều kiện trả 0 hàng, không ghi; outbox đã được giữ nguyên       |
| Hai lần xử lý đồng thời                       | Chỉ một lần ghi nhờ cập nhật có điều kiện                                    |
| Phát sự kiện tiến độ thất bại                 | Hàng outbox vẫn pending; relay thử lại với cùng `eventId`                    |
| Judge không trả sau 10 phút                   | Watchdog cập nhật có điều kiện sang `INTERNAL_ERROR`; kết quả muộn bị bỏ qua |
| Redis không sẵn sàng                          | Nuốt lỗi tại adapter, bản ghi vẫn hoàn tất                                   |

## Bảo mật

| Mối đe doã                     | Biện pháp                                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------------------ |
| Client gửi dữ liệu judge giả   | `whitelist` + `forbidNonWhitelisted`; dữ liệu judge chỉ lấy từ Learning                          |
| Client gửi trạng thái/điểm giả | Các trường đó không tồn tại trong DTO, nên bị từ chối                                            |
| Lộ Test Case ẩn                | DTO kết quả liệt kê tường minh; không trả gói judge trong bất kỳ phản hồi nào                    |
| Lộ dữ liệu judge qua lỗi       | Adapter bọc lỗi HTTP thành lỗi phụ thuộc chung, không chuyển tiếp nội dung phản hồi của Learning |
| Gán hàng loạt chủ sở hữu       | Chủ sở hữu chỉ từ header tin cậy                                                                 |
| Truy cập bản ghi người khác    | Nằm ngoài phạm vi này nhưng port phải có sẵn phương thức lọc theo chủ sở hữu cho SUB-003         |
| Mã nguồn thành lệnh            | Submission không dựng lệnh, không dựng tên file                                                  |
| Giao lại trùng gây phát lặp    | Cập nhật trạng thái có điều kiện, outbox UNIQUE, `eventId` cố định; Learning khử trùng           |
| Điểm tiến độ khác điểm Judge   | Event luôn 100 khi ACCEPTED theo LRN-006, bản ghi giữ điểm Judge kể cả 0/null                    |

## Chiến lược kiểm thử

| Mã             | Kịch bản                                                                                                 |
| -------------- | -------------------------------------------------------------------------------------------------------- |
| FR-002, AC-002 | Ngôn ngữ chưa bật cho Problem → từ chối, `JudgeJobPort` **không** được gọi                               |
| FR-003, AC-004 | Dữ liệu judge lấy từ `LearningJudgePackagePort`, không lấy từ body                                       |
| FR-004, AC-005 | Body chứa Test Case, giới hạn, trạng thái, điểm, chủ sở hữu → bị từ chối bởi `forbidNonWhitelisted`      |
| FR-005, AC-006 | Thiếu `x-auth-user-id` → `401`, không tạo bản ghi                                                        |
| FR-007, AC-003 | Problem không tồn tại hoặc chưa sẵn sàng → từ chối, không tạo bản ghi, không gọi Judge                   |
| FR-008, AC-001 | Submit hợp lệ → bản ghi `QUEUED`, phản hồi không chứa phán quyết                                         |
| FR-011, AC-007 | Áp dụng phán quyết → trạng thái, điểm, Test Case, thời gian, bộ nhớ lưu trong một giao dịch              |
| FR-012, AC-008 | Bản ghi đã ở trạng thái cuối cùng nhận kết quả mới → trạng thái giữ nguyên, không có bản ghi kết quả mới |
| FR-018, AC-009 | Hai lần xử lý đồng thời → chỉ một lần ghi, trạng thái nhất quán                                          |
| FR-014, AC-010 | `acceptedEventId` giống nhau giữa hai lần phát                                                           |
| FR-015, AC-011 | `ACCEPTED` → một hàng outbox/event logic, `score: 100`; `INTERNAL_ERROR` → không tạo hàng                |
| FR-016, AC-013 | Crash trước/sau broker confirm → outbox retry cùng `eventId`, Learning chỉ áp dụng một lần               |
| FR-023, AC-012 | Bản ghi `RUN` với `EXECUTED` → không tạo outbox accepted                                                 |
| FR-021         | Watchdog quá 10 phút và result về muộn → `INTERNAL_ERROR` bất biến                                       |
| FR-021, AC-014 | Lỗi ở bước chuẩn bị hoặc phát việc → bản ghi không ở `QUEUED` vô hạn                                     |
| FR-010, AC-015 | Xác minh Submission không thực thi mã, không có khoá ngoại xuyên service, chỉ gọi Learning qua nội bộ    |
| AC-016         | Không trường ẩn nào trong phản hồi, lỗi, log hay Swagger                                                 |
| AC-018         | Đổi tiêu đề Problem ở Learning không đổi kết quả bản ghi                                                 |

Hai kiểm thử đáng chú ý nhất là FR-023/AC-012 và FR-016/AC-013, vì chúng bảo vệ trực tiếp tính đúng
đắn của tiến độ học tập và chống phát sự kiện lặp.

## Khả năng quan sát

- Log `debug` khi giao việc: `submissionId`, `mode: 'SUBMIT'`. Không log mã nguồn.
- Log `warn` khi bỏ qua kết quả vì bản ghi đã ở trạng thái cuối cùng, kèm `submissionId`.
- Log `warn` khi phát sự kiện tiến độ thất bại, kèm `submissionId` và `acceptedEventId` nhưng không
  kèm payload sự kiện.
- Dùng `acceptedEventId` làm khoá tương quan giữa Submission và Learning. Không thêm hệ thống
  correlation ID mới.

## Thứ tự triển khai

1. Xác nhận adapter dùng đúng LRN-002-FR-015 mà không đổi contract Learning.
2. Thêm domain mapping cho verdict/điểm nullable và điều kiện accepted.
3. Thêm migration score nullable và outbox; chạy `pnpm migration:run:submission` trong giai đoạn triển khai.
4. Thêm `ValidationPipe` `whitelist` + `forbidNonWhitelisted` ở `main.ts` nếu chưa có.
5. Tạo `SubmitCodeUseCase` cùng `LearningJudgePackagePort` và adapter.
6. Tạo `ApplyJudgeResultUseCase` với cập nhật có điều kiện và ghi outbox cùng transaction.
7. Tạo relay outbox dùng `AcceptedEventPort`, broker confirm và retry cùng `eventId`; thêm watchdog 10 phút.
8. Làm consumer mỏng, gọi một use case, xử lý ACK/NACK ở adapter.
9. Viết kiểm thử theo bảng ở mục Chiến lược kiểm thử.
10. Chạy `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build:submission`.

Không có câu hỏi hợp đồng Learning còn mở; chỉ triển khai theo spec Approved.

## Rủi ro

| Rủi ro                                                                     | Biện pháp giảm thiểu                                                                     |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Event giao lại sau khi relay sập                                           | Stable `eventId` và Learning khử trùng; không kỳ vọng broker exactly-once                |
| Hai consumer chạy đồng thời ghi hai lần                                    | Cập nhật có điều kiện trả số hàng, cộng ràng buộc `UNIQUE (submission_id)`               |
| `score                                                                     |                                                                                          | 100` che điểm Judge bằng 0 | Event đặt 100 tường minh, bản ghi giữ 0; test riêng cho 0/null |
| Realtime hiện đẩy `JudgeResult` thô xuống client, làm lộ `stdout`/`stderr` | `RealtimePort` chỉ nhận đối tượng tối thiểu; sửa nằm ở `SUB-004` nhưng phải làm cùng đợt |
| Dữ liệu `score = 0` cũ không phân biệt được với chưa có điểm               | Ghi nhận giới hạn, không có cách sửa; nêu trong worked entry                             |
| Ép kiểu trạng thái không kiểm tra                                          | `toJudgeVerdictStatus` có kiểm tra, kèm kiểm thử kết quả không hợp lệ                    |
| Job hợp lệ chờ quá 10 phút                                                 | Watchdog kết thúc lỗi hệ thống; kết quả muộn bị bỏ, ghi nhận rủi ro vận hành             |

## Tuân thủ kiến trúc

- **Chiều phụ thuộc:** `controller → SubmitCodeUseCase / ApplyJudgeResultUseCase → domain port ← adapter`.
  `JudgeResultConsumer` chỉ giải mã và gọi một use case.
- **Quyền sở hữu:** Submission sở hữu `submissions` và `submission_results`. `problem_id` là giá
  trị định danh ngoài, không phải quan hệ lưu trữ. Không truy vấn cơ sở dữ liệu của Learning.
- **Hợp đồng với Learning:** chỉ qua HTTP nội bộ có xác thực. Submission không đăng ký consumer
  RabbitMQ nào của Learning và không giả định có consumer nào tồn tại.
- **Ranh giới module:** `modules/submissions` giữ aggregate và port dùng chung. Use case Submit và
  use case áp dụng kết quả ở cùng module vì chúng chia sẻ bản ghi và cùng một giao dịch.
- **Không đưa vào service này:** biên dịch, runner, sandbox, mã của Judge; và cả logic cập nhật
  tiến độ của Learning.
- **Ngoại lệ đã được phê duyệt:** Không có.

## Quyết định đã chốt

Gói judge LRN-002 xác nhận trạng thái/ngôn ngữ ở thời điểm nộp; điểm Judge thiếu là `null`, event
ACCEPTED mang 100; không dùng `RUNNING`; lỗi Learning không tạo bản ghi, lỗi publish job kết thúc
`INTERNAL_ERROR`; watchdog 10 phút; mỗi request tạo bản ghi; không quyền riêng, không điểm Assignment
trong Submission. Không còn câu hỏi chặn kế hoạch.

> `plan.md` mô tả NHƯ THẾ NÀO. Nó KHÔNG ĐƯỢC thêm hành vi, tác nhân hay tiêu chí nghiệm thu vượt
> ngoài `spec.md` Approved.
