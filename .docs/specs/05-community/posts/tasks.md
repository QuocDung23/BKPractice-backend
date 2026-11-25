# COM-001 Công việc triển khai Bài viết cộng đồng (Posts)

## Trạng thái

Approved — Sẵn sàng triển khai

Được chủ sở hữu sản phẩm phê duyệt ngày `2026-09-30` (phê duyệt gộp: chủ sở hữu duyệt trước các
phương án đề xuất).

Đặc tả liên quan: [`./spec.md`](./spec.md) — phiên bản Approved `1.0`
Kế hoạch liên quan: [`./plan.md`](./plan.md) — Approved ngày `2026-09-30`

Mọi công việc bắt đầu ở trạng thái chưa hoàn thành. Chỉ đánh dấu `[x]` khi cả phần triển khai lẫn
phần kiểm chứng đã xong. Các mục N/A là những mục duy nhất được tích sẵn có chủ đích. Danh sách này
không thêm hành vi ngoài `spec.md` và không thay đổi `plan.md`.

## Chuẩn bị

- [ ] **COM-001-T001 — Xác nhận nền tảng.** Khảo sát trạng thái Git, `spec.md` 1.0 Approved,
      `plan.md` Approved, kiến trúc Community (Clean Architecture, ADR 0002). Khảo sát lại module
      `posts`, `community.entities.ts`, migration `1700000002000` và `data-source.ts`; nếu khác kết
      quả khảo sát trong kế hoạch, **DỪNG và BÁO CÁO**.
      **Phụ thuộc:** Không có.
      **Truy vết:** Quy trình SDD; mục Ảnh hưởng tới mã nguồn hiện có của kế hoạch.

- [ ] **COM-001-T002 — Xác nhận phối hợp với COM-005.** Đối chiếu plan COM-005: `posts.is_hidden` là
      cờ ẩn; COM-001 không ghi các cột ẩn; quyết định của người điều phối về nơi đặt quy tắc hiển thị
      (mục Vấn đề cần chủ sở hữu xem lại, ý 1). Nếu chưa có quyết định hoặc COM-005 đổi chỗ lưu,
      **DỪNG và BÁO CÁO** trước khi viết bộ lọc hiển thị.
      **Phụ thuộc:** COM-001-T001.
      **Truy vết:** COM-001-FR-013; mục Vấn đề cần chủ sở hữu xem lại của kế hoạch.

- [ ] **COM-001-T003 — Xác nhận ranh giới và loại trừ.** Ghi nhận: không gọi Learning, không mã
      quyền mới, không xoá cứng, không ghim, không tìm kiếm, không realtime, không event, không đổi
      Gateway hay cấu hình.
      **Phụ thuộc:** COM-001-T001.
      **Truy vết:** Mục Ngoài phạm vi của đặc tả; COM-001-FR-004, FR-012; SR-006.

## Nền dùng chung trong Community

- [x] **COM-001-T004 — Guard định danh tin cậy.** Tạo `common/auth/` với `TrustedUserGuard` (đọc
      `x-auth-user-id`, thiếu hoặc không phải UUID → `401`) và decorator `@TrustedPrincipal()` ở
      `trusted-principal.decorator.ts`, trả `Principal { userId, permissions }` (`x-auth-permissions`
      thiếu → tập rỗng).
      **Phụ thuộc:** COM-001-T001.
      **Truy vết:** COM-001-SR-002; AC-004.

- [ ] **COM-001-T005 — Lỗi domain chung và filter.** Tạo `common/errors/` với `ValidationError`,
      `NotFoundError`, `ForbiddenError`, `InvalidStateError` (TS thuần) và
      `CommunityDomainErrorFilter` ánh xạ sang `400/404/403/409` giữ hình dạng lỗi NestJS hiện có.
      **Phụ thuộc:** COM-001-T001.
      **Truy vết:** Mục Xử lý lỗi của kế hoạch; tình huống lỗi của đặc tả.

