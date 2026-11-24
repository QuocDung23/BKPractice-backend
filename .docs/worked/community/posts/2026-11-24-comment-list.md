# 2026-11-24 - Paginated root comment API

- Author: Codex
- Scope: Read root comments of an existing Post with pagination and caller-visible reply counts.

## Spec and plan

- Approved COM-002-FR-005/010/013 and AC-009/016.
- Existing Comments plan ListRootComments/API/visibility rules; bounded `.docs/pm/plan/community/posts/2026-11-24-comment-list.md`.
- Focused checklist is cross-referenced from Comments tasks; full lifecycle/module dependencies remain open.
- Spec status at start: Approved. No Approved spec edited.

## Questions clarified

| Question                         | Conclusion                                                                                                                                                        | Source                                                                                                   |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Which endpoint is requested?     | GET /api/community/posts/:id/comments, returning root comments. Replies are counted but their separate reading endpoint is future work.                           | Owner accepted the comment-list proposal; Comments plan distinguishes ListRootComments from ListReplies. |
| Defaults and ordering?           | page=1, pageSize=20, maximum size 50; createdAt ASC, then UUID ASC.                                                                                               | Comments spec/plan.                                                                                      |
| Hidden visibility?               | Post hidden to nonauthor returns 404; author may read. A root is visible if public or caller is its author. Counts only include visible replies of visible roots. | COM-002-FR-010/013.                                                                                      |
| What about enormous page inputs? | Reject values beyond Number.MAX_SAFE_INTEGER as invalid query data; this is a numeric representation bound, not a product page limit.                             | JavaScript numeric safety and malformed-query error requirement.                                         |
| Schema/configuration changes?    | None; use existing is_hidden and timestamps. Soft deletion and full Comment domain extraction remain unimplemented.                                               | Current schema and bounded scope.                                                                        |

## What was done

Added `CommentPageQueryDto` to validate/transform page and pageSize, with default 1/20, minimum 1, maximum size 50 and safe-integer page bound. Existing global validation rejects unknown query fields. Added response DTOs `CommentSummaryDto`, `CommentPageDto` and `CommentModerationDto`, exported through the existing DTO barrel. Swagger describes the page envelope, root/null parent ID, visible reply count and author-only moderation status.

`PostsController.listComments(principal, postId, query)` receives the trusted caller, UUID-validated Post ID and validated query, then invokes the service. The existing POST create-comment route is preserved.

`PostsService.listComments(userId, postId, query)` returns a typed page. It opens a Community REPEATABLE READ transaction, validates Post visibility before reading comments or totals, finds roots visible to the caller and counts them with the identical filter, orders/paginates, then runs one grouped reply-count query for returned root IDs only. Empty/out-of-range pages skip reply aggregation and retain the visible total. It maps plain fields into DTOs instead of returning entity relations. Only the Comment author receives moderation.status derived from is_hidden. No other user's hidden content, counts or moderation fields are exposed.

Extended the real PostgreSQL HTTP suite for default/custom paging, size 50, empty/out-of-range pages, tie ordering, author-hidden-root status, root/reply privacy, cross-Post isolation, hidden Post stream access, authentication, UUIDs and invalid query values including huge numbers. Existing concurrency/rollback tests run in the same isolated database suite.

## Why these choices

Root-only paging matches ListRootComments and prevents replies from distorting root totals. A grouped count query avoids one database call per root. REPEATABLE READ gives Post visibility, root page/total and reply counts one database snapshot, avoiding contradictory pagination results under concurrent moderation. Existing class-transformer/class-validator and TypeORM provide the required transport/persistence behavior without dependencies or migrations. Plain response mapping avoids accidentally exposing relation graphs or hidden entity fields.

## How the feature works

1. GET /api/community/posts/:id/comments arrives with the existing trusted identity.
2. Guard, UUID pipe and query DTO validation run before business access.
3. The service validates Post visibility within a read snapshot; hidden/nonexistent foreign Posts return 404.
4. It queries visible roots/total, then visible reply counts for that page.
5. It returns `{ items, page, pageSize, total }`, with author-only moderation status and numeric replyCount on each root.
6. Invalid queries return 400; missing authentication returns 401; out-of-range pages return empty items with the same visible total.

## Configuration

No runtime configuration, migration, package or lockfile changes. No actual .env was read or modified. The existing test runner creates/cleans a dedicated database and role.

## Verification

- First real PostgreSQL run: 24 passed, before adding two numeric-boundary cases.
- Final real PostgreSQL run: 26 passed; dedicated database and role removed.
- Regression: 65 Community tests passed; database-only tests are run separately, not counted as ordinary passes.
- Typecheck and Community build: passed, including the final build after the numeric-bound decorator.
- Lint: passed. git diff --check: passed.
- No CodeGraph directory exists.

## Remaining

- Separate paginated reply retrieval, editing/deleting/restoring comments, Comment likes and full Clean Architecture extraction are not implemented here.
- Public Gateway JWT flow is outside the isolated HTTP suite; it uses the real Community guard with test-only internal credentials.
- Existing edits and application data are preserved. No commit/push.
