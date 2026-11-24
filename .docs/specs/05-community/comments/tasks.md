# COM-002 Công việc triển khai Bình luận và trả lời (Comments)

## Trạng thái

Approved — Sẵn sàng triển khai sau COM-001

Được chủ sở hữu sản phẩm phê duyệt ngày `2026-09-30` (phê duyệt gộp: chủ sở hữu duyệt trước các
phương án đề xuất).

Đặc tả liên quan: [`./spec.md`](./spec.md) — phiên bản Approved `1.0`
Kế hoạch liên quan: [`./plan.md`](./plan.md) — Approved ngày `2026-09-30`

Mọi công việc bắt đầu ở trạng thái chưa hoàn thành. Chỉ đánh dấu `[x]` khi cả phần triển khai lẫn
phần kiểm chứng đã xong. Các mục N/A là những mục duy nhất được tích sẵn có chủ đích. Danh sách này
không thêm hành vi ngoài `spec.md` và không thay đổi `plan.md`.

## Chuẩn bị

- [ ] **COM-002-T001 — Xác nhận nền tảng.** Khảo sát trạng thái Git, `spec.md` 1.0 Approved,
      `plan.md` Approved, kiến trúc Community (Clean Architecture, ADR 0002). Xác nhận COM-001 đã
      triển khai: `common/auth`, `common/errors`, `common/content`, `common/pagination`,
      `CheckPostInteraction` được `PostsModule` export, migration `Com001Posts`. Nếu chưa, **DỪNG và
      BÁO CÁO**.
      **Phụ thuộc:** Không có.
      **Truy vết:** Quy trình SDD; bước 1 của Thứ tự triển khai trong kế hoạch.

- [ ] **COM-002-T002 — Xác nhận phối hợp với COM-005.** Đối chiếu plan COM-005: `comments.is_hidden`
      là cờ ẩn; COM-002 không ghi các cột ẩn; quyết định của người điều phối về nơi đặt quy tắc hiển
      thị và về `CheckCommentInteraction` so với `ContentVisibilityReader` (mục Vấn đề cần chủ sở hữu
      xem lại). Nếu chưa có quyết định, **DỪNG và BÁO CÁO**.
      **Phụ thuộc:** COM-002-T001.
      **Truy vết:** COM-002-FR-014; mục Vấn đề cần chủ sở hữu xem lại của kế hoạch.

- [ ] **COM-002-T003 — Xác nhận ranh giới và loại trừ.** Ghi nhận: một cấp trả lời, không mention,
      không thông báo, không realtime, không quyền của tác giả Post với Comment người khác, không mã
      quyền mới, không xoá cứng, không số Comment trên Post.
      **Phụ thuộc:** COM-002-T001.
      **Truy vết:** Mục Ngoài phạm vi của đặc tả; COM-002-FR-012.

## Domain

- [ ] **COM-002-T004 — Model `Comment`.** Trường theo kế hoạch; `content` là `RestrictedMarkdown`
      1..5.000; `isPubliclyVisible`, `isVisibleTo(viewerId, root?)` đúng COM-005-FR-012, `edit`,
      `softDelete`, `restore`, `acceptsInteraction`, kiểm tra sở hữu (`ForbiddenError` so với
      `NotFoundError`). `hiddenByModeration` chỉ đọc.
      **Phụ thuộc:** COM-002-T001.
      **Truy vết:** COM-002-FR-001, FR-002, FR-007 tới FR-010, FR-014, FR-015, FR-017, FR-018.

- [ ] **COM-002-T005 — `CommentFactory`.** `createRoot`, `createReply` (cha khác Post hoặc không công
      khai → `NotFoundError`; cha là trả lời → `ValidationError`).
      **Phụ thuộc:** COM-002-T004.
      **Truy vết:** COM-002-FR-003, FR-004; AC-003, AC-004, AC-017.

- [ ] **COM-002-T006 — Phép chiếu cho tác giả.** Biểu diễn tác giả kèm `deletedAt` và `moderation`
      (`AuthorModerationView` của COM-005-FR-013; trước COM-005 chỉ `status` suy từ `is_hidden`);
      người không phải tác giả không bao giờ nhận các trường này.
      **Phụ thuộc:** COM-002-T004.
      **Truy vết:** COM-002-FR-011, FR-014; SR-004; AC-014, AC-016.