- [ ] **COM-001-T006 — `RestrictedMarkdown`.** Tạo `common/content/restricted-markdown.ts` theo
      thuật toán của kế hoạch (bỏ khối mã rào và đoạn mã inline; từ chối thẻ HTML, `<!--`,
      `<!DOCTYPE`, `<?`, lược đồ `javascript:`/`vbscript:`/`data:`), tham số độ dài tối thiểu/tối đa.
      Không import framework.
      **Phụ thuộc:** COM-001-T005.
      **Truy vết:** COM-001-FR-014; SR-005; AC-006, AC-007.

- [ ] **COM-001-T007 — Phân trang dùng chung.** Tạo `common/pagination/` với `PageQueryDto`
      (`page` ≥ 1 mặc định 1, `pageSize` 1..50 mặc định 20) và `PageResponseDto<T>`
      (`items`, `page`, `pageSize`, `total`).
      **Phụ thuộc:** COM-001-T001.
      **Truy vết:** COM-001-FR-007, FR-008; AC-008.

- [ ] **COM-001-T008 — Unit test nền dùng chung.** Guard (thiếu, rỗng, không phải UUID), filter,
      `RestrictedMarkdown` (thẻ ngoài/trong khối mã, khối chưa đóng, inline code, `javascript:`,
      giới hạn độ dài, bỏ khoảng trắng).
      **Phụ thuộc:** COM-001-T004 tới COM-001-T007.
      **Truy vết:** AC-004, AC-006, AC-007.

## Domain

- [ ] **COM-001-T009 — Value object `PostTitle` và `PostTarget`.** `PostTitle` 1..200 sau khi bỏ
      khoảng trắng, không thẻ HTML, không xuống dòng hay ký tự điều khiển. `PostTarget` chỉ nhận ba
      tổ hợp hợp lệ, UUID.
      **Phụ thuộc:** COM-001-T005.
      **Truy vết:** COM-001-FR-003, FR-004, FR-014; AC-003, AC-006.

- [ ] **COM-001-T010 — Model `Post`.** `edit`, `softDelete`, `restore`, `isVisibleTo`,
      `acceptsInteraction`, kiểm tra sở hữu (`ForbiddenError` so với `NotFoundError` theo hiển thị).
      `hiddenByModeration` chỉ đọc; không method nào đổi nó.
      **Phụ thuộc:** COM-001-T009.
      **Truy vết:** COM-001-FR-005, FR-009 tới FR-011, FR-013, FR-016, FR-017; AC-010 tới AC-015,
      AC-018, AC-019.

- [ ] **COM-001-T011 — Unit test domain.** Mọi tổ hợp phạm vi/đích; bảng trạng thái của đặc tả (sửa,
      xoá mềm, khôi phục theo từng tình trạng); sửa Post bị ẩn không bỏ ẩn; khôi phục giữ trạng thái
      ẩn; `acceptsInteraction` sai khi đã xoá hoặc bị ẩn.
      **Phụ thuộc:** COM-001-T009, COM-001-T010.
      **Truy vết:** AC-003, AC-010, AC-013, AC-014, AC-015, AC-018, AC-019.

## Tầng application

- [ ] **COM-001-T012 — Định nghĩa port `PostRepository`.** Chỉ các thao tác trong kế hoạch:
      `findById`, `insert`, `saveIfState`, `listVisible`, `listByAuthor`.
      **Phụ thuộc:** COM-001-T010.
      **Truy vết:** Mục Port của kế hoạch.

- [ ] **COM-001-T013 — `CreatePost`, `GetPost`, `ListPosts`, `ListMyPosts`.** `authorId` từ
      `actorId`; `GetPost` trả `NotFoundError` khi không hiển thị với người gọi, phép chiếu tác giả kèm
      trạng thái; `ListPosts` lọc/sắp/phân trang; `ListMyPosts` gồm đã xoá và bị ẩn.
      **Phụ thuộc:** COM-001-T006, COM-001-T012.
      **Truy vết:** COM-001-FR-002, FR-006 tới FR-008, FR-013; AC-001, AC-002, AC-008, AC-009,
      AC-012, AC-015, AC-016.

