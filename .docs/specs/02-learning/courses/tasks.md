# LRN-003 Công việc triển khai Quản lý Course

> Cập nhật 2026-11-07: [LRN-008](../self-study/spec.md) thay thế mọi quy định về LECTURER, sở hữu riêng của người tạo, Class, Enrollment, Assignment và tiến độ theo lớp trong tài liệu này. Các yêu cầu còn lại vẫn áp dụng.

> Cập nhật pattern 2026-11-07: `CourseRepository` đã ở `domain/repositories`; controller Course inject inbound port của từng use case qua token. Các task chưa đánh dấu bên dưới còn phụ thuộc các phần kiểm chứng khác của LRN-003.

> Amendment 1.1 được chủ sở hữu Approved ngày 2026-11-12: Course readiness tính Problem hoặc Quiz
> khả dụng. Các task T031–T035 dưới đây thay phần Problem-only của T007/T011/T012/T028; không migration.

## Trạng thái

Approved — Sẵn sàng triển khai sau LRN-001

Được chủ sở hữu sản phẩm phê duyệt ngày `2026-09-30` (phê duyệt gộp).

Đặc tả liên quan: [`./spec.md`](./spec.md) — phiên bản Approved `1.0`
Kế hoạch liên quan: [`./plan.md`](./plan.md) — Approved ngày `2026-09-30`

Mọi công việc bắt đầu ở trạng thái chưa hoàn thành. Chỉ đánh dấu `[x]` khi cả phần triển khai lẫn
phần kiểm chứng đã xong. Các mục N/A là những mục duy nhất được tích sẵn có chủ đích.

## Chuẩn bị

- [ ] **LRN-003-T001 — Xác nhận nền tảng.** Khảo sát Git, spec 1.0, plan, kiến trúc Learning (ADR
      0002). Xác nhận LRN-001 đã triển khai (`TransactionRunner`,
      `@TrustedPrincipal()`/`TrustedPrincipalGuard` có `permissions`, bộ kiểm Markdown,
      `problems.deleted_at`) và ID-003-T045 tới T048 đã có. Thiếu thì **DỪNG và BÁO CÁO**.
      **Phụ thuộc:** Không có.
      **Truy vết:** Mục Thứ tự triển khai bước 1 của kế hoạch.

- [x] **LRN-003-T002 — Xác nhận ranh giới.** Không tạo Class, Enrollment, Assignment, Progress; không
      bài giảng/tài liệu; không đồng sở hữu; không microservice mới; `courses` chỉ đọc Problem qua
      `ProblemReferenceReader`.
      **Phụ thuộc:** LRN-003-T001.
      **Truy vết:** LRN-003-FR-001, FR-012, FR-017; mục Ngoài phạm vi.

## Identity

- [ ] **LRN-003-T003 — Seed quyền `course:*` ở Identity.** Quyền `course:*` đã nằm trong
      catalog `permission-catalog.ts` và được seed bằng `pnpm seed:identity:rbac` (idempotent) cùng
      các quyền khác; không còn migration riêng. Kiểm chứng `pnpm seed:identity:rbac` và token mới
      của `LECTURER` có tám quyền `course:*`.
      **Phụ thuộc:** LRN-003-T001.
      **Truy vết:** ID-003-FR-017; mục Quy tắc phân quyền của đặc tả.

## Domain

- [ ] **LRN-003-T004 — Value object.** `CourseId`, `CourseSlug`, `CourseTitle`, `CourseDescription`
      (≤ 20.000), `ChapterTitle` (≤ 200), `ChapterDescription` (≤ 5.000), `CourseStatus`,
      `DeletedMarker`. Dùng bộ kiểm Markdown hạn chế của LRN-001. Không import NestJS/TypeORM.
      **Phụ thuộc:** LRN-003-T001.
      **Truy vết:** LRN-003-FR-002, FR-014, FR-015.

