# 2026-11-21 — Verify Submission and Learning integration in CI

- Author: Codex
- Scope: Submission watchdog, UC02, UC03, CoursesModule and the backend verify job.

## Spec and plan

- [GW-002](../../specs/gateway/learning/problems/spec.md) defines HTTP 502
  for an unconfigured upstream route.
- [The error response contract](../../specs/00-system/error-responses/spec.md) defines
  `details` and a separate `requestId` for each request.
- [SUB-002](../../specs/03-submission/submit-code/spec.md) defines the ten-minute watchdog and
  terminal-state handling.
- Reproduce the seven failures on PostgreSQL, fix the watchdog result, align the assertions with
  the existing contracts, then run the same three suites in CI.

## Questions clarified

| Question                                                                  | Conclusion                                                                                                                                                                     |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Should the Gateway status change?                                         | The existing 502 and `UPSTREAM_NOT_CONFIGURED` satisfy the route contract. Assert both values and retain checks that the request cannot reach Learning or mutate a submission. |
| Why did the watchdog count two affected submissions when it updated none? | TypeORM's PostgreSQL driver returns a two-element tuple for raw UPDATE queries. The repository now reads the returned rows from that tuple.                                    |
| How can a test compare a rejected attachment with an unavailable problem? | Compare the full error after removing the per-request ID and assert both IDs separately.                                                                                       |

## Changes

The watchdog still updates eligible submissions in one statement and emits a notification
for each updated submission. It now returns zero when PostgreSQL updates zero rows and maps
the actual rows for nonzero updates. The UC02 test checks the public submission ID, the owner
and the terminal notification, then verifies that a late verdict cannot overwrite the status.

UC03 and CoursesModule read readiness codes from the common `details` array. The verify job
starts PostgreSQL 17 and supplies its isolated test database only to UC02, UC03 and
CoursesModule. The existing default Jest step continues to run the tests that do not require
this database.

## Verification

- All 89 tests across UC02, UC03 and CoursesModule pass with PostgreSQL 17.
- The default Jest run passed 1,578 tests, with 350 opt-in tests skipped.
- Backend typecheck, ESLint, builds for all six applications and `git diff --check` pass.
- Parsed the CI workflow and verified the image, database URLs and three test paths.
- GitHub Actions verification and full browser-to-Judge staging validation remain pending.