- [ ] **COM-001-T014 — `UpdatePost`, `DeletePost`, `RestorePost`.** Theo quy tắc chung của kế hoạch
      (tác giả → `409` khi sai trạng thái; người khác → `404`/`403`); lưu có điều kiện, 0 dòng →
      `InvalidStateError`.
      **Phụ thuộc:** COM-001-T012.
      **Truy vết:** COM-001-FR-009 tới FR-012, FR-017; AC-010, AC-011, AC-013, AC-014, AC-017,
      AC-018.

- [ ] **COM-001-T015 — `CheckPostInteraction`.** Trả `{ postId, authorId, visibleToViewer,
acceptsInteraction }` hoặc `NotFoundError`; được `PostsModule` export cho module Community khác.
      **Phụ thuộc:** COM-001-T012.
      **Truy vết:** COM-001-FR-016; AC-019.

- [ ] **COM-001-T016 — Unit test application.** Dùng `PostRepository` giả: sở hữu `403`/`404`,
      `ADMIN`/`LECTURER` không phải tác giả bị `403`, `saveIfState` trả 0 → `409`, danh sách "của
      tôi", `CheckPostInteraction`.
      **Phụ thuộc:** COM-001-T013 tới COM-001-T015.
      **Truy vết:** AC-011, AC-014, AC-016, AC-017, AC-019.

## Lưu trữ

- [ ] **COM-001-T017 — Cập nhật entity `Post`.** Thêm `title` (varchar 200), `editedAt`,
      `deletedAt` bằng `@Column` thường (không `@DeleteDateColumn`). Giữ đường dẫn file để không đổi
      import của `Comment`, `Reaction`, `Bookmark`, `Report`.
      **Phụ thuộc:** COM-001-T001.
      **Truy vết:** Mục Lưu trữ của kế hoạch.

- [ ] **COM-001-T018 — Adapter `TypeOrmPostRepository`.** Ánh xạ entity ↔ model; truy vấn công khai
      luôn kèm `deleted_at IS NULL AND is_hidden = false`; sắp `(created_at DESC, id DESC)`; `total`
      theo cùng bộ lọc; `saveIfState` là `UPDATE ... WHERE` có điều kiện.
      **Phụ thuộc:** COM-001-T012, COM-001-T017.
      **Truy vết:** COM-001-FR-007, FR-013, FR-017; SR-004, SR-006.

- [ ] **COM-001-T019 — Integration test lưu trữ.** Trên `bkpractice_community` cách ly: lọc theo
      phạm vi/đích, phân trang ổn định, Post ẩn/đã xoá không vào danh sách công khai và không vào
      `total`, lưu có điều kiện khi đua sửa/xoá, CHECK phạm vi/đích.
      **Phụ thuộc:** COM-001-T018, COM-001-T021.
      **Truy vết:** AC-008, AC-009, AC-012, AC-014, AC-015.

## Cơ sở dữ liệu / Migration

- [ ] **COM-001-T020 — Viết migration `Com001Posts`.** Tạo
      `apps/community-service/src/database/migrations/<timestamp>-Com001Posts.ts` (timestamp >
      `1700000002000`). Up: kiểm tra dòng vi phạm phạm vi/đích (dừng nếu `PROBLEM`/`COURSE` thiếu
      đích; `GLOBAL` có id thừa thì đặt `NULL`); thêm và điền `title`, đặt `NOT NULL`; thêm
      `edited_at`, `deleted_at`, `CHK_posts_scope_target`, `IDX_posts_feed`,
      `IDX_posts_author_created`. Down: bỏ theo thứ tự ngược.
      **Phụ thuộc:** COM-001-T017.
      **Truy vết:** Mục Thay đổi cơ sở dữ liệu và Migration của kế hoạch.

