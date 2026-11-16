> **Đã hoàn tất bàn giao 2026-11-11.** Backend MVP đã triển khai, kiểm thử và đối chiếu checklist
> này với source/tests. Kết quả verification, giới hạn còn lại và rủi ro ghi ở
> [worked entry](../../../worked/learning/quizzes/2026-11-11-quiz-implementation.md). Quality gate
> toàn repo còn lỗi baseline ngoài phạm vi LRN-009 (ghi rõ ở T054–T057).
>
> **Amendment 1.6 Approved 2026-11-12:** các bằng chứng lịch sử ghi “Progress không đổi” được thay
> bởi T063–T069 bên dưới. Completion user + Quiz giữ nguyên; Course Progress nay tính Quiz theo
> LRN-006 1.1 mà không thêm migration.

# LRN-009 — Checklist triển khai Quiz và ngân hàng câu hỏi

## Trạng thái và cách dùng

**Hoàn tất**, ngày `2026-11-11`.
Nguồn: [spec 1.5, Approved](./spec.md) và [plan đã duyệt](./plan.md), được lập theo yêu cầu chủ sở hữu.

- Follow lần lượt T001–T062; không làm task code trước khi T001–T007 đóng và spec Approved.
- Mọi task bắt đầu chưa hoàn thành. Chỉ đánh dấu `[x]` khi có đầu ra và bằng chứng kiểm chứng.
- Task phụ thuộc câu hỏi chưa chốt phải để mở; không dùng mặc định của code để trả lời sản phẩm.
- Khi gặp quyết định khác draft, cập nhật spec/plan/tasks trước khi sửa nguồn tương ứng.
- Mỗi lần hoàn tất một lát cắt ghi worked entry vào đúng module; T060 tổng hợp bàn giao cuối.
- Các đường dẫn nguồn chưa tồn tại trong plan là điểm dự kiến, không phải file đã triển khai.

## Chặng 0 — Chốt yêu cầu và contract

- [x] **LRN-009-T001 — Khảo sát baseline trước code.**
      Đầu ra: Git status, spec/plan/kiến trúc, source hiện tại và scripts; ghi baseline các lỗi đã có,
      không coi kết quả kiểm tra trong worked cũ là kết quả lần này. Giữ nguyên thay đổi không liên quan.
      **Phụ thuộc:** Không. **Truy vết:** quy trình SDD, plan G-07.
      **Bằng chứng 2026-11-11:** preflight ghi trong [worked entry](../../../worked/learning/quizzes/2026-11-11-quiz-implementation.md)
      (mục Verification): build Learning và 2 suite/6 test quyền qua; lint/typecheck còn lỗi baseline Identity.
      Mục này lưu khảo sát baseline; quyết định Q-001–Q-008 và G-07 đã được ghi nhận trong các
      amendment spec 1.3–1.5, không lấy mặc định implementation làm quyết định sản phẩm.
- [x] **LRN-009-T002 — Chốt chia sẻ và tiện ích.**
      Đầu ra: Q-001 riêng tư/chia sẻ có kiểm soát; chốt scope người nhận/thu hồi và Q-002 về clone/import/ôn.
      Kiểm chứng: theo quyết định hiện hành 1.5, câu dùng chung cho LECTURER; câu private dùng grant;
      không sửa gốc và clone thành bản riêng.
      **Phụ thuộc:** T001. **Truy vết:** FR-005–007, Q-001/002, G-01/02.
      **Cập nhật mới nhất 2026-11-12:** Q-001 được điều chỉnh ở spec 1.5: câu bank dùng chung mặc
      định, có thể đặt private và cấp grant; Quiz vẫn private; clone câu là bản riêng tư.
- [x] **LRN-009-T003 — Chốt đơn vị hoàn thành.**
      Đầu ra: Q-003/Q-004: theo Quiz hay revision, áp dụng giữa nhiều Chapter/Course, có đổi Progress
      hoặc gating không. Kiểm chứng: ví dụ đạt bản cũ rồi đổi đề có kết quả xác định.
      **Phụ thuộc:** T001. **Truy vết:** FR-022–025, Q-003/004, G-03.
- [x] **LRN-009-T004 — Chốt vòng đời và lượt làm.**
      Đầu ra: Q-005/Q-006, bảng trạng thái/visibility, public lookup, hide/delete, active attempts,
      finish tường minh/tự động, giới hạn lượt/thời gian. Kiểm chứng cả retry answer sau FINISHED.
      **Phụ thuộc:** T001. **Truy vết:** FR-008/012/015–021/025, G-04.
- [x] **LRN-009-T005 — Chốt giới hạn, taxonomy và quyền.**
      Đầu ra: Q-007/Q-008: permission codes, limits, query/page/sort, số Quiz/Chapter, ID/hash retry
      và Topic/Tag/difficulty. Kiểm chứng: không còn validator/DDL cần đoán một giá trị sản phẩm.
      **Phụ thuộc:** T002, T003, T004. **Truy vết:** FR-002/004–006/013, G-05.
- [x] **LRN-009-T006 — Đồng bộ các nguồn chân lý và duyệt spec.**
      Đầu ra: bản sửa đổi được chủ sở hữu duyệt cho LRN-008, Problem/Test Case/Course, Identity và
      mô tả kiến trúc role mới; LRN-009 Approved, các câu hỏi được đóng. Không khôi phục Class/Assignment.
      **Phụ thuộc:** T002, T003, T004, T005. **Truy vết:** FR-001/002/013/015, G-06/07.
- [x] **LRN-009-T007 — Review plan và đóng contract.**
      Đầu ra: plan/schema/routes/payload/status/permissions/limits khớp spec Approved; ma trận FR/SR/AC
      và test, roadmap cập nhật. Kiểm chứng các nhánh draft bị loại bỏ không còn task code bắt buộc.
      **Phụ thuộc:** T006. **Truy vết:** G-07, toàn bộ FR/SR/AC.

## Chặng 1 — Quyền LECTURER/ADMIN trên Learning

