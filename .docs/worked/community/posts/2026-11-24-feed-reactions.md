# 2026-11-24 - Caller-specific reaction state on the Post feed

- Author: Codex
- Scope: Add likeCount/likedByMe to the existing GET /api/community/posts response for frontend reloads.

## Spec and plan

- Approved COM-003-FR-008/010 and reaction aggregation/AC-010 rules.
- Existing Posts/Reactions plans and focused `.docs/pm/plan/community/posts/2026-11-24-feed-reactions.md`.
- Feature task files reference the bounded patch; full reaction projections for other unfinished endpoints remain open.
- Spec status at start: Approved. No Approved spec changed.

## Questions clarified

| Question                          | Conclusion                                                                                   | Source                                                                                                  |
| --------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Which API is changed now?         | Existing list endpoint only; no new detail, pagination or Comment endpoint.                  | Owner accepted the next step to expose reaction state for frontend reads; current module has list only. |
| Which user determines likedByMe?  | The Principal established by the Community guard, never client data.                         | COM-003 identity rule and existing TrustedPrincipal.                                                    |
| What is the aggregation strategy? | One grouped reaction query for returned Post IDs; no query for an empty feed.                | Reactions plan batch-count requirement.                                                                 |
| How are hidden Posts handled?     | Preserve the existing list filter, including hiding them from the normal feed for all users. | Existing list contract; full author management remains unfinished.                                      |

## What was done

`PostsService.list(userId)` now receives the caller ID, fetches the same existing visible feed (up to 50, pinned first then newest), and aggregates reactions for exactly those IDs. The single group query counts LIKE records and uses PostgreSQL BOOL_OR to compute whether the caller has a stored LIKE. A Map joins by Post ID, preserving feed order. Posts without reactions receive numeric 0 and boolean false; PostgreSQL COUNT strings are converted to JSON numbers. No reaction rows or reactor identities are returned.

`PostsController.list` reads TrustedPrincipal and passes its user ID to the service. The return type and Swagger response use new `PostSummaryDto`, which documents existing fields and the two additions. The DTO is exported by the narrow folder barrel.

Added `posts.feed.spec.ts` to check empty-feed bypass, one grouped query, selected IDs/caller parameter, order-preserving mapping and typed defaults. Extended the real PostgreSQL HTTP suite to check counts for multiple Posts and different callers, zero-like defaults, reload after unlike, exclusion of hidden Posts, and the existing limit/pinned ordering. The authentication HTTP test now also asserts caller-ID forwarding.

## Why these choices

One batch query avoids a query per Post. PostgreSQL performs the count and caller-membership computation without sending reactor IDs to application callers. Mapping by ID avoids relying on SQL group order and preserves the existing feed contract. Defaults make frontend rendering deterministic after reload. No dependency, schema, environment or unrelated endpoint changes are needed.

## How the feature works

1. The authenticated request reaches GET /api/community/posts; the existing guard validates the internal caller and user UUID.
2. The controller obtains the verified Principal and passes its userId to list.
3. The service fetches visible Posts. An empty result returns immediately.
4. One grouped query computes likeCount and likedByMe for returned Post IDs.
5. The service merges numeric/boolean reaction fields into the existing Post representation and returns the same array shape.
6. A later reload after unlike queries current stored reactions instead of relying on browser state.

## Configuration

No configuration change. No actual .env was read or changed. No dependency or migration changes. Existing Gateway/Community authentication remains in force.

## Verification

- Unit/regression Community tests: 65 passed; the 11 database-only cases are skipped in this normal command and run separately below.
- Real PostgreSQL/HTTP runner: 11 passed, including three new feed cases and the existing concurrency/rollback cases. Temporary database and role were removed.
- pnpm typecheck and build:community: passed. pnpm lint: passed.
- Test resources use the existing isolated-database runner and are cleaned after completion.
- git diff --check and launcher syntax check: passed.
- No CodeGraph directory is configured.

## Remaining

- Full Post detail/pagination, author management, Comment reaction state and frontend UI wiring remain separate work.
- No claim is made that full COM-003-T015 is complete across unfinished endpoints.
- Existing working-tree edits and application data are preserved. No commit/push.
