# SUB-001 Kế hoạch triển khai

## Trạng thái

**Approved — 2026-09-30, chủ sở hữu sản phẩm phê duyệt trong hội thoại.** Đây là kế hoạch triển
khai tương lai; chưa có task mã nguồn nào được thực hiện.

## Đặc tả liên quan

- [`./spec.md`](./spec.md) — SUB-001 Chạy thử mã (Run Code), phiên bản 1.0, ngày 2026-09-30
- Trạng thái spec dùng cho kế hoạch: **`Approved`**
- Spec liên quan cùng nhóm: [`../submit-code/spec.md`](../submit-code/spec.md),
  [`../submission-history/spec.md`](../submission-history/spec.md),
  [`../realtime-result/spec.md`](../realtime-result/spec.md)

## Service đích

Service: **Submission**

Lý do: `specs/00-system/service-boundaries.md` và
[`docs/architecture/submission-service.md`](../../../architecture/submission-service.md) giao
quyền sở hữu vòng đời bền vững của Run và Submit cho Submission. SUB-001 cũng ghi rõ ở mục Ngoài
phạm vi rằng không có microservice Run riêng.

## Kiến trúc service bắt buộc

Kiến trúc: **Clean Architecture + Event-Driven Architecture**

Chép chính xác từ [`specs/00-system/architecture-reference.md`](../../00-system/architecture-reference.md)
dòng Submission, và khớp với `submission-service.md` cùng
[ADR 0002](../../../adr/0002-revised-service-internal-architectures.md).

Hệ quả bắt buộc cho kế hoạch này:

- Domain giữ vòng đời và bất biến của Run, không phụ thuộc framework.
- Use case điều phối thông qua port; adapter kỹ thuật nằm ngoài domain.
- Run giao việc chấm bất đồng bộ qua RabbitMQ và nhận kết quả về qua consumer.
- Run không được biên dịch hay thực thi mã.

`submission-service.md` ghi trạng thái hiện tại là **PARTIALLY ALIGNED** vì
`SubmissionsService` và `JudgeResultConsumer` đang điều phối trực tiếp TypeORM, RabbitMQ, HTTP và
Redis thay vì qua port. Run là nơi đầu tiên cần tách port để sửa căn bản này.

## Ảnh hưởng tới mã nguồn hiện có

| Tệp hiện có                                         | Ảnh hưởng                                                                       |
| --------------------------------------------------- | ------------------------------------------------------------------------------- |
| `modules/submissions/submissions.service.ts`        | `run()` bị chuyển thành một use case riêng; `publishOrFail` được thay bằng port |
| `modules/submissions/submissions.controller.ts`     | Route Run giữ nguyên đường dẫn; chỉ đổi sang gọi use case                       |
| `modules/submissions/entities/submission.entity.ts` | Entity TypeORM giữ vai trò lưu trữ; aggregate domain tách riêng                 |
| `modules/submissions/dto/run-code.dto.ts`           | Bổ sung cấu hình chặn trường lạ và giới hạn `stdin`                             |
| `modules/submissions/judge-result.consumer.ts`      | Consumer mỏng lại, gọi use case; nhánh Run được xử lý trong use case dùng chung |
| `database/migrations/...InitialSubmissionSchema`    | Không sửa migration đã chạy; thêm migration mới cho cột `stdin`                 |

Hành vi phải giữ tương thích:

- Đường dẫn `POST /api/run` và mã `202 Accepted` không đổi.
- Header tin cậy `x-auth-user-id` từ Gateway không đổi.
- Cặp giới hạn cố định của Run là `3000ms` / `256MB`; client không được ghi đè.

## Thay đổi ở tầng domain

Tạo một aggregate không phụ thuộc framework tại
`apps/submission-service/src/modules/submissions/domain/`:

- `SubmissionRecord` — thuộc tính chủ sở hữu, loại bản ghi, `problemId` tuỳ chọn, ngôn ngữ, mã nguồn,
  `stdin`, trạng thái, mốc thời gian.
- `SubmissionKind` giữ giá trị hiện có; `SubmissionStatus` bổ sung `EXECUTED` cho Run thành công.
  `RUNNING` vẫn tồn tại trong enum lưu trữ nhưng Run không dùng tới.
- `createRunRecord(input)` — hàm khởi tạo bản ghi Run ở trạng thái `PENDING`.
- `markRunQueued(record)` — chuyển `PENDING` sang `QUEUED` sau khi việc được giao thành công.
- `markRunFailedToDispatch(record)` — chuyển sang `INTERNAL_ERROR` khi không phát được việc
  (SUB-001-FR-014).
- `isTerminal(status)` — bất biến dùng chung, vì SUB-002 và SUB-003 cần cùng một định nghĩa.
- Consumer ánh xạ kết quả Judge `ACCEPTED` với `mode: RUN` thành `EXECUTED` trước khi lưu.
- `canProduceWrongAnswer()` — Run không có dữ liệu mong đợi nên không sinh `WRONG_ANSWER`
  (SUB-001-FR-006).

Không đưa vào domain: trạng thái lưu trữ, HTTP, RabbitMQ, Redis, và bất kỳ khái niệm nào chỉ phục
vụ kỹ thuật.

## Tầng application / Use case

`apps/submission-service/src/modules/run-code/run-code.use-case.ts`:

- `RunCodeUseCase.execute({ userId, language, sourceCode, stdin, problemId })` — thực hiện
  SUB-001-FR-008, FR-009, FR-010, FR-011, FR-014.

Các port tối thiểu, đặt tại
`apps/submission-service/src/modules/submissions/domain/ports/`:

| Port                       | Phục vụ yêu cầu                    | Cần cho Run |
| -------------------------- | ---------------------------------- | ----------- |
| `SubmissionRepositoryPort` | FR-011 lưu bản ghi bằng PostgreSQL | Có          |
| `JudgeJobPort`             | FR-010 giao việc chấm bất đồng bộ  | Có          |
| `RealtimePort`             | FR-012 phát kết quả sau khi lưu    | Có          |

Run **không** cần `LearningJudgePackagePort`. Đây là điểm cốt lõi của SUB-001-FR-004: Run không
được gọi Learning. Việc import port đó vào `modules/run-code` là sai về ranh giới module và sẽ bị
ghi nhận là ngoại lệ tại bước Tuân thủ kiến trúc.

Thứ tự các bước trong use case, tương ứng SUB-001-FR-014 và FR-015:

1. Kiểm tra ngữ cảnh tin cậy đã có `userId`.
2. Lưu bản ghi ở trạng thái `PENDING`.
3. Phát việc cho Judge.
4. Thành công: chuyển sang `QUEUED` và trả về `202` cùng định danh và trạng thái hàng đợi.
5. Thất bại ở bước 3: chuyển sang `INTERNAL_ERROR`, rồi trả lỗi theo quy ước hiện có; không trả
   `202` kèm lỗi. Bản ghi không bị bỏ treo ở `QUEUED`.

Watchdog định kỳ cập nhật có điều kiện bản ghi `PENDING`/`QUEUED` quá 10 phút từ `createdAt` sang
`INTERNAL_ERROR`; consumer chỉ áp dụng kết quả nếu bản ghi chưa terminal. Xử lý race bằng cập nhật
nguyên tử, kết quả đến sau timeout bị bỏ qua.

Nếu bước 2 thành công nhưng bước 3 thất bại, bản ghi vẫn tồn tại ở `INTERNAL_ERROR` và vẫn đọc được
trong lịch sử. Đây là hành vi đã chốt, không phải một lựa chọn của kế hoạch.

## Lưu trữ