- [ ] **COM-002-T007 — Unit test domain.** Mọi nhánh của `createReply`, bảng trạng thái của đặc tả,
      sửa Comment bị ẩn không bỏ ẩn, `isVisibleTo` với từng tổ hợp (công khai, tác giả, gốc xoá, gốc
      ẩn với tác giả gốc và người khác, trả lời xoá, trả lời ẩn), `acceptsInteraction`.
      **Phụ thuộc:** COM-002-T004 tới COM-002-T006.
      **Truy vết:** AC-003, AC-004, AC-010, AC-012 tới AC-017, AC-019.

## Tầng application

- [ ] **COM-002-T008 — Định nghĩa port.** Chỉ `CommentRepository` và `PostInteractionReader` như kế
      hoạch.
      **Phụ thuộc:** COM-002-T004.
      **Truy vết:** Mục Port của kế hoạch.

- [ ] **COM-002-T009 — `CreateComment`.** Kiểm Post (`404`), `acceptsInteraction` (`409`), nạp cha
      khi có, gọi factory, lưu với `authorId = actorId`.
      **Phụ thuộc:** COM-002-T005, COM-002-T008.
      **Truy vết:** COM-002-FR-003, FR-004, FR-013; AC-001 tới AC-006, AC-017.

- [ ] **COM-002-T010 — `ListRootComments`, `ListReplies`, `ListMyComments`.** Hai use case đầu kiểm
      Post và gọi truy vấn theo người xem; `ListReplies` trả `404` khi Comment gốc không hiển thị với
      người gọi; `ListMyComments` chỉ trả Comment của người gọi, gồm đã xoá và bị ẩn, mới nhất trước.
      **Phụ thuộc:** COM-002-T006, COM-002-T008.
      **Truy vết:** COM-002-FR-005, FR-006, FR-010, FR-011, FR-013; AC-009, AC-012 tới AC-014,
      AC-016.

- [ ] **COM-002-T011 — `UpdateComment`, `DeleteComment`, `RestoreComment`.** Kiểm Post; kiểm sở hữu;
      chuyển trạng thái; lưu có điều kiện, 0 dòng → `InvalidStateError`. Khôi phục khi Post đã xoá →
      `404`.
      **Phụ thuộc:** COM-002-T004, COM-002-T008.
      **Truy vết:** COM-002-FR-007 tới FR-009, FR-013, FR-014, FR-018; AC-010, AC-011, AC-014 tới
      AC-016.

- [ ] **COM-002-T012 — `CheckCommentInteraction`.** Trả `{ commentId, postId, authorId,
visibleToViewer, acceptsInteraction }` hoặc `NotFoundError`; được `CommentsModule` export.
      **Phụ thuộc:** COM-002-T004, COM-002-T008.
      **Truy vết:** COM-002-FR-017; AC-019.

- [ ] **COM-002-T013 — Unit test application.** Port giả: Post không hiển thị → `404` cho mọi use
      case; Post không nhận tương tác → `409` khi tạo; tác giả Post, `ADMIN`, `LECTURER` không phải
      tác giả → `403`; `saveIfState` 0 dòng → `409`; `ListReplies` với gốc không hiển thị → `404`;
      `CheckCommentInteraction` khi Comment, Post hoặc Comment gốc không công khai.
      **Phụ thuộc:** COM-002-T009 tới COM-002-T012.
      **Truy vết:** AC-005, AC-006, AC-011, AC-012, AC-015, AC-019.

## Lưu trữ

- [ ] **COM-002-T014 — Chuyển và cập nhật entity `Comment`.** Chuyển sang
      `modules/comments/entities/comment.entity.ts`; thêm `editedAt`, `deletedAt` bằng `@Column`
      thường; sửa import trong `community.entities.ts`; bỏ `Comment` khỏi `forFeature` của
      `PostsModule`.
      **Phụ thuộc:** COM-002-T001.
      **Truy vết:** Mục Lưu trữ của kế hoạch.

