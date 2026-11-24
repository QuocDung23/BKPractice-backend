# 2026-11-24 - Paginated reply reading

- Author: Codex
- Scope: Read replies of an existing root comment, with pagination and caller-specific visibility.

## Spec and plan

- Approved COM-002-FR-006/010/013 and the ListReplies/API rules in Comments plan.
- Bounded plan: `.docs/pm/plan/community/posts/2026-11-24-reply-list.md`.
- Comments tasks contain a focused patch checklist; full lifecycle/Comment reaction/module extraction tasks remain open.
- Spec status at start: Approved. No Approved spec changed.

## Questions clarified

| Question                                         | Conclusion                                                                                                     | Source                                                     |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Which route?                                     | GET /api/community/comments/:commentId/replies, exactly the planned reply-reading URL.                         | Comments plan API table and owner accepted next step.      |
| Is commentId any comment?                        | It must identify a root; using a reply as root returns 404.                                                    | ListReplies use case.                                      |
| What if either Post or root is hidden?           | Both must independently be visible to caller; owning one resource does not bypass the other resource's policy. | COM-002-FR-010/013.                                        |
| Does the root author see others' hidden replies? | No. Reply visibility is public or owned by the caller.                                                         | COM-002 visibility rule.                                   |
| Are schema/modules being rebuilt?                | No migration; the existing small Posts module owns the new controller until full feature extraction.           | Existing Community architecture and bounded session scope. |

## What was done

Added `CommentsController` in the existing Posts module. Its `listReplies(principal, rootId, query)` receives trusted identity, UUID-validated root ID and reused CommentPageQueryDto, then calls PostsService. The controller is guarded and documents 200/400/401/404 through Swagger. It is registered in PostsModule and exported by the source-folder barrel; existing root/create routes remain unchanged.

`PostsService.listReplies(userId, rootId, query)` opens a REPEATABLE READ transaction, loads the root with its Post/parent, and rejects missing/non-root/invisible content before reading reply rows or totals. It queries only replies of that root and Post, filters public-or-owned replies, orders createdAt ASC/id ASC, and returns a consistent page/total. Plain mapping includes the real parentCommentId and no relation graph or replyCount field. Only reply authors receive moderation.status.

Added ReplySummaryDto and ReplyPageDto, exported through the DTO barrel. Query defaults/limits are reused (1/20, max pageSize 50, safe integer page). Added normalized 404 COMMENT_NOT_FOUND so missing/inaccessible roots are indistinguishable.

Extended the real PostgreSQL HTTP suite with default/custom/out-of-range/empty pages, same-timestamp ordering, root isolation, reply-as-root denial, hidden reply ownership, cross-resource author privacy, hidden root/Post denial, validation and authentication. All requests use the real controller/service/repositories, with only isolated test configuration.

## Why these choices

A small additional controller uses the planned route without moving unrelated existing endpoints. REPEATABLE READ keeps root/Post visibility, reply page and total in one snapshot. Existing DTO validation and error handling preserve the established contract. Separate typed reply DTOs avoid implying another nesting level or including root-only replyCount. Explicit mapping prevents nested entity relations and hidden metadata from leaking.

## How the feature works

1. The authenticated client requests GET /api/community/comments/:rootId/replies with page/pageSize.
2. Guard, UUID and query validation run.
3. The service verifies both root and Post visibility within a snapshot; inaccessible or non-root targets receive 404 without counts.
4. Visible replies and matching total are selected in oldest-first order.
5. The caller receives `{ items, page, pageSize, total }`, with parentCommentId on each reply and author-only moderation status.
6. Empty/out-of-range pages succeed with empty items and the visible total; malformed input is 400 and absent trust is 401.

## Configuration

No configuration, migration, dependency or lockfile change. No actual .env was read or modified. The existing real-PostgreSQL runner uses and removes a dedicated test database/role.

## Verification

- Community regression tests: 65 passed; database cases are skipped in this normal run and executed separately.
- Real PostgreSQL/HTTP tests: 41 passed, including 15 new reply-reading cases. Dedicated test database and role removed.
- Typecheck and Community build: passed. Lint: passed. git diff --check: passed.
- No CodeGraph directory is configured.

## Remaining

- Comment editing, deletion/restoration, likes and full domain/use-case extraction are separate work.
- Public Gateway JWT behavior is not mocked or retested here; isolated tests use the real Community guard with a private test credential. The owner already manually exercised login and normal root comments.
- Existing user data and unrelated working-tree edits are preserved. No commit/push.