- [x] **LRN-009-T008 — Cập nhật catalog và seed quyền Identity.**
      Đầu ra: mapping code → nhiều role cho Learning và quyền ngân hàng/Quiz được duyệt. Kiểm chứng
      seed idempotent, không duplicate permission, không cấp quản lý cho STUDENT hoặc xoá quyền khác.
      **Phụ thuộc:** T007. **Truy vết:** FR-002, SR-001/002, AC-002.
      **Bằng chứng:** `apps/identity-service/src/modules/rbac/domain/permission-catalog.ts` (+spec)
      map Learning/quiz theo role; migration `1700000000010-LearningQuizPermissions.ts`;
      `learning-quiz-permissions.integration.spec.ts` pass 1/1: seed hai lần vẫn 70 mappings,
      không duplicate, STUDENT không nhận quyền quản lý.
- [x] **LRN-009-T009 — Migration dữ liệu quyền và token mới.**
      Đầu ra: migration mới sửa database đã qua LearningSelfStudyPermissions; down có phạm vi rõ.
      Kiểm chứng DB test nâng cấp/seed lại và access token mới có quyền; không sửa migration lịch sử.
      **Phụ thuộc:** T008. **Truy vết:** FR-002, SR-001, AC-002/024.
      **Bằng chứng:** `learning-quiz-permissions.integration.spec.ts` up/down giữ grants có trước;
      JWT cấp mới có permission Quiz; không sửa migration cũ (chỉ thêm file mới).
- [x] **LRN-009-T010 — Phục hồi owner checks cho mutation cũ.**
      Đầu ra: policy/use case Problem/TestCase/Harness/Course kiểm owner được load; ADMIN có permission
      bypass owner, LECTURER không bypass. Kiểm tất cả caller, không chỉ sửa tên role trong guard.
      **Phụ thuộc:** T009. **Truy vết:** FR-002, SR-002, AC-002.
      **Bằng chứng:** `problem-authorization.service.ts` (+6 spec cases LECTURER own/deny/ADMIN),
      `course-authorization.service.ts`, các use case Problem/Course pass owner thật từ DB;
      `quiz.integration.spec.ts` "protects draft/private resources and scopes management to owner or ADMIN".
- [x] **LRN-009-T011 — Scope các đường đọc quản lý.**
      Đầu ra: list/detail/preview và repository filter phân biệt LECTURER owner với ADMIN. Kiểm chứng
      total/pagination không lộ nội dung ngoài scope; policy dùng Problem nháp theo spec sửa đổi.
      **Phụ thuộc:** T010. **Truy vết:** FR-002/007, SR-002, AC-002/007.
      **Bằng chứng:** `list-managed-problems/courses/quizzes` use cases lọc owner trước count;
      integration test "scopes and filters before pagination and reads Quiz/attempt lists in full";
      lỗi `.where` ghi đè owner filter đã được bắt và sửa (worked entry).
- [x] **LRN-009-T012 — Regression quyền Learning.**
      Đầu ra: tests hai LECTURER, ADMIN, STUDENT, thiếu permission; bao phủ đọc/ghi/lifecycle/test/harness
      và managed lists. Kiểm chứng không mở quyền chéo khi migration cấp Learning lại cho LECTURER.
      **Phụ thuộc:** T010, T011. **Truy vết:** FR-002, SR-001/002, AC-002/024.
      **Bằng chứng:** nhóm Learning/Gateway/RBAC 91 suites / 937 tests pass (worked entry Verification);
      migration integration xác nhận STUDENT không nhận quyền, mapping LECTURER không mở nội dung người khác.

## Chặng 2 — Domain thuần

- [x] **LRN-009-T013 — Question và immutable revision.**
      Đầu ra: ID/content/options/explanation/owner/taxonomy theo limits; một đáp án đúng, ID option
      không trùng, tạo revision không sửa bản cũ. Kiểm chứng domain không cần NestJS/DB.
      **Phụ thuộc:** T007. **Truy vết:** FR-003/004/007/012, AC-003/004/007/011.
      **Bằng chứng:** `quizzes/domain/models.ts` (không import framework) +
      `quiz-models.spec.ts` "retains the original immutable revision", "rejects duplicate ids,
      empty explanations and executable markup".
- [x] **LRN-009-T014 — Quiz, draft/revision và readiness.**
      Đầu ra: tạo nháp rỗng, replace câu có thứ tự, chống trùng question root, publish-validator,
      chuyển trạng thái đã duyệt. Kiểm chứng bản published cố định và lỗi không làm đổi aggregate.
      **Phụ thuộc:** T013. **Truy vết:** FR-008–012, AC-008–011.
      **Bằng chứng:** `quiz-models.spec.ts` "requires questions for publish and rejects duplicate roots
      through different versions", "forks a new draft instead of changing an already published definition",
      "enforces lifecycle state before editing or republishing".
- [x] **LRN-009-T015 — Attempt và calculator 90%.**
      Đầu ra: definition cố định, first-answer/feedback, finish đủ câu, counts/pass; mọi phép tính
      là server/domain. Kiểm 0 câu bị từ chối, 8/10, 9/10, 13/15, 14/15 và rounding sát ngưỡng.
      **Phụ thuộc:** T014. **Truy vết:** FR-016–024, AC-015–022.
      **Bằng chứng:** `quiz-models.spec.ts` "returns first answer feedback and only reveals answered
      questions", "rejects a foreign question/option and incomplete finish"; calculator so nguyên
      `correct × 100 >= total × 90` (worked entry How the feature works).
- [x] **LRN-009-T016 — Liên kết Quiz trong Course aggregate.**
      Đầu ra: Chapter quizRefs, attach/detach/reorder với giới hạn đã chốt; duy nhất theo Chapter,
      cho phép Quiz ở nhiều Chapter/Course. Kiểm chứng problemRefs không đổi; readiness Learning Item
      được amendment T063/T064 mở rộng cho Problem hoặc Quiz.
      **Phụ thuộc:** T007. **Truy vết:** FR-013/014, AC-012/013.
      **Bằng chứng:** `courses/domain/course.aggregate.ts`, `value-objects/chapter.ts`;
      `course.aggregate.spec.ts` "keeps Quiz order separate, permits reuse across chapters and
      enforces 50 per chapter".
