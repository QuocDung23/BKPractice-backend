# 2026-11-16 — Submission: verification on real PostgreSQL

- Author: ngochoai0810 (with Claude)
- Scope: Submission service, `modules/submissions` persistence; tasks of SUB-002 and SUB-003

## Spec and plan

- Spec: `.docs/specs/03-submission/submit-code/spec.md`, `.docs/specs/03-submission/submission-history/spec.md`
- Plan: the `plan.md` next to each spec
- Tasks: the `tasks.md` next to each spec
- Spec status at start: Approved (both)

## Questions clarified

| Question                                      | Conclusion                                                                                                                                                                                                         | Source                                                         |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| Which database may the integration specs use? | Only one whose name ends in `_test`; the spec file enforces it. A throwaway `postgres:17-alpine` container with database `submission_test` was used, so neither `.env` nor the development databases were touched. | `typeorm-submission.repository.integration.spec.ts`, CLAUDE.md |

## What was done

No product code changed. This work is not a product feature; it runs verification that earlier
entries recorded as "not run on real PostgreSQL":

1. Started a temporary PostgreSQL 17 container, let the integration spec run the real migrations,
   and ran `typeorm-submission.repository.integration.spec.ts`.
2. Ran the keyset-pagination query shape under `EXPLAIN` against 40,000 seeded rows for 200 owners
   inside a transaction that was rolled back.
3. Ticked the five tasks these runs prove and removed the container.

## Why these choices

- A disposable container gives a clean schema built only by migrations, which is what the tasks ask
  to prove, and leaves nothing behind.
- The race test was repeated because a concurrency test that passes once proves little.

## How the feature works

1. Two `judge.result` deliveries for one Submit are applied concurrently; the repository's
   conditional update lets exactly one change the row and write the outbox event (SUB-002 AC-009).
2. History paging orders by `created_at DESC, public_id DESC` and continues from a compound cursor,
   so records sharing a timestamp are neither repeated nor skipped, and a record inserted between
   two page reads does not disturb earlier pages (SUB-003).
3. PostgreSQL serves that query with `Index Only Scan using IDX_submissions_owner_created` and no
   Sort node. The cursor predicate is applied as a filter on the index because it is an `OR`
   expression; the owner prefix and the ordering come from the index.

## Configuration

No configuration change.

## Verification

- Commands run and their results:
  - `TEST_DATABASE_URL=<temp _test database> pnpm exec jest apps/submission-service/src/modules/submissions/infrastructure/persistence --runInBand`: 21 passed, 1 skipped.
  - The repository integration spec alone, five more times: 3/3 passed each time.
  - `EXPLAIN (COSTS OFF)` of the cursor query: index-only scan on `IDX_submissions_owner_created`.
- Not verified:
  - The very first run, started seconds after the container came up, failed 3 tests; every later
    run passed. The likely cause is PostgreSQL's restart at the end of first-time initialisation,
    but that was not confirmed.
  - `typeorm-submission-count.reader.integration.spec.ts` stayed skipped under this database.
  - Watchdog timing, outbox crash/retry against a real broker, and the end-to-end Submit with
    Learning and Judge.

## Remaining

- Not done (to do later): the remaining open tasks of SUB-001/002/003 (operations notes for the
  `stdin` and `score` migrations, internal-URL routing checks, account-lock token behaviour,
  FR/SR/AC sign-off and the `Implemented` status change).
- Risks: none introduced; no code changed.
