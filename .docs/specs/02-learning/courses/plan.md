# LRN-003 Kế hoạch triển khai Quản lý Course

> Cập nhật 2026-11-07: [LRN-008](../self-study/spec.md) thay thế mọi quy định về LECTURER, sở hữu riêng của người tạo, Class, Enrollment, Assignment và tiến độ theo lớp trong tài liệu này. Các yêu cầu còn lại vẫn áp dụng.

## Bố trí code theo Problem (2026-11-07)

Refactor theo yêu cầu chủ dự án, giữ hợp đồng LRN-003 và quyền ADMIN của LRN-008:

- Mỗi workflow nằm trong một `application/use-cases/<action>.use-case.ts`; interface và token tương ứng nằm trong `application/ports/in/<action>.port.in.ts`.
- Từng use case ghi tự điều phối quyền, transaction, `loadForUpdate`, thay đổi aggregate và lưu; bỏ wrapper callback `CourseMutationService`.
- Dùng `TransactionRunner` do Problem sở hữu, với adapter và context transaction riêng cho Course.
- `application/command` chứa command tạo/cập nhật riêng; lỗi application/domain tách theo tên lỗi, repository port ở `domain/repositories/course.repository.port.out.ts`.
- Presentation gồm `ManagedCoursesController`, `ManagedChaptersController`, `PublicCoursesController`; đăng ký controller quản lý trước controller có route `:idOrSlug`. Route và response giữ nguyên.
- `CourseRequestMapper` chuyển DTO tạo/cập nhật sang command; filter ở `presentation/http/filters`. DTO tách theo tạo, cập nhật, chapter, sắp xếp và query.
- Duy trì barrel trong mỗi thư mục và import qua alias `@/modules/courses/*`. Alias cụ thể được khai báo trong TypeScript/Jest để không đè alias của Identity.

## Sửa lỗi review PR — 2026-11-07

- Course và Problem dùng chung AsyncLocalStorage transaction được phân vùng theo DataSource ở infrastructure của Learning. Context của từng module giữ API hiện tại; `ProblemReferenceReaderAdapter` đọc bằng manager của transaction đang chạy, không lấy connection thứ hai.
- Từ chối tạo Course có slug `managed` (không phân biệt hoa/thường sau chuẩn hoá) vì trùng route quản lý. Kiểm tra trong use case tạo, giữ khả năng rehydrate và đọc bằng ID cho dữ liệu cũ. Swagger ghi rõ slug dành riêng.
- Kiểm thử toàn bộ vòng đời qua CoursesModule thật với pool PostgreSQL chỉ có một connection; kiểm thử cô lập context giữa request/DataSource; kiểm thử API từ chối slug và không ghi state.

## Trạng thái

Approved

Được chủ sở hữu sản phẩm phê duyệt ngày `2026-09-30` (phê duyệt gộp: chủ sở hữu duyệt trước các
phương án đề xuất trong kế hoạch này).

Kế hoạch này bám theo phiên bản `1.1` (Approved) của đặc tả LRN-003. Nó là tài liệu thiết kế, không
triển khai code và không thay đổi đặc tả.

## Đặc tả liên quan

- [LRN-003 Quản lý Course](./spec.md)
- Trạng thái: `Approved`
- Phiên bản: `1.1`
- Ngày phê duyệt amendment: `2026-11-12`

Kế hoạch không thêm hành vi, trạng thái hay giới hạn nào ngoài đặc tả.

## Service đích

Service: Learning Service, module `courses` (`apps/learning-service/src/modules/courses/`).

Ngoài Learning, chỉ có một thay đổi: migration seed tám quyền `course:*` ở Identity theo
ID-003-FR-017. Gateway đã chuyển `/api/courses*` tới Learning.

## Kiến trúc service bắt buộc

Kiến trúc: **DDD + Hexagonal Architecture** (theo
[ADR 0002](../../../adr/0002-revised-service-internal-architectures.md)).

```text
presentation -> application -> domain
infrastructure ----implements----^ các port của application/domain
```

