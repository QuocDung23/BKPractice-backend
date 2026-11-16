# LRN-006 Kế hoạch triển khai Tiến độ học tập

> Amendment `1.1` Approved 2026-11-12: Course progress dùng Learning Item chung cho Problem và Quiz.
> Quiz completion được đọc từ attempt `FINISHED` có `passed=true`; không thêm bảng hoặc migration.

> Cập nhật 2026-11-07: [LRN-008](../self-study/spec.md) thay thế mọi quy định về LECTURER, sở hữu riêng của người tạo, Class, Enrollment, Assignment và tiến độ theo lớp trong tài liệu này. Các yêu cầu còn lại vẫn áp dụng.

> Cập nhật triển khai 2026-11-07: Luồng ghi `submission.accepted` và ba API đọc tiến độ cá nhân đã triển khai theo domain/use case/port/adapter, dưới phạm vi LRN-008. Phần đọc được kiểm thử trên PostgreSQL cách ly; phần retry/DLQ được kiểm thử với RabbitMQ thật.

## Sửa lỗi review PR — 2026-11-07

Chuẩn hoá bốn UUID của accepted event thành chữ thường sau khi kiểm tra định dạng. Ghi nhận, so identity và chống trùng dùng cùng biểu diễn với PostgreSQL. Kiểm thử sự kiện hoa/thường cho cùng một cặp user/Problem trên PostgreSQL, bao gồm gửi lại cùng eventId ở kiểu chữ khác.

## Triển khai phần đọc tự học — 2026-11-07

Theo yêu cầu chủ dự án, hoàn thiện ba use case/API `ListMySolvedProblems`, `GetMySolvedStatus`, `GetMyCourseProgress` của LRN-006, dưới phạm vi LRN-008. Các phần Class/Assignment và Clock phục vụ hạn chót đã bị thay thế, không phải phụ thuộc chặn phần đọc.

- Mỗi use case/inbound port một file; controller, DTO, mapper, filter ở `presentation/http`; barrel và alias theo working agreement.
- `ProgressRepository` bổ sung `findSolved` và `listSolved`. `listSolved` lọc Problem công khai bằng join trong cùng truy vấn trước phân trang và đếm tổng; tránh lộ số lượng bài bị ẩn. `PublishedProblemFilter` phục vụ tra trạng thái theo danh sách; kết quả giữ thứ tự đầu vào, UUID chuẩn hoá trước kiểm trùng.
- `CourseStructureReader` là port riêng của Progress, adapter chỉ SELECT trên bảng Learning, không import entity/repository của Course/Problem. Course chưa export truy vấn cấu trúc công khai nên reader dùng một truy vấn left join có lọc, giữ Chapter rỗng. Test so với API Course trên cùng dữ liệu để ngăn lệch chính sách hiển thị.
- `CompletionCount` và `CourseCompletionCalculator` chỉ tính trong domain; đọc tiến độ không mở transaction ghi, không lưu số liệu tổng hợp. Progress context dùng storage chung của Learning và cung cấp manager mặc định cho SELECT.
- Gateway đã có allowlist ba route, chỉ kiểm chứng lại; không sửa transport contract hay thêm route ghi.
- Test PostgreSQL/Nest module thật: dữ liệu nhiều người dùng, ẩn/mở Problem, gỡ khỏi Course, Course không công khai, Chapter rỗng, phân trang và query sai; các response chỉ chứa trường đã được plan liệt kê.

## Trạng thái

Approved

Được chủ sở hữu sản phẩm phê duyệt ngày `2026-09-30` (phê duyệt gộp: chủ sở hữu duyệt trước các
phương án đề xuất).