- [x] **LRN-003-T005 — Aggregate `Course`.** Chapter và `ChapterProblemRef` bên trong; bất biến ≤ 50
      Chapter, ≤ 50 Problem mỗi Chapter, mỗi Problem một lần mỗi Course, thứ tự liên tục; thêm, sửa,
      gỡ, sắp xếp lại Chapter và Problem.
      **Phụ thuộc:** LRN-003-T004.
      **Truy vết:** LRN-003-FR-005, FR-006, FR-015; AC-009, AC-013, AC-018.

- [x] **LRN-003-T006 — Máy trạng thái.** Publish, hold, republish, xoá mềm, khôi phục, xoá hẳn nháp;
      bước chuyển bị cấm trả `InvalidCourseState`. Chỉ `DRAFT`/`PUBLISHED` chưa xoá mềm sửa được.
      **Phụ thuộc:** LRN-003-T005.
      **Truy vết:** LRN-003-FR-007, FR-018, FR-019.

- [x] **LRN-003-T007 — `CourseReadiness` và `ProblemAttachPolicy`.** Readiness: tiêu đề, ≥ 1 Chapter,
      ≥ 1 Problem `PUBLISHED` chưa xoá. Attach: Problem chưa xoá và (`PUBLISHED` hoặc nháp/tạm giữ của
      chính mình); lỗi không phân biệt không tồn tại với không được phép.
      **Phụ thuộc:** LRN-003-T005.
      **Truy vết:** LRN-003-FR-006, FR-008, FR-019; SR-003; AC-006, AC-008, AC-019, AC-020.

- [x] **LRN-003-T008 — Unit test domain.** Không cần PostgreSQL.
      **Phụ thuộc:** LRN-003-T004 tới LRN-003-T007.
      **Truy vết:** AC-006, AC-008, AC-009, AC-013, AC-018, AC-019, AC-020.

## Tầng application

- [ ] **LRN-003-T009 — Port.** `CourseRepository` (có `loadForUpdate`), `CourseReferenceChecker`,
      `ProblemReferenceReader`; dùng lại `TransactionRunner` của LRN-001; principal lấy qua
      `@TrustedPrincipal()`/`TrustedPrincipalGuard`, không phải port.
      **Phụ thuộc:** LRN-003-T005.
      **Truy vết:** Mục Port của kế hoạch.

- [x] **LRN-003-T010 — `CourseAuthorization`.** Kiểm mã quyền trong `principal.permissions` và
      `createdBy == principal.userId`; không ngoại lệ cho `ADMIN`.
      **Phụ thuộc:** LRN-003-T003, LRN-003-T009.
      **Truy vết:** LRN-003-SR-001, SR-002; AC-002.

- [x] **LRN-003-T011 — Use case quản lý Course.** `CreateCourse`, `UpdateCourse`, `PublishCourse`,
      `HoldCourse`, `RepublishCourse`, `DeleteCourse` (xoá hẳn nháp khi không bị tham chiếu, ngược lại
      xoá mềm), `RestoreCourse`. Mỗi use case trong transaction có `loadForUpdate`.
      **Phụ thuộc:** LRN-003-T006, LRN-003-T007, LRN-003-T010.
      **Truy vết:** LRN-003-FR-003, FR-004, FR-007, FR-008, FR-018, FR-019; AC-001, AC-006, AC-007,
      AC-014, AC-017.

- [x] **LRN-003-T012 — Use case Chapter và Problem.** `AddChapter`, `UpdateChapter`, `RemoveChapter`,
      `ReorderChapters`, `AttachProblem`, `DetachProblem`, `ReorderChapterProblems`; Course `PUBLISHED`
      phải giữ readiness sau thay đổi.
      **Phụ thuộc:** LRN-003-T007, LRN-003-T010.
      **Truy vết:** LRN-003-FR-005, FR-006, FR-019; AC-008, AC-009, AC-013, AC-018, AC-019, AC-020.

