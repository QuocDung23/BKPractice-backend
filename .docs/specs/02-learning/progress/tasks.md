# LRN-006 — Công việc triển khai Progress cá nhân

## Trạng thái và phạm vi

Approved — checklist cập nhật 2026-11-07 theo [LRN-008](../self-study/spec.md).
Nguồn: [LRN-006 spec](./spec.md) và [plan](./plan.md), Approved ngày 2026-09-30.
Giữ ID task để truy vết. Class, Enrollment, Assignment và điểm theo hạn chót đã bị LRN-008 loại bỏ;
các mục N/A dưới đây không phải việc còn chờ triển khai.

## Chuẩn bị

- [x] **LRN-006-T001 — Nền tảng.** Đọc spec/plan/kiến trúc; Problem có trạng thái/xoá mềm, principal tin cậy và TransactionRunner; Course đã có API và schema cần thiết.
- [x] **LRN-006-T002 — Dữ liệu được đọc.** Xác nhận `courses.status/deleted_at`, thứ tự `chapters`/`chapter_problems`, `problems.publish_status/deleted_at`. Course chưa export query cấu trúc công khai; Progress dùng reader riêng và test so với API Course. Class/Assignment không còn là phụ thuộc.
- [x] **LRN-006-T003 — Ranh giới.** Không đổi contract sự kiện, không sửa Submission/libs, không backfill/realtime, không ghi ATTEMPTED, không API ghi hay lưu tổng hợp.

## Domain

- [x] **LRN-006-T004 — AcceptedSubmission.** Kiểm payload, chuẩn hoá UUID, thời điểm và điểm hợp lệ; lỗi không sửa state (FR-009; AC-007).
- [x] **LRN-006-T005 — ProblemProgress.** Thời điểm sớm nhất, điểm cao nhất, không tạo ATTEMPTED (FR-003–FR-007).
- [x] **LRN-006-T006 — CompletionCount/CourseCompletionCalculator.** Tính trên cấu trúc hiển thị, giữ thứ tự, Chapter rỗng và 0/0 hợp lệ (FR-012; AC-011).
- [x] **LRN-006-T007 — N/A: AssignmentScoreCalculator.** LRN-008 loại bỏ Assignment và điểm theo hạn chót.
- [x] **LRN-006-T008 — Unit domain.** Payload sai, gộp min/max qua mọi hoán vị có sự kiện trùng; completion trên cấu trúc hiện tại, 0/0.

## Application và port

- [x] **LRN-006-T009 — Port.** ProgressRepository ghi/đọc cá nhân, CourseStructureReader, PublishedProblemFilter và TransactionRunner dùng chung. ClassMembershipReader, AssignmentReader, Clock là N/A theo LRN-008.
- [x] **LRN-006-T010 — ApplyAcceptedSubmission.** Receipt và progress nguyên tử; duplicate, khoá dòng, rollback (FR-002–FR-010).
- [x] **LRN-006-T011 — Ba use case cá nhân.** ListMySolvedProblems, GetMySolvedStatus, GetMyCourseProgress. Lọc visibility, dùng principal, giữ thứ tự trạng thái; Course không công khai trả NotFound (FR-011/FR-012/FR-018). GetMyAssignmentScore là N/A theo LRN-008.
- [x] **LRN-006-T012 — N/A: authorization/use case tiến độ theo Class.** LRN-008 loại bỏ các luồng này.
- [x] **LRN-006-T013 — Unit application.** Use case chỉ đọc theo principal, không ghi; ẩn trạng thái/thời điểm Problem không công khai; lỗi reader không trả dữ liệu một phần; kiểm use case ghi hiện có.

## Persistence và reader

- [x] **LRN-006-T014 — Entity.** Giữ Progress/enum lịch sử, đăng ký ProgressEventReceipt trong Learning.
- [x] **LRN-006-T015 — Repository.** Ghi qua manager của transaction; đọc lọc SOLVED và solved_at không null. List lọc Problem công khai trước phân trang/total; findSolved theo cặp user/Problem. Các phép gộp theo Class là N/A.
- [x] **LRN-006-T016 — Integration lưu trữ.** Concurrent event/duplicate, earliest time/best score, rollback/retry, ATTEMPTED cũ và UUID hoa/thường.
- [x] **LRN-006-T017 — Reader.** CourseStructureReader và PublishedProblemFilter chỉ SELECT trên Learning qua port của Progress; không import entity/repository của Course/Problem. Class/Assignment/SystemClock là N/A.
- [x] **LRN-006-T018 — Integration reader/API.** So cấu trúc với API Course; ẩn ON_HOLD/DRAFT/xoá mềm, giữ Chapter rỗng; Course không công khai 404, 0/0 hợp lệ.

## Migration

- [x] **LRN-006-T019 — Migration hiện có.** `1700000005000-Lrn006Progress.ts`: precheck dữ liệu, receipt từ last_event_id, CHECK điểm và thời điểm giải. Không sửa migration lịch sử hay thêm migration cho API đọc.
- [x] **LRN-006-T020 — Kiểm chứng migration.** Chạy down/up trong transaction rollback trên PostgreSQL test; kiểm dữ liệu lỗi, receipt chép từ last_event_id, CHECK và bảo toàn progress.

## Messaging

