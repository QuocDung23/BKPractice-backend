# LRN-009 — Kế hoạch Quiz và ngân hàng câu hỏi

## Trạng thái

**Reviewed và được phép triển khai**, ngày `2026-11-11`, theo phê duyệt toàn bộ MVP; cập nhật
theo hợp đồng header 1.4 và Question visibility 1.5 được chủ sở hữu duyệt ngày `2026-11-12`.
Code backend đã triển khai; kết quả kiểm chứng và giới hạn hiện hành ở [tasks](./tasks.md),
[worked](../../../worked/learning/quizzes/2026-11-11-quiz-implementation.md) và
[hướng dẫn vận hành](../../../pm/plan/learning/quizzes/README.md).
Không tự chuyển spec sang Verified khi quality gate toàn repo còn baseline lỗi.

## Đặc tả liên quan

- Nguồn: [LRN-009 — Quiz và ngân hàng câu hỏi](./spec.md), 1.5, `Approved`, 2026-11-12.
- Checklist: [tasks.md](./tasks.md). Mỗi task có đầu ra, kiểm chứng, phụ thuộc và truy vết.
- Phụ thuộc: [LRN-003](../courses/spec.md), [LRN-006](../progress/spec.md),
  [LRN-008](../self-study/spec.md), [Identity RBAC](../../01-identity/rbac/spec.md).
- Trước implementation: spec Approved, không còn câu hỏi ảnh hưởng hành vi và không còn xung
  đột với spec/kiến trúc hiện hành. Quyền dùng chung ngân hàng đã được cập nhật ở amendment 1.5.

## Service đích

- **Learning:** module `quizzes` sở hữu ngân hàng, Quiz, phiên bản, lượt làm và chấm; module
  `courses` sở hữu liên kết Chapter/Quiz và thứ tự trong Chapter.
- **Identity:** catalog và migration quyền; không lưu hay chấm Quiz.
- **API Gateway:** allowlist method/path, principal và transport; không có policy/DB Quiz.
- **Submission/Judge/Community:** không thay đổi. Không dùng RabbitMQ để chấm từng câu.

## Quyết định triển khai đã chốt

| Gate             | Quyết định được duyệt                                                                                                                                                                     |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G-01 / Q-001     | Câu hỏi dùng chung mặc định cho LECTURER; có thể tạo riêng tư hoặc đổi visibility với grant cá nhân. Clone là bản riêng tư; chỉ owner/ADMIN sửa gốc. Quiz vẫn private/grant như hiện tại. |
| G-02 / Q-002     | Search/filter, bulk pick, create-in-picker, deep clone; không import/AI/ôn riêng.                                                                                                         |
| G-03 / Q-003–004 | Completion user + Quiz, giữ qua revisions và mọi Chapter/Course; LRN-006 1.1 tính mỗi Quiz hiển thị là một Learning Item.                                                                 |
| G-04 / Q-005–006 | Học qua Course published; immutable revisions; một active attempt, first answer, finish tường minh, unlimited time/retries. Hide/delete cho tiếp tục lượt cũ.                             |
| G-05 / Q-007–008 | Limits/title/taxonomy/pagination/idempotency theo bảng Q của spec 1.3; permission riêng theo hành động.                                                                                   |
| G-06             | Amendment lecturer-owner/admin-all đã đồng bộ vào LRN-008, Problems/TestCases/Courses, RBAC và architecture.                                                                              |
| G-07             | Chủ sở hữu: “approved tất cả cho tôi”, 2026-11-11. Không còn gate chặn code.                                                                                                              |

Các tham chiếu G/Q trong thiết kế dưới đây dùng quyết định đã duyệt ở bảng này.

## Kiến trúc service bắt buộc

**DDD + Hexagonal Architecture**, theo [Learning architecture](../../../architecture/learning-service.md),
[ADR 0002](../../../adr/0002-revised-service-internal-architectures.md) và
[dependency rules](../../../architecture/dependency-rules.md).

```text
presentation → application → domain
infrastructure ── implements ──→ application/domain ports
```

- `Question`, `Quiz` và `QuizAttempt` là ba aggregate có bất biến thật; không repository per table.
- Domain thuần TypeScript, không NestJS/TypeORM/HTTP. Use case điều phối quyền, transaction và
  aggregate; controller chỉ chuyển DTO/command/result.
- Repository aggregate ở `domain/repositories/*.port.out.ts`; reader và boundary khác ở
  `application/ports/out/`; mỗi workflow có inbound `*.port.in.ts` và một use case riêng.
- Dùng `@/modules/quizzes/*`, barrel từng thư mục; thêm alias cụ thể trước alias mặc định Identity
  trong TypeScript/Jest. Không chuyển model nghiệp vụ vào `libs/`.
- Tái dùng `TransactionRunner` của Problems và transaction storage theo DataSource tại
  `src/infrastructure/persistence/transaction-storage.ts`. Quizzes có context/runner adapter
  riêng nhưng dùng cùng manager đang hoạt động; không tạo connection lồng cho cross-module read.

### Ranh giới Courses/Quizzes