- `SubmissionRepositoryPort` có các thao tác: `save(record)`, `findById(id)`, `findByIdAndOwner(id,
userId)`, `listByOwner(filters, cursor, limit)`. Danh sách thuộc SUB-003, nhưng phương thức đặt ở
  port dùng chung để tránh hai aggregate cùng đọc một bảng.
- Xác định bản ghi Run bằng cặp `userId` và `kind = 'RUN'`; không cần một bảng riêng.
- Quyền sở hữu cơ sở dữ liệu: Submission sở hữu `submissions` và `submission_results`. Run không tạo
  quan hệ lưu trữ với Problem của Learning; `problem_id` là một giá trị UUID thuần túy
  (SUB-001-SR-007).
- Truy vấn danh sách phải lọc theo `userId` trước khi phân trang, để phân trang không thể vượt ra
  ngoài sở hữu (chung với SUB-003-SR-002).

## Thay đổi cơ sở dữ liệu

Bảng `submissions` hiện có KHÔNG có cột lưu `stdin`, trong khi SUB-001-FR-011 yêu cầu lưu `stdin`
cùng mã nguồn. Đây là thiếu sót thật, không phải lựa chọn của kế hoạch.

| Thay đổi              | Chi tiết                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| Cột mới               | `submissions.stdin` kiểu `text`, cho phép `NULL`                                                  |
| Enum mới              | Thêm `EXECUTED` vào `submissions_status_enum` cho Run thành công                                  |
| Index mới             | Không thêm. Index hiện có trên `user_id` và `problem_id` đã phục vụ truy vấn Run                  |
| Ràng buộc             | Không có ràng buộc mới; `stdin` là dữ liệu do người học gửi                                       |
| Ảnh hưởng tương thích | Cột cho phép `NULL` nên các bản ghi Run cũ vẫn đọc được; giá trị `NULL` được hiểu là `stdin` rỗng |

`SubmissionResult` không thay đổi. `stdout` và `stderr` vẫn được lưu vì SUB-002-FR-019 yêu cầu
lưu, còn quyền xem được quyết định ở SUB-003.

## Migration

- Tệp: `apps/submission-service/src/database/migrations/<timestamp>-AddRunStdin.ts`
- Lệnh sinh: `pnpm migration:generate:submission` (lệnh đã tồn tại trong `package.json`)
- `up`: `ALTER TABLE "submissions" ADD "stdin" text`
- `down`: `ALTER TABLE "submissions" DROP COLUMN "stdin"`
- Tính hoàn tác: có, vì cột nullable và không có ràng buộc phụ thuộc
- Migration `1700000001000-InitialSubmissionSchema` đã tồn tại **không được sửa**
- Migration riêng thêm giá trị `EXECUTED` vào PostgreSQL enum. `down` không được âm thầm đổi các
  bản ghi `EXECUTED` sang phán quyết khác; rollback enum yêu cầu quy trình dữ liệu riêng.
- `synchronize` phải tiếp tục ở trạng thái tắt; không được dùng nó thay cho migration

## API

| Route      | Method | Mã thành công | Ghi chú                                |
| ---------- | ------ | ------------- | -------------------------------------- |
| `/api/run` | `POST` | `202`         | Đường dẫn giữ nguyên; Gateway đã proxy |

Phản hồi `202` trả về: `id` công khai (`publicId` theo SUB-003), loại là thử nghiệm, trạng thái đã nhận vào hàng đợi,
ngôn ngữ, thời điểm tạo. Không trả phán quyết trong cùng phản hồi (SUB-001-AC-001).

Phản hồi phải được ánh xạ qua một DTO kết quả riêng, không trả thẳng entity TypeORM. Lý do là
SUB-001-SR-004 và SUB-003-SR-008: tuần tự hoá thẳng entity sẽ làm lộ trường mới thêm về sau.

## DTO / Kiểm tra dữ liệu

`RunCodeRequestDto`:

- `language` — `@IsIn(SUPPORTED_LANGUAGES)`; lấy từ danh mục dùng chung trong
  [`libs/contracts/src/judge.contracts.ts`](../../../libs/contracts/src/judge.contracts.ts),
  không khai báo lại danh sách (SUB-001-FR-003).
- `sourceCode` — `@IsString()`, `@MinLength(1)`, `@MaxLength(100_000)`.
- `stdin` — `@IsString()`, `@MaxLength(100_000)`, cho phép chuỗi rỗng. Cần cho phép rỗng vì
  SUB-001-FR-008 nói rõ `stdin` có thể rỗng.
- `problemId` dùng `@IsOptional()` và `@IsProblemId()` để nhận UUID v4 và v5. ID chỉ được lưu làm
  nhãn (SUB-001-FR-005). ID sai định dạng bị từ chối. ID hợp lệ vẫn được lưu dù bài không tồn tại.

Chống gán hàng loạt: bật `ValidationPipe` với `whitelist: true` và `forbidNonWhitelisted: true` ở
`main.ts` nếu chưa có. Đây là điều kiện cần để đạt SUB-001-AC-008 và SUB-001-AC-016; cần kiểm tra
trạng thái hiện tại của `main.ts` trước khi thêm.

## Phân quyền

- Chủ sở hữu lấy từ header tin cậy `x-auth-user-id` mà Gateway đã xác minh. Controller chỉ đọc
  header này và không nhận bất kỳ định danh nào từ body.
- Không thêm quyền `submission:run`; mọi vai trò đã xác thực được Run theo SUB-001.
- Không thêm hạn mức tần suất (SUB-001-SR-009).
- Việc một Run không cấp quyền lên Problem hay tiến độ được đảm bảo bằng cách Run không gọi bất kỳ
  service nào khác ngoài Judge.

## Messaging / Sự kiện

- Exchange `bkpractice.judge`, routing key `judge.request`, `messageId` bằng `executionId`.
- `JudgeRequest` với `mode: 'RUN'`, `problemType: 'STANDARD'`, `testCases: [{ stdin }]`, và cặp
  giới hạn mặc định. Giữ nguyên hình dạng contract hiện có; SUB-001 không đổi contract nào.
- **Run không phát `submission.accepted`.** Điều kiện này phải được kiểm chứng bằng kiểm thử, vì
  SUB-001-AC-003 là tiêu chí nghiệm thu độc lập (xem mục Chiến lược kiểm thử).
- Consumer nhận `judge.result` phải phân biệt `mode: 'RUN'` và không gọi `AcceptedEventPort` khi
  mode là `RUN`.

## Realtime

- N/A cho phần **hợp đồng**; nội dung thông báo và vòng đời kênh thuộc
  [`../realtime-result/plan.md`](../realtime-result/plan.md).
- Run chỉ dùng `RealtimePort` với một lời gọi `publishResult(ownerId, notification)` sau khi kết
  quả đã lưu (SUB-001-FR-012).
- Lỗi phát realtime phải bị nuốt và ghi log ở mức cảnh báo, không được làm ném lỗi ra khỏi use case
  xử lý kết quả. Đây là điều kiện để đạt SUB-001-AC-012.

## Adapter hạ tầng

- `TypeormSubmissionRepository` — hiện thực `SubmissionRepositoryPort` bằng repository TypeORM.
- `RabbitJudgeJobAdapter` — hiện thực `JudgeJobPort` bằng `RabbitMqService`.
- `RedisRealtimeAdapter` — hiện thực `RealtimePort`.

Các adapter này tồn tại dưới dạng class trong module. `submissions.service.ts` và
`judge-result.consumer.ts` hiện tại sẽ được thay bằng lời gọi qua các adapter, không xoá ngay các
tệp gốc nếu chúng còn được dùng cho Submit.

## Xử lý lỗi