- Module `courses` có đủ bốn tầng vì có bất biến thật: vòng đời, điều kiện xuất bản, giới hạn, tính
  duy nhất của Problem trong Course, và phép chiếu ẩn Problem chưa công khai.
- Module `courses` không import entity, repository hay use case nội bộ của module `problems`. Nó đọc
  thông tin Problem qua một port hẹp mà module `problems` cung cấp (xem mục Port).
- Class và Enrollment vẫn nằm trong thư mục entity của `courses` ở nền tảng hiện tại nhưng không
  thuộc phạm vi LRN-003 (LRN-004).

## Ảnh hưởng tới mã nguồn hiện có

### Nền tảng hiện tại (kết quả khảo sát)

- `courses/entities/course.entity.ts` định nghĩa `Course` (`title` ≤ 200, `slug` duy nhất ≤ 220,
  `description` null được, `created_by`, `created_at`), `Chapter` (`course_id` FK `ON DELETE CASCADE`,
  `title`, `display_order`), `Classroom`, `Enrollment`.
- Chưa có module Nest, controller hay use case cho Course; `learning-service.module.ts` chỉ nạp
  `ProblemsModule` và `ProgressModule`.
- Chưa có cột trạng thái, `updated_at`, `deleted_at` trên `courses`; chưa có `description` trên
  `chapters`; chưa có bảng nối Chapter–Problem.
- `classes.course_id` là FK `ON DELETE CASCADE` và `assignments.course_id` là FK `ON DELETE SET NULL`
  tới `courses`: xoá hẳn một Course sẽ kéo theo xoá Class. LRN-003-FR-018 vì vậy phải kiểm tra tham
  chiếu trước khi xoá.
- `learning.entities.ts` đăng ký mọi entity Learning; `data-source.ts` dùng `synchronize: false`.

### Phân loại thay đổi

| Phân loại | Nội dung                                                                                                                                                                                                                         |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REUSE     | Bảng `courses`, `chapters`; `TransactionRunner` và cơ chế principal tin cậy (`@TrustedPrincipal()`/`TrustedPrincipalGuard`) của LRN-001; bộ kiểm tra Markdown hạn chế của LRN-001; `ValidationPipe` toàn cục; định tuyến Gateway |
| MODIFY    | Entity `Course`, `Chapter`; `learning.entities.ts`; `learning-service.module.ts` (nạp `CoursesModule`); module `problems` (export port đọc tham chiếu Problem)                                                                   |
| CREATE    | Domain `Course` aggregate và value object; port, use case; entity `ChapterProblem`; adapter TypeORM; controller, DTO; `CoursesModule`; migration Learning `Lrn003CourseManagement`; migration Identity seed quyền; test          |
| REMOVE    | Không có                                                                                                                                                                                                                         |

## Thay đổi ở tầng domain

### Aggregate `Course`

Course cùng mọi Chapter và mọi tham chiếu Problem của nó là một aggregate (tối đa 50 × 50 tham
chiếu, đủ nhỏ để nạp và lưu cả khối).

| Thành phần          | Quy tắc                                                                   | Truy vết       |
| ------------------- | ------------------------------------------------------------------------- | -------------- |
| `CourseId`          | UUID ổn định                                                              | FR-002         |
| `CourseSlug`        | Giảng viên cung cấp, đúng mẫu, ≤ 220 ký tự, bất biến                      | FR-002         |
| `CourseTitle`       | Không rỗng, ≤ 200 ký tự, không phải định danh                             | FR-002, FR-008 |
| `CourseDescription` | Markdown hạn chế, ≤ 20.000 ký tự, cho phép null                           | FR-014, FR-015 |
| `CourseStatus`      | `DRAFT`, `PUBLISHED`, `ON_HOLD` + `DeletedMarker`                         | FR-007         |
| `Chapter`           | Entity trong aggregate: `ChapterId`, tiêu đề ≤ 200, mô tả ≤ 5.000, thứ tự | FR-005, FR-015 |
| `ChapterProblemRef` | `problemId` + thứ tự trong Chapter                                        | FR-006, FR-012 |

Bất biến của aggregate:

- ≤ 50 Chapter; ≤ 50 tham chiếu mỗi Chapter (FR-015).
- Mỗi `problemId` xuất hiện tối đa một lần trong toàn Course (quyết định 7).
- Thứ tự Chapter và thứ tự Problem trong Chapter là dãy liên tục 0..n-1 sau mỗi thao tác.
- Chỉ `DRAFT` và `PUBLISHED` chưa xoá mềm là chỉnh sửa được (FR-019).

### Máy trạng thái

```text
tạo -> DRAFT
DRAFT -> PUBLISHED             (publish; kiểm CourseReadiness)
PUBLISHED -> ON_HOLD           (hold)
ON_HOLD -> PUBLISHED           (republish; kiểm lại CourseReadiness)
PUBLISHED | ON_HOLD -> xoá mềm (delete; giữ status)
xoá mềm -> status cũ           (restore; không kiểm lại nội dung)
DRAFT -> xoá hẳn               (delete khi không bị tham chiếu; FR-018)
```

Bước chuyển bị cấm trả `InvalidCourseState` và không đổi state.

### Domain service `CourseReadiness`

Đầu vào: aggregate + tập `LearningItemState` hiện tại của các Problem/Quiz được tham chiếu (lấy qua
hai catalog port và hợp nhất ở application).
Lỗi có thể trả: `TITLE_REQUIRED`, `CHAPTER_REQUIRED`, `PUBLISHED_CONTENT_REQUIRED`. Dùng bởi publish,
republish, phần mức độ sẵn sàng ở phía quản lý, và kiểm tra "giữ điều kiện xuất bản" khi sửa Course
`PUBLISHED` (FR-008, FR-019).

### Chính sách thêm Problem

`ProblemAttachPolicy`: cho phép nếu Problem chưa xoá mềm và (`PUBLISHED`) hoặc (`DRAFT`/`ON_HOLD` và
`createdBy` = principal). Ngược lại trả `ProblemNotAttachable`, lỗi này không phân biệt "không tồn
tại" với "không được phép" (FR-006, SR-003).

## Tầng application / Use case

Mỗi use case thay đổi dữ liệu chạy trong `TransactionRunner`, nạp Course bằng `loadForUpdate` (khoá
dòng `courses`), kiểm quyền và sở hữu qua `CourseAuthorization`, rồi lưu cả aggregate.

| Use case                 | Quyền                 | Ghi chú                                                              | Truy vết                       |
| ------------------------ | --------------------- | -------------------------------------------------------------------- | ------------------------------ |
| `CreateCourse`           | `course:create`       | Tạo `DRAFT`; `createdBy` từ principal; slug trùng → `DuplicateSlug`  | FR-003; AC-001, AC-011         |
| `UpdateCourse`           | `course:update`       | Tiêu đề, mô tả; nếu `PUBLISHED` thì kiểm `CourseReadiness`           | FR-004, FR-019                 |
| `AddChapter`             | `course:update`       | Thêm vào cuối hoặc vị trí chỉ định; kiểm ≤ 50                        | FR-005; AC-013                 |
| `UpdateChapter`          | `course:update`       | Tiêu đề, mô tả                                                       | FR-005                         |
| `RemoveChapter`          | `course:update`       | Gỡ Chapter và tham chiếu của nó; nếu `PUBLISHED` thì kiểm readiness  | FR-005, FR-019; AC-019         |
| `ReorderChapters`        | `course:update`       | Tập ID phải trùng đúng tập hiện có                                   | FR-005; AC-009                 |
| `AttachProblem`          | `course:update`       | `ProblemAttachPolicy`; kiểm trùng trong Course; kiểm ≤ 50            | FR-006; AC-008, AC-018, AC-020 |
| `DetachProblem`          | `course:update`       | Nếu `PUBLISHED` thì kiểm readiness Problem + Quiz                    | FR-006, FR-019; AC-019/022     |
| `DetachQuiz`             | `course:update`       | Nếu `PUBLISHED` thì kiểm readiness Problem + Quiz                    | FR-019/020; AC-021–023         |
| `ReorderChapterProblems` | `course:update`       | Tập ID phải trùng đúng tập hiện có trong Chapter                     | FR-006; AC-009                 |
| `PublishCourse`          | `course:publish`      | `DRAFT` → `PUBLISHED`                                                | FR-008; AC-006, AC-007         |
| `HoldCourse`             | `course:hold`         | `PUBLISHED` → `ON_HOLD`                                              | FR-007                         |
| `RepublishCourse`        | `course:republish`    | `ON_HOLD` → `PUBLISHED`, kiểm lại readiness                          | FR-007, FR-008                 |
| `DeleteCourse`           | `course:delete`       | `DRAFT`: kiểm tham chiếu rồi xoá hẳn; `PUBLISHED`/`ON_HOLD`: xoá mềm | FR-007, FR-018; AC-014, AC-017 |
| `RestoreCourse`          | `course:restore`      | Gỡ dấu xoá                                                           | FR-007                         |
| `ListPublishedCourses`   | Đã xác thực           | Phân trang, tìm tiêu đề `ILIKE`, mới nhất trước                      | FR-009; AC-005                 |
| `GetPublishedCourse`     | Đã xác thực           | Theo id hoặc slug; chỉ Problem `PUBLISHED` chưa xoá                  | FR-009, FR-010; AC-004, AC-010 |
| `ListManagedCourses`     | `course:read-managed` | Của chính mình; `includeDeleted` tuỳ chọn                            | FR-011                         |
| `GetManagedCourse`       | `course:read-managed` | Kèm trạng thái từng Problem đã xếp và lỗi readiness                  | FR-011                         |