- Courses thêm `CourseQuizCatalog` là read port của chính Courses, chỉ trả summary/version/state
  và khả năng sử dụng; adapter gọi một read projection được Quizzes export. Không import entity
  hoặc write repository Quizzes vào Courses.
- Quizzes có `QuizCourseAccessReader` để kiểm đường truy cập qua Course/Chapter. Adapter chỉ
  SELECT các bảng cùng Learning qua transaction manager; không import entity/repository Courses.
- Nhờ vậy `CoursesModule` có thể import `QuizzesModule` một chiều; `QuizzesModule` không import
  ngược `CoursesModule`. Không dùng `forwardRef` để che vòng phụ thuộc.
- Aggregate Course giữ `quizRefs` theo Chapter và quy tắc liên kết; chấm và đáp án không đi vào
  Course aggregate/result. Không gộp thứ tự Quiz và Problem thành timeline chung ngoài spec.

## Ảnh hưởng tới mã nguồn hiện có

Khảo sát ngày 2026-11-11, không có `.codegraph/`; dùng đọc nguồn và tìm kiếm trực tiếp.

| Loại   | Điểm chạm thực tế                                                                                     | Hành động dự kiến                                                                          |
| ------ | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| REUSE  | Problems `TrustedPrincipal`/guard, TransactionRunner, Markdown validation; shared transaction storage | Tái dùng boundary có sẵn, không sao chép principal/transaction business service            |
| MODIFY | `modules/courses/domain/course.aggregate.ts`, `domain/value-objects/chapter.ts`                       | Thêm Quiz reference và thao tác attach/detach/reorder trong Chapter                        |
| MODIFY | Courses entity/mapper/repository, `course-view.assembler.ts`, results/DTO/controllers/module/tokens   | Lưu và trả Quiz theo đúng visibility, giữ nguyên `problems` và thứ tự hiện có              |
| MODIFY | Problems/Courses authorization, managed list/detail/mutation use cases và repository filters          | LECTURER owner, ADMIN toàn bộ; truyền owner thật từ dữ liệu, không chỉ thêm role vào guard |
| MODIFY | `modules/learning.entities.ts`, `learning-service.module.ts`, TypeScript/Jest aliases                 | Đăng ký entity/module/DI và entry point runtime/migration                                  |
| MODIFY | Identity `modules/rbac/domain/permission-catalog.ts`, seeder nếu cần, migration mới                   | Cấp Learning cho LECTURER và ADMIN, thêm quyền Quiz theo G-05                              |
| MODIFY | Gateway `application/proxy/gateway-proxy.constants.ts` và test                                        | Allowlist route Quiz/ngân hàng/attempt/Chapter mới, giữ lọc header và auth hiện hành       |
| CREATE | `modules/quizzes/`, migration Learning/Identity mới và test                                           | Không tạo folder/layer không có nhiệm vụ thực                                              |
| MODIFY | Progress Course reader/calculator/DTO/test                                                            | Gộp Problem đã giải và Quiz đã pass theo LRN-006 1.1; không đổi consumer Problem/Judge     |

Hiện Identity catalog chỉ map Learning sang ADMIN, và migration
`1700000000009-LearningSelfStudyPermissions.ts` đã gỡ quyền Learning của LECTURER. Cần migration
mới cho database đã chạy, không chỉ sửa seed/catalog và không sửa migration lịch sử.

## Thay đổi ở tầng domain

| Thành phần                          | Bất biến/hành vi                                                                                                          | Truy vết           |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `Question` / `QuestionRevision`     | Owner ổn định; visibility riêng tư tùy chọn; revision bất biến; clone riêng tư; sửa gốc chỉ owner/admin                   | FR-002–007, FR-012 |
| `Quiz` / `QuizRevision`             | Tạo nháp rỗng; danh sách có thứ tự; không trùng câu gốc; publish cố định phiên bản câu; sửa qua draft tiếp theo theo G-04 | FR-008–012         |
| `QuizPublishValidator`              | Gom issue theo câu/field; kiểm số câu, đáp án, giải thích, quyền dùng; trả lỗi thay vì publish một phần                   | FR-011/012         |
| `QuizAttempt`                       | Đề cố định; first-answer; trả feedback của câu đã ghi; finish chỉ khi đủ câu; không sửa lượt cũ                           | FR-016–021         |
| `QuizScoreCalculator`               | `correct × 100 >= total × 90`, tổng > 0, một câu một điểm; không phụ thuộc rounding                                       | FR-022–024         |
| Course `QuizReference` / `quizRefs` | Duy nhất trong Chapter, thứ tự độc lập Problem, không cascade nội dung Quiz                                               | FR-013/014         |

Giới hạn, state machine và chính sách chia sẻ lấy từ quyết định G-01/G-04/G-05 cuối cùng.
Không thêm type đa đáp án, trọng số, bank nhiều cấp, XP hoặc engine luật tổng quát.

## Tầng application / Use case

### Các workflow dự kiến