- [ ] **COM-002-T015 — Adapter `TypeOrmCommentRepository`.** `listRootsForViewer`,
      `listRepliesForViewer` với điều kiện hiển thị của kế hoạch, đếm trả lời hiển thị với người xem,
      sắp `(created_at ASC, id ASC)`, `total` theo cùng điều kiện; `listByAuthor` mới nhất trước; lưu có
      điều kiện.
      **Phụ thuộc:** COM-002-T008, COM-002-T014.
      **Truy vết:** COM-002-FR-005, FR-006, FR-010, FR-011, FR-018; SR-004, SR-006.

- [ ] **COM-002-T016 — Adapter `PostsInteractionAdapter`.** Hiện thực `PostInteractionReader` bằng
      `CheckPostInteraction` do `PostsModule` export; không truy vấn bảng `posts`.
      **Phụ thuộc:** COM-002-T008.
      **Truy vết:** COM-002-FR-013; mục Tuân thủ kiến trúc của kế hoạch.

- [ ] **COM-002-T017 — Integration test lưu trữ.** Trên cơ sở dữ liệu cách ly: gốc xoá/ẩn không vào
      luồng của người khác, Comment bị ẩn của người xem vẫn vào luồng của chính họ, `replyCount` và
      `total` không đếm mục không hiển thị, `listByAuthor` gồm đã xoá và bị ẩn, thứ tự và phân trang,
      CHECK tự làm cha.
      **Phụ thuộc:** COM-002-T015, COM-002-T019.
      **Truy vết:** AC-009, AC-012 tới AC-014, AC-016.

## Cơ sở dữ liệu / Migration

- [ ] **COM-002-T018 — Viết migration `Com002Comments`.** Tạo
      `apps/community-service/src/database/migrations/<timestamp>-Com002Comments.ts`, chạy sau
      `Com001Posts`. Up: kiểm tra dữ liệu cũ vi phạm (dừng nếu có), thêm `edited_at`, `deleted_at`,
      `CHK_comments_not_self_parent`, `IDX_comments_post_roots`, `IDX_comments_parent`,
      `IDX_comments_author_created`. Down: bỏ theo thứ tự ngược.
      **Phụ thuộc:** COM-002-T014.
      **Truy vết:** Mục Thay đổi cơ sở dữ liệu và Migration của kế hoạch.

- [ ] **COM-002-T019 — Kiểm chứng vòng đời migration.** `pnpm migration:run:community`, kiểm tra
      schema, `pnpm migration:revert:community`, kiểm tra down (chỉ gỡ phần của COM-002), chạy lại up.
      Xác nhận `synchronize` vẫn tắt.
      **Phụ thuộc:** COM-002-T018.
      **Truy vết:** Định nghĩa Hoàn thành; chiến lược cơ sở dữ liệu.

## API / Presentation

- [ ] **COM-002-T020 — DTO request.** `CreateCommentRequestDto` (`content`, `parentCommentId?`),
      `UpdateCommentRequestDto` (`content`), query `PageQueryDto`. Không trường nào đặt được tác giả,
      Post, Comment cha khi sửa, hay trạng thái. Xoá `posts/dto/create-comment.dto.ts`.
      **Phụ thuộc:** COM-002-T001.
      **Truy vết:** COM-002-SR-003; AC-008, AC-018.

- [ ] **COM-002-T021 — DTO response và mapper.** `CommentResponseDto` (kèm `replyCount` cho gốc),
      `AuthorCommentResponseDto` (thêm `deletedAt`, `moderation`); ánh xạ tường minh, không trả entity.
      **Phụ thuộc:** COM-002-T006.
      **Truy vết:** Đầu ra của đặc tả; COM-002-FR-011, FR-014; SR-004.

- [ ] **COM-002-T022 — `CommentsController`.** `@Controller('api/community')`, `TrustedUserGuard`, bảy
      route của kế hoạch (`GET comments/mine` khai báo trước route có `:commentId`), `ParseUUIDPipe`;
      mỗi route gọi đúng một use case.
      **Phụ thuộc:** COM-002-T009 tới COM-002-T011, COM-002-T020, COM-002-T021.
      **Truy vết:** COM-002-FR-003 tới FR-009, FR-011; AC-001, AC-002, AC-009, AC-010, AC-014.