- [x] **LRN-009-T017 — Test bất biến domain.**
      Đầu ra: test có ý nghĩa cho các bất biến trên, state transitions sai, UUID/revision lệch,
      đúng/sai, replay, finish chưa đủ và bất biến kết quả cũ; không chỉ test getter hoặc barrel.
      **Phụ thuộc:** T013, T014, T015, T016. **Truy vết:** AC-003/004/008/009/011/012/018/020/021.
      **Bằng chứng:** `quiz-models.spec.ts` 8 test bất biến; `course.aggregate.spec.ts` quiz case;
      cả hai pass trong kết quả toàn repo (worked entry Verification).

## Chặng 3 — Schema, repository và đọc dữ liệu

- [x] **LRN-009-T018 — Entity và migration Learning mới.**
      Đầu ra: tám bảng của plan sau điều chỉnh gates, UUID/timestamps, FK root/revision, unique/check/
      index và down ngược thứ tự. Giữ synchronize=false; chưa chạy trên database có dữ liệu thật.
      **Phụ thuộc:** T007, T017. **Truy vết:** FR-003/009/012–014/016/020, AC-003/009/011–013/018.
      **Bằng chứng:** migration `1700000011000-Lrn009QuizQuestionBank.ts` 10 bảng (kể cả hai bảng
      grant), composite FK, unique; entities `quiz.entities.ts` đăng ký `learning.entities.ts`;
      DataSource import trực tiếp cho thấy `synchronize=false` (worked entry); migration chỉ chạy
      trên DB test riêng.
- [x] **LRN-009-T019 — Persistence Chapter/Quiz ở Courses.**
      Đầu ra: entity chapter_quizzes, Course snapshot/mapper/load/save round-trip quizRefs; cascade
      chỉ link. Kiểm reorder unique không lỗi giữa chừng và save Problem cũ không làm mất Quiz.
      **Phụ thuộc:** T016, T018. **Truy vết:** FR-013/014, AC-012/013.
      **Bằng chứng:** `courses/entities/chapter-quiz.entity.ts`, `course.persistence-mapper.ts`,
      `course.typeorm-repository.ts`; unique `(chapter_id, display_order)` DEFERRABLE;
      integration "preserves ordered Quiz links when Course Problem content is saved".
- [x] **LRN-009-T020 — Question/Quiz repositories và transaction context.**
      Đầu ra: hai domain repository ports, TypeORM adapters/mappers, root locks, immutable revision,
      shared transaction manager; không repository per table. Kiểm rollback publication/batch.
      **Phụ thuộc:** T018. **Truy vết:** FR-003/008–012, AC-003/008/009/011.
      **Bằng chứng:** `question.typeorm-repository.ts`, `quiz.typeorm-repository.ts`,
      `quiz-transaction.context.ts` dùng manager đang hoạt động; rollback publication/batch kiểm trong
      integration "rolls back data before failed feedback" và replace-atomic test.
- [x] **LRN-009-T021 — Attempt repository và answers.**
      Đầu ra: load theo id+userId, row lock attempt, unique answer, load definition pinned và ghi
      finish nguyên tử. Kiểm DB từ chối version/root sai; không hard-delete lịch sử được tham chiếu.
      **Phụ thuộc:** T018, T020. **Truy vết:** FR-016–023, SR-005/007, AC-015/018–021/024.
      **Bằng chứng:** `attempt.typeorm-repository.ts`; PK answers `(attempt_id, question_id)`;
      integration "enforces composite revision ownership and restricts deletion of retained content
      in PostgreSQL".
- [x] **LRN-009-T022 — Read ports và query batch.**
      Đầu ra: bank search/usage, QuizReferenceReader, CourseQuizCatalog adapter và QuizCourseAccessReader;
      taxonomy reader nếu được duyệt. Kiểm scope trước count, không N+1/cross-module entity import.
      **Phụ thuộc:** T019, T020. **Truy vết:** FR-005/007/013/015, AC-005/007/012/014.
      **Bằng chứng:** `quizzes/infrastructure/readers/quiz-readers.ts`,
      `courses/infrastructure/quiz-catalog.adapter.ts` (chỉ import port read, không entity/write repo
      Quizzes); integration "scopes and filters before pagination" + đọc theo lô.
- [x] **LRN-009-T023 — Idempotency tạo mới.**
      Đầu ra: cơ chế request ID/hash đã duyệt cho create; cùng request trả cùng resource ID, khác
      payload trả conflict. Kiểm hash gốc không đổi khi edit, retry đồng thời không sinh hai root.
      **Phụ thuộc:** T020, T021. **Truy vết:** FR-006/020, AC-006/019.
      **Bằng chứng:** `quiz_bank_questions/quizzes` có `client_request_id` + `request_hash` unique
      theo người tạo; `quiz-models.spec.ts` "hashes semantically identical key ordering for creation
      retries"; integration "replays creates and rejects another payload with the same request id".
- [x] **LRN-009-T024 — PostgreSQL integration và migration lifecycle.**
      Đầu ra: test up/down/up cách ly; constraints, data round-trip, immutable preservation, order,
      rollback và pool một connection. Kiểm fixtures Problem/Course/Progress trước/sau không bị đổi.
      **Phụ thuộc:** T019, T020, T021, T022, T023. **Truy vết:** AC-003/006/009/011–013/018/019.
      **Bằng chứng:** `quiz.integration.spec.ts` 14 tests pass trên PostgreSQL 17 container riêng,
      pool một connection; "verifies Learning migration down/up transactionally without losing
      existing fixtures".

## Chặng 4 — Ngân hàng câu hỏi