| Nhóm               | Use case                                                                                                                      | Boundary và kết quả                                                                                    |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Ngân hàng          | `CreateQuestion`, `ReviseQuestion`, `ListBankQuestions`, `GetBankQuestion`, `ListQuestionUsage`                               | Quyền/owner/scope → aggregate/repository → management result; lọc quyền trước count/pagination         |
| Tạo Quiz           | `CreateQuiz`, `UpdateQuizDraft`, `ReplaceQuizQuestions`, `PreviewQuiz`, `PublishQuiz`, `GetManagedQuiz`, `ListManagedQuizzes` | Khoá root khi sửa; resolve version/permission theo batch; result có readiness và thông tin bản câu mới |
| Cập nhật bản mới   | `CreateQuizDraftRevision`, cập nhật version tường minh rồi `PublishQuiz`                                                      | Chỉ sau G-04; giữ bản published cũ khi đang soạn; không tự nâng toàn bộ câu                            |
| ChapterQ-001–Q-008 | `AttachQuiz`, `DetachQuiz`, `ReorderChapterQuizzes` ở Courses                                                                 | Quyền Course + quyền dùng Quiz; loadForUpdate Course; lưu cùng manager; trả view Course                |
| Làm bài            | `StartQuizAttempt`, `GetMyQuizAttempt`, `AnswerQuizQuestion`, `FinishQuizAttempt`                                             | Danh tính từ principal; kiểm visibility/owner; transaction cho ghi; response chọn trường               |
| Thành tích         | `ListMyQuizAttempts`, `GetMyQuizResult`, `GetMyQuizCompletion`                                                                | Đọc lượt FINISHED của user; kết quả tốt nhất/hoàn thành theo G-03, không đọc user khác                 |

Vòng đời ẩn/xoá/khôi phục theo G-04; chia sẻ theo G-01. `CloneQuestion`/`CloneQuiz` cần có ID và
owner mới theo FR-026, không sửa gốc. Cách sao chép các câu tham chiếu khi clone Quiz cần chốt
để không tự mở quyền dùng câu chưa được chia sẻ. Import và ôn câu sai vẫn phụ thuộc G-02.

### Ports có lý do tồn tại

- `QuestionRepository`, `QuizRepository`, `QuizAttemptRepository`: ba aggregate persistence.
- `BankTaxonomyReader`: kiểm Topic/Tag Learning hiện có theo Q-008.
- `ShareRecipientReader`: HTTP nội bộ Identity, chỉ nhận `{userId, roles}` của user ACTIVE.
- `QuizCourseAccessReader`: visibility người học qua Course/Chapter, đọc bằng own projection.
- `QuizReferenceReader`: projection Quizzes export cho Courses; tuyệt đối không trả đáp án.
- `CourseQuizCatalog`: port ở Courses để dùng projection trên; không là repository ghi.
- `TransactionRunner`: tái dùng port có sẵn. Kiểm idempotency tạo mới đặt trong repository
  aggregate, không tạo platform-wide idempotency framework.

### Tạo câu ngay trong bộ chọn

Thiết kế hai bước có thể quan sát: tạo câu trong ngân hàng rồi thêm ID/revision vào Quiz.
Mỗi bước trả ID/kết quả rõ ràng; nếu bước gắn thất bại, câu vẫn tồn tại và UI có thể chọn lại.
Không báo tạo câu thất bại khi thực tế đã lưu, không xoá bù câu ngân hàng đang được dùng nơi khác.

Theo G-05, API nhận UUID qua header `Idempotency-Key` cho create/clone và hash payload ban đầu
cho tạo câu/Quiz. Learning truyền key vào use case; key/hash được lưu trên root hiện có, unique theo
người tạo: retry cùng key/hash trả lại ID đã tạo, hash khác trả `409`. Hash không được tính lại từ
nội dung hiện hành sau khi người dùng đã sửa câu. Không log payload. Gateway chuyển tiếp header
request nên không cần thay đổi; body create/clone không chứa key và không có bảng/migration riêng.

## Lưu trữ

Learning sở hữu toàn bộ bảng dưới đây trong `bkpractice_learning`. Dùng UUID, `timestamptz`,
TypeORM entity tách domain, migration với `synchronize: false` như hiện hành.

### Mười bảng của MVP