Kế hoạch này bám theo phiên bản `1.0` (Approved) của đặc tả LRN-006. Nó là tài liệu thiết kế, không
triển khai code và không thay đổi đặc tả. Các vấn đề chưa tự quyết được nằm ở mục
[Vấn đề cần chủ sở hữu xem lại](#vấn-đề-cần-chủ-sở-hữu-xem-lại).

## Đặc tả liên quan

- [LRN-006 Tiến độ học tập](./spec.md)
- Trạng thái: `Approved`
- Phiên bản: `1.0`
- Ngày phê duyệt: `2026-09-30`

Đặc tả là nguồn chân lý cho việc ghi tiến độ từ `submission.accepted`, tính idempotent, thời điểm
giải sớm nhất, các phép tổng hợp và phân quyền. Kế hoạch này không thêm hành vi nào ngoài đặc tả.

## Service đích

Service: Learning Service

Module `progress` hiện có (`apps/learning-service/src/modules/progress/`), trong
`bkpractice_learning`. API Gateway chỉ cần thêm một tiền tố định tuyến (xem mục Cấu hình). Không tạo
microservice mới.

## Kiến trúc service bắt buộc

Kiến trúc: **DDD + Hexagonal Architecture** (theo
[ADR 0002](../../../adr/0002-revised-service-internal-architectures.md)).

```text
presentation (REST controller, RabbitMQ consumer) -> application -> domain
infrastructure ----implements----^ các port của application/domain
```

- Consumer RabbitMQ và REST controller là driving adapter, mỗi cái gọi đúng một use case.
- Domain không import NestJS, TypeORM hay RabbitMQ.
- Chỉ dùng DDD tactical. Aggregate `ProblemProgress` được biện minh bởi bất biến "thời điểm giải là
  lần đạt sớm nhất, điểm là điểm cao nhất". Phép tính hoàn thành Course và điểm Assignment là domain
  service thuần. Không thêm bounded context, CQRS hay event store.
- Đây chính là bước "tách use case `ApplyAcceptedSubmission`" mà
  [learning-service.md](../../../architecture/learning-service.md) mục Incremental alignment
  yêu cầu khi luồng tiến độ thay đổi lần tới.

## Ảnh hưởng tới mã nguồn hiện có

### Nền tảng hiện tại (kết quả khảo sát)

- `progress` (migration `1700000003000-InitialLearningSchema.ts`): `id` uuid PK, `user_id` uuid, `problem_id`
  uuid, `status` enum `progress_status_enum` (`ATTEMPTED`, `SOLVED`) NOT NULL, `best_score` integer
  mặc định 0, `solved_at` timestamptz null, `last_event_id` uuid null, `updated_at`,
  `UNIQUE (user_id, problem_id)`. Không có khoá ngoại tới `problems` và không có CHECK.
- Entity `Progress` (`modules/progress/entities/progress.entity.ts`) ánh xạ đúng bảng trên, enum
  `ProgressStatus`.
- `ProgressConsumer` (`modules/progress/progress.consumer.ts`) tiêu thụ
  `RABBIT_QUEUES.learningAccepted` qua `RabbitMqService.consume`, đọc dòng theo
  `(userId, problemId)`, bỏ qua nếu `lastEventId === event.eventId`, rồi đặt `SOLVED`,
  `bestScore = max`, `solvedAt ??= occurredAt`, `lastEventId = eventId`, `save`. Không có transaction,
  không kiểm tra payload.
  - Gửi lại một sự kiện cũ hơn sự kiện gần nhất không bị coi là trùng (chỉ so sự kiện gần nhất).
  - `solvedAt ??=` giữ thời điểm của sự kiện được xử lý trước, không phải `occurredAt` sớm nhất.
  - Hai sự kiện đồng thời cho cặp chưa có dòng: cả hai `findOneBy` ra rỗng, lần `save` thứ hai vi phạm
    `UNIQUE` và rơi vào luồng thử lại.
- `RabbitMqService` (`libs/common/src/messaging/rabbitmq.service.ts`): `prefetch(1)`, ACK sau khi
  handler xong; handler ném lỗi thì publish lại message vào cùng exchange/routing key với header
  `x-retry-count` tăng dần (ngay lập tức, không có độ trễ), tới 3 lần; lần thứ 4 thất bại thì
  `nack(requeue=false)` và message vào `learning.submission.accepted.dead` qua
  `bkpractice.dead-letter`. JSON hỏng cũng đi đường này.
- Contract `SubmissionAcceptedEvent` (`libs/contracts/src/submission.contracts.ts`):
  `eventId`, `occurredAt` (chuỗi ISO), `submissionId`, `userId`, `problemId`, `score`. Hằng số
  exchange `bkpractice.learning`, routing key `submission.accepted`, queue
  `learning.submission.accepted` trong `messaging.constants.ts`.
- Bên phát (`apps/submission-service/.../judge-result.consumer.ts`, chỉ đọc để hiểu): `eventId` là
  `acceptedEventId` được sinh một lần và lưu; `occurredAt` là `submission.updatedAt` lúc phát; message
  mang `messageId = eventId`.
- Gateway (`apps/api-gateway/src/proxy/gateway-proxy.service.ts`) chuyển tới Learning các tiền tố
  `/api/problems`, `/api/courses`, `/api/assignments`, `/api/classes`; chưa có `/api/progress`.
- Chưa có REST API nào cho tiến độ.

### Phân loại thay đổi

| Phân loại | Nội dung                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REUSE     | Bảng `progress` và cột hiện có; `RabbitMqService` và topology queue/DLQ; contract `SubmissionAcceptedEvent` và hằng số messaging (không đổi); `TransactionRunner` và cơ chế principal tin cậy (`@TrustedPrincipal()`/`TrustedPrincipalGuard`) của LRN-001; `ValidationPipe` toàn cục; bảng `chapters`/`chapter_problems` (LRN-003), `classes`/`enrollments` (LRN-004), `assignments`/`assignment_problems` (LRN-005) chỉ để đọc |
| MODIFY    | Entity `Progress` (giữ enum, domain không ghi `ATTEMPTED`); `progress.module.ts` (nối dây use case, port, adapter, controller); `gateway-proxy.service.ts` (thêm tiền tố `/api/progress`)                                                                                                                                                                                                                                       |
| CREATE    | Domain `ProblemProgress`, `AcceptedSubmission`, `CompletionCount`, `CourseCompletionCalculator`, `AssignmentScoreCalculator`; port và adapter; 7 use case; consumer mới ở `presentation`; 2 controller và DTO; entity `ProgressEventReceipt`; migration `Lrn006Progress`; test                                                                                                                                                  |
| REMOVE    | `modules/progress/progress.consumer.ts` (thay bằng consumer mỏng gọi `ApplyAcceptedSubmission`)                                                                                                                                                                                                                                                                                                                                 |

Không sửa `libs/contracts`, `libs/common` hay bất cứ file nào của Submission.

## Thay đổi ở tầng domain

### Value object `AcceptedSubmission`

Dựng từ payload chưa kiểm tra (`unknown`) bằng `AcceptedSubmission.parse`. Bất biến:

- `eventId`, `submissionId`, `userId`, `problemId`: UUID hợp lệ.
- `occurredAt`: chuỗi ISO 8601 parse ra thời điểm hợp lệ.
- `score`: số nguyên ≥ 0.

Sai bất kỳ điều nào thì ném `InvalidAcceptedSubmission` (LRN-006-FR-009). Không import
class-validator; kiểm tra thuần TypeScript để domain không phụ thuộc framework.

### Aggregate `ProblemProgress`

Khoá theo `(userId, problemId)`. Trường: `solvedAt: Date`, `bestScore: number`, `lastEventId`.

- `ProblemProgress.firstSolve(e)`: tạo với `solvedAt = e.occurredAt`, `bestScore = e.score`.
- `applyAccepted(e)`: `solvedAt = min(solvedAt, e.occurredAt)`, `bestScore = max(bestScore, e.score)`,
  `lastEventId = e.eventId`. Hai phép min/max giao hoán và luỹ đẳng (LRN-006-FR-005, FR-006).
- `isSolved` luôn đúng với aggregate đã tồn tại; không có trạng thái `ATTEMPTED` (FR-007).
- Việc bỏ qua sự kiện trùng không nằm trong aggregate mà ở use case, dựa trên biên nhận sự kiện (xem
  Lưu trữ), vì nó phải đúng cả với sự kiện cũ hơn sự kiện gần nhất.

`last_event_id` từ nay chỉ là thông tin chẩn đoán ("sự kiện áp dụng gần nhất"), không còn dùng để
khử trùng.

### Domain service

| Tên                          | Đầu vào                                                                                            | Kết quả                                                                                                             | Truy vết               |
| ---------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `CourseCompletionCalculator` | Cấu trúc hiển thị (Chapter có thứ tự, Problem hiển thị có thứ tự) + tập Problem đã giải            | `CompletionCount` toàn Course và từng Chapter, danh sách đã giải                                                    | FR-012, FR-014, FR-015 |
| `AssignmentScoreCalculator`  | Danh sách `(problemId, maxScore)`, `deadlineAt`, bản đồ `problemId → solvedAt`, thời điểm hiện tại | Điểm từng Problem (`maxScore` nếu `solvedAt ≤ deadlineAt`, ngược lại 0), tổng, tối đa, `isFinal = now > deadlineAt` | FR-013, FR-016         |

`CompletionCount` là value object `{ solved, total }` với `0 ≤ solved ≤ total`; `0/0` hợp lệ.

## Tầng application / Use case

| Use case                        | Tác nhân / quyền                        | Luồng chính                                                                                                                                                                                                                                                             | Truy vết                           |
| ------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `ApplyAcceptedSubmission`       | Consumer (service tin cậy qua queue)    | `AcceptedSubmission.parse`; trong `TransactionRunner`: `recordReceipt` (trùng thì trả `DUPLICATE`, commit); `insertIfAbsent(firstSolve)`; nếu đã có dòng thì `loadForUpdate`, `applyAccepted`, `save`; trả `APPLIED`                                                    | FR-002–FR-010; AC-001–AC-009       |
| `ListMySolvedProblems`          | Đã xác thực, chính mình                 | Liệt kê tiến độ của principal, chỉ Problem đang `PUBLISHED` chưa xoá mềm, sắp `solved_at DESC, problem_id`, phân trang                                                                                                                                                  | FR-011; AC-010                     |
| `GetMySolvedStatus`             | Đã xác thực, chính mình                 | Với ≤ 100 định danh: đã giải và thời điểm giải; Problem không hiển thị trả chưa giải                                                                                                                                                                                    | FR-011; SR-004                     |
| `GetMyCourseProgress`           | Đã xác thực, chính mình                 | `CourseStructureReader.loadVisibleStructure` (null → `NotFound`); đọc Problem đã giải và Quiz đã pass của principal; `CourseCompletionCalculator` tính Learning Item                                                                                                    | FR-012/019/020; AC-011–013/025–027 |
| `GetMyAssignmentScore`          | Sinh viên đang đăng ký                  | `AssignmentReader.load`; `ClassMembershipReader.isEnrolled(classId, principal)`; Assignment phải hiển thị với sinh viên theo LRN-005 tại `Clock.now()`; thiếu điều nào thì `NotFound`; đọc tiến độ; `AssignmentScoreCalculator`; chỉ trả Problem hiển thị với sinh viên | FR-013; AC-014–AC-017              |
| `GetClassCourseProgress`        | `class:read-managed` + chủ sở hữu Class | Kiểm quyền; nạp Class (`NotFound`); `lecturerId` = principal (khác thì `Forbidden`); cấu trúc hiển thị của Course của Class (null → `NotFound`); trang sinh viên đang đăng ký; đếm đã giải theo từng sinh viên bằng một truy vấn gộp                                    | FR-014; AC-018, AC-019             |
| `GetClassStudentCourseProgress` | `class:read-managed` + chủ sở hữu Class | Như trên; sinh viên phải đang đăng ký (khác thì `NotFound`); `CourseCompletionCalculator` cho sinh viên đó                                                                                                                                                              | FR-015; AC-019, AC-022             |
| `GetClassAssignmentScores`      | `class:read-managed` + chủ sở hữu Class | Kiểm quyền và sở hữu; Assignment phải thuộc Class và chủ sở hữu thấy được theo LRN-005 (khác thì `NotFound`); trang sinh viên đang đăng ký; đọc tiến độ gộp; `AssignmentScoreCalculator` từng sinh viên                                                                 | FR-016; AC-018, AC-019, AC-023     |

Mọi use case đọc chỉ chạy SELECT, không mở transaction ghi (FR-017, FR-018). Thứ tự kiểm tra ở use
case của lớp: quyền `class:read-managed` → tồn tại Class → sở hữu, để người thiếu quyền không dò được
Class nào tồn tại.

### Port

| Port                     | Trách nhiệm                                                                                                                                                                                                             | Adapter                                         |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `ProgressRepository`     | Ghi: `recordReceipt`, `insertIfAbsent`, `loadForUpdate`, `save`. Đọc: `findSolved(userId, problemIds)`, `listSolved(userId, page)`, `countSolvedByUsers(userIds, problemIds)`, `findSolvedByUsers(userIds, problemIds)` | TypeORM (`progress`, `progress_event_receipts`) |
| `CourseStructureReader`  | Cấu trúc Course `PUBLISHED` chưa xoá: Chapter và Learning Item Problem/Quiz đang hiển thị; `null` nếu Course không hiển thị                                                                                             | TypeORM chỉ đọc                                 |
| `QuizCompletionReader`   | Thời điểm pass đầu tiên theo user + Quiz từ attempt `FINISHED`, không phụ thuộc revision hiện tại                                                                                                                       | TypeORM chỉ đọc `quiz_attempts`                 |
| `ClassMembershipReader`  | Nạp Class (`id`, `courseId`, `lecturerId`, `status`); `isEnrolled`; trang sinh viên đang đăng ký (`studentId`, `enrolledAt`) và tổng số                                                                                 | TypeORM chỉ đọc                                 |
| `AssignmentReader`       | Nạp Assignment theo `(classId?, assignmentId)` với `deadlineAt`, các trường quyết định hiển thị của LRN-005, danh sách `(problemId, maxScore, order, visibleToStudent)`                                                 | TypeORM chỉ đọc                                 |
| `PublishedProblemFilter` | Lọc một tập `problemId` còn `PUBLISHED` chưa xoá mềm (cho `ListMySolvedProblems`, `GetMySolvedStatus`)                                                                                                                  | TypeORM chỉ đọc                                 |
| `Clock`                  | Thời điểm hiện tại, để kiểm thử `startsAt`/`deadlineAt`/`isFinal` không phụ thuộc đồng hồ thật                                                                                                                          | `SystemClock`                                   |
| `TransactionRunner`      | (LRN-001) transaction cho `ApplyAcceptedSubmission`                                                                                                                                                                     | DataSource                                      |

Principal tin cậy không phải port: controller dùng `@TrustedPrincipal()`/`TrustedPrincipalGuard`
của LRN-001 và truyền `Principal` vào use case.

Ba reader chéo module là port riêng của `progress`, vì tiến độ chỉ cần một phép chiếu chỉ đọc rất hẹp
của Course, Class và Assignment. Chúng thuộc cùng bounded context và cùng cơ sở dữ liệu; chúng không
ghi và không dùng repository ghi của module khác. Nếu module sở hữu (LRN-003/004/005) đã export một
truy vấn hiển thị tương đương khi LRN-006 được triển khai, adapter gọi truy vấn đó thay vì tự viết
lại điều kiện.

## Lưu trữ

- Cơ sở dữ liệu sở hữu: `bkpractice_learning`. Không truy cập cơ sở dữ liệu của Submission hay
  Identity.
- **Biên nhận sự kiện** `progress_event_receipts`: một dòng cho mỗi `eventId` đã áp dụng. `recordReceipt`
  là `INSERT ... ON CONFLICT (event_id) DO NOTHING RETURNING event_id`; không có dòng trả về nghĩa là
  trùng. Biên nhận và thay đổi tiến độ nằm trong cùng một transaction, nên một lần áp dụng thất bại
  không để lại biên nhận (FR-010).
- **`insertIfAbsent`**: chèn dòng với `status = 'SOLVED'` bằng
  `INSERT ... ON CONFLICT (user_id, problem_id) DO NOTHING RETURNING id`.
- **`loadForUpdate`**: `SELECT ... FROM progress WHERE user_id = $1 AND problem_id = $2 FOR UPDATE`.
- **Đồng thời:** hai sự kiện khác nhau cho cùng cặp chưa có dòng: một bên chèn được, bên kia chờ khoá
  của chỉ mục duy nhất, rồi `DO NOTHING`, rồi `loadForUpdate` và gộp — kết quả như tuần tự (AC-006).
  Cùng một `eventId` tới hai instance: bên thứ hai chờ khoá khoá chính của biên nhận rồi thấy trùng.
- **Đọc "đã giải":** luôn lọc `status = 'SOLVED' AND solved_at IS NOT NULL`.
- **Truy vấn gộp cho lớp:** đếm dòng đã giải theo `user_id` với điều kiện
  `user_id = ANY($1) AND problem_id = ANY($2) AND status = 'SOLVED'`, `GROUP BY user_id`; với Assignment dùng
  `findSolvedByUsers` trả `(user_id, problem_id, solved_at)` rồi tính trong domain. Một trang tối đa
  100 sinh viên; Course tối đa 2.500 Problem (50 × 50 theo LRN-003-FR-015). Chỉ mục duy nhất
  `(user_id, problem_id)` hiện có phục vụ các truy vấn này.
- **Reader chéo module:** `CourseStructureReader` union projection `chapter_problems` → `problems`
  và `chapter_quizzes` → `quizzes`, chỉ giữ root `PUBLISHED` chưa xoá mềm, sắp theo Chapter và thứ tự
  riêng của từng loại. `QuizCompletionReader` lấy `MIN(finished_at)` của attempt `FINISHED` có
  `passed=true` theo user + Quiz. `ClassMembershipReader` đọc `classes`,
  `enrollments`. `AssignmentReader` đọc `assignments`, `assignment_problems`. Tên cột trạng thái/xoá
  mềm theo migration của LRN-003/004/005.

## Thay đổi cơ sở dữ liệu

Đích: `bkpractice_learning`.

- Bảng mới `progress_event_receipts`: `event_id` uuid PK, `user_id` uuid NOT NULL, `problem_id` uuid
  NOT NULL, `received_at` timestamptz NOT NULL DEFAULT `now()`. Không khoá ngoại (`user_id` là ID ngoài
  của Identity; `problem_id` không cần ràng buộc vì tiến độ không ràng buộc Problem).
- `progress`: thêm `CHECK (best_score >= 0)` và
  `CHECK (status <> 'SOLVED' OR solved_at IS NOT NULL)`.
- Giữ giá trị enum `ATTEMPTED` và cột `last_event_id` để không phá dữ liệu hay tương thích; domain
  không ghi `ATTEMPTED`.
- Không thêm chỉ mục mới trên `progress`.

Không có khoá ngoại hay truy vấn xuyên service.

## Migration

`apps/learning-service/src/database/migrations/<timestamp>-Lrn006Progress.ts`, chạy sau các migration
của LRN-003, LRN-004 và LRN-005, `synchronize: false`.

- **Up:**
  1. Kiểm tra trước: nếu có dòng `progress` với `best_score < 0` hoặc
     `status = 'SOLVED' AND solved_at IS NULL` thì dừng migration với thông báo rõ (code hiện có không tạo ra dòng như vậy).
  2. Tạo `progress_event_receipts`.
  3. Chép `last_event_id` khác null của `progress` vào biên nhận (`ON CONFLICT DO NOTHING`), để sự kiện
     đã áp dụng trước đó vẫn được nhận là trùng.
  4. Thêm hai CHECK trên `progress`.
- **Down:** bỏ hai CHECK; bỏ `progress_event_receipts`. Dữ liệu `progress` không đổi.
- Kiểm chứng bằng `pnpm migration:run:learning` / `pnpm migration:revert:learning` trên cơ sở dữ liệu
  cách ly có dữ liệu tiến độ mẫu.

## API

Tiền tố mới `/api/progress`, được Gateway chuyển tới Learning (xem Cấu hình). Tất cả route là `GET`,
cần Bearer token.

| Method + route                                                  | Use case                        | Phản hồi                                                                                                                                               |
| --------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/progress/me/problems`                                 | `ListMySolvedProblems`          | `200` trang `{ items: [{ problemId, solvedAt }], page, limit, total }`                                                                                 |
| `GET /api/progress/me/problems/status?problemIds=...`           | `GetMySolvedStatus`             | `200` `[{ problemId, solved, solvedAt }]` theo thứ tự đầu vào                                                                                          |
| `GET /api/progress/me/courses/:courseId`                        | `GetMyCourseProgress`           | `200` `CourseProgressDto`                                                                                                                              |
| `GET /api/progress/me/assignments/:assignmentId`                | `GetMyAssignmentScore`          | `200` `AssignmentScoreDto`                                                                                                                             |
| `GET /api/progress/classes/:classId/course`                     | `GetClassCourseProgress`        | `200` `{ courseId, totalProblems, items: [{ studentId, enrolledAt, solved }], page, limit, total }`                                                    |
| `GET /api/progress/classes/:classId/students/:studentId/course` | `GetClassStudentCourseProgress` | `200` `CourseProgressDto`                                                                                                                              |
| `GET /api/progress/classes/:classId/assignments/:assignmentId`  | `GetClassAssignmentScores`      | `200` `{ assignmentId, deadlineAt, maxScore, isFinal, items: [{ studentId, score, problems: [{ problemId, score, solvedAt }] }], page, limit, total }` |

- Route `.../me/problems/status` khai báo trước mọi route có tham số cùng cấp.
- Không có route ghi. Swagger mô tả mọi route, ví dụ dùng UUID giả.
- Tương thích: toàn bộ là route mới; không route hiện có nào đổi.

## DTO / Kiểm tra dữ liệu

- Tham số route `courseId`, `assignmentId`, `classId`, `studentId`: `ParseUUIDPipe`.
- `PageQueryDto`: `page` int ≥ 1 mặc định 1; `limit` int 1..100 mặc định 20.
- `SolvedStatusQueryDto`: `problemIds` chuỗi phân tách bằng dấu phẩy, biến đổi thành mảng UUID không
  trùng, 1..100 phần tử.
- `ValidationPipe` toàn cục (`whitelist`, `forbidNonWhitelisted`) làm query có `userId` hay trường lạ
  bị `400` (SR-002, AC-021).
- Response DTO ánh xạ tường minh, không trả entity:
  - `CourseProgressDto`: `courseId`, `completed`, `total`,
    `chapters: [{ chapterId, completed, total }]`,
    `completedItems: [{ type: 'PROBLEM' | 'QUIZ', itemId, completedAt }]`.
    Trong giai đoạn tương thích, giữ alias deprecated `solved = completed`, Chapter `solved = completed`
    và projection Problem-only `solvedProblems`; client mới MUST dùng contract Learning Item.
  - `AssignmentScoreDto`: `assignmentId`, `deadlineAt`, `score`, `maxScore`, `isFinal`,
    `problems: [{ problemId, passed, score, maxScore, solvedAt }]` (chỉ Problem hiển thị với sinh viên).
- Không có trường tên, email, mã nguồn, Test Case hay kết quả chấm (SR-005, AC-024).

## Phân quyền

- Principal từ `@TrustedPrincipal()`/`TrustedPrincipalGuard` của LRN-001 tại presentation (header
  `x-auth-user-id`, `x-auth-permissions` do Gateway đặt lại). Thiếu `x-auth-user-id` → `401`; thiếu
  quyền → coi là rỗng.
- Route `me/*`: chỉ cần principal hợp lệ; `userId` luôn là principal, không có tham số người dùng.
- Route `classes/*`: `ClassProgressAuthorization` trong tầng application kiểm tra
  `permissions` chứa `class:read-managed` và `class.lecturerId === principal.userId`. `ADMIN` không có
  ngoại lệ.
- **Seed quyền ở Identity:** N/A — LRN-006 không thêm mã quyền. `class:read-managed` được định nghĩa
  và seed cho `LECTURER` bởi task seed của LRN-004.
- Kiểm thử phân quyền cả khẳng định (chủ sở hữu có quyền) lẫn phủ định (không phải chủ sở hữu,
  `STUDENT` của lớp, `ADMIN`, chưa xác thực).

## Messaging / Sự kiện

| Mục          | Giá trị                                                                                                   |
| ------------ | --------------------------------------------------------------------------------------------------------- |
| Exchange     | `bkpractice.learning` (direct), không đổi                                                                 |
| Routing key  | `submission.accepted`, không đổi                                                                          |
| Queue        | `learning.submission.accepted` (durable, DLX `bkpractice.dead-letter`), không đổi                         |
| DLQ          | `learning.submission.accepted.dead`, routing key `submission.accepted.dead`, không đổi                    |
| Bên phát     | Submission (`JudgeResultConsumer.publishAcceptedIfNeeded`), `messageId = eventId`                         |
| Bên tiêu thụ | Learning `SubmissionAcceptedConsumer` → `ApplyAcceptedSubmission`                                         |
| Contract     | `SubmissionAcceptedEvent`, không đổi                                                                      |
| Idempotent   | Biên nhận theo `eventId` trong cùng transaction với thay đổi tiến độ; phép gộp min/max giao hoán          |
| ACK          | `RabbitMqService` ACK khi use case trả về (`APPLIED` hoặc `DUPLICATE`)                                    |
| Retry        | Use case ném lỗi (payload sai, lỗi cơ sở dữ liệu) → cơ chế hiện có publish lại tối đa 3 lần, không độ trễ |
| DLQ          | Lần thất bại thứ 4 → `nack(requeue=false)` → DLQ. Đưa lại từ DLQ an toàn nhờ biên nhận (FR-010)           |

- Payload sai định dạng: consumer không bắt lỗi của `AcceptedSubmission.parse`, để message đi đường
  thử lại rồi vào DLQ (FR-009). Ba lần thử lại vô ích là chấp nhận được; đổi `RabbitMqService` để phân
  biệt lỗi không thể thử lại ảnh hưởng tới consumer của Submission và Judge nên không làm trong LRN-006
  (xem mục Vấn đề cần chủ sở hữu xem lại).
- LRN-006 không phát event nào.

## Realtime

N/A. Đặc tả loại trừ thông báo realtime khi tiến độ thay đổi.

## Adapter hạ tầng

- `infrastructure/persistence/progress.repository.ts`: `ProgressRepository` bằng TypeORM
  `EntityManager` của transaction hiện tại cho các lệnh ghi.
- `infrastructure/persistence/progress-event-receipt.entity.ts`: entity cho `progress_event_receipts`,
  đăng ký trong `learning.entities.ts`.
- `infrastructure/readers/course-structure.reader.ts`, `class-membership.reader.ts`,
  `assignment.reader.ts`, `published-problem.filter.ts`: adapter chỉ đọc.
- `infrastructure/system-clock.ts`: `Clock`.
- `presentation/submission-accepted.consumer.ts`: đăng ký `RabbitMqService.consume` ở
  `onModuleInit`, gọi `ApplyAcceptedSubmission`, log kết quả.
- `presentation/my-progress.controller.ts`, `presentation/class-progress.controller.ts`.
- Entity `Progress` ở `entities/` giữ nguyên chỗ; mapper chuyển giữa entity và `ProblemProgress` ở
  adapter.

## Cấu hình

- `apps/api-gateway/src/proxy/gateway-proxy.service.ts`: thêm `'/api/progress'` vào danh sách tiền tố
  của `LEARNING_SERVICE_URL`. Không thêm biến môi trường.
- Không đổi `.env.example`, Docker, RabbitMQ hay `libs/contracts`.

## Xử lý lỗi

| Điều kiện                                                                              | Ánh xạ                                                   |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Thiếu/sai token                                                                        | `401` qua Gateway; thiếu principal ở Learning cũng `401` |
| Thiếu `class:read-managed` hoặc không phải chủ sở hữu Class                            | `403`                                                    |
| Course không hiển thị; Class, Assignment, sinh viên không tìm thấy hoặc không hiển thị | `404`                                                    |
| UUID sai, `problemIds` quá 100, phân trang sai, trường lạ                              | `400`                                                    |
| Lỗi lưu trữ khi đọc                                                                    | Lỗi chuẩn hoá hiện có (`500`)                            |
| `InvalidAcceptedSubmission` trong consumer                                             | Ném lại → retry → DLQ; không đổi tiến độ                 |
| Lỗi cơ sở dữ liệu khi áp dụng                                                          | Transaction rollback → retry → DLQ                       |
| Sự kiện trùng                                                                          | Trả `DUPLICATE`, ACK                                     |

Không đưa vào cấu trúc lỗi mới.

## Bảo mật

| Yêu cầu | Cách thực thi                                                                                                                 |
| ------- | ----------------------------------------------------------------------------------------------------------------------------- |
| SR-001  | Quyền, sở hữu, đăng ký kiểm trong use case, không ở controller                                                                |
| SR-002  | Principal chỉ từ decorator/guard tin cậy của LRN-001; route `me/*` không có tham số người dùng; `forbidNonWhitelisted`        |
| SR-003  | Use case `me/*` chỉ truy vấn theo principal; use case lớp giới hạn theo sinh viên đang đăng ký và Course/Assignment của Class |
| SR-004  | Reader chỉ trả nội dung hiển thị; không hiển thị thì `404` hoặc coi là chưa giải                                              |
| SR-005  | DTO không có trường mã nguồn, Test Case, harness, kết quả chấm                                                                |
| SR-006  | Không có route ghi; chỉ consumer của queue nội bộ gọi `ApplyAcceptedSubmission`                                               |
| SR-007  | Chỉ datasource Learning; không khoá ngoại xuyên service                                                                       |
| SR-008  | Log sự kiện chỉ gồm `eventId`, `problemId`, kết quả; không log header hay payload thô                                         |
| SR-009  | Thiếu principal hoặc quyền thì từ chối trước khi đọc dữ liệu                                                                  |

## Chiến lược kiểm thử

- **Unit (domain, không cần PostgreSQL):** `AcceptedSubmission.parse` với mọi trường sai (AC-007);
  `ProblemProgress` min/max, và kiểm thử theo mọi hoán vị của một tập sự kiện có lặp (AC-003, AC-004,
  AC-005); `CourseCompletionCalculator` với Chapter rỗng, 0/0; `AssignmentScoreCalculator` với giải
  trước hạn, đúng hạn, trễ, giải trước khi giao, `isFinal` (AC-014, AC-015, AC-016).
- **Unit (application, port giả):** `ApplyAcceptedSubmission` trùng/mới/đã có dòng (AC-001, AC-002);
  không bao giờ ghi `ATTEMPTED` (AC-009); use case đọc với `Clock` giả; phân quyền lớp (AC-019), sinh
  viên không đăng ký (AC-017, AC-022).
- **Integration (lưu trữ, PostgreSQL):** biên nhận và tiến độ cùng rollback; hai sự kiện đồng thời cho
  cặp mới (AC-006); cùng `eventId` đồng thời; sự kiện cũ tới lại sau sự kiện mới (AC-002); lỗi cơ sở
  dữ liệu rồi đưa lại (AC-008); migration up/down có dữ liệu mẫu và bước chép `last_event_id`.
- **Integration (messaging):** payload hỏng đi hết 3 lần thử rồi vào DLQ và tiến độ không đổi (AC-007).
- **API/E2E:** `401` (AC-020); liệt kê đã giải lọc Problem `ON_HOLD` (AC-010); tiến độ Course với
  Problem `ON_HOLD`/xoá mềm và Course không `PUBLISHED` (AC-011, AC-012, AC-013); điểm Assignment
  (AC-014–AC-017); tiến độ lớp chỉ có sinh viên đang đăng ký, rời lớp (AC-018, AC-023); trường lạ
  `userId` (AC-021); soi phản hồi không có trường cấm (AC-024).
- Chạy `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.

## Khả năng quan sát

- Giữ correlation ID hiện có cho REST.
- Consumer log một dòng mỗi sự kiện: `eventId`, `problemId`, kết quả (`APPLIED`, `DUPLICATE`,
  `INVALID`, lỗi), số lần thử (`x-retry-count`). Không log header, token hay payload thô.
- Vận hành theo dõi độ dài `learning.submission.accepted.dead` qua giao diện quản trị RabbitMQ hiện có.
  Không thêm hệ thống metric mới.

## Truy vết yêu cầu

| Yêu cầu        | Đường triển khai                                           | Kiểm chứng                               |
| -------------- | ---------------------------------------------------------- | ---------------------------------------- |
| FR-001, FR-002 | Chỉ Learning ghi; không route ghi                          | Rà soát; SR-006                          |
| FR-003         | `ApplyAcceptedSubmission`, `ProblemProgress.firstSolve`    | Unit/integration; AC-001                 |
| FR-004         | `progress_event_receipts` + `recordReceipt`                | Integration; AC-002, AC-008              |
| FR-005, FR-006 | `ProblemProgress.applyAccepted` (min/max), khoá dòng       | Unit hoán vị, integration; AC-003–AC-006 |
| FR-007         | Domain không có `ATTEMPTED`                                | Unit; AC-009                             |
| FR-008         | Không xoá tiến độ; lọc lúc đọc                             | API; AC-010, AC-013, AC-023              |
| FR-009, FR-010 | `AcceptedSubmission.parse`; transaction; retry/DLQ hiện có | Integration; AC-007, AC-008              |
| FR-011         | `ListMySolvedProblems`, `GetMySolvedStatus`                | API; AC-010                              |
| FR-012         | `GetMyCourseProgress`, `CourseCompletionCalculator`        | Unit/API; AC-011–AC-013                  |
| FR-013         | `GetMyAssignmentScore`, `AssignmentScoreCalculator`        | Unit/API; AC-014–AC-017                  |
| FR-014–FR-016  | Use case lớp, `ClassProgressAuthorization`                 | API; AC-018, AC-019, AC-022, AC-023      |
| FR-017, FR-018 | Tính lúc đọc; use case đọc không ghi                       | Rà soát                                  |
| SR-001–SR-009  | Mục Bảo mật                                                | Test bảo mật; AC-019–AC-021, AC-024      |

## Thứ tự triển khai

1. Xác nhận LRN-001 (`TransactionRunner`, `@TrustedPrincipal()`/`TrustedPrincipalGuard`, `deleted_at`
   của Problem), LRN-003 (`chapter_problems`, trạng thái Course), LRN-004 (trạng thái Class,
   `class:read-managed`) và LRN-005 (bảng Assignment, quy tắc hiển thị) đã triển khai.
2. Domain: `AcceptedSubmission`, `ProblemProgress`, `CompletionCount`, hai domain service; unit test.
3. Migration LRN-006 và entity biên nhận; kiểm chứng up/down.
4. Adapter `ProgressRepository` và `ApplyAcceptedSubmission`; thay consumer cũ; integration test
   messaging và đồng thời.
5. Reader chéo module, `Clock`; use case đọc; unit test.
6. DTO, controller, Swagger; thêm tiền tố Gateway.
7. Test API/bảo mật; `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.

Bước 2–4 (ghi tiến độ đúng) không phụ thuộc LRN-004/005 và có thể làm trước; bước 5–6 cần các tính
năng đó.

## Phụ thuộc

- **LRN-001 đã triển khai:** `TransactionRunner`, cơ chế principal tin cậy
  (`@TrustedPrincipal()`/`TrustedPrincipalGuard`), xoá mềm Problem.
- **LRN-003 đã triển khai:** `chapter_problems`, trạng thái và xoá mềm Course, phép chiếu người học.
- **LRN-004 đã triển khai:** Class có `lecturer_id`, trạng thái (`ACTIVE`/`ARCHIVED`), Enrollment của
  sinh viên đang đăng ký, quyền `class:read-managed` đã seed ở Identity.
- **LRN-005 đã triển khai:** Assignment thuộc Class, `startsAt`, `deadlineAt`, vòng đời và xoá mềm,
  `assignment_problems.max_score`, quy tắc hiển thị với sinh viên và với chủ sở hữu.
- **ID-003 0.4:** header `x-auth-permissions`.
- Contract `SubmissionAcceptedEvent` và topology RabbitMQ hiện có (không đổi).

## Rủi ro

- **`occurredAt` không phải lúc nộp:** bài nộp sát `deadlineAt` có thể bị tính trễ vì `occurredAt` là
  lúc Submission ghi kết quả. Không đổi contract; đề xuất đội Submission thêm `submittedAt` sau (quyết định nền của LRN-005 cũng
  ghi rủi ro này).
- **`occurredAt` lấy từ `submission.updatedAt` lúc phát:** nếu Submission phát lại cùng `eventId` sau
  khi dòng Submission đổi, `occurredAt` có thể khác; biên nhận theo `eventId` giữ giá trị của lần áp
  dụng đầu tiên.
- **Dữ liệu cũ:** tiến độ ghi trước LRN-006 có thể có `solved_at` không sớm nhất; không backfill vì
  không đọc được Submission.
- **Thử lại không độ trễ:** sự cố cơ sở dữ liệu kéo dài làm sự kiện nhanh chóng vào DLQ; cần đưa lại
  thủ công bằng công cụ RabbitMQ. An toàn nhờ biên nhận.
- **Bảng biên nhận tăng mãi:** một dòng mỗi bài được `ACCEPTED`; chấp nhận ở v1, dọn dẹp là Ngoài
  phạm vi.
- **Lặp điều kiện hiển thị:** reader chéo module có thể lệch với phép chiếu người học của LRN-003 hay
  quy tắc hiển thị của LRN-005. Giảm thiểu bằng cách gọi truy vấn do module sở hữu export nếu có, và
  test API so khớp với phép chiếu của LRN-003.
- **Hiệu năng lớp lớn:** giới hạn trang 100 sinh viên và truy vấn gộp; Course tối đa 2.500 Problem.

## Vấn đề cần chủ sở hữu xem lại

Không vấn đề nào chặn triển khai. Các điểm dưới đây vượt thẩm quyền của LRN-006 nên không tự quyết:

1. **Phân biệt lỗi không thể thử lại trong `RabbitMqService`.** Payload sai định dạng hiện bị thử lại 3
   lần vô ích trước khi vào DLQ, và các lần thử lại không có độ trễ. Sửa `libs/common` ảnh hưởng mọi
   consumer (Submission, Judge), nên cần một quyết định riêng. LRN-006 chạy đúng với hành vi hiện có.
2. **Trường thời điểm nộp trong `submission.accepted`.** Để chấm hạn chót chính xác cần `submittedAt`
   (hoặc một thời điểm kết quả ổn định thay vì `updatedAt` lúc phát). Đây là contract của đội
   Submission; LRN-006 không đổi.
3. **Nơi đặt phép tính điểm Assignment — đã giải quyết (2026-09-30).** `AssignmentScoreCalculator`
   chỉ nằm trong module `progress`. LRN-005 không có grader hay route bảng điểm riêng; điểm chỉ được
   hiển thị qua LRN-006 (LRN-005-FR-011, FR-012).

## Tuân thủ kiến trúc

- **Chiều phụ thuộc:** domain (`ProblemProgress`, `AcceptedSubmission`, hai domain service) không
  import framework; use case chỉ phụ thuộc domain và port; adapter TypeORM, reader, `SystemClock` cài
  đặt port và được gắn ở `progress.module.ts`.
- **Driving adapter mỏng:** consumer và controller chỉ dịch transport và gọi một use case; logic khử
  trùng, gộp và tính điểm không nằm trong consumer (khắc phục điểm `PARTIALLY ALIGNED` ghi trong
  `learning-service.md`).
- **Quyền sở hữu dữ liệu:** chỉ `bkpractice_learning`; `user_id` và `problem_id` trong tiến độ là ID
  thuần, không khoá ngoại xuyên service; không đọc Submission hay Identity.
- **Ranh giới module:** reader chéo module chỉ đọc bảng cùng bounded context, không dùng repository
  ghi của module khác và không sửa dữ liệu của chúng.
- **Thư viện dùng chung:** không thêm entity hay use case vào `libs/`; contract messaging không đổi.
- Không có ngoại lệ kiến trúc nào.

> `plan.md` mô tả NHƯ THẾ NÀO. Nó KHÔNG ĐƯỢC thêm hành vi, tác nhân hay tiêu chí nghiệm thu vượt
> ngoài `spec.md` đã Approved (phiên bản 1.0). Danh sách công việc dẫn xuất từ kế hoạch này nằm ở
> [`tasks.md`](./tasks.md).