- [x] **LRN-006-T021 — Consumer mỏng.** Chỉ gọi inbound use case, lỗi được ném lại cho retry/DLQ, không thay libs/common/contracts.
- [x] **LRN-006-T022 — Integration messaging.** RabbitMQ/PostgreSQL cách ly: accepted/duplicate, payload sai retry 3 lần vào DLQ không đổi state; lỗi ghi rollback và replay sau phục hồi áp dụng đúng một lần.

## HTTP, Gateway và bảo mật

- [x] **LRN-006-T023 — DTO.** Page/limit, 1..100 UUID duy nhất, response tường minh; UUID danh sách chuẩn hoá trước kiểm trùng, không có trường userId hay dữ liệu judge.
- [x] **LRN-006-T024 — MyProgressController.** Ba GET route cá nhân, không endpoint ghi/Class/Assignment; từng handler gọi một inbound use case.
- [x] **LRN-006-T025 — Filter.** 401/400/404 theo contract, 500 không lộ lỗi hạ tầng hoặc log bí mật.
- [x] **LRN-006-T026 — Swagger.** Ba route, Bearer, DTO và response/error schemas.
- [x] **LRN-006-T027 — DI.** Nối controller, port, use case, reader, calculator và consumer trong ProgressModule; barrel/alias theo working agreement.
- [x] **LRN-006-T028 — Gateway.** Allowlist ba route cá nhân đã có từ LRN-008; kiểm chứng giữ routing và principal, không thêm nghiệp vụ Gateway.
- [x] **LRN-006-T029 — API/PostgreSQL E2E.** 401, lỗi query, cách ly người dùng, ADMIN chỉ xem của mình, phân trang/total không lộ bài ẩn, status theo thứ tự, tiến độ được giữ khi ẩn/gỡ bài, phản hồi chỉ có trường hợp lệ.
- [x] **LRN-006-T030 — Rà soát bảo mật.** Chỉ SELECT khi đọc, không đọc CSDL service khác, không raw payload/header hay dữ liệu judge trong response/log; userId giả trong query bị 400.

## Vận hành và bàn giao

- [x] **LRN-006-T031 — Tài liệu vận hành.** API đọc, test cách ly, theo dõi/replay DLQ bằng công cụ RabbitMQ hiện có.
- [x] **LRN-006-T032 — Gate chất lượng.** Chạy lint/typecheck/test/build; ghi rõ lỗi baseline của test Identity nếu còn.
- [x] **LRN-006-T033 — Kiến trúc.** Rà domain thuần, repository/reader port, controller/consumer mỏng, import và barrel; đồng bộ CodeGraph.
- [x] **LRN-006-T034 — Đối chiếu spec.** FR-001–FR-012, FR-017/FR-018 và các AC/SR cá nhân áp dụng; FR-013–FR-016, AC-014–AC-019, AC-022/AC-023 theo lớp là N/A theo LRN-008 (việc giữ tiến độ cá nhân vẫn áp dụng).
- [x] **LRN-006-T035 — Worked entry và bàn giao.** Ghi kết quả thật và giới hạn; không tự chuyển trạng thái Approved spec.

## Regression đã hoàn thành trước phần đọc

- [x] Tách domain/use case/port khỏi consumer, receipt idempotency và adapter giao dịch.
- [x] Chuẩn hoá bốn UUID của accepted event; kiểm event hoa/thường và duplicate trên PostgreSQL.

## Kết quả gate 2026-11-07

9 suite/69 test Progress qua với PostgreSQL và RabbitMQ thật. Build cả sáu service qua; ESLint/Prettier riêng phần thay đổi qua. Test toàn repo: 135 suite/1.056 test qua, 16 suite/118 test skip; một suite Identity lỗi vì `officialName` không còn trong kiểu hiện hành. `pnpm lint` và `pnpm typecheck` toàn repo cũng còn đúng lỗi baseline Identity này. Các mục gate ở trên xác nhận đã chạy và ghi nhận kết quả, không có nghĩa toàn repo đã xanh; spec giữ trạng thái Approved.

## Amendment Learning Item — 2026-11-12

- [x] **LRN-006-T036 — Contract Progress 1.1.** Định nghĩa Problem/Quiz là Learning Item ngang trọng
      số; response Course dùng `completed`, `completedItems` và loại item.
- [x] **LRN-006-T037 — Projection Course content.** `CourseStructureReader` đọc Problem và Quiz
      PUBLISHED chưa xoá; giữ Chapter rỗng; không import write repository module khác.
- [x] **LRN-006-T038 — Quiz completion reader.** Đọc pass đầu tiên từ `quiz_attempts` theo user + Quiz;
      fail sau và đổi revision không thu hồi completion; không thêm bảng/migration.
- [x] **LRN-006-T039 — Tính Learning Item.** Domain calculator và use case hợp nhất Problem solved +
      Quiz passed, chỉ tính item đang hiển thị.
- [x] **LRN-006-T040 — Regression.** Unit cho Problem-only/Quiz-only/mixed; fixture PostgreSQL cho
      hold/delete/detach/republish/revision và fail sau pass. Suite PostgreSQL skip khi thiếu URL test.
- [x] **LRN-006-T041 — Verify/bàn giao.** Unit liên quan 55/55 và HTTP Course 39/39 qua, ESLint phần đổi qua,
      `build:learning` qua; typecheck chỉ còn baseline Identity `officialName`; worked entry được ghi.
- [x] **LRN-006-T042 — Tích hợp report sau rebase.** Course report dùng cùng projection Problem/Quiz
      và tính Quiz hoàn thành từ attempt `FINISHED` có `passed=true`; typecheck/build và regression qua.