- [x] **LRN-003-T013 — Use case đọc.** `ListPublishedCourses`, `GetPublishedCourse` (id hoặc slug; chỉ
      Problem `PUBLISHED` chưa xoá), `ListManagedCourses` (`includeDeleted`), `GetManagedCourse` (trạng
      thái từng Problem, lỗi readiness).
      **Phụ thuộc:** LRN-003-T009, LRN-003-T010.
      **Truy vết:** LRN-003-FR-009, FR-010, FR-011, FR-013; AC-004, AC-005, AC-010.

- [x] **LRN-003-T014 — Unit test application.** Port giả: quyền, sở hữu, trạng thái, xoá hẳn nháp bị
      tham chiếu, giữ readiness, lỗi không để lại thay đổi dở dang.
      **Phụ thuộc:** LRN-003-T011 tới LRN-003-T013.
      **Truy vết:** AC-002, AC-014, AC-017, AC-019.

## Lưu trữ và migration

- [x] **LRN-003-T015 — Migration Learning.** `<timestamp>-Lrn003CourseManagement.ts`: enum
      `courses_status_enum`; `courses.status` (mặc định `DRAFT`), `updated_at`, `deleted_at`, CHECK mô
      tả; `chapters.description`, CHECK, `UNIQUE (id, course_id)`, index; bảng `chapter_problems` với
      FK kép, FK `problem_id` `ON DELETE RESTRICT`, `UNIQUE (course_id, problem_id)`, index; partial
      index trên `courses`. Down gỡ theo thứ tự ngược.
      **Phụ thuộc:** LRN-003-T001.
      **Truy vết:** Mục Thay đổi cơ sở dữ liệu của kế hoạch.

- [ ] **LRN-003-T016 — Kiểm chứng migration.** `pnpm migration:run:learning`, kiểm schema, revert,
      chạy lại; Course hiện có thành `DRAFT`; không schema service khác bị đụng.
      **Phụ thuộc:** LRN-003-T015.
      **Truy vết:** Định nghĩa Hoàn thành.

- [x] **LRN-003-T017 — Entity.** Cập nhật `Course`, `Chapter`; thêm `ChapterProblem`; đăng ký trong
      `learning.entities.ts`. Không chuyển entity vào `libs/`.
      **Phụ thuộc:** LRN-003-T015.
      **Truy vết:** Mục Lưu trữ của kế hoạch.

- [x] **LRN-003-T018 — `ProblemReferenceReader` ở module `problems`.** Provider chỉ đọc trả `id`,
      `slug`, `title`, `problemType`, `difficulty`, `publishStatus`, `deletedAt`, `createdBy` cho một tập
      ID; export từ `problems.module.ts`. Không trả nội dung đề, Test Case, harness.
      **Phụ thuộc:** LRN-003-T009.
      **Truy vết:** LRN-003-FR-012; SR-004; AC-015.

- [x] **LRN-003-T019 — Adapter `CourseRepository` và `CourseReferenceChecker`.** Ánh xạ hai chiều,
      lưu cả khối, `FOR UPDATE`, truy vấn người học join `problems` có lọc trạng thái, liệt kê phân
      trang tìm `ILIKE`; ánh xạ vi phạm UNIQUE thành `DuplicateSlug` / `ProblemAlreadyInCourse`.
      **Phụ thuộc:** LRN-003-T009, LRN-003-T017.
      **Truy vết:** LRN-003-FR-002, FR-009, FR-010, FR-018; SR-003, SR-007.

- [x] **LRN-003-T020 — Integration test.** Ánh xạ aggregate; FK kép; trùng Problem dưới đồng thời;
      Problem `ON_HOLD`/xoá mềm ẩn rồi hiện lại đúng vị trí; xoá hẳn nháp bị Class tham chiếu bị từ chối.
      **Phụ thuộc:** LRN-003-T016, LRN-003-T018, LRN-003-T019.
      **Truy vết:** AC-004, AC-010, AC-017, AC-018.

