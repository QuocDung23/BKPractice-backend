# 2026-11-24 - Post detail, feed filtering and author lifecycle

- Author: Codex
- Scope: Post detail, paged/filtered feed, edit and soft-delete for posts and comments.

## Spec and plan

- Approved COM-001 (Posts) and COM-002 (Comments) specs and plans.
- Plan: `.docs/pm/plan/community/posts/2026-11-24-post-lifecycle.md`.
- Tasks: COM-001 and COM-002 author lifecycle tasks.
- Spec status at start: Approved. No spec was changed.

## Questions clarified

| Question                                             | Conclusion                                                                                                                        | Source                                 |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| What is the scope of this step?                      | Detail reading, paged/filtered post feed, author edit/soft-delete of posts and comments. Author enrichment and realtime deferred. | PM Plan & Approved specs               |
| How are edits and soft deletes stored?               | Via nullable `edited_at` and `deleted_at` columns, added via migration `1795527000000-CommunityContentLifecycle.ts`.              | Architecture & schema design           |
| Who can edit or delete content?                      | Only the author (`authorId === actorId`). Nonauthors receive 403 (or 404 if hidden from them).                                    | COM-001-FR-009/010, COM-002-FR-007/008 |
| What happens to hidden status during edits/deletion? | Hidden status (`is_hidden`) is retained and managed solely by moderation (COM-005). Editing does not unhide content.              | COM-001-FR-013, COM-002-FR-014         |

## What was done

1. **Migration and Entities:**
   - Created migration `1795527000000-CommunityContentLifecycle.ts` adding `edited_at` and `deleted_at` to `posts` and `comments`, with partial indexes for visible feed querying.
   - Updated `Post` and `Comment` TypeORM entities with `editedAt` and `deletedAt`.

2. **Clean Architecture Domain & Application Ports:**
   - Added `content-lifecycle.ts` domain policies (`canReadContent`, `checkContentOwnership`).
   - Added `EditContent` application use case and `ContentRepository` port.
   - Implemented `TypeOrmContentRepository` for transactional lock-based content modification.

3. **Controllers and DTOs:**
   - `PostsController`: Added `GET :id`, `PATCH :id`, and `DELETE :id`. Updated `GET /` to support `PostPageQueryDto` (pagination and scope/problemId/courseId filtering).
   - `CommentsController`: Added `PATCH :commentId` and `DELETE :commentId`.
   - DTOs created: `EditPostDto`, `EditCommentDto`, `EditedCommentDto`, `PostPageQueryDto`, `PostPageDto`, `PostSummaryDto`.

## How the feature flows

Gateway authenticates the caller and forwards the private Community credential. Controllers validate route UUIDs and DTOs and obtain the trusted principal. The paged feed applies public visibility and optional target filters before selecting/counting rows; reaction counts are fetched for returned posts only. Detail reads apply the same visibility policy with author-only moderation metadata.

Edits and deletions invoke EditContent through ContentRepository. The PostgreSQL adapter locks Post before root/target Comment, then invokes the plain domain ownership/state rules within the transaction. Edits change only content and editedAt; soft deletion changes deletedAt. Moderation remains unchanged. Read and interaction queries exclude deleted ancestors so children cannot leak or receive new interactions. Existing reactions and child records are retained.

## Questions clarified on continuation (2026-11-25)

- User selected only detail, pagination/filter, edit/delete first; enrichment and realtime remain deferred. No new permission question was needed.
- Existing content-only creation remains compatible in this bounded slice. Titles, own-content management lists, restore endpoints and full module extraction remain pending; this work does not complete the full COM-001/002 feature checklists.
- Application database migration is an operator step. No real environment file was inspected and no application content was modified by verification.

## Verification

Resumed verification on 2026-11-25:

- `corepack pnpm lint`: passed, no errors.
- `corepack pnpm typecheck`: passed.
- `corepack pnpm build:community`: passed (webpack compiled successfully).
- Community regression: 65 cases verified. Initial run had 64 pass / 1 fail because the auth HTTP fixture omitted production ValidationPipe, so page defaults were absent. Added the production pipe; reran its file and all 9 cases passed. Other four regression files passed unchanged; 70 isolated database cases are skipped in the ordinary run.
- `node scripts/test-community-postgres.mjs`: 70/70 passed with actual PostgreSQL and Community HTTP. Covers paged/filtered feed, detail/viewer flags, ownership 403 versus concealed 404, edit validation, deleted ancestors, retained children/likes, repeated deletion 409, post-delete versus interaction/edit races, and migration down/up.
- The disposable database and role were removed by the runner. The forced database-failure test intentionally logs an error and verifies rollback; it passed.
- `git diff --check`: passed (line-ending warnings only). No new dependencies or environment changes.

The earlier PostgreSQL run caught a 5000-character comment-limit inheritance defect; independent comment DTO validation fixed it, and the final 70 tests passed. Full repository test/build success is not claimed by this entry; the applicable resumed checks above are the evidence.

## Configuration and deployment

No environment variables, ports, Gateway routing or dependencies changed in this slice. Run `corepack pnpm migration:run:community` before restarting Community (`corepack pnpm dev:community`). Migration up adds nullable fields and indexes without deleting content; down removes lifecycle markers and can reveal previously soft-deleted content. Migration up/down is verified only in a disposable PostgreSQL database.

## Limitations

The frontend must change post feed consumption from an array to `response.items`. This task changes backend only. Public Gateway JWT flow was manually exercised earlier by the user; current automated integration tests exercise Community HTTP with the trusted internal credential. CodeGraph is absent and no index command is applicable. No commit or push was performed.