- [x] **LRN-009-T025 — CreateQuestion.**
      Đầu ra: use case/inbound port, role/permission, owner từ principal, ghi root+revision/options
      nguyên tử và replay an toàn. Kiểm câu hợp lệ/sai, mass assignment, lỗi commit và request trùng.
      **Phụ thuộc:** T012, T024. **Truy vết:** FR-002–004/006, SR-001/002, AC-002/004/006/024.
      **Bằng chứng:** `create-question.use-case.ts` + `create-question.port.in.ts`;
      integration replay/mass-assignment test (`quiz.integration.spec.ts` line 279).
- [x] **LRN-009-T026 — ReviseQuestion và scope chia sẻ.**
      Đầu ra: owner/ADMIN tạo revision mới; người được chia sẻ chỉ xem/dùng/clone theo scope, không
      đổi published references. Kiểm owner A/B, ADMIN và người chỉ được quyền sử dụng.
      **Phụ thuộc:** T025. **Truy vết:** FR-002/007/012, AC-002/007/011.
      **Bằng chứng:** `revise-question.use-case.ts`, `share-question.use-case.ts`;
      integration "shares for use/clone without editing and revokes new use without changing copies".
- [x] **LRN-009-T027 — Search/filter/detail/usage.**
      Đầu ra: use cases/read models phân trang ổn định, preview quản lý, usage chỉ trong scope;
      đủ dữ liệu bộ chọn đánh dấu câu đã chọn. Kiểm lọc trước total và câu riêng tư không bị lộ.
      **Phụ thuộc:** T022, T026. **Truy vết:** FR-005/007, SR-002/003, AC-005/007/025.
      **Bằng chứng:** `list-bank-questions/get-bank-question/list-question-usage` use cases;
      integration "scopes and filters before pagination" và private-lookup test (line 217).
- [x] **LRN-009-T028 — Contract tạo ngay trong bộ chọn.**
      Đầu ra: response và luồng hai bước phân biệt created/attached; create thành công nhưng attach
      lỗi vẫn lấy lại được ID câu. Kiểm retry cả hai bước không nhân đôi câu/link hoặc xoá bù câu.
      **Phụ thuộc:** T023, T025. **Truy vết:** FR-006, AC-006.
      **Bằng chứng:** hai endpoint độc lập `POST /question-bank/questions` và
      `PUT /quizzes/:id/draft/questions`; contract ghi trong [tài liệu module](../../../pm/plan/learning/quizzes/README.md);
      replay test (line 279) xác nhận không tạo trùng.
- [x] **LRN-009-T029 — HTTP ngân hàng.**
      Đầu ra: management controller/DTO/request-result mapper/filter theo route đã duyệt. Kiểm auth,
      owner, unknown fields, Markdown, giới hạn và phản hồi lỗi; STUDENT không lấy được bộ đáp án.
      **Phụ thuộc:** T026, T027, T028. **Truy vết:** FR-002–007, SR-001–006, AC-002/004–007/024/025.
      **Bằng chứng:** `bank-questions.controller.ts` + DTO whitelist/forbidNonWhitelisted;
      STUDENT bị chặn trong integration owner-scoping test; Swagger DTO có isCorrect chỉ ở managed.

## Chặng 5 — Soạn và xuất bản Quiz

- [x] **LRN-009-T030 — CreateQuiz và quản lý draft.**
      Đầu ra: tạo root+draft rỗng, cập nhật title/description, list/detail scoped, request replay;
      kiểm DRAFT không lộ cho learner và LECTURER không sửa Quiz người khác.
      **Phụ thuộc:** T012, T020, T023. **Truy vết:** FR-002/008, AC-002/008/014.
      **Bằng chứng:** `create-quiz.use-case.ts`, `update-quiz-draft.use-case.ts`,
      `list-managed-quizzes/get-managed-quiz` use cases; DRAFT chỉ hiện owner/ADMIN (integration line 217).
- [x] **LRN-009-T031 — Chọn nhiều câu, bỏ câu và reorder.**
      Đầu ra: ReplaceQuizQuestions kiểm toàn batch ID/revision/scope, exact order, duplicate root và
      limits; một item sai rollback tất cả. Kiểm câu dùng trong nhiều Quiz và revision thuộc đúng root.
      **Phụ thuộc:** T026, T027, T030. **Truy vết:** FR-003/005/007/009, AC-003/005/007/009.
      **Bằng chứng:** `replace-quiz-questions.use-case.ts` resolve cả batch trước lưu; unique
      revision/question-root; domain test duplicate-root qua hai phiên bản.
- [x] **LRN-009-T032 — Preview và nhận biết bản mới.**
      Đầu ra: management preview/readiness, old vs current question revision để chọn update tường minh;
      preview không tạo attempt/score. Kiểm không tự nâng phiên bản của Quiz đã publish.
      **Phụ thuộc:** T031. **Truy vết:** FR-010/012, AC-010/011.
      **Bằng chứng:** `preview-quiz.use-case.ts` trả readiness + `questionUpdates`;
      integration "reports source updates without upgrading pinned versions and hides revoked draft content".
- [x] **LRN-009-T033 — Publish và vòng đời đã duyệt.**
      Đầu ra: lock root, kiểm readiness/scope, cố định revision và đổi pointer cùng transaction;
      draft tiếp theo/lifecycle đúng G-04. Kiểm fail không đổi published pointer hoặc bản đã phát hành.
      **Phụ thuộc:** T032. **Truy vết:** FR-008/011/012/015, AC-004/008/011/014.
      **Bằng chứng:** `publish-quiz.use-case.ts`, `hold-quiz/republish-quiz` use cases; lỗi "publish
      không có draft tự tạo revision" đã bắt và sửa (worked entry); domain lifecycle test.
- [x] **LRN-009-T034 — HTTP quản lý Quiz.**
      Đầu ra: controllers/DTO/mappers/filter cho create/draft/select/preview/publish và lifecycle đã
      duyệt. Kiểm static routes trước ID, allowlist field, code/status và permission từng thao tác.
      **Phụ thuộc:** T030, T031, T032, T033. **Truy vết:** FR-008–012, AC-008–011/024/025.
      **Bằng chứng:** `managed-quizzes.controller.ts`; route `managed` tĩnh trước `:id`
      (Gateway allowlist line 14–15); 409/404 mapping qua `quiz-exception.filter.ts`.

