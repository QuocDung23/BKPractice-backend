# 2026-11-04 — Submission verification tests (SUB-002, SUB-003, SUB-004 partial)

- Author: Claude (on `fix/sub-004-gateway-socket`, then merged into `feature/submission-service`)
- Scope: close the test gaps that do not need Redis. No product behaviour changed. The Redis lease
  and every item that needs a running Redis are deferred, as agreed on 2026-11-04.

## Spec and plan

- SUB-002 Submit: `.docs/specs/03-submission/submit-code/tasks.md`
- SUB-003 History: `.docs/specs/03-submission/submission-history/tasks.md`
- SUB-004 Realtime: `.docs/specs/03-submission/realtime-result/tasks.md`
- Spec status: all three remain Approved; none is moved to `Implemented` (that needs review).

## Questions clarified

| Question                                                     | Conclusion                                                                                                                                    | Source        |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| Skip everything that touches Redis?                          | Yes. The Redis lease, the Redis-down and recovery items, and the Gateway warn/retry items stay unticked and are noted as deferred.            | User decision |
| Can the PostgreSQL concurrency and paging tests run here?    | Not yet. Docker is not running and no local `*_test` database exists, so the integration suite is written but skipped. AC-009 stays unticked. | Environment   |
| Does the Gateway already test expired tokens on HTTP routes? | No. Only the realtime path had tests, so a unit test for `GatewayAuthMiddleware` was added.                                                   | Code          |

## What was done

- `submit-code-request.dto.spec.ts`: a valid body is accepted; a body that sets `ownerId`, `userId`,
  `roles`, `permissions`, `testCases`, `timeLimitMs`, `status` or `score` is rejected; an unsupported
  language or a non-UUID `problemId` is rejected. It uses the same `ValidationPipe` options as the
  global bootstrap (`whitelist` and `forbidNonWhitelisted`).
- `typeorm-submission.repository.integration.spec.ts`: three PostgreSQL tests, skipped unless
  `TEST_DATABASE_URL` points to a database whose name ends with `_test`.
  - Two `applySubmitVerdictOnce` calls race on the same submission: one row is returned, and one
    result row and one outbox row exist.
  - Keyset paging over five records that share one `created_at` returns every record once.
  - A newer record saved between two page reads does not duplicate or hide any earlier record.
- `gateway-auth.middleware.spec.ts`: uses a real `JwtService` to sign tokens.
  - A token that has not expired sets `x-auth-user-id` and calls `next`.
  - An expired token gives `UnauthorizedException` and does not call `next`.
  - A client-sent `x-auth-user-id` is removed before the token check.
  - The middleware reads no account state, so a valid token is accepted even if the account is
    locked. This is the stateless behaviour required by ID-001. The check covers the Gateway only,
    not Identity end to end.

## Verification

- `pnpm lint` (eslint on `apps/submission-service` and `apps/api-gateway`): clean.
- `pnpm typecheck`: passed.
- `pnpm exec jest apps/submission-service apps/api-gateway --runInBand`: 32 suites passed, 1 skipped
  (integration); 179 tests passed, 3 skipped.
- `pnpm build:submission`, `pnpm build:gateway`: webpack compiled successfully.
- Not run: the full `pnpm test` over every app, and the integration suite.

## Not verified

- AC-009 (concurrent Submit verdicts) and paging with tied timestamps on a real PostgreSQL database.
  Run them with a `*_test` database, for example:
  `TEST_DATABASE_URL=postgres://.../bkpractice_submission_test pnpm exec jest typeorm-submission.repository.integration --runInBand`.
- `EXPLAIN` on the cursor query (`submission-history/tasks.md`, the index item).
- Account lock end to end with Identity.
- Anything that needs Redis: the 5-socket lease, the Redis-down and recovery behaviour, and the
  Gateway warn and retry.
- Crash before and after broker confirm (`submit-code/tasks.md`, outbox retry).

## Remaining

- `run-code/tasks.md`, watchdog item: the late-result half is covered; "a duplicate request creates
  a new Run record" has no test yet.
- Non-code items: the frontend notice (sent through the chat, not recorded as done), the plan-vs-spec
  check, and review before any spec moves to `Implemented`.