- [ ] **COM-001-T021 — Kiểm chứng vòng đời migration.** Trên cơ sở dữ liệu cách ly có dữ liệu cũ:
      `pnpm migration:run:community`, kiểm tra schema và tiêu đề đã điền,
      `pnpm migration:revert:community`, kiểm tra down, chạy lại up. Xác nhận `synchronize` vẫn tắt.
      **Phụ thuộc:** COM-001-T020.
      **Truy vết:** Định nghĩa Hoàn thành; chiến lược cơ sở dữ liệu.

## API / Presentation

- [ ] **COM-001-T022 — DTO request/query.** `CreatePostRequestDto` (thêm `title`),
      `UpdatePostRequestDto` (ít nhất một trường), `ListPostsQueryDto` (kế thừa `PageQueryDto`, lọc
      `scope`/`problemId`/`courseId`, từ chối tổ hợp không khớp). Không trường nào đặt được tác giả,
      trạng thái, ghim, mốc thời gian, vai trò hay quyền.
      **Phụ thuộc:** COM-001-T007.
      **Truy vết:** COM-001-SR-003; AC-003, AC-005, AC-008.

- [ ] **COM-001-T023 — DTO response và mapper.** `PostResponseDto`, `AuthorPostResponseDto` (thêm
      `deletedAt`, `moderation` theo `AuthorModerationView` của COM-005-FR-013),
      `PostSummaryResponseDto`, `PageResponseDto<T>`. Ánh xạ
      tường minh; không trả entity.
      **Phụ thuộc:** COM-001-T010.
      **Truy vết:** Đầu ra của đặc tả; COM-001-FR-008, FR-013; SR-004.

- [ ] **COM-001-T024 — Route Post.** Trong `PostsController`: `POST /`, `GET /`, `GET /mine` (khai
      báo trước `/:id`), `GET /:id`, `PATCH /:id`, `DELETE /:id` (`204`), `POST /:id/restore`;
      `ParseUUIDPipe` cho `:id`; `TrustedUserGuard` ở mức controller; mỗi route gọi đúng một use case.
      Giữ `POST /:id/comments` và `POST /:id/reactions/like` gọi `PostsService` như cũ.
      **Phụ thuộc:** COM-001-T004, COM-001-T013, COM-001-T014, COM-001-T022, COM-001-T023.
      **Truy vết:** COM-001-FR-002, FR-006 tới FR-011; AC-001, AC-004, AC-010, AC-012, AC-013.

- [ ] **COM-001-T025 — Thu gọn `PostsService` và nối dây module.** Bỏ `list`, `create`; giữ `comment`
      (tới COM-002) và `toggleLike` (tới COM-003). Trong `posts.module.ts`: gắn `PostRepository` →
      `TypeOrmPostRepository`, đăng ký use case, export `CheckPostInteraction`, đăng ký
      `CommunityDomainErrorFilter`.
      **Phụ thuộc:** COM-001-T015, COM-001-T018, COM-001-T024.
      **Truy vết:** Mục Adapter hạ tầng và Tuân thủ kiến trúc của kế hoạch.

- [ ] **COM-001-T026 — Cập nhật Swagger.** `@ApiBearerAuth()`, DTO, mã lỗi `400/401/403/404/409`; ví
      dụ không chứa dữ liệu thật.
      **Phụ thuộc:** COM-001-T024.
      **Truy vết:** Định nghĩa Hoàn thành; SR-007.

## Phân quyền

- [x] **N/A — Seed quyền ở Identity.** COM-001 không định nghĩa mã quyền mới (quyết định 1 của đặc
      tả); không có migration nào trong `apps/identity-service`.

- [ ] **COM-001-T027 — Kiểm thử phân quyền khẳng định và phủ định.** Tác giả được sửa/xoá/khôi phục;
      người khác, `ADMIN`, `LECTURER` không phải tác giả bị `403`; Post không hiển thị trả `404`;
      thiếu header `401`.
      **Phụ thuộc:** COM-001-T024.
      **Truy vết:** COM-001-SR-001, SR-002; AC-004, AC-011, AC-017.

## Messaging

- [x] **N/A — COM-001 không phát hay tiêu thụ event.**

## Realtime

- [x] **N/A — Không có yêu cầu realtime.**

