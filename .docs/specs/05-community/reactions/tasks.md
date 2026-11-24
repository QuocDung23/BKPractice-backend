# COM-003 Công việc triển khai Reactions

## Trạng thái

Approved — Sẵn sàng triển khai sau COM-001 và COM-002

Được chủ sở hữu sản phẩm phê duyệt ngày `2026-09-30` (phê duyệt gộp: chủ sở hữu duyệt trước các
phương án đề xuất).

Đặc tả liên quan: [`./spec.md`](./spec.md) — phiên bản Approved `1.1`
Kế hoạch liên quan: [`./plan.md`](./plan.md) — Approved ngày `2026-09-30`

Mọi công việc bắt đầu ở trạng thái chưa hoàn thành. Chỉ đánh dấu `[x]` khi cả phần triển khai lẫn
phần kiểm chứng đã xong. Các mục N/A là những mục duy nhất được tích sẵn có chủ đích. Danh sách này
không thêm hành vi ngoài `spec.md` và không thay đổi `plan.md`.

## Chuẩn bị

- [ ] **COM-003-T001 — Xác nhận nền tảng.** Khảo sát trạng thái Git, `spec.md` 1.1 Approved,
      `plan.md` Approved, kiến trúc Community. Xác nhận COM-001/002 đã triển khai `common/auth`,
      `common/errors`, `CheckPostInteraction`, `CheckCommentInteraction` và DTO Post/Comment. Nếu chưa,
      **DỪNG và BÁO CÁO**.
      **Phụ thuộc:** Không có.
      **Truy vết:** Quy trình SDD; bước 1 của Thứ tự triển khai.

- [ ] **COM-003-T002 — Xác nhận ranh giới và loại trừ.** Ghi nhận: chỉ `LIKE`, không danh sách người
      đã `LIKE`, không thông báo, không bộ đếm phi chuẩn hoá, không realtime, không mã quyền mới.
      **Phụ thuộc:** COM-003-T001.
      **Truy vết:** Ngoài phạm vi của đặc tả; COM-003-FR-011.

## Domain

- [ ] **COM-003-T003 — Khái niệm domain.** `ReactionType` (chỉ `LIKE`), `ReactionTarget`,
      `ReactionState`; lỗi dùng `common/errors/`. Không import NestJS/TypeORM.
      **Phụ thuộc:** COM-003-T001.
      **Truy vết:** COM-003-FR-002, FR-003, FR-007, FR-009.

## Tầng application

- [ ] **COM-003-T004 — Định nghĩa port.** `ReactionRepository`, `ReactionCountReader`,
      `ContentInteractionReader` (bọc `CheckPostInteraction`/`CheckCommentInteraction`). Không port nào
      khác.
      **Phụ thuộc:** COM-003-T003.
      **Truy vết:** Mục Port của plan.

- [ ] **COM-003-T005 — `LikeContent` và `UnlikeContent`.** Hỏi `ContentInteractionReader` (Comment
      phải trùng `postId`); bật cần `acceptsInteraction` (không có → `409`), tắt cần `visibleToViewer`;
      không hiển thị → `404`; ghi idempotent; trả `liked`, `likeCount` trong cùng transaction.
      **Phụ thuộc:** COM-003-T004.
      **Truy vết:** COM-003-FR-004–FR-007, FR-009, FR-013; AC-001–AC-008.

- [ ] **COM-003-T006 — Unit test application.** Port giả: idempotent hai chiều, đối tượng không hiển
      thị, Comment sai Post, tác giả trên nội dung bị ẩn của mình (bật `409`, tắt được).
      **Phụ thuộc:** COM-003-T005.
      **Truy vết:** AC-002, AC-003, AC-005–AC-008.

## Lưu trữ

- [ ] **COM-003-T007 — Chuyển và cập nhật entity.** Chuyển `Reaction` sang
      `reactions/infrastructure/persistence/`, thêm `comment` nullable, bỏ `@Index` cũ; cập nhật
      `community.entities.ts`, bỏ `Reaction` khỏi `posts.module.ts`.
      **Phụ thuộc:** COM-003-T001.
      **Truy vết:** Mục Lưu trữ của plan; SR-005.