| Bảng                           | Các trường chính                                                                                                        | Ràng buộc / lý do                                                                                     |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `quiz_bank_questions`          | `id`, `created_by`, current revision, `is_private` default false, timestamps/soft delete, create request ID/hash        | Root độc lập; câu dùng chung mặc định; private grants không FK Identity                               |
| `quiz_bank_question_revisions` | `id`, `question_id`, `revision`, `content`, `explanation`, `options` JSONB, difficulty/taxonomy theo gate, `created_at` | Unique question/revision; bất biến; options chứa ID/text/isCorrect/order và chỉ server đọc đầy đủ     |
| `quizzes`                      | `id`, `created_by`, state, `published_revision_id`, timestamps/soft delete; creation request ID/hash nếu chốt           | Root sở hữu, con trỏ bản phát hành; title/description cụ thể thuộc revision                           |
| `quiz_revisions`               | `id`, `quiz_id`, `revision`, title/description, draft/published marker, `published_at`                                  | Unique quiz/revision; draft sửa được, bản published bất biến                                          |
| `quiz_revision_questions`      | `quiz_revision_id`, `question_id`, `question_revision_id`, `display_order`                                              | Unique revision/câu gốc và revision/order; FK composite bảo revision thuộc đúng câu                   |
| `chapter_quizzes`              | `id`, `chapter_id`, `quiz_id`, `display_order`                                                                          | Entity thuộc Courses; unique chapter/quiz và chapter/order; cùng Quiz được dùng ở Chapter/Course khác |
| `quiz_attempts`                | `id`, `quiz_id`, `quiz_revision_id`, `user_id`, status, total/correct count, passed, started/finished time              | Quiz revision phải thuộc Quiz; score/tổng hợp do server; lưu kết quả chỉ khi FINISHED                 |
| `quiz_attempt_answers`         | `attempt_id`, `question_id`, `question_revision_id`, `selected_option_id`, `is_correct`, `answered_at`                  | Unique attempt/câu gốc; version lấy từ đề cố định, lựa chọn kiểm trong revision                       |
| `quiz_grants`                  | `quiz_id`, `user_id`                                                                                                    | Grant cá nhân dùng/clone Quiz; unique resource/recipient, không FK Identity                           |
| `quiz_question_grants`         | `question_id`, `user_id`                                                                                                | Grant cá nhân dùng/clone câu; unique resource/recipient, không FK Identity                            |

JSONB choices giúp giữ một revision nguyên khối và tránh thêm repository/table cho từng lựa
chọn. Validate hình dạng/ID duy nhất/đúng một đáp án ở domain; DB kiểm hình dạng mảng và các
ràng buộc thực thi được. Giới hạn kích thước hữu hạn được chốt ở G-05 trước migration.

### Phiên bản thay cho sao chép snapshot nhiều lần

Attempt tham chiếu QuizRevision bất biến; QuizRevision tham chiếu QuestionRevision bất biến.
Đây là bộ đề cố định của FR-016, không cần thêm một bản JSONB chứa toàn bộ đề vào mỗi attempt.
Không hard-delete hoặc sửa các revision đã phát hành/được tham chiếu. Repository load thành
`AttemptDefinition` thuần domain để chấm; response mapper không serialize entity/revision thô.

Quiz mới có draft revision ban đầu. Theo state machine sau G-04, sửa bản đã publish mở draft
mới, còn learner tiếp tục thấy published pointer cũ cho tới lần publish tiếp. Không chỉnh rows
của published revision tại chỗ. Root được khoá khi tăng số revision hoặc đổi published pointer.

### Khoá ngoại, index và scope

- `chapter_id` có thể cascade **liên kết** khi Chapter bị xoá; `quiz_id` không cascade nội dung
  hoặc attempt. Revision/attempt dependencies dùng RESTRICT để giữ lịch sử; Quiz xoá mềm.
- Thêm unique `(id, question_id)` cho question revision và `(id, quiz_id)` cho Quiz revision
  nếu cần composite FK chống gắn nhầm root; không chỉ kiểm bằng UI.
- Index bank theo owner/visibility và sort ổn định; filter visibility trước count. Câu dùng chung
  hiển thị cho LECTURER; câu riêng tư chỉ owner/admin/grantee thấy. Chốt taxonomy rồi
  mới chọn index filter; không thêm search engine/dependency mới cho tìm kiếm bản đầu.
- Index `chapter_quizzes(quiz_id)` để usage/reverse read; order index theo Chapter.
- Index attempt `(user_id, quiz_id, started_at DESC, id)` và các lượt FINISHED cho best/pass.
- Một active attempt/user/Quiz có partial unique index; completion theo user + Quiz, giữ revision đã đạt.
- Câu hỏi có `is_private=false` mặc định; nếu `true`, quyền đọc/dùng/clone theo owner/admin/grant.
  Đối tượng grant là từng LECTURER; không xây ACL nhóm hoặc policy engine tổng quát. Owner vẫn là
  điều kiện sửa gốc. Quiz tiếp tục private và dùng grant riêng.
- Có thể suy ra completion từ FINISHED attempts, không thêm `quiz_progress` hoặc sửa bảng
  `progress` hiện có; không lưu context hoàn thành riêng theo Course.
- Điểm tốt nhất so theo tỷ lệ đúng, không lấy `MAX(correct_count)` giữa các đề có số câu khác
  nhau. Những revision nào được phép so/gộp phụ thuộc G-03; chỉ dùng FINISHED và total > 0.

### Thuật toán ghi đồng thời

**Trả lời một câu:**

1. Mở transaction, tìm attempt theo `(id, principal.userId)` và khoá dòng attempt.
2. Load definition cố định; kiểm state/visibility theo policy đã duyệt.
3. Nếu câu đã có answer: cùng option trả kết quả cũ; khác option trả `409`; không chấm lại.
   Retry answer đã lưu được trả lại kể cả sau FINISHED; không cho tạo answer mới sau FINISHED.
4. Nếu chưa có answer: kiểm câu/option thuộc definition, chấm trong domain, insert answer.
5. Commit rồi mới trả feedback đúng/sai/đáp án/giải thích riêng câu đó. Không gửi phản hồi thành
   công trong transaction trước commit.

**Kết thúc lượt:**