## Chặng 6 — Quiz trong Chapter/Course

- [x] **LRN-009-T035 — Attach/Detach/ReorderChapterQuizzes.**
      Đầu ra: use cases/inbound ports ở Courses, khoá Course, kiểm đúng Chapter và quyền Course + dùng
      Quiz; lưu qua repository Course. Kiểm duplicate pair, cross-Course path, rollback và giới hạn.
      **Phụ thuộc:** T012, T019, T022, T033. **Truy vết:** FR-013/014, AC-002/012/013.
      **Bằng chứng:** `attach-quiz/detach-quiz/reorder-chapter-quizzes` use cases + ports ở
      `courses/application`; `chapter-quizzes.controller.ts`; duplicate pair và cross-Course trong
      integration line 378.
- [x] **LRN-009-T036 — Course response có Quiz summary.**
      Đầu ra: results/DTO/view assembler/persistence không lộ câu hỏi/đáp án; learner lọc hidden trước
      count, manager theo scope. Kiểm giữ problems/order/readiness và Chapter rỗng như contract cũ.
      **Phụ thuộc:** T035. **Truy vết:** FR-013/015, SR-004, AC-012/014/025.
      **Bằng chứng:** `course.response.dto.ts` (`chapters[].quizzes` chỉ summary),
      `course-view.assembler.ts`; `CourseQuizSummaryDto` không chứa options/đáp án; course regression
      suites pass.
- [x] **LRN-009-T037 — Access reader cho người học.**
      Đầu ra: QuizCourseAccessReader dùng own SELECT/projection, kiểm Course/Chapter và Quiz visibility
      theo Q-005, không gọi repository ghi module khác. Kiểm lookup trực tiếp không lách nội dung ẩn.
      **Phụ thuộc:** T022, T036. **Truy vết:** FR-015/016, AC-014/015.
      **Bằng chứng:** `quiz-readers.ts` QuizCourseAccessReader (SELECT own projection);
      integration "protects draft/private resources" + hide/reappear test line 514.
- [x] **LRN-009-T038 — Integration CoursesModule thật.**
      Đầu ra: API gắn cùng Quiz ở nhiều Chapter/Course, gỡ không mất lịch sử, hide/reappear theo policy,
      reorder và cập nhật Problem không xoá Quiz; kiểm transaction pool một connection không deadlock.
      **Phụ thuộc:** T035, T036, T037. **Truy vết:** FR-013–015, AC-012–014.
      **Bằng chứng:** `quiz.integration.spec.ts` boot CoursesModule thật; "allows one shared Quiz in
      multiple Courses and deep clones its selected question revisions"; pool một connection.

## Chặng 7 — Làm bài và kết quả cá nhân

- [x] **LRN-009-T039 — StartQuizAttempt.**
      Đầu ra: kiểm visibility theo principal/context, chọn published revision nhất quán và tạo attempt;
      active/retry policy theo gate. Kiểm publish đồng thời không tạo đề ghép từ hai phiên bản.
      **Phụ thuộc:** T021, T023, T033, T037. **Truy vết:** FR-016, AC-014/015.
      **Bằng chứng:** `start-quiz-attempt.use-case.ts`; start lặp trả lượt IN_PROGRESS hiện có
      (integration full-flow test); attempt pin một QuizRevision duy nhất.
- [x] **LRN-009-T040 — GetMyQuizAttempt / resume.**
      Đầu ra: own attempt với definition learner-safe và feedback chỉ câu đã chấm; load lại vẫn giữ
      lựa chọn cũ. Kiểm user khác/ADMIN không mở được attempt và không serialize correct options thô.
      **Phụ thuộc:** T039. **Truy vết:** FR-017, SR-004/005, AC-016/024/025.
      **Bằng chứng:** `get-my-quiz-attempt.use-case.ts`; `LearnerQuestionDto` không có isCorrect/
      correctOptionId ngoài `feedback`; integration "reveals only the submitted question" + ADMIN
      không vượt scope attempt.
- [x] **LRN-009-T041 — AnswerQuizQuestion.**
      Đầu ra: row lock root, kiểm question/option thuộc đề, lưu first answer, commit rồi feedback;
      replay cùng option, khác option conflict. Kiểm failed commit không trả đáp án thành công.
      **Phụ thuộc:** T040. **Truy vết:** FR-018–020, SR-007, AC-017–019.
      **Bằng chứng:** `answer-quiz-question.use-case.ts`; integration "reveals only the submitted
      question, locks first answers and finalizes idempotently" và "rolls back data before failed feedback".
- [x] **LRN-009-T042 — FinishQuizAttempt.**
      Đầu ra: cùng root lock, đủ câu mới finish, count server và integer 90%, ghi result nguyên tử;
      FINISHED replay result cũ. Kiểm không nhận score client và answer/finish không sai tổng.
      **Phụ thuộc:** T041. **Truy vết:** FR-021–024, AC-019–022.
      **Bằng chứng:** `finish-quiz-attempt.use-case.ts`; finish lặp trả summary cũ; answer/finish dùng
      cùng khoá attempt (integration line 573).
- [x] **LRN-009-T043 — Result/history/best/completion.**
      Đầu ra: queries theo user, chỉ FINISHED cho best/pass; giữ revision đã đạt và chính sách G-03;
      lượt fail mới không xoá lượt pass cũ. Kiểm làm lại không ghi đè và không đổi Progress ngoài scope.
      **Phụ thuộc:** T042. **Truy vết:** FR-023–025, AC-021–024.
      **Bằng chứng:** `list-my-quiz-attempts/get-my-quiz-result/get-my-quiz-completion` use cases;
      completion theo user + Quiz giữ revision đạt; Progress denominator không đổi (worked entry).
- [x] **LRN-009-T044 — HTTP learner và response mapper.**
      Đầu ra: start/resume/answer/finish/result/history/completion, input allowlist và projection riêng;
      static `me` trước `:id`. Kiểm đúng/sai trả ngay giải thích câu đó, chưa mở câu kế tiếp.
      **Phụ thuộc:** T039, T040, T041, T042, T043. **Truy vết:** FR-016–025, AC-015–025.
      **Bằng chứng:** `learner-quizzes.controller.ts`; `GET /api/quiz-attempts/me` trước `:id`
      (Gateway line 29–30); learner DTO projection không có đáp án chưa mở.