## API / Presentation

- [x] **LRN-003-T021 — DTO.** Request và response theo mục DTO của kế hoạch; ánh xạ tường minh;
      `ValidationPipe` toàn cục chặn trường lạ.
      **Phụ thuộc:** LRN-003-T004.
      **Truy vết:** LRN-003-SR-005; AC-016.

- [x] **LRN-003-T022 — Controller.** Mười tám route theo bảng API của kế hoạch; `managed` trước
      `:idOrSlug`; mỗi route gọi đúng một use case; không logic nghiệp vụ trong controller.
      **Phụ thuộc:** LRN-003-T011 tới LRN-003-T013, LRN-003-T021.
      **Truy vết:** Mục API của kế hoạch.

- [x] **LRN-003-T023 — Ánh xạ lỗi.** Theo bảng Xử lý lỗi của kế hoạch; không cấu trúc lỗi mới.
      **Phụ thuộc:** LRN-003-T022.
      **Truy vết:** Mục Tình huống lỗi của đặc tả; SR-008.

- [x] **LRN-003-T024 — Swagger.** Mô tả route, DTO, Bearer, mã lỗi; ví dụ không chứa dữ liệu judge.
      **Phụ thuộc:** LRN-003-T022.
      **Truy vết:** Định nghĩa Hoàn thành; SR-004.

- [x] **LRN-003-T025 — `CoursesModule`.** Nối dây use case, port, adapter; import `ProblemsModule` chỉ
      để lấy `ProblemReferenceReader`; nạp vào `learning-service.module.ts`.
      **Phụ thuộc:** LRN-003-T018, LRN-003-T019, LRN-003-T022.
      **Truy vết:** Mục Kiến trúc của kế hoạch.

## Messaging / Realtime / Cấu hình

- [x] **N/A — Không có sự kiện, realtime hay thay đổi cấu hình.** LRN-003 không phát/tiêu thụ sự
      kiện, không dùng Redis/Socket.IO, payload nhỏ nên không cần đổi giới hạn body.

## Kiểm thử, bảo mật, kiểm chứng

- [x] **LRN-003-T026 — Test API/E2E.** `401`, `403`, liệt kê và xem đã xuất bản, Course nháp/tạm giữ/
      xoá trả `404` cho người học, slug trùng, mô tả có HTML, xoá mềm không xoá Class, không có dữ liệu
      judge, trường lạ.
      **Phụ thuộc:** LRN-003-T022 tới LRN-003-T025.
      **Truy vết:** AC-001 tới AC-020.

- [x] **LRN-003-T027 — Rà soát bảo mật.** Không lộ Course/Problem chưa công khai qua liệt kê, tìm,
      chi tiết, lỗi, số đếm; không có dữ liệu judge; không truy cập CSDL service khác.
      **Phụ thuộc:** LRN-003-T026.
      **Truy vết:** LRN-003-SR-001 tới SR-008.

- [x] **LRN-003-T028 — Chạy lệnh kiểm chứng.** `pnpm lint`, `pnpm typecheck`, `pnpm test`,
      `pnpm build`; không che lỗi bằng `any`, `@ts-ignore` hay tắt lint.
      **Phụ thuộc:** LRN-003-T026, LRN-003-T027.
      **Truy vết:** Định nghĩa Hoàn thành.

- [ ] **LRN-003-T029 — Tuân thủ kiến trúc.** Domain không import framework; `courses` không import
      internals của `problems` ngoài `ProblemReferenceReader`; không entity Course trong `libs/`.
      **Phụ thuộc:** LRN-003-T025, LRN-003-T028.
      **Truy vết:** ADR 0002; `dependency-rules.md`.