1. Khoá cùng dòng attempt và kiểm owner; FINISHED trả result đã lưu.
2. Đọc answers đã commit, xác nhận đủ mỗi câu trong definition; đếm số đúng phía server.
3. Tính ngưỡng bằng số nguyên; lưu counts, passed, FINISHED và finished_at trong một transaction.
4. Commit rồi trả summary. Answer/finish cùng khoá root nên không chạy xuyên nhau gây sai tổng.

Quy ước trên làm rõ giao nhau giữa FR-020 retry và lỗi trả lời lượt FINISHED: chỉ replay cùng
answer đã tồn tại được chấp nhận. Phải đưa chi tiết này vào contract/spec review ở G-07.

### Reorder và lỗi giữa chừng

Reorder chỉ nhận đúng tập ID hiện có, không trùng/thiếu/thừa. Khoá root và cập nhật trong một
transaction. Unique display_order dùng constraint deferrable hoặc cập nhật hai pha an toàn;
không lần lượt đổi 0↔1 gây vi phạm unique giữa chừng. Course/Quiz save không được xoá các link
Quiz chỉ vì một workflow Problem cũ chưa load chúng; cập nhật cả mapper/load/save và regression.

## Thay đổi cơ sở dữ liệu

- Thêm tám bảng dự kiến, indexes/constraints và entity registration sau khi gates đóng.
- Không đổi bảng Problem/TestCase và không thêm bảng Progress; tiến độ Course đọc trực tiếp
  `progress` và `quiz_attempts` hiện có.
- Identity thêm permission/mapping bằng migration riêng, không dùng FK xuyên database.
- Các thay đổi state/sharing/taxonomy/active-attempt chỉ chốt DDL sau khi có quyết định gate.
- Migration mới thêm `quiz_bank_questions.is_private` với default false để câu hiện có thành câu
  dùng chung; không sửa migration lịch sử. Quiz grants không đổi.

## Migration

1. Tạo migration Learning mới tên logic `Lrn009QuizQuestionBank`; chọn timestamp không trùng
   lịch sử khi triển khai, không sửa `Lrn008SelfStudy` hoặc các migration cũ.
2. Thứ tự up: bank roots/revisions → Quiz roots/revisions/items → links → attempts/answers →
   pointers/composite FK/index/check. Xử lý con trỏ vòng root/revision bằng thêm FK sau tạo bảng.
3. Test trên PostgreSQL cách ly: từ schema trước Quiz, giữ nguyên fixtures Problem/Course/Progress;
   up, ràng buộc sai, down, up lại. Down xoá dữ liệu Quiz mới nên chỉ thử ở database test.
4. Identity có migration mới khôi phục mapping Learning cho LECTURER, giữ ADMIN, thêm mã Quiz
   và ngân hàng theo G-05. Catalog phải hỗ trợ một code cấp cho nhiều role mà không tạo duplicate
   permission; seed hiện hành không được vô tình xoá mapping mới khi chạy lại.
5. Review quyền tuỳ chỉnh đang có; down không xoá quyền/mapping có trước hoặc phục hồi lớp/bài
   tập đã bị loại bỏ. Ghi khả năng mất dữ liệu và phương án rollback ứng dụng rõ ràng.
6. Triển khai: backup → migration Identity/Learning theo kế hoạch môi trường → rollout code →
   refresh/đăng nhập lại để claim permission được cấp mới → smoke test. Không chạy trên dữ liệu
   thật trong đợt viết tài liệu, không dùng script migration có `.env` làm cách đọc secret.

## API

Endpoint dưới đây đã được triển khai. UUID path/payload allowlist và response có Swagger riêng cho management/learner.
Hợp đồng chi tiết và route lifecycle/share/clone ở [tài liệu module](../../../pm/plan/learning/quizzes/README.md).

### Ngân hàng và soạn Quiz

| Method / path                                     | Use case / nội dung                                                                         | Thành công dự kiến      |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------- |
| `GET /api/question-bank/questions`                | Search/filter/page trong scope cho phép                                                     | `200` page quản lý      |
| `GET /api/question-bank/questions/:id`            | Detail, revision được phép đọc                                                              | `200` management detail |
| `POST /api/question-bank/questions`               | Tạo câu, options, explanation; request ID theo gate                                         | `201` ID + revision     |
| `PUT /api/question-bank/questions/:id/visibility` | Owner/ADMIN đặt `isPrivate` để chia sẻ với LECTURER hoặc giới hạn theo grant                | `200` updated question  |
| `POST /api/question-bank/questions/:id/revisions` | Owner/ADMIN tạo revision nội dung mới                                                       | `201` revision          |
| `GET /api/question-bank/questions/:id/usage`      | Quiz đang dùng, chỉ lộ các metadata được phép                                               | `200` usage             |
| `POST /api/quizzes`                               | Tạo root và draft revision rỗng                                                             | `201` managed Quiz      |
| `GET /api/quizzes/managed`                        | Danh sách trong phạm vi quản lý                                                             | `200` page              |
| `GET /api/quizzes/managed/:id`                    | Draft và published metadata; preview trả readiness/version updates                          | `200` managed Quiz      |
| `PATCH /api/quizzes/:id/draft`                    | Sửa title/description của draft                                                             | `200` draft             |
| `PUT /api/quizzes/:id/draft/questions`            | Thay toàn bộ tập `{questionId, revisionId}` theo thứ tự; thêm/bỏ/reorder trong một workflow | `200` draft             |
| `POST /api/quizzes/:id/preview`                   | Projection quản lý, không tạo attempt                                                       | `200` preview           |
| `POST /api/quizzes/:id/publish`                   | Publish draft, đổi published pointer nguyên tử                                              | `200` managed Quiz      |