- [x] **LRN-009-T045 — Race/retry/rollback với PostgreSQL thật.**
      Đầu ra: tests same/different option đồng thời, finish twice, answer vs finish, rollback và mất
      response sau commit rồi replay. Dùng barrier/root lock thật; xác minh chỉ một answer/điểm mỗi câu.
      **Phụ thuộc:** T044. **Truy vết:** FR-020/021, SR-007, AC-018/019/020.
      **Bằng chứng:** integration "serializes concurrent answers/finish and rolls back data before
      failed feedback" và "waits on an actual PostgreSQL root lock and permits only one competing
      first choice" (root-lock contention pool hai connections).

## Chặng 8 — DI, Gateway, contract và E2E

- [x] **LRN-009-T046 — Module, alias và runtime entry points.**
      Đầu ra: QuizzesModule/tokens/bindings, entity list, root imports, barrel và alias TypeScript/Jest;
      không import module vòng. Kiểm Nest compile, test resolution và data-source entry point trực tiếp.
      **Phụ thuộc:** T029, T034, T038, T044. **Truy vết:** FR-001, quy tắc kiến trúc/import.
      **Bằng chứng:** `quizzes.module.ts` (Không import CoursesModule — chiều import một chiều từ
      Courses), `quiz.tokens.ts`, barrel index từng thư mục; alias `tsconfig.json`/`jest.config.ts`;
      data-source entry import qua ts-node thành công (worked entry).
- [x] **LRN-009-T047 — Gateway allowlist chính xác.**
      Đầu ra: method/path mới cho bank/Quiz/attempt/Chapter, prefix được duyệt; không wildcard business
      routes. Giữ auth/session, query/body/status/header handling; không thêm chấm/quyền owner vào Gateway.
      **Phụ thuộc:** T046. **Truy vết:** FR-001/002/013/016/018, SR-001, AC-001/024.
      **Bằng chứng:** `gateway-proxy.constants.ts` thêm route từng method/path regex; quiz-routes.spec
      "has no unbounded Quiz route wildcard"; prefix service Learning giữ nguyên.
- [x] **LRN-009-T048 — Gateway contract/security tests.**
      Đầu ra: route matrix positive/negative, segment/traversal, fake x-auth/internal headers, session,
      cookie/CSRF khi áp dụng, timeout/outage và pass-through lỗi. Kiểm request bị chặn không gọi Learning.
      **Phụ thuộc:** T047. **Truy vết:** SR-001/004/005, AC-001/024/025.
      **Bằng chứng:** `quiz-routes.spec.ts` (route matrix, wildcard, header contract) nằm trong 91
      suites Learning/Gateway pass (worked entry).
- [x] **LRN-009-T049 — Swagger và ví dụ cho người tích hợp.**
      Đầu ra: đủ endpoint/DTO/status/permission/limits và ví dụ role/owner, create+attach hai bước,
      answer/finish replay. Kiểm schemas learner không có key/giải thích chưa mở hoặc admin bypass attempt.
      **Phụ thuộc:** T046, T047. **Truy vết:** FR-006/018/020/024, SR-003/004, AC-006/017/022/025.
      **Bằng chứng:** DTO `quiz.response.dto.ts` tách Managed vs Learner projection với ApiProperty,
      minItems/maxItems theo Q-007; integration "documents management projections separately from
      unanswered learner questions".
- [x] **LRN-009-T050 — Full-flow HTTP + PostgreSQL E2E.**
      Đầu ra: lecturer tạo bank → chọn Quiz → publish → gắn Chapter → học → đúng/sai ngay → finish
      → history/retry; cập nhật revision và đối chiếu lượt cũ. Kiểm nhiều Chapter/Course và 90% thực.
      **Phụ thuộc:** T045, T048, T049. **Truy vết:** AC-001–025, theo ma trận bên dưới.
      **Bằng chứng:** `quiz.integration.spec.ts` 14 tests HTTP + PostgreSQL thật phủ full flow,
      revision pin, hide/revoke, clone, share, phân trang, races, migration lifecycle.
- [x] **LRN-009-T051 — Privacy và nội dung an toàn.**
      Đầu ra: quét/assert response/start/resume/answer/Course/error/log/Swagger không lộ đáp án chưa mở;
      IDOR, mass assignment, Markdown/script/code text. Kiểm cả manager-scope và learner projection.
      **Phụ thuộc:** T050. **Truy vết:** SR-001–007, AC-024/025.
      **Bằng chứng:** DTO learner không có isCorrect ngoài feedback; integration private-lookup/IDOR
      tests; domain test executable markup; không log payload/đáp án (worked entry).
- [x] **LRN-009-T052 — Regression và truy vấn.**
      Đầu ra: Problem/TestCase/Harness/Course/Progress và role migration còn đúng; query batch, scope trước
      count, pool một connection, index query thực tế. Không thay Progress denominator ngoài quyết định G-03.
      **Phụ thuộc:** T050, T051. **Truy vết:** FR-001/002/005/013/015/023, AC-002/005/012/014/021.
      **Bằng chứng:** 149 suites pass toàn repo với PostgreSQL riêng (worked entry); course aggregate/
      persistence regression pass; Progress không đổi theo G-03.
- [x] **LRN-009-T053 — Nhân bản và tiện ích có điều kiện.**
      Tách workflow clone câu/Quiz theo FR-026 sau khi scope/cách sao chép tham chiếu được chốt:
      ID/owner mới, không sửa gốc, không clone qua ID đoán được. Import/ôn chỉ thêm nếu Q-002 duyệt.
      **Phụ thuộc:** T007, T052. **Truy vết:** FR-026, AC-026, Q-001/Q-002.
      **Bằng chứng:** Q-002 duyệt clone sâu; `clone-question/clone-quiz` use cases + `POST .../:id/clone`;
      integration "deep clones its selected question revisions" và clone-không-sửa-gốc; Import/ôn không
      thêm (N/A theo Q-002).