- [ ] **LRN-003-T030 — Đối chiếu đặc tả và bàn giao.** Rà FR-001 tới FR-019, SR-001 tới SR-008,
      AC-001 tới AC-020; cập nhật ô đánh dấu, viết worked entry, lấy review, chuyển trạng thái qua
      quy trình SDD.
      **Phụ thuộc:** LRN-003-T028, LRN-003-T029.
      **Truy vết:** Đặc tả 1.0; quy trình SDD.

## Bảng tổng hợp độ phủ

| Yêu cầu               | Công việc triển khai chính   | Kiểm thử/xác minh      |
| --------------------- | ---------------------------- | ---------------------- |
| LRN-003-FR-001–FR-004 | T002, T004, T011, T019       | T008, T014, T026       |
| LRN-003-FR-005–FR-006 | T005, T007, T012             | T008, T020, T026       |
| LRN-003-FR-007–FR-008 | T006, T007, T011             | T008, T014, T026       |
| LRN-003-FR-009–FR-013 | T013, T018, T019             | T020, T026             |
| LRN-003-FR-014–FR-017 | T002, T004, T005, T011       | T008, T026             |
| LRN-003-FR-018–FR-019 | T006, T011, T012, T019       | T014, T020             |
| LRN-003-SR-001–SR-008 | T003, T010, T018, T019, T021 | T027                   |
| LRN-003-AC-001–AC-020 | —                            | T008, T014, T020, T026 |

> File này là danh sách kiểm tra triển khai, không phải đặc tả. Không thêm yêu cầu và không âm thầm
> thay đổi `spec.md` hay `plan.md` đã Approved.

## Refactor bố trí theo Problem — 2026-11-07

- [x] Mỗi use case và inbound port một file; command và lỗi có tên riêng.
- [x] Use case ghi tự điều phối transaction và aggregate; bỏ `CourseMutationService`, dùng chung hợp đồng `TransactionRunner` của Problem.
- [x] Tách controller Course quản lý, Chapter quản lý và Course công khai; giữ 18 route và thứ tự route tĩnh trước route động.
- [x] Tách request mapper, DTO và thư mục filters; thêm barrel và alias theo working agreement.
- [x] Xác minh unit/API, DI với PostgreSQL, lint/typecheck/build và ghi worked entry. Course có 145 test qua; build cả sáu service qua. Lint/typecheck/test toàn repo còn lỗi có sẵn ở test Identity (`officialName`), xem worked entry `learning/courses/2026-11-07-align-layout-with-problems.md`.

## Sửa lỗi review PR — 2026-11-07

- [x] Chia sẻ transaction storage theo DataSource giữa Course/Problem; reader dùng manager hiện tại.
- [x] Chặn slug `managed` khi tạo mới, giữ rehydrate dữ liệu cũ và cập nhật Swagger.
- [x] Kiểm thử regression với pool một connection, cô lập request/DataSource, API slug và chạy kiểm tra chất lượng.

## Amendment Course content — 2026-11-12

- [x] **LRN-003-T031 — Đồng bộ spec/plan/contract.** Course 1.1 và Progress 1.1 Approved; readiness
      dùng `PUBLISHED_CONTENT_REQUIRED`, output quản lý/Swagger không còn mã Problem-only.
- [x] **LRN-003-T032 — Learning Item readiness.** Thêm projection domain `LearningItemState`; application
      hợp nhất `CourseProblemCatalog` + `CourseQuizCatalog`; không thêm entity/bảng/migration.
- [x] **LRN-003-T033 — Giữ readiness khi mutation.** Publish/republish/remove Chapter/detach Problem/
      detach Quiz dùng cùng readiness; mutation thất bại rollback state.
- [x] **LRN-003-T034 — Test Course content.** Unit/integration cho Problem-only, Quiz-only, mixed;
      hold/delete/republish và đổi Quiz revision dùng trạng thái root hiện tại.
- [x] **LRN-003-T035 — Verify/bàn giao.** Chạy test liên quan, lint/typecheck/build, cập nhật task và
      worked entry; ghi rõ baseline hoặc test PostgreSQL chưa chạy.