- [ ] **COM-002-T023 — Gỡ hành vi cũ và nối dây module.** Bỏ route comment khỏi `PostsController`,
      bỏ `PostsService.comment`. Tạo `comments.module.ts` (import `PostsModule`, `forFeature([Comment])`,
      gắn hai port, export `CheckCommentInteraction`); nạp `CommentsModule` trong
      `community-service.module.ts`.
      **Phụ thuộc:** COM-002-T012, COM-002-T015, COM-002-T016, COM-002-T022.
      **Truy vết:** Mục Adapter hạ tầng và Tuân thủ kiến trúc của kế hoạch.

- [ ] **COM-002-T024 — Cập nhật Swagger.** Route, DTO, mã lỗi `400/401/403/404/409`; ví
      dụ không chứa dữ liệu thật.
      **Phụ thuộc:** COM-002-T022.
      **Truy vết:** Định nghĩa Hoàn thành; SR-007.

## Phân quyền

- [x] **N/A — Seed quyền ở Identity.** COM-002 không định nghĩa mã quyền mới (quyết định 1 của đặc
      tả); không có migration nào trong `apps/identity-service`.

- [ ] **COM-002-T025 — Kiểm thử phân quyền khẳng định và phủ định.** Tác giả Comment được
      sửa/xoá/khôi phục; tác giả Post, `ADMIN`, `LECTURER` không phải tác giả bị `403`; Comment/Post
      không hiển thị trả `404`; thiếu header `401`.
      **Phụ thuộc:** COM-002-T022.
      **Truy vết:** COM-002-SR-001, SR-002; AC-005, AC-007, AC-011.

## Messaging

- [x] **N/A — COM-002 không phát hay tiêu thụ event.**

## Realtime

- [x] **N/A — Không có yêu cầu realtime.**

## Cấu hình

- [x] **N/A — Không đổi cấu hình.**

## Kiểm thử và bảo mật

- [ ] **COM-002-T026 — Test API.** `@nestjs/testing` + `fetch` của Node: tạo gốc, trả lời, trả lời
      lồng `400`, cha khác Post `404`, Post bị ẩn (`404` với người khác, `409` với tác giả Post khi
      tạo), sửa/xoá/khôi phục, trả lời biến mất và hiện lại theo Comment gốc, "Comment của tôi", trường
      lạ `400`, route `POST posts/:postId/comments` giữ đường dẫn.
      **Phụ thuộc:** COM-002-T022 tới COM-002-T025.
      **Truy vết:** COM-002-AC-001 tới AC-020.

- [ ] **COM-002-T027 — Rà soát bảo mật tập trung.** `replyCount`, `total`, "Comment của tôi", lỗi, log,
      Swagger không lộ nội dung hay tác giả của Comment không công khai; không log nội dung hay header;
      không đường ghi `is_hidden`.
      **Phụ thuộc:** COM-002-T026.
      **Truy vết:** COM-002-SR-001 tới SR-007; AC-020.

## Tài liệu và kiểm chứng

- [ ] **COM-002-T028 — Cập nhật tài liệu triển khai.** Ghi đổi mã lỗi `422` → `400`, `409` khi tạo
      Comment trên Post bị ẩn của chính mình, route đọc mới, việc trả lời ẩn theo Comment gốc, cảnh báo
      down migration làm Comment đã xoá hiện lại.
      **Phụ thuộc:** COM-002-T019, COM-002-T024.
      **Truy vết:** Mục Rủi ro của kế hoạch.

- [ ] **COM-002-T029 — Chạy lệnh kiểm chứng.** `pnpm lint`, `pnpm typecheck`, `pnpm test`,
      `pnpm build`. Không che lỗi bằng `any`, `@ts-ignore` hay tắt lint.
      **Phụ thuộc:** COM-002-T026, COM-002-T027, COM-002-T028.
      **Truy vết:** Định nghĩa Hoàn thành.

- [ ] **COM-002-T030 — Kiểm chứng tuân thủ kiến trúc.** Domain không import framework; use case chỉ
      phụ thuộc domain và port; `comments` chỉ biết Posts qua `CheckPostInteraction`; adapter gắn ở
      composition root; không entity/use case Comment trong `libs/`.
      **Phụ thuộc:** COM-002-T023, COM-002-T029.
      **Truy vết:** ADR 0002; `dependency-rules.md`; mục Tuân thủ kiến trúc của kế hoạch.