## Cấu hình

- [x] **N/A — Không đổi cấu hình.** Không biến môi trường, `.env.example`, Docker hay Gateway mới.

## Kiểm thử và bảo mật

- [ ] **COM-001-T028 — Test API.** Khởi động app bằng `@nestjs/testing` trên cổng ngẫu nhiên, gọi
      bằng `fetch` của Node: vòng đời tạo/đọc/sửa/xoá/khôi phục; danh sách, lọc, "bài của tôi"; trường
      lạ `400`; Markdown có khối mã; route comment/like cũ vẫn chạy khi có header.
      **Phụ thuộc:** COM-001-T024 tới COM-001-T027.
      **Truy vết:** COM-001-AC-001 tới AC-020.

- [ ] **COM-001-T029 — Rà soát bảo mật tập trung.** Phản hồi, lỗi, log, Swagger không chứa header xác
      thực, token hay dữ liệu Post không hiển thị với người gọi; không log tiêu đề/nội dung; không gọi
      Learning; không đường ghi `is_hidden`.
      **Phụ thuộc:** COM-001-T028.
      **Truy vết:** COM-001-SR-001 tới SR-007; AC-020.

## Tài liệu và kiểm chứng

- [ ] **COM-001-T030 — Cập nhật tài liệu triển khai.** Ghi thay đổi contract (`title` bắt buộc, danh
      sách dạng trang, phạm vi/đích không khớp bị từ chối), cảnh báo down migration mất tiêu đề và dấu
      xoá mềm, và rằng `toggleLike` chưa tôn trọng xoá mềm cho tới COM-003.
      **Phụ thuộc:** COM-001-T021, COM-001-T026.
      **Truy vết:** Mục Rủi ro của kế hoạch.

- [ ] **COM-001-T031 — Chạy lệnh kiểm chứng.** `pnpm lint`, `pnpm typecheck`, `pnpm test`,
      `pnpm build`. Không che lỗi bằng `any`, `@ts-ignore` hay tắt lint.
      **Phụ thuộc:** COM-001-T028, COM-001-T029, COM-001-T030.
      **Truy vết:** Định nghĩa Hoàn thành.

- [ ] **COM-001-T032 — Kiểm chứng tuân thủ kiến trúc.** Domain và `common/content` không import
      NestJS/TypeORM; use case chỉ phụ thuộc domain và port; controller chỉ lo transport; adapter gắn
      ở composition root; không entity/use case Post trong `libs/`; không module nào đọc thẳng
      repository của Posts.
      **Phụ thuộc:** COM-001-T025, COM-001-T031.
      **Truy vết:** ADR 0002; `dependency-rules.md`; mục Tuân thủ kiến trúc của kế hoạch.

- [ ] **COM-001-T033 — Đối chiếu với đặc tả.** Rà từng COM-001-FR-001 tới FR-017, SR-001 tới SR-007,
      AC-001 tới AC-020 với code, test, migration và Swagger. Xác nhận không có hành vi Ngoài phạm vi.
      **Phụ thuộc:** COM-001-T031, COM-001-T032.
      **Truy vết:** Đặc tả 1.0; Định nghĩa Hoàn thành.

- [ ] **COM-001-T034 — Bàn giao theo SDD.** Cập nhật ô đánh dấu trung thực, viết worked entry, lấy
      review của con người, chỉ chuyển đặc tả sang `Implemented` rồi `Verified` qua quy trình SDD.
      **Phụ thuộc:** COM-001-T033.
      **Truy vết:** Quy trình SDD.

## Bảng tổng hợp độ phủ