- [ ] **COM-003-T008 — Adapter.** `TypeOrmReactionRepository` (`ON CONFLICT DO NOTHING`, `DELETE`
      idempotent, `COUNT`), `TypeOrmReactionCountReader` (truy vấn gộp theo danh sách ID, trả
      `likeCount`, `likedByMe`), `content-interaction.adapter.ts`. Không có phương thức trả danh sách
      người dùng.
      **Phụ thuộc:** COM-003-T004, COM-003-T007.
      **Truy vết:** COM-003-FR-004, FR-008, FR-009, FR-010, FR-011; SR-004.

- [ ] **COM-003-T009 — Integration test lưu trữ.** Partial unique index; hai lần bật đồng thời; số đếm
      sau ẩn/khôi phục; `likedByMe` theo người gọi.
      **Phụ thuộc:** COM-003-T008, COM-003-T010.
      **Truy vết:** AC-009, AC-010, AC-013.

## Cơ sở dữ liệu / Migration

- [ ] **COM-003-T010 — Migration `Com003Reactions`.** Thêm `comment_id` FK nội bộ cascade; tra và bỏ
      ràng buộc duy nhất cũ qua `pg_constraint`; tạo hai partial unique index và index `comment_id`.
      Down xoá phản ứng trên Comment (ghi cảnh báo) và khôi phục ràng buộc cũ.
      **Phụ thuộc:** COM-003-T007.
      **Truy vết:** Mục Thay đổi CSDL và Migration của plan.

- [ ] **COM-003-T011 — Kiểm chứng migration.** `pnpm migration:run:community` /
      `pnpm migration:revert:community` trên CSDL cách ly có phản ứng mẫu; `synchronize` vẫn tắt.
      **Phụ thuộc:** COM-003-T010.
      **Truy vết:** Định nghĩa Hoàn thành.

## API

- [ ] **COM-003-T012 — Controller và DTO.** Bốn route `PUT`/`DELETE` của plan; `ParseUUIDPipe`;
      `ReactionStateResponseDto`; lỗi qua `CommunityDomainErrorFilter`; `TrustedUserGuard`.
      **Phụ thuộc:** COM-003-T005.
      **Truy vết:** COM-003-FR-005–FR-007; SR-001, SR-003, SR-006; AC-011, AC-012.

- [ ] **COM-003-T013 — Gỡ route đảo trạng thái.** Xoá `POST /api/community/posts/:id/reactions/like`,
      `PostsController.like`, `PostsService.toggleLike`.
      **Phụ thuộc:** COM-003-T012.
      **Truy vết:** COM-003-FR-012; AC-014.

- [ ] **COM-003-T014 — Swagger và gắn module.** Mô tả route mới, ghi route cũ bị gỡ;
      `ReactionsModule` import `PostsModule`, `CommentsModule`, export `ReactionCountReader` như provider
      độc lập; import trong `community-service.module.ts`.
      **Phụ thuộc:** COM-003-T008, COM-003-T013.
      **Truy vết:** Mục Adapter và API của plan.

## Phần bổ sung vào COM-001/COM-002

- [ ] **COM-003-T015 — Bổ sung số đếm vào biểu diễn nội dung.** Sửa mapper `PostResponseDto`,
      `PostSummaryResponseDto`, `CommentResponseDto` và phép chiếu tác giả để thêm `likeCount`,
      `likedByMe` qua `ReactionCountReader` (một truy vấn gộp mỗi trang). Không thêm vào
      `CommentPlaceholderResponseDto`; không đổi hành vi khác của COM-001/002.
      **Phụ thuộc:** COM-003-T014.
      **Truy vết:** COM-003-FR-008; SR-002; AC-008, AC-010.

## Messaging

- [x] N/A — Đặc tả không có sự kiện.

## Realtime

- [x] N/A — Realtime là Ngoài phạm vi.

## Phân quyền

- [ ] **COM-003-T016 — Test phân quyền.** Khẳng định: `STUDENT`, `LECTURER`, `ADMIN` đều bật/tắt được
      phản ứng của mình. Phủ định: không header, header sai định dạng, cố đặt `userId` trong body.
      **Phụ thuộc:** COM-003-T012.
      **Truy vết:** Quy tắc phân quyền; SR-001, SR-006; AC-011, AC-012.

## Kiểm thử

- [ ] **COM-003-T017 — Test API/E2E.** Bật/tắt trên Post và Comment, idempotent, nội dung ẩn/xoá mềm
      (người khác `404`, tác giả bật `409`), Comment gốc bị xoá mềm/ẩn cùng cây trả lời không xuất
      hiện và không lộ số đếm, route cũ không còn, không phản hồi nào có danh sách người dùng.
      **Phụ thuộc:** COM-003-T011, COM-003-T014, COM-003-T015.
      **Truy vết:** AC-001 tới AC-015.