## Chặng 9 — Gate chất lượng và bàn giao

- [x] **LRN-009-T054 — Lint.**
      Chạy `pnpm lint`; sửa lỗi thuộc thay đổi. Lỗi baseline phải ghi lệnh/file thực tế, không disable
      rule hoặc xoá test để báo xanh. Chỉ đánh dấu sau khi đã chạy và ghi rõ gate còn fail nếu có.
      **Phụ thuộc:** T053. **Truy vết:** Definition of Done.
      **Bằng chứng:** `pnpm lint` chạy sau code cuối: chỉ còn 2 lỗi baseline
      `no-unsafe-argument` trong `test/account-import.integration.spec.ts:238,241` (ngoài LRN-009,
      không sửa); ESLint từng file thay đổi pass (worked entry).
- [x] **LRN-009-T055 — Typecheck.**
      Chạy `pnpm typecheck`; kiểm alias/DTO/ports và migrations. Ghi baseline riêng nếu còn lỗi Identity
      `officialName`; không coi kết quả build một service là thay thế typecheck toàn repo.
      **Phụ thuộc:** T053. **Truy vết:** Definition of Done.
      **Bằng chứng:** `pnpm typecheck` chạy sau code cuối: chỉ còn 5 lỗi baseline `officialName` trong
      cùng file baseline (dòng 236/238/241/348/383), không thuộc LRN-009.
- [x] **LRN-009-T056 — Test mục tiêu và toàn repo.**
      Chạy các lệnh test trong plan và `pnpm test`; cung cấp DB test cách ly cho integration cần thiết.
      Ghi pass/fail/skip; suite thiếu URL bị skip không phải bằng chứng hoàn thành persistence/races.
      **Phụ thuộc:** T053. **Truy vết:** toàn bộ AC, Definition of Done.
      **Bằng chứng:** `pnpm test --silent --json` với PostgreSQL riêng: 149 suites pass, 1 suite
      baseline fail compile, 8 suites skip (Identity cần URL DB riêng, Progress consumer cần vhost
      RabbitMQ riêng); 1.231 tests pass / 33 skip; Quiz HTTP/PostgreSQL và migration mới không skip
      (worked entry).
- [x] **LRN-009-T057 — Build các service.**
      Chạy `pnpm build` theo script thực có. Kiểm Nest/DI và direct runtime/migration resolution khi phù
      hợp; không tạo command script giả hoặc cài thêm dependency để né lỗi cấu hình hiện hữu.
      **Phụ thuộc:** T053. **Truy vết:** FR-001, Definition of Done.
      **Bằng chứng:** `pnpm build` pass cả 6 service ở lần chạy cuối; data-source entry point import
      trực tiếp qua ts-node/tsconfig-paths thành công (worked entry).
- [x] **LRN-009-T058 — Audit kiến trúc và diff.**
      Kiểm domain thuần, ports/adapters, module ownership, không entity/repository xuyên service/module,
      barrels/alias, diff không chứa secret. Nếu có `.codegraph/` lúc triển khai thì sync/status sau đổi nguồn.
      **Phụ thuộc:** T054, T055, T056, T057. **Truy vết:** FR-001, SR-001–007, plan Tuân thủ kiến trúc.
      **Bằng chứng:** `quizzes/domain` không import NestJS/TypeORM; Courses import QuizzesModule một
      chiều và chỉ qua read port `QuizReferenceReader` (không entity/write repo Quizzes); Quizzes tái
      dùng TransactionRunner/TrustedPrincipal của Problems theo plan REUSE; barrel index từng thư mục;
      diff không chứa secret (chỉ tên biến schema zod/ biến Compose có sẵn); repo không có `.codegraph/`
      nên bỏ sync theo quy ước.
- [x] **LRN-009-T059 — Tài liệu vận hành và triển khai.**
      Đầu ra: ghi chú theo module về API/full flow, quyền/token refresh, migration/backup/up/down/rollback,
      giữ lịch sử và chính sách visibility/version cuối cùng. Smoke test trên môi trường được phép; không tự deploy.
      **Phụ thuộc:** T058. **Truy vết:** FR-002/012/016/020/025, Definition of Done.
      **Bằng chứng:** 5 tài liệu theo module: [Quiz](../../../pm/plan/learning/quizzes/README.md),
      [Course links](../../../pm/plan/learning/courses/quizzes.md),
      [Identity RBAC](../../../pm/plan/identity/rbac/learning-quizzes.md),
      [share-recipient](../../../pm/plan/identity/users/quiz-share-recipient.md),
      [Gateway routes](../../../pm/plan/api-gateway/learning/quizzes.md); smoke test/deploy chưa chạy
      trên môi trường thật — ghi ở worked entry Remaining.
- [x] **LRN-009-T060 — Đối chiếu spec, worked và bàn giao.**
      Đầu ra: evidence từng FR/SR/AC, tasks phản ánh đúng việc làm và N/A có lý do; worked theo module giải
      thích what/why/flow/config/checks/remaining. Báo rõ gate còn fail; không tự nâng spec sang Verified.
      **Phụ thuộc:** T059. **Truy vết:** toàn bộ spec và quy trình SDD.
      **Bằng chứng:** checklist này đối chiếu từng task với source/tests 2026-11-11; worked entry bàn giao
      đầy đủ; spec giữ `Approved` (không tự Verified); gate baseline còn lỗi Identity ghi rõ ở T054–T056.

- [ ] **LRN-009-T061 — Chuyển idempotency key sang HTTP header.**
      Đầu ra: create/clone Question và Quiz nhận UUID từ `Idempotency-Key`; body không có key;
      giữ replay/conflict semantics và các cột trên root, không thêm bảng/migration. Cập nhật
      Swagger, contract fixtures và tài liệu. **Phụ thuộc:** chủ sở hữu duyệt LRN-009 1.4.
      **Truy vết:** Q-007, API contract. **Bằng chứng:** implementation source/docs cập nhật;
      kiểm thử chưa chạy.