Draft tiếp theo mở khi update/replace. Lifecycle/share/revoke/clone đã triển khai theo G-01/G-02/G-04; Gateway allowlist từng method/path, không dùng wildcard.

### Chapter và người học

| Method / path                                                 | Use case / contract                                                   | Thành công dự kiến    |
| ------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------- |
| `POST /api/courses/:id/chapters/:chapterId/quizzes`           | Attach `{quizId, position?}`, quyền Course và dùng Quiz               | `201` managed Course  |
| `DELETE /api/courses/:id/chapters/:chapterId/quizzes/:quizId` | Chỉ gỡ liên kết                                                       | `204`                 |
| `PUT /api/courses/:id/chapters/:chapterId/quizzes/order`      | Đúng tập Quiz ID hiện có                                              | `200` managed Course  |
| `GET /api/quizzes/:id`                                        | Giới thiệu bản learner được phép học, không đáp án                    | `200` learner summary |
| `POST /api/quizzes/:id/attempts`                              | Start; Course/Chapter context nếu G-04 yêu cầu; idempotency theo gate | `201` learner attempt |
| `GET /api/quiz-attempts/me`                                   | History theo chính mình; filter/page theo G-05                        | `200` page            |
| `GET /api/quiz-attempts/:id`                                  | Resume, câu chưa mở đáp án vẫn kín                                    | `200` learner attempt |
| `PUT /api/quiz-attempts/:id/answers/:questionId`              | `{selectedOptionId}`; first write hoặc replay cùng lựa chọn           | `200` feedback câu đó |
| `POST /api/quiz-attempts/:id/finish`                          | Không nhận score; đủ câu mới finish; retry trả summary cũ             | `200` result          |
| `GET /api/quiz-attempts/:id/result`                           | Chỉ FINISHED của chính mình                                           | `200` summary/review  |
| `GET /api/quizzes/:id/completion/me`                          | Scope hoàn thành/điểm tốt nhất theo G-03                              | `200` completion      |

Route tĩnh `managed`/`me` đặt trước route ID. Giữ `GET Course` hiện có, thêm `chapters[].quizzes`
chỉ chứa summary hợp lệ; không đổi/xoá `chapters[].problems`. Không có API `userId` tuỳ chọn để
LECTURER/ADMIN đọc lịch sử của người khác. Danh sách Quiz độc lập vẫn phụ thuộc Q-005.

## DTO / Kiểm tra dữ liệu

- DTO quản lý và DTO người học tách riêng. Mapper chọn trường tường minh; không spread entity
  hoặc `options` có isCorrect sang learner result.
- Create question: content, explanation, options `{id?, content, isCorrect}` và taxonomy đã
  duyệt. Server gán ID option khi mới; sửa revision phải xác định quy tắc giữ/đổi ID rõ ràng.
- Create/update Quiz: chỉ title/description; selected IDs/revisions đi qua workflow riêng.
- Replace questions: UUID chuẩn hoá trước kiểm trùng; không cho lách một questionId bằng nhiều
  revision; resolve cả batch và kiểm permission trước lưu. Một câu không hợp lệ làm rollback batch.
- Answer: chỉ option ID; server tìm correct option từ revision, không nhận isCorrect/points.
- Giữ ValidationPipe hiện có `transform`, `whitelist`, `forbidNonWhitelisted`; chuẩn hoá và
  kiểm string/Markdown. Numeric/string/count/page limits phải có giá trị sau G-05; không tự
  đặt mặc định mới hoặc bỏ validator vì spec còn mở.
- Visibility lọc **trước** phân trang/total. Reorder trả lỗi nếu tập không khớp, không bỏ qua
  âm thầm các ID người gọi không được dùng.

## Phân quyền

- Quiz/bank create: LECTURER hoặc ADMIN + permission; createdBy từ principal.
- Mutation nội dung: LECTURER owner hoặc ADMIN + permission, dựa owner được load từ DB.
  Đọc/chọn/clone: owner, ADMIN hoặc người được chia sẻ quyền tương ứng; scope trước count và
  pagination. Không suy quyền dùng lại từ trạng thái publish. Preview/detail không được mở
  dữ liệu ngoài grant; clone tạo root/owner mới và không sửa gốc. Usage cũng lọc metadata Quiz.
- Chapter mutation: quyền `course:update` + owner Course (hoặc ADMIN), Chapter phải thuộc đúng
  Course trên URL và Quiz được dùng theo policy. Không chỉ kiểm owner của Quiz.