| Lỗi                             | Nơi xử lý                                      | Kết quả                           |
| ------------------------------- | ---------------------------------------------- | --------------------------------- |
| Thiếu `x-auth-user-id`          | Controller, trước khi gọi use case             | `401`                             |
| Lỗi kiểm tra dữ liệu            | `ValidationPipe`                               | `400`, không tạo bản ghi          |
| Lỗi lưu trữ bản ghi             | Use case, ném lỗi                              | Không có bản ghi, không gọi Judge |
| Lỗi phát việc cho Judge         | Use case, chuyển bản ghi sang `INTERNAL_ERROR` | Bản ghi kết thúc, không bị treo   |
| Kết quả phán quyết không hợp lệ | Consumer, kiểm tra hình thức trước khi áp dụng | Giữ trạng thái cũ, log cảnh báo   |
| Lỗi phát realtime               | Adapter, nuốt và log                           | Bản ghi vẫn hoàn tất              |

Không thêm cấu trúc lỗi mới theo SUB-001. Dùng các exception sẵn có của NestJS đang được
`submissions.controller.ts` và `learning-judge.client.ts` sử dụng.

## Bảo mật

| Mối đe doạ                      | Biện pháp trong kế hoạch                                                          |
| ------------------------------- | --------------------------------------------------------------------------------- |
| Mã nguồn biến thành lệnh        | Truyền qua trường `sourceCode` của `JudgeRequest`; Submission không dựng lệnh nào |
| Client gửi header định danh giả | Gateway đã xoá header trước khi xác thực; Submission chỉ đọc header sau đó        |
| Client gửi dữ liệu judge giả    | `whitelist` + `forbidNonWhitelisted` loại trường lạ trước khi tới use case        |
| Lộ dữ liệu judge qua phản hồi   | DTO kết quả liệt kê tường minh, không tuần tự hoá thẳng entity                    |
| Lộ mã nguồn qua log             | Không log `sourceCode` hay `stdin`; chỉ log định danh bản ghi và mã lỗi           |
| Truy cập bản ghi của người khác | Truy vấn luôn kèm `userId`; Run không có route đọc bản ghi nào                    |

## Chiến lược kiểm thử

| Mã             | Kịch bản kiểm thử                                                                      |
| -------------- | -------------------------------------------------------------------------------------- |
| FR-008, AC-007 | Ngôn ngữ ngoài danh mục, mã nguồn rỗng, `stdin` quá dài → từ chối, không tạo bản ghi   |
| FR-009, AC-016 | Body chứa `userId`/vai trò/quyền → bị từ chối bởi `forbidNonWhitelisted`               |
| AC-008         | Body chứa `expectedOutput`, `testCases`, `timeLimitMs` → trường bị từ chối             |
| FR-010, AC-001 | Run hợp lệ → bản ghi `QUEUED`, `JudgeJobPort.publish` được gọi đúng một lần            |
| FR-011, AC-002 | Kết quả phán quyết tới → trạng thái, thời gian, bộ nhớ được lưu, realtime được phát    |
| AC-003         | Assert **không có** lời gọi `AcceptedEventPort` cho bản ghi `RUN`                      |
| AC-009         | `problemId` không tồn tại → bản ghi vẫn tạo, không có lời gọi HTTP nào tới Learning    |
| FR-014, AC-010 | `JudgeJobPort.publish` ném lỗi → bản ghi ở `INTERNAL_ERROR`, không ở `QUEUED`          |
| FR-015, AC-011 | Áp dụng cùng một kết quả hai lần → không có bản ghi kết quả trùng                      |
| AC-013         | Kết quả không lỗi → trạng thái không phải `WRONG_ANSWER`                               |
| FR-006         | Judge báo `ACCEPTED` cho Run → lưu `EXECUTED`, không phát tiến độ                      |
| FR-005         | `problemId` sai dạng UUID → từ chối; UUID không tồn tại → vẫn chạy, không gọi Learning |
| FR-014         | Watchdog quá 10 phút → `INTERNAL_ERROR`; kết quả về sau không ghi đè                   |
| AC-012         | `RealtimePort` ném lỗi → bản ghi vẫn hoàn tất, không ném lỗi ra ngoài                  |