- [ ] **LRN-009-T062 — Ngân hàng câu hỏi dùng chung theo mặc định.**
      Đầu ra: câu hỏi mới mặc định hiển thị cho LECTURER; cho phép đặt/chuyển câu private; list/get/use
      kiểm tra visibility; chỉ owner/ADMIN sửa gốc; clone câu và clone Quiz tạo câu riêng tư; thêm
      migration `is_private` với default false; route Gateway cho visibility; cập nhật Swagger và hướng dẫn module. Quiz grant
      không thay đổi. **Phụ thuộc:** chủ sở hữu duyệt LRN-009 1.5. **Truy vết:** FR-002/005/007/026,
      Q-001, SR-001/004. **Bằng chứng:** `SetQuestionVisibilityUseCase`, bank query scope,
      `requireQuestionUse`, migration `1700000012000`, Gateway allowlist and Swagger. Build and lint
      changed files pass; automated tests not run.

- [x] **LRN-009-T063 — Quiz completion cho Course Progress.** Export/read contract hẹp qua bảng
      attempt hiện có: pass một lần hoàn thành theo user + Quiz, giữ qua fail sau và revision mới.
- [x] **LRN-009-T064 — Visibility regression.** Progress loại Quiz ON_HOLD/xoá/gỡ link và tự tính lại
      completion cũ khi Quiz được publish/restore/gắn lại; không event và không migration.

## Không áp dụng trong phạm vi hiện tại

- **Messaging / outbox / DLQ:** N/A theo FR-001 và Đầu ra spec; HTTP chấm từng câu, không thêm event.
- **Realtime / Socket.IO / Redis:** N/A; lưu DB và HTTP/resume đủ contract hiện tại.
- **Judge / Submission:** N/A; không biên dịch hoặc thực thi code trắc nghiệm.
- **Frontend mobile/admin:** không thuộc implementation backend này; contract backend hỗ trợ luồng chọn
  hàng loạt và feedback tức thì. Không đánh dấu UI đã hoàn thành từ API test.

Các mục trên phải được review lại nếu spec Approved đổi scope. Tiến độ code, verification thực tế,
giới hạn chưa kiểm chứng và rủi ro bàn giao ở [worked entry](../../../worked/learning/quizzes/2026-11-11-quiz-implementation.md).

## Ma trận truy vết để nghiệm thu

Mã FR/SR/AC trong bảng đều thuộc LRN-009. Kiểm thử nằm trong task của lát cắt, T050 là full-flow
và T060 là đối chiếu cuối; không đợi T050 mới viết các test cần cho task trước đó.

| FR     | Task triển khai chính              | Kiểm chứng / AC        |
| ------ | ---------------------------------- | ---------------------- |
| FR-001 | T007, T046, T047                   | T048, T058; AC-001     |
| FR-002 | T008–T012, T025, T026, T030, T035  | T012, T051; AC-002     |
| FR-003 | T013, T020, T025, T031             | T017, T024; AC-003     |
| FR-004 | T013, T025, T029                   | T017, T029; AC-004     |
| FR-005 | T022, T027, T031                   | T027, T050; AC-005     |
| FR-006 | T023, T025, T028                   | T024, T028; AC-006     |
| FR-007 | T002, T026, T027, T031             | T026, T051; AC-007     |
| FR-008 | T014, T030, T033                   | T017, T034; AC-008     |
| FR-009 | T014, T031                         | T017, T024; AC-009     |
| FR-010 | T032                               | T032, T050; AC-010     |
| FR-011 | T014, T033                         | T017, T034; AC-004/008 |
| FR-012 | T013, T014, T020, T026, T032, T033 | T024, T050; AC-011     |
| FR-013 | T016, T019, T035, T036             | T038; AC-012           |
| FR-014 | T019, T035                         | T038; AC-013           |
| FR-015 | T004, T036, T037                   | T038, T051; AC-014     |
| FR-016 | T021, T039                         | T024, T050; AC-015     |
| FR-017 | T040                               | T044, T050; AC-016     |
| FR-018 | T015, T041                         | T044, T045; AC-017     |
| FR-019 | T015, T041                         | T017, T045; AC-018     |
| FR-020 | T021, T023, T041, T042             | T045; AC-018/019       |
| FR-021 | T015, T042                         | T045, T050; AC-019/020 |
| FR-022 | T015, T042                         | T017, T050; AC-021     |
| FR-023 | T003, T043                         | T050, T052; AC-021     |
| FR-024 | T042, T043, T044                   | T049, T050; AC-022     |
| FR-025 | T004, T043, T044                   | T050; AC-023           |
| FR-026 | T002, T053                         | T051, T053; AC-026     |

| Security | Task kiểm chứng              | AC             |
| -------- | ---------------------------- | -------------- |
| SR-001   | T012, T029, T048, T051       | AC-002/024     |
| SR-002   | T012, T026, T027, T035, T051 | AC-002/005/007 |
| SR-003   | T029, T049, T051             | AC-025         |
| SR-004   | T036, T040, T044, T049, T051 | AC-014–017/025 |
| SR-005   | T021, T040, T043, T051       | AC-024         |
| SR-006   | T029, T049, T051             | AC-025         |
| SR-007   | T024, T041, T042, T045       | AC-018/019     |

## Bằng chứng cần ghi ở mỗi chặng

- Quyết định/spec version được dùng, file và contract thực sự đã đổi.
- Lệnh test/check đã chạy, kết quả, số suite skip và lý do; không chỉ ghi “đã test”.
- Các case bị từ chối và dữ liệu giữ nguyên khi lỗi, đặc biệt quyền và retry/concurrency.
- Phần chưa làm, scope có điều kiện/N/A, ảnh hưởng migration và gate còn fail.

> Checklist này là đường triển khai dự kiến. Nó không thay thế phê duyệt spec, không thêm sản
> phẩm ngoài FR và không ghi nhận implementation chỉ vì tài liệu đã được tạo.