`CourseAuthorization` kiểm mã quyền có trong `principal.permissions` và `course.createdBy ==
principal.userId`. `ADMIN` không có ngoại lệ.

### Port

| Port                     | Trách nhiệm                                                                                                           | Adapter                                             |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `CourseRepository`       | Nạp/lưu aggregate; `loadForUpdate`; tìm theo slug/id; liệt kê đã xuất bản; liệt kê của chủ sở hữu                     | TypeORM (`courses`, `chapters`, `chapter_problems`) |
| `CourseReferenceChecker` | Có Class hay Assignment nào tham chiếu Course không                                                                   | TypeORM (`classes`, `assignments`)                  |
| `ProblemReferenceReader` | Đọc `id`, `slug`, `title`, `problemType`, `difficulty`, `publishStatus`, `deletedAt`, `createdBy` của một tập Problem | Provider do module `problems` export                |
| `CourseQuizCatalog`      | Đọc metadata/trạng thái Quiz theo ID, không đọc đáp án hay repository ghi                                             | Adapter qua `QuizReferenceReader`                   |
| `TransactionRunner`      | (LRN-001)                                                                                                             | `DataSource`                                        |

`ProblemReferenceReader` là API công khai duy nhất của module `problems` mà `courses` dùng; nó chỉ
đọc và không trả Test Case, harness hay nội dung đề. Principal tin cậy không phải port: controller
dùng `@TrustedPrincipal()`/`TrustedPrincipalGuard` của LRN-001 và truyền `Principal` vào use case.

### Amendment Course content 1.1

- `LearningItemState` là projection domain nhỏ `{ id, type, status, isDeleted }`; không phải entity
  mới và không tạo bảng.
- `CoursePublishReadinessService` đọc đồng thời `CourseProblemCatalog` và `CourseQuizCatalog`, hợp
  nhất state rồi gọi domain `CourseReadiness`.
- Course Problem-only, Quiz-only và mixed đều publish được khi còn ít nhất một item khả dụng.
- Detach Problem/Quiz và remove Chapter trên Course `PUBLISHED` phải giữ ít nhất một item khả dụng.
- Quiz hold/delete sau khi Course publish bị ẩn như Problem hold/delete; Course không tự đổi trạng
  thái. Republish Course luôn kiểm lại trạng thái hiện tại.
- Không gộp hai thứ tự Problem/Quiz và không migration schema trong amendment này.

## Lưu trữ

