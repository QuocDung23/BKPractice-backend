# 2026-11-24 - Hidden interactions and explicit Post likes

- Author: Codex
- Scope: Repair existing Post/comment interaction visibility and replace the existing Post LIKE toggle with idempotent enable/disable endpoints.

## Spec and plan

- Approved specs: COM-001 Post visibility/new interactions, COM-002 FR-004/013, COM-003 FR-005/006/007/009/010/012/013.
- Plans: existing Posts/Comments/Reactions plans; focused execution note `.docs/pm/plan/community/posts/2026-11-24-hidden-interactions-likes.md`.
- Tasks: bounded patch checklists cross-referenced from feature task files. Full COM-003 tasks requiring unfinished COM-001/002 remain open.
- Spec status at start: Approved. No Approved spec was changed.

## Questions clarified

| Question                                 | Conclusion                                                                                                                                                  | Source                                                                     |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Which reactions are being changed?       | Existing Post likes only. Comment reactions need schema and unfinished full-feature dependencies and are outside this repair.                               | User request to replace the current toggle; existing schema; focused plan. |
| What may happen on hidden content?       | Nonauthors receive 404; authors cannot create comments or enable likes (409), but may remove their own like. Hidden parent comments cannot receive replies. | COM-001/002 interaction policy and COM-003-FR-009.                         |
| How should retries behave?               | PUT ensures liked=true, DELETE ensures liked=false; repeated operations do not invert the state.                                                            | COM-003-FR-005/006/012 and plan API table.                                 |
| Is a migration needed?                   | No. The existing unique `(post_id, user_id)` constraint supports conflict-safe Post likes.                                                                  | Reaction entity and initial Community migration.                           |
| Is this the full COM-003 implementation? | No. Full Comments/Reactions dependency gates remain open. No claim is made about comment reactions, soft deletion or feed projections.                      | Session scope and focused plan.                                            |

## What was done

`PostsService.comment(authorId, postId, dto)` now checks the Post and parent Comment in a Community transaction. A missing Post or a hidden Post belonging to someone else returns POST_NOT_FOUND. A hidden Post belonging to the caller returns POST_INTERACTION_DISABLED (409). Missing, wrong-Post or hidden parents return COMMENT_PARENT_NOT_FOUND without saving. Existing one-level depth behavior remains. Public Post/parent rows are locked for share until the save commits so they cannot be hidden between validation and write. For the joined parent lookup, the lock targets only the comments table, avoiding PostgreSQL nullable-join lock errors.

Removed `toggleLike`. `PostsService.setPostLike(userId, postId, liked)` accepts the desired state and returns `{ liked, likeCount }`. It first locks and checks the Post inside a transaction, before reading reactions or counts. Enabling uses TypeORM INSERT with ON CONFLICT DO NOTHING, backed by the existing unique constraint. Disabling deletes only `(postId, callerId)`. Count is read after the write through the same transaction manager. A hidden author's existing like can be removed; another user's hidden-content reaction remains stored and inaccessible. Restoring visibility permits ordinary interaction again without recreating old likes.

`PostsController.likePost` handles PUT and `unlikePost` handles DELETE at `/api/community/posts/:id/reactions/like`; both return 200. The POST route has been removed. TrustedPrincipal and UUID parsing remain in place. `LikeRequestDto` declares no client-controlled fields so the existing global validation pipe rejects injected user IDs/types/counts. `ReactionStateDto` and Swagger document the response and 409 path. New DTOs are exported through the existing barrel.

`post-errors.ts` adds the normalized 409 POST_INTERACTION_DISABLED definition. Other historical error codes/statuses are preserved. Existing validation/authentication tests now use the explicit endpoints. Reworked service tests exercise both policy and real HTTP transport with repository fakes; a metadata-only PostgreSQL TypeORM test checks actual conflict-safe insert SQL and the table-specific parent row lock. README explains the frontend migration.

## Why these choices

An explicit requested state makes retries safe; a read-then-toggle cannot distinguish a retry from an intentional reversal. Conflict-safe insertion delegates uniqueness to PostgreSQL instead of racing a read-before-insert. Scoped deletion is naturally idempotent and cannot delete another user's like. The existing schema and Community connection already provide these primitives, so no dependency or migration is needed.

Transactions keep visibility validation, writes and count reads together. Shared locks protect moderation state while allowing concurrent reads and likes. Domain/module extraction stays separate from this focused repair of the existing Posts module, consistent with its documented partial alignment.

## How the feature works

1. Gateway authentication and the Community guard establish the caller; UUID/body validation runs at the controller.
2. PUT/DELETE maps directly to a desired boolean state; comment creation keeps its existing endpoint.
3. The service starts a Community transaction and checks/locks the relevant visible content.
4. Invalid interactions fail with 404/409 before reaction reads/counts or comment writes.
5. Allowed likes are inserted-if-absent or deleted-if-present, then counted; allowed comments are saved.
6. The transaction commits and the caller receives the requested like state/count or the created comment. Storage failures roll back through TypeORM transaction handling.

## Configuration

No configuration change. No environment files were read or modified. No migration, package or lockfile change. Frontend API migration: replace the removed POST toggle with explicit PUT/DELETE and consume HTTP 200 `{ liked, likeCount }`.

## Verification

- `corepack pnpm typecheck`: passed.
- `corepack pnpm build:community`: passed.
- `corepack pnpm test apps/community-service --silent`: passed, 4 suites / 63 tests.
- `corepack pnpm lint`: passed.
- TypeORM SQL-generation tests use PostgreSQL metadata without connecting to a database.
- CodeGraph: N/A, no `.codegraph/` directory.

## Remaining

- A real PostgreSQL concurrent-write/rollback/moderation race test was not run. Uniqueness relies on the existing database constraint and ON CONFLICT statement; shared locks and transaction semantics have not been exercised against a live database here.
- HTTP tests use the real controller, guard, validation/filter and service with mocked repositories. No live Gateway/Identity stack was started.
- No frontend source was changed; callers of the old POST route must migrate before integration.
- Comment reactions, full reaction feed projections, soft deletion and larger feature extraction remain outside this patch.
- Existing unrelated working-tree changes are preserved. No commit or push was created.