## Tài liệu và kiểm chứng

- [ ] **COM-003-T018 — Tài liệu triển khai.** Ghi thay đổi phá vỡ route cũ (frontend phải chuyển
      sang `PUT`/`DELETE`) và cảnh báo down migration.
      **Phụ thuộc:** COM-003-T013.
      **Truy vết:** Mục Rủi ro của plan.

- [ ] **COM-003-T019 — Chạy lệnh kiểm chứng.** `pnpm lint`, `pnpm typecheck`, `pnpm test`,
      `pnpm build`.
      **Phụ thuộc:** COM-003-T016, COM-003-T017, COM-003-T018.
      **Truy vết:** Định nghĩa Hoàn thành.

- [ ] **COM-003-T020 — Kiểm chứng kiến trúc, đối chiếu đặc tả và bàn giao.** Chiều phụ thuộc đúng;
      rà FR-001–FR-013, SR-001–SR-006, AC-001–AC-015; cập nhật ô đánh dấu; viết worked entry; chỉ chuyển
      trạng thái đặc tả qua quy trình SDD.
      **Phụ thuộc:** COM-003-T019.
      **Truy vết:** ADR 0002; Đặc tả 1.0; Định nghĩa Hoàn thành.

## Bảng tổng hợp độ phủ

| Yêu cầu                | Công việc triển khai chính | Kiểm thử/xác minh      |
| ---------------------- | -------------------------- | ---------------------- |
| COM-003-FR-001         | T007, T014                 | T020                   |
| COM-003-FR-002–FR-003  | T003, T007, T010           | T017                   |
| COM-003-FR-004–FR-007  | T005, T008, T012           | T006, T009, T017       |
| COM-003-FR-008, FR-010 | T008, T015                 | T009, T017             |
| COM-003-FR-009         | T005                       | T006, T017             |
| COM-003-FR-011         | T002, T008                 | T017, T020             |
| COM-003-FR-012         | T013                       | T017                   |
| COM-003-FR-013         | T005, T008                 | T009                   |
| COM-003-SR-001–SR-006  | T008, T012                 | T016, T020             |
| COM-003-AC-001–AC-015  | —                          | T006, T009, T016, T017 |

> File này là danh sách kiểm tra triển khai, không phải đặc tả. Không thêm yêu cầu và không âm thầm
> thay đổi `spec.md` hay `plan.md` đã Approved trong lúc thực hiện.

## Existing hidden-interaction / Post-like patch - 2026-11-24

Owner-requested bounded repair: [execution plan](../../../pm/plan/community/posts/2026-11-24-hidden-interactions-likes.md).

- [x] Enforce hidden-Post interaction policy and reject replies to hidden parent comments.
- [x] Replace the existing Post toggle with PUT/DELETE, each returning `{ liked, likeCount }` with HTTP 200.
- [x] Use transactions, scoped deletion and conflict-safe insertion with the existing unique constraint.
- [x] Verify 63 Community tests, PostgreSQL SQL generation, lint, typecheck and Community build; document frontend migration and remaining live-database verification.

This patch does not complete the larger feature tasks or the full COM-003 dependency gate. Comment reactions, full feed projections and soft-delete workflows remain open. No database migration is included.

## Real PostgreSQL verification - 2026-11-24

- [x] Execute actual HTTP/concurrency/visibility/rollback checks in a separately created PostgreSQL database: 8 tests passed.
- [x] Remove temporary database and role after verification; run lint/typecheck.

Evidence: [live PostgreSQL work note](../../../worked/community/posts/2026-11-24-real-postgres-verification.md). This covers the current Post-like patch, not all larger COM-003 tasks above.

## Existing feed reaction state - 2026-11-24

- [x] Add numeric likeCount and caller-specific likedByMe to the current Post list using one grouped reaction query; skip that query for an empty feed.
- [x] Preserve visibility, ordering and the 50-item limit; document the typed Swagger response.
- [x] Verify 65 Community regression/unit tests and 11 isolated real PostgreSQL/HTTP cases, lint, typecheck and Community build.

Evidence: [feed reaction work note](../../../worked/community/posts/2026-11-24-feed-reactions.md). This implements the current list projection only; full detail/Comment projections and other unfinished tasks remain open.