- `courses`: thêm `status`, `updated_at`, `deleted_at`.
- `chapters`: thêm `description`, `UNIQUE (id, course_id)` để làm đích cho FK kép.
- Bảng mới `chapter_problems`: `id`, `chapter_id`, `course_id`, `problem_id`, `display_order`.
  - FK kép `(chapter_id, course_id)` → `chapters(id, course_id)` `ON DELETE CASCADE`, bảo đảm
    `course_id` luôn khớp Chapter.
  - FK `problem_id` → `problems(id)` `ON DELETE RESTRICT` (cùng CSDL, cùng bounded context; Problem
    không bao giờ bị xoá hẳn theo LRN-001).
  - `UNIQUE (course_id, problem_id)` thực thi "một lần mỗi Course" (quyết định 7).
- Phép chiếu người học dùng một truy vấn join `chapter_problems` → `problems` với
  `publish_status = 'PUBLISHED' AND deleted_at IS NULL`, sắp theo thứ tự Chapter rồi thứ tự Problem.
  Không chọn cột nội dung đề, Test Case hay harness.
- Xoá hẳn Course `DRAFT`: trong cùng transaction, `loadForUpdate`, rồi `CourseReferenceChecker`; có
  tham chiếu thì `CourseReferenced` (409); không thì `DELETE` (cascade xoá `chapters`,
  `chapter_problems`).

## Thay đổi cơ sở dữ liệu

Đích: `bkpractice_learning`.

- Kiểu enum mới `courses_status_enum` (`DRAFT`, `PUBLISHED`, `ON_HOLD`).
- `courses`: `status courses_status_enum NOT NULL DEFAULT 'DRAFT'`, `updated_at timestamptz NOT NULL
DEFAULT now()`, `deleted_at timestamptz NULL`, `CHECK (char_length(description) <= 20000)`.
- `chapters`: `description text NULL`, `CHECK (char_length(description) <= 5000)`,
  `UNIQUE (id, course_id)`, index `(course_id, display_order)`.
- `chapter_problems` như mục Lưu trữ, cộng index `(chapter_id, display_order)` và index `(problem_id)`.
- Partial index `courses (status, created_at DESC) WHERE deleted_at IS NULL` và
  `courses (created_by) WHERE deleted_at IS NULL`.
- Course hiện có nhận `status = 'DRAFT'` (thất bại theo hướng đóng: không Course cũ nào tự hiển thị).

## Migration

- Learning: `apps/learning-service/src/database/migrations/<timestamp>-Lrn003CourseManagement.ts`,
  chạy sau migration LRN-001 (và LRN-002 nếu có), `synchronize: false`. Down gỡ đúng những gì đã
  thêm theo thứ tự ngược, bỏ bảng `chapter_problems` và kiểu enum.
- Identity: `apps/identity-service/src/database/migrations/<timestamp>-Lrn003CoursePermissions.ts`
  chèn tám mã `course:create`, `course:read-managed`, `course:update`, `course:publish`,
  `course:hold`, `course:republish`, `course:delete`, `course:restore` và gán cho `LECTURER`, bỏ qua
  nếu đã có; down xoá đúng những gì đã chèn. Chạy sau `Id003PermissionCatalog`.
- Kiểm chứng bằng `pnpm migration:run:learning` / `revert:learning` và `pnpm migration:run:identity`
  / `revert:identity`.

## API

Tất cả route cần Bearer token. Route `managed` khai báo trước route `:idOrSlug`.