| Yêu cầu               | Công việc triển khai chính | Kiểm thử/xác minh            |
| --------------------- | -------------------------- | ---------------------------- |
| COM-001-FR-001–FR-005 | T009, T010, T013, T020     | T011, T016, T028             |
| COM-001-FR-006–FR-008 | T013, T018, T023, T024     | T016, T019, T028             |
| COM-001-FR-009–FR-012 | T010, T014, T024           | T011, T016, T028             |
| COM-001-FR-013        | T002, T010, T018           | T011, T019, T028             |
| COM-001-FR-014        | T006, T009                 | T008, T011                   |
| COM-001-FR-015        | T003                       | T033                         |
| COM-001-FR-016        | T015, T025                 | T016                         |
| COM-001-FR-017        | T014, T018                 | T016, T019                   |
| COM-001-SR-001–SR-007 | T004, T018, T022, T024     | T027, T029, T033             |
| COM-001-AC-001–AC-020 | —                          | T008, T011, T016, T019, T028 |

> File này là danh sách kiểm tra triển khai, không phải đặc tả. Không thêm yêu cầu và không âm thầm
> thay đổi `spec.md` hay `plan.md` đã Approved trong lúc thực hiện.

## Authentication boundary patch - 2026-11-24

COM-001-T004 was completed and verified under the owner-approved [Gateway authentication scope addendum](../../../pm/plan/community/posts/2026-11-24-gateway-auth-boundary.md). The patch additionally authenticates the Gateway hop with a dedicated credential and restricts Docker publication. Other implementation tasks remain open. The old plan survey says Community has no tests; the checkout already contained 9 tests before this patch, and these were run successfully.

## Existing endpoint validation patch - 2026-11-24

The owner authorized the bounded validation patch on existing APIs. Execution details: [request validation plan](../../../pm/plan/community/posts/2026-11-24-request-validation.md).

- [x] Reject whitespace-only content after trim and enforce the existing trimmed length limits.
- [x] Return 400 for malformed Post UUIDs on existing comment/like routes.
- [x] Enforce matching Post scope/target UUIDs and reject unrelated targets.
- [x] Verify through 49 Community tests, lint, typecheck and Community build; record the work note.

These entries cover the existing endpoint patch only. Full domain value objects, complete feature DTOs/controllers and other larger tasks above remain open; the full COM-002 dependency gate is not claimed complete.

## Existing hidden-interaction / Post-like patch - 2026-11-24

Owner-requested bounded repair: [execution plan](../../../pm/plan/community/posts/2026-11-24-hidden-interactions-likes.md).

- [x] Enforce hidden-Post interaction policy and reject replies to hidden parent comments.
- [x] Replace the existing Post toggle with PUT/DELETE, each returning `{ liked, likeCount }` with HTTP 200.
- [x] Use transactions, scoped deletion and conflict-safe insertion with the existing unique constraint.
- [x] Verify 63 Community tests, PostgreSQL SQL generation, lint, typecheck and Community build; document frontend migration and remaining live-database verification.

This patch does not complete the larger feature tasks or the full COM-003 dependency gate. Comment reactions, full feed projections and soft-delete workflows remain open. No database migration is included.

## Existing feed reaction state - 2026-11-24

- [x] Add numeric likeCount and caller-specific likedByMe to the current Post list using one grouped reaction query; skip that query for an empty feed.
- [x] Preserve visibility, ordering and the 50-item limit; document the typed Swagger response.
- [x] Verify 65 Community regression/unit tests and 11 isolated real PostgreSQL/HTTP cases, lint, typecheck and Community build.

Evidence: [feed reaction work note](../../../worked/community/posts/2026-11-24-feed-reactions.md). This implements the current list projection only; full detail/Comment projections and other unfinished tasks remain open.

## Bounded author lifecycle slice (2026-11-25)

User explicitly selected detail/paging/filter and author edit/soft-delete first; author enrichment and realtime deferred. Execution plan: [post lifecycle](../../../pm/plan/community/posts/2026-11-24-post-lifecycle.md). Full feature checklist above remains open: title, management lists, restoration and full architecture extraction are not claimed complete.

- [x] Verify implemented ownership checks, soft deletion, deleted-ancestor visibility and interaction blocking against isolated PostgreSQL (70 tests passed).
- [x] Verify API regression, lint, typecheck and Community build; evidence: [worked entry](../../../worked/community/posts/2026-11-24-post-lifecycle.md).