- Attempt/result/completion: principal.userId luôn là scope; ADMIN không bypass owner attempt.
- Permission theo catalog: `question:{create,read-managed,update,share,clone,delete,restore}` và
  `quiz:{create,read-managed,update,publish,hold,republish,share,clone,delete,restore}`.
  Không thêm wildcard thật vào token hoặc gán quyền mới chưa được catalog duyệt.
- Phục hồi owner checks ở **mọi** mutation Problem/TestCase/Course/Harness và managed list/detail
  khi chuyển vai trò Learning; chỉ sửa role guard là thiếu và có thể mở quyền chéo LECTURER.
- Phạm vi này không tự thay policy sử dụng Problem nháp của người khác; đối chiếu bản sửa đổi
  LRN-001/003/008 tại G-06, rồi bổ sung test allow/deny tương ứng.

## Messaging / Sự kiện

N/A — FR-001 và phần Đầu ra không yêu cầu event, queue, outbox, retry/DLQ hoặc thay contract
accepted-submission. Dùng HTTP response cho feedback; không thêm RabbitMQ chỉ vì Learning có sẵn.

## Realtime

N/A — không WebSocket/SSE. Kết quả được lưu bền trước response; resume qua GET là nguồn chân lý.
Không thêm cache đáp án trên Redis hoặc dùng socket để thay transaction.

## Adapter hạ tầng

- Ba TypeORM repositories với persistence mapper và shared transaction context.
- Read projections theo boundary ở trên, query batch để tránh N+1 trong bộ chọn/Course/usage.
- Courses có adapter read tới projection Quizzes; không kéo đáp án vào Course response.
- Module composition bind inbound tokens, repository ports, readers, validator/calculator;
  root chỉ imports modules/entity list. Mỗi module giữ ownership của entity riêng.
- Không thêm dependency mới khi PostgreSQL/TypeORM/Node crypto hiện có giải quyết đủ.

## Xử lý lỗi

Domain/application error độc lập HTTP, filter map `401/403/404/400/409/500` theo spec sau review.
Phân biệt NotFound learner với Forbidden owner-management; không kiểm khác nhau để lộ tài nguyên
ẩn. Unique/FK/conflict DB được map sang lỗi an toàn, không trả SQL hoặc đáp án.

Retry read không ghi state; retry answer/finish như thuật toán transaction. Create retry theo
request ID/hash sau G-05. Không retry tự động mutation bằng cách tạo request ID mới. Lỗi commit
không được chuyển thành response thành công; kết quả mất trên đường truyền được lấy lại bằng
replay, không chấm lại.

## Bảo mật

- Test mass assignment userId/createdBy/role/score/status/finishedAt, IDOR attempt, fake headers
  và role không có permission. Làm theo SR-001/002/005, không coi client mobile là trusted server.
- Test secret fields ở tất cả learner surfaces: start/resume/answer/result/completion/Course,
  lỗi, log và Swagger. Answer chỉ mở đáp án câu đã trả lời, không mở câu tiếp theo.
- Management APIs có đáp án luôn có guard/policy riêng; không truy cập ngân hàng bằng quyền học.
- Dùng Markdown hạn chế và frontend sanitization contract hiện có; code snippet chỉ là text.
- Không log snapshot, options, câu trả lời, token/header hoặc raw payload; privacy kiểm cả test
  harness logger. Visibility/ownership phải tồn tại ở cả đọc và ghi.

## Chiến lược kiểm thử

| Lớp                   | Kịch bản bắt buộc                                                                                                         | AC                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Domain                | single correct, revisions, no duplicate root, order, 90% số nguyên, first-answer/finish                                   | AC-003/004/008/009/011/018/020/021 |
| Use case với port giả | allow/deny owner/ADMIN, chia sẻ, batch rollback, preview không ghi, version update                                        | AC-002/005/006/007/010/011         |
| PostgreSQL thật       | FK/unique/check, migration up/down/up, immutable preservation, one-connection transaction, race/retry/rollback            | AC-003/006/009/011/012/013/018/019 |
| HTTP/Nest + SQL       | full author → publish → attach → learn → feedback → finish → history; hidden/private lookup và DTO                        | AC-005/008/012/014–017/020–025     |
| Gateway               | exact route/method, auth/session, strip fake/internal header, transport status, unavailable/timeout, không business logic | AC-001/002/024/025                 |
| Regression            | Problem/TestCase/Harness/Course; readiness Problem-only/Quiz-only/mixed; Progress tính Quiz, consumer Problem không đổi   | FR-002/013/015, G-03/G-06          |

Thiết kế concurrent tests với barrier/transactions thật, không chỉ gọi tuần tự Promise mock.
Bao gồm same/different answer, finish twice, answer vs finish, rollback trước commit, mất
response sau commit rồi replay, cùng question root khác revisions, quote/HTML/error leak.

Migration/test dùng PostgreSQL cách ly với `TEST_DATABASE_URL` và convention test hiện có;
không đọc `.env`, không dùng DB thật. Suite bị skip không được tính là đã xác minh.

Các lệnh hiện có, chỉ chạy ở lần implementation khi phù hợp:

```bash
pnpm test apps/learning-service/src/modules/quizzes
pnpm test apps/learning-service/src/modules/courses
pnpm test apps/learning-service/src/modules/problems
pnpm test apps/identity-service/src/modules/rbac
pnpm test apps/api-gateway
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Nếu baseline Identity `officialName` còn lỗi phải ghi lại đúng file/lệnh, không xoá test hoặc
gọi toàn repo xanh. Không chạy lại migration scripts có nạp `.env` trên môi trường thật để test.

## Khả năng quan sát

Dùng request ID hiện có. Log operation, resource ID cần thiết, outcome/error code và duration;
không raw request/answer/definition. Ghi rõ thời điểm bắt đầu/kết thúc là thời gian server,
không phải active learning time. Không thêm hệ metric/analytics hoặc expose endpoint vận hành
ngoài phạm vi. Usage query cho người quản lý cũng phải lọc quyền để không lộ Quiz riêng tư khác.

## Thứ tự triển khai

| Chặng                 | Tasks     | Kết quả có thể review / demo                                              |
| --------------------- | --------- | ------------------------------------------------------------------------- |
| 0. Chốt nguồn chân lý | T001–T007 | Gates đóng, spec Approved, contract/limits/auth được duyệt; chưa code     |
| 1. Đồng bộ quyền      | T008–T012 | LECTURER chỉ nội dung mình tạo, ADMIN toàn bộ; quyền trong token mới đúng |
| 2. Domain             | T013–T017 | Unit thuần cho ngân hàng, Quiz, attempt, liên kết và ngưỡng               |
| 3. Persistence        | T018–T024 | Migration/repositories/readers và test PostgreSQL, replay tạo mới         |
| 4. Ngân hàng          | T025–T029 | Tạo, sửa revision, search/pick/usage và API quản lý có kiểm quyền         |
| 5. Soạn Quiz          | T030–T034 | Nháp, chọn hàng loạt, reorder, preview, publish bản cố định               |
| 6. Chapter            | T035–T038 | Gắn/gỡ/đọc Quiz nhiều Chapter/Course, giữ nguyên Problem                  |
| 7. Mobile backend     | T039–T045 | Start/resume/answer/finish/history, replay và races đúng                  |
| 8. Transport và E2E   | T046–T053 | DI/alias, Gateway, Swagger, privacy/full flow và tiện ích có điều kiện    |
| 9. Bàn giao           | T054–T060 | Quality gates, architecture, vận hành, coverage và worked evidence        |

Không coi việc hoàn tất schema là hoàn tất một tính năng. Mỗi chặng triển khai cần test tương
ứng; cập nhật checklist sau khi có bằng chứng. Không cần chờ toàn feature xong mới chạy test
ngân hàng hoặc regression quyền.

## Rủi ro

- **Draft bị hiểu là Approved:** gates ở đầu cả plan/tasks; không code trước G-07.
- **Chuyển quyền mở dữ liệu chéo:** kiểm owner ở use case và scoped read/query; seed/migration
  hai role và test mọi workflow cũ, không chỉ Quiz.
- **Cập nhật ngân hàng làm đổi đề:** revisions bất biến/pinned, DB FK giữ lịch sử, update tường minh.
- **Count/pagination hoặc usage lộ riêng tư:** scope trước count, projection không trả metadata
  của tài nguyên không được phép.
- **Race tăng điểm hoặc finalize sớm:** attempt row lock chung, unique answer và commit trước feedback.
- **Course save làm mất Quiz:** cập nhật snapshot/mapper/repository/test mọi write path cũ.
- **Điểm 90% bị làm tròn hoặc ôn làm tăng điểm:** integer comparison, first-answer, kết quả FINISHED
  bất biến; chế độ ôn riêng chỉ khi được duyệt.
- **Hoàn thành sau đổi đề không rõ:** G-03 chặn query/index/AC; không reset hoặc giữ ngầm.
- **Down migration xoá dữ liệu mới:** chỉ test cách ly; backup/rollback ứng dụng riêng khi deploy.

## Tuân thủ kiến trúc

Domain không phụ thuộc framework. Application chỉ dùng own domain/ports và shared transaction
port đã có. Entity, EntityManager, SQL và JSONB chỉ ở infrastructure; controller là inbound
adapter. Cùng Learning database cho phép FK nội bộ và own read projection, không cho phép import
entity/write repository module khác. User references không FK Identity. Judge không có nghiệp
vụ Quiz, Gateway không tính điểm; Progress chỉ đọc completion Quiz qua port/reader trong Learning.
Không có ngoại lệ kiến trúc
mới nào được duyệt bởi draft này.

> Plan này giải thích HOW dự kiến của LRN-009. Khi spec được Approved với quyết định khác,
> phải sửa plan/tasks theo spec trước code, không dùng plan để mở rộng WHAT.

## Kết quả triển khai 2026-11-11

Đã có 3 aggregate, inbound ports/use cases, 3 repositories, readers, HTTP/Swagger, 2 migration,
Course links và Gateway routes. Không thêm dependency, queue hoặc service. Readiness/version updates
được trả ở preview. Logging hiện dùng request/status Gateway và lỗi Quiz đã lọc, chưa có log duration
riêng cho từng use case; không log đáp án hay payload. Chi tiết bằng chứng/gate ở worked và tasks.