| Method + route                                                    | Use case                 | Phản hồi                          |
| ----------------------------------------------------------------- | ------------------------ | --------------------------------- |
| `GET /api/courses`                                                | `ListPublishedCourses`   | `200` tóm tắt phân trang          |
| `GET /api/courses/managed`                                        | `ListManagedCourses`     | `200` tóm tắt quản lý phân trang  |
| `GET /api/courses/managed/:id`                                    | `GetManagedCourse`       | `200` chi tiết quản lý            |
| `GET /api/courses/:idOrSlug`                                      | `GetPublishedCourse`     | `200` chi tiết người học          |
| `POST /api/courses`                                               | `CreateCourse`           | `201` chi tiết quản lý            |
| `PATCH /api/courses/:id`                                          | `UpdateCourse`           | `200`                             |
| `POST /api/courses/:id/publish`                                   | `PublishCourse`          | `200`                             |
| `POST /api/courses/:id/hold`                                      | `HoldCourse`             | `200`                             |
| `POST /api/courses/:id/republish`                                 | `RepublishCourse`        | `200`                             |
| `DELETE /api/courses/:id`                                         | `DeleteCourse`           | `204` (xoá hẳn nháp hoặc xoá mềm) |
| `POST /api/courses/:id/restore`                                   | `RestoreCourse`          | `200`                             |
| `POST /api/courses/:id/chapters`                                  | `AddChapter`             | `201`                             |
| `PUT /api/courses/:id/chapters/order`                             | `ReorderChapters`        | `200`                             |
| `PATCH /api/courses/:id/chapters/:chapterId`                      | `UpdateChapter`          | `200`                             |
| `DELETE /api/courses/:id/chapters/:chapterId`                     | `RemoveChapter`          | `204`                             |
| `POST /api/courses/:id/chapters/:chapterId/problems`              | `AttachProblem`          | `201`                             |
| `PUT /api/courses/:id/chapters/:chapterId/problems/order`         | `ReorderChapterProblems` | `200`                             |
| `DELETE /api/courses/:id/chapters/:chapterId/problems/:problemId` | `DetachProblem`          | `204`                             |

Swagger mô tả mọi route, DTO, yêu cầu Bearer và mã lỗi.

## DTO / Kiểm tra dữ liệu

- `CreateCourseRequestDto`: `title`, `slug`, `description?`.
- `UpdateCourseRequestDto`: partial của `title`, `description` (ngữ nghĩa `PATCH` như LRN-001; `slug`
  không có trong DTO).
- `AddChapterRequestDto`: `title`, `description?`, `position?`. `UpdateChapterRequestDto`: partial.
- `AttachProblemRequestDto`: `problemId` (UUID), `position?`.
- `ReorderRequestDto`: `ids` (UUID không trùng, 1..50).
- Query liệt kê: `page`, `pageSize` (≤ 50), `q` (≤ 200 ký tự), `includeDeleted` (chỉ phía quản lý).
- `ValidationPipe` toàn cục (`whitelist`, `forbidNonWhitelisted`) chặn `createdBy`, `status`,
  `deletedAt`, mốc thời gian (SR-005, AC-016).
- Response: `CourseSummaryResponseDto`, `CourseDetailResponseDto` (người học: Chapter + tóm tắt
  Problem hiển thị), `ManagedCourseResponseDto` (thêm `status`, mốc thời gian, trạng thái từng Problem
  đã xếp, lỗi readiness, `deletedAt` khi `includeDeleted`). Ánh xạ tường minh.

## Phân quyền

- Principal từ `@TrustedPrincipal()`/`TrustedPrincipalGuard` (LRN-001) tại presentation, gồm
  `permissions` từ `x-auth-permissions`.
- Bảng quyền theo thao tác như mục Quy tắc phân quyền của đặc tả; quyền sở hữu so `createdBy`.
- Xem Course đã xuất bản chỉ cần đã xác thực.
- Thiếu principal hoặc thiếu quyền thì từ chối trước khi đọc dữ liệu quản lý.

## Messaging / Sự kiện

N/A. LRN-003 không phát hay tiêu thụ sự kiện.

## Realtime

N/A.

## Adapter hạ tầng

- `courses/infrastructure/persistence/course.repository.ts`: ánh xạ hai chiều entity ↔ aggregate, lưu
  cả khối (xoá và chèn lại tham chiếu Chapter/Problem đã đổi), `SELECT ... FOR UPDATE`.
- `courses/infrastructure/persistence/course-reference.checker.ts`: đếm `classes` và `assignments`
  theo `course_id`.
- `problems` export `ProblemReferenceReader` từ `problems.module.ts`; `CoursesModule` import
  `ProblemsModule` chỉ để lấy provider này.