Kiểm thử phải dùng port giả (fake) chứ không mock repository TypeORM, để chứng minh use case không
phụ thuộc framework.

## Khả năng quan sát

- Log ở mức `debug` cho mỗi lần giao việc: `submissionId`, `mode: 'RUN'`. Không log `sourceCode`
  hay `stdin`.
- Log ở mức `warn` khi phát việc thất bại, kèm `submissionId` và tên lỗi đã chuẩn hoá.
- Dùng `executionId` hiện có làm khoá tương quan xuyên Submission và Judge. Không thêm hệ thống
  correlation ID mới trong phạm vi này.
- Metric vận hành không có trong nền tảng hiện tại; kế hoạch không tự thêm.

## Thứ tự triển khai

1. Tách aggregate domain và các port, chưa đổi hành vi.
2. Thêm migration cột `stdin` và chạy `pnpm migration:run:submission`.
3. Bổ sung `ValidationPipe` `whitelist` + `forbidNonWhitelisted` nếu `main.ts` chưa có.
4. Tạo `RunCodeUseCase` cùng adapter, chuyển route `/api/run` sang dùng use case.
5. Làm consumer mỏng và tách nhánh Run.
6. Viết kiểm thử theo bảng ở mục Chiến lược kiểm thử.
7. Chạy `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build:submission`.

## Rủi ro

| Rủi ro                                                   | Biện pháp giảm thiểu                                                                  |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Judge trả `ACCEPTED` cho Run, khác ý nghĩa Submit        | Ánh xạ thành `EXECUTED` trước khi lưu; không phát tiến độ                             |
| Bản ghi treo hoặc kết quả tới sau timeout                | Watchdog 10 phút và cập nhật trạng thái có điều kiện, terminal là bất biến            |
| Migration cột `stdin` chạy trên môi trường đã có dữ liệu | Cột nullable nên không cần backfill; migration hoàn tác được                          |
| Tách port làm thay đổi hành vi Submit ngoài ý muốn       | Bước 1 chỉ thêm, chưa xoá; xác minh bằng kiểm thử Submit hiện có trước khi dọn tệp cũ |

## Tuân thủ kiến trúc

- **Chiều phụ thuộc:** `controller → use case → domain port ← adapter`. Domain không import
  TypeORM, NestJS, RabbitMQ hay ioredis. `RealtimePort` và `JudgeJobPort` khai báo trong domain và
  được hiện thực ở tầng infrastructure.
- **Quyền sở hữu:** Submission sở hữu bảng `submissions`. Không có khoá ngoại xuyên service; `problem_id`
  là UUID thuần túy.
- **Ranh giới module:** `modules/run-code` chỉ chứa use case Run và DTO của nó. Aggregate và port
  dùng chung đặt ở `modules/submissions/domain` vì `submission-service.md` nói rõ Run và Submit có
  thể dùng chung aggregate vòng đời.
- **Ngoại lệ đã được phê duyệt:** Không có. Nếu triển khai cần thêm abstraction không có trong
  `submission-service.md`, phải dừng và báo cáo.
- **Không đưa vào service này:** mã biên dịch, runner, sandbox, mã của Judge.

## Quyết định đã chốt

`EXECUTED` cho Run thành công, 3000 ms/256 MB cố định, watchdog 10 phút, không quyền riêng/không
quota, `problemId` UUID nullable không tra Learning. Không còn câu hỏi chặn kế hoạch.

> `plan.md` mô tả NHƯ THẾ NÀO. Nó KHÔNG ĐƯỢC thêm hành vi, tác nhân hay tiêu chí nghiệm thu vượt
> ngoài `spec.md` Approved.