- [ ] **COM-002-T031 — Đối chiếu với đặc tả.** Rà từng COM-002-FR-001 tới FR-018, SR-001 tới SR-007,
      AC-001 tới AC-020 với code, test, migration và Swagger. Xác nhận không có hành vi Ngoài phạm vi.
      **Phụ thuộc:** COM-002-T029, COM-002-T030.
      **Truy vết:** Đặc tả 1.0; Định nghĩa Hoàn thành.

- [ ] **COM-002-T032 — Bàn giao theo SDD.** Cập nhật ô đánh dấu trung thực, viết worked entry, lấy
      review của con người, chỉ chuyển đặc tả sang `Implemented` rồi `Verified` qua quy trình SDD.
      **Phụ thuộc:** COM-002-T031.
      **Truy vết:** Quy trình SDD.

## Bảng tổng hợp độ phủ

| Yêu cầu               | Công việc triển khai chính   | Kiểm thử/xác minh      |
| --------------------- | ---------------------------- | ---------------------- |
| COM-002-FR-001–FR-002 | T004, T014                   | T007, T030             |
| COM-002-FR-003–FR-004 | T005, T009, T022             | T007, T013, T026       |
| COM-002-FR-005–FR-006 | T010, T015, T022             | T017, T026             |
| COM-002-FR-007–FR-009 | T004, T011, T022             | T007, T013, T026       |
| COM-002-FR-010–FR-011 | T004, T006, T010, T015, T021 | T007, T017, T026       |
| COM-002-FR-012        | T003                         | T031                   |
| COM-002-FR-013        | T009 tới T011, T016          | T013, T026             |
| COM-002-FR-014        | T002, T004, T015             | T007, T017, T026       |
| COM-002-FR-015–FR-016 | T004                         | T007, T026             |
| COM-002-FR-017        | T012, T023                   | T013                   |
| COM-002-FR-018        | T011, T015                   | T013, T017             |
| COM-002-SR-001–SR-007 | T015, T016, T020, T021, T022 | T025, T027, T031       |
| COM-002-AC-001–AC-020 | —                            | T007, T013, T017, T026 |

> File này là danh sách kiểm tra triển khai, không phải đặc tả. Không thêm yêu cầu và không âm thầm
> thay đổi `spec.md` hay `plan.md` đã Approved trong lúc thực hiện.

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

## Paginated root comment reading - 2026-11-24

- [x] Add GET /api/community/posts/:id/comments with validated page/pageSize and typed Swagger page response.
- [x] Apply Post/root/reply visibility, stable oldest-first ordering, visible totals and grouped reply counts in a REPEATABLE READ snapshot.
- [x] Return author-only moderation status using existing is_hidden; map plain response fields.
- [x] Verify 65 regression tests, 26 isolated PostgreSQL/HTTP cases, lint, typecheck and Community build.

Evidence: [root comment work note](../../../worked/community/posts/2026-11-24-comment-list.md). This implements the existing-schema root-reading slice only; separate reply reading, lifecycle and full architectural feature tasks remain open.

## Paginated reply reading - 2026-11-24

- [x] Add GET /api/community/comments/:commentId/replies with reused query validation, typed DTOs and Swagger.
- [x] Enforce root/Post/reply visibility, root-only targets, oldest-first ordering and snapshot-consistent visible totals.
- [x] Map reply parent IDs and author-only moderation status without relation graphs.
- [x] Verify 65 regression tests, 41 isolated PostgreSQL/HTTP cases, lint, typecheck and Community build.

Evidence: [reply-list work note](../../../worked/community/posts/2026-11-24-reply-list.md). Lifecycle, Comment reactions and full architectural extraction remain open.

## Bounded author lifecycle slice (2026-11-25)

User explicitly selected detail/paging/filter and author edit/soft-delete first; author enrichment and realtime deferred. Execution plan: [post lifecycle](../../../pm/plan/community/posts/2026-11-24-post-lifecycle.md). Full feature checklist above remains open: title, management lists, restoration and full architecture extraction are not claimed complete.

- [x] Verify implemented ownership checks, soft deletion, deleted-ancestor visibility and interaction blocking against isolated PostgreSQL (70 tests passed).
- [x] Verify API regression, lint, typecheck and Community build; evidence: [worked entry](../../../worked/community/posts/2026-11-24-post-lifecycle.md).