- Mapper vi phạm ràng buộc `UNIQUE (slug)` → `DuplicateSlug`, `UNIQUE (course_id, problem_id)` →
  `ProblemAlreadyInCourse`.

## Cấu hình

Không có thay đổi cấu hình, biến môi trường, Docker hay giới hạn body (payload nhỏ).

## Xử lý lỗi

| Lỗi domain/application                                                              | HTTP  |
| ----------------------------------------------------------------------------------- | ----- |
| Thiếu principal                                                                     | `401` |
| `CourseForbidden`                                                                   | `403` |
| `CourseNotFound`, `ChapterNotFound`                                                 | `404` |
| Kiểm tra dữ liệu, `LimitExceeded`, `InvalidReorder`, `ProblemNotAttachable`         | `400` |
| `CourseNotReady` (kèm danh sách mã lỗi)                                             | `400` |
| `DuplicateSlug`, `ProblemAlreadyInCourse`, `CourseReferenced`, `InvalidCourseState` | `409` |

Không đưa vào cấu trúc lỗi mới. `ProblemNotAttachable` không phân biệt không tồn tại với không được
phép.

## Bảo mật

| Yêu cầu | Cách thực thi                                                                                       |
| ------- | --------------------------------------------------------------------------------------------------- |
| SR-001  | Quyền, sở hữu, trạng thái trong use case                                                            |
| SR-002  | Principal chỉ từ header Gateway                                                                     |
| SR-003  | Truy vấn người học lọc Course và Problem theo trạng thái; `ProblemNotAttachable` không lộ thông tin |
| SR-004  | `ProblemReferenceReader` không trả nội dung đề, Test Case hay harness                               |
| SR-005  | DTO danh sách cho phép                                                                              |
| SR-006  | Bộ kiểm tra Markdown hạn chế của LRN-001                                                            |
| SR-007  | Chỉ datasource Learning; FK tới `problems` là nội bộ bounded context                                |
| SR-008  | Thiếu ngữ cảnh thì từ chối                                                                          |

## Chiến lược kiểm thử

- **Unit (domain):** vòng đời và bước chuyển bị cấm; `CourseReadiness`; `ProblemAttachPolicy`; giới
  hạn 50/50; trùng Problem; sắp xếp lại (AC-006, AC-008, AC-009, AC-013, AC-018, AC-019, AC-020).
- **Unit (application, port giả):** quyền và sở hữu (AC-002); xoá hẳn nháp bị tham chiếu (AC-017);
  sửa Course đã xuất bản giữ readiness (AC-019).
- **Integration:** ánh xạ aggregate; FK kép; `UNIQUE (course_id, problem_id)` dưới đồng thời; truy
  vấn người học ẩn Problem `ON_HOLD`/xoá mềm và hiện lại khi mở lại (AC-004, AC-010); migration
  up/down cả hai service.
- **API/E2E:** `401` (AC-003), liệt kê và xem đã xuất bản (AC-005, AC-007), slug trùng (AC-011), mô
  tả có HTML (AC-012), xoá mềm không xoá Class (AC-014), không có dữ liệu judge (AC-015), trường lạ
  (AC-016).
- Chạy `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.

## Khả năng quan sát

Log kết quả các thao tác quản lý và chuyển trạng thái kèm `courseId`, request ID; không log mô tả.
Không thêm metric.

## Truy vết yêu cầu

| Yêu cầu        | Đường triển khai                                         | Kiểm chứng                     |
| -------------- | -------------------------------------------------------- | ------------------------------ |
| FR-001, FR-017 | Module `courses` trong Learning; không Class/Assignment  | Rà soát                        |
| FR-002–FR-004  | `CreateCourse`, `UpdateCourse`, value object             | AC-001, AC-011, AC-016         |
| FR-005, FR-006 | Use case Chapter/Problem, `ProblemAttachPolicy`          | AC-008, AC-009, AC-018, AC-020 |
| FR-007, FR-018 | Máy trạng thái, `DeleteCourse`, `CourseReferenceChecker` | AC-014, AC-017                 |
| FR-008, FR-019 | `CourseReadiness`                                        | AC-006, AC-007, AC-019         |
| FR-009–FR-011  | Truy vấn người học và quản lý                            | AC-004, AC-005, AC-010         |
| FR-012, FR-013 | `chapter_problems` + lọc lúc đọc                         | AC-010                         |
| FR-014–FR-016  | Markdown, giới hạn, transaction                          | AC-012, AC-013                 |
| SR-001–SR-008  | Mục Bảo mật                                              | AC-002, AC-003, AC-015         |

## Thứ tự triển khai

1. Xác nhận LRN-001 đã triển khai (`TransactionRunner`, `@TrustedPrincipal()`/`TrustedPrincipalGuard`,
   bộ kiểm Markdown, entity Problem có `deleted_at`) và ID-003-T045 tới T048 đã có.
2. Migration seed quyền `course:*` ở Identity.
3. Domain và unit test.
4. Migration Learning và entity.
5. `ProblemReferenceReader` ở module `problems`; adapter lưu trữ; integration test.
6. Use case và unit test.
7. DTO, controller, Swagger, `CoursesModule`.
8. Test API/bảo mật; `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.

## Phụ thuộc

- **LRN-001** đã triển khai: Problem có trạng thái và dấu xoá; các port dùng chung.
- **ID-003 0.4**: claim `permissions`; migration seed ở Identity.
- **LRN-004, LRN-005** sau này tham chiếu Course; LRN-004 phải khoá dòng `courses` (`FOR SHARE`) khi
  tạo Class để không đua với xoá hẳn Course nháp.

## Rủi ro

- **Xoá hẳn Course và FK của `classes`:** nền tảng hiện dùng `ON DELETE CASCADE`, nên nếu kiểm tra
  tham chiếu bị bỏ qua thì xoá Course kéo theo xoá Class. Giảm thiểu bằng kiểm tra trong cùng
  transaction có khoá; LRN-004 khoá `FOR SHARE` khi tạo Class và đổi FK `classes.course_id` sang
  `ON DELETE RESTRICT`, còn LRN-005 đổi `assignments.class_id` sang `ON DELETE RESTRICT`.
- **Course cũ chuyển thành `DRAFT`** sau migration: nếu đã có dữ liệu thật, cần xuất bản lại thủ công.
- **Đọc chéo module:** `courses` phụ thuộc `ProblemReferenceReader`; đổi hình dạng Problem phải giữ
  port này ổn định.

## Tuân thủ kiến trúc

- **Chiều phụ thuộc:** presentation chỉ gọi use case; application phụ thuộc domain và các port hẹp;
  domain Course/Chapter không import NestJS hay TypeORM; adapter TypeORM hiện thực các port và được
  gắn tại `CoursesModule`.
- **DDD có lý do:** Course là aggregate vì các bất biến thứ tự Chapter/Problem, giới hạn 50/50, tính
  duy nhất của Problem trong toàn Course và điều kiện xuất bản cần nhất quán trong một transaction.
- **Ranh giới module:** `courses` đọc Problem qua `ProblemReferenceReader` của module `problems`, không
  dùng repository ghi hay truy cập nội bộ presentation của module khác.
- **Quyền sở hữu dữ liệu:** mọi bảng Course/Chapter/quan hệ Problem thuộc `bkpractice_learning`;
  `created_by` là UUID ngoài, không có khoá ngoại tới Identity. Migration seed quyền vẫn do Identity
  sở hữu và không cho Learning truy cập CSDL Identity.
- **Phạm vi:** không tách service, không đưa entity/use case vào `libs/`, không tái cấu trúc toàn bộ
  Learning và không có ngoại lệ kiến trúc.

> `plan.md` mô tả NHƯ THẾ NÀO. Nó KHÔNG ĐƯỢC thêm hành vi, tác nhân hay tiêu chí nghiệm thu vượt
> ngoài `spec.md` đã Approved (phiên bản 1.0). Danh sách công việc nằm ở [`tasks.md`](./tasks.md).
