# 2026-11-17 — End-to-end verification of Submission and Judge, UC02 test repair

- Author: ngochoai0810 (with Claude)
- Scope: whole repository (verification); `test/uc02-practice-submission.integration.spec.ts` (fix)

## Spec and plan

- Spec: SUB-001…SUB-004 (`.docs/specs/03-submission/`), JDG-001…JDG-005 (`.docs/specs/04-judge/`),
  ERR-001 (`.docs/specs/00-system/error-responses/spec.md`)
- Plan / Tasks: the `plan.md` and `tasks.md` next to each spec
- Spec status at start: Approved (all)

## Questions clarified

| Question                                                                                                                         | Conclusion                                                                                                                                                                                                                                                                                                                      | Source                                                            |
| -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Do the Submission and Judge branches work together?                                                                              | Merged into a throwaway branch and tested as one tree; the branch was deleted afterwards.                                                                                                                                                                                                                                       | Repository owner, 2026-11-17 ("Chạy end-to-end")                  |
| Why did all 55 UC02 tests fail?                                                                                                  | The test builds its own Submission app without the shared `createValidationPipe()` and `AllExceptionsFilter` that `libs/common/src/bootstrap.ts` installs. Since ERR-001 the Gateway turns any upstream error that is not in the shared envelope into `502`. The failure set was identical on `main`, so it predates this work. | `gateway-proxy.service.ts` (`isApiErrorEnvelope`), `bootstrap.ts` |
| GW-07 and HIS-10 expect `403/404/405` for routes the Gateway does not expose; the Gateway answers `502 UPSTREAM_NOT_CONFIGURED`. | **Open.** ERR-001 FR says an unrouted path needs its own `code` but not which status; the Gateway chose `502`. Either the test or the Gateway must change, and that is the owners' decision. Not changed.                                                                                                                       | ERR-001 spec line 121, `gateway-errors.ts`                        |
| VER-10 expects no record to expire at "now + 9 minutes" but two do.                                                              | **Open, not diagnosed.** Fails identically on `main`; the host and database clocks agree.                                                                                                                                                                                                                                       | UC02 run on `main`, 2026-11-17                                    |

## What was done

1. Verified the stacked branches together (Submission: `feat/sub-004-realtime` →
   `test/sub-004-gateway-realtime` → `test/submission-verification`; Judge: `feat/judge-service` →
   … → `feat/jdg-004-oop-judge`).
2. Added `judge.broker.integration.spec.ts` on `feat/jdg-004-oop-judge`: a real RabbitMQ broker and
   real Docker sandboxes carry a Run, a C++ Submit, an invalid request and a poison message through
   `judge.request` → `JudgeConsumer` → `ProcessJudgeRequestUseCase` → `JudgeEngine` → `judge.result`.
3. On branch `test/uc02-error-envelope` (from `main`): the UC02 test now builds the Submission app
   with the shared pipe and filter, gives `JudgeResultConsumer` a no-op broker instead of
   `undefined`, and compares the HIS-08 bodies without the per-request `requestId`.

## Why these choices

- A throwaway merge branch tests the combination without changing any work branch.
- Disposable RabbitMQ and PostgreSQL containers on separate ports keep the shared development
  infrastructure and `.env` untouched; the broker spec purges queues, so it refuses to run unless a
  dedicated URL is given.
- The UC02 fix goes on its own branch from `main` because the test belongs to the system-level UC02
  work, not to Submission or Judge.

## How the feature works

1. Submission publishes `judge.request` on `bkpractice.judge`.
2. The Judge consumer validates the payload, judges it in Docker, and publishes `judge.result` on
   `bkpractice.submission` with `messageId = executionId`; only then is the request acknowledged.
3. An invalid but correlatable request gets `INTERNAL_ERROR`; an uncorrelatable one is acknowledged
   and dropped, leaving nothing in the request queue or its dead-letter queue.
4. Submission applies the result, stores it in PostgreSQL and notifies the owner through Redis.

## Configuration

No configuration change. The broker spec reads an opt-in `JUDGE_BROKER_IT_URL` test variable only.

## Verification

- Commands run and their results (merged tree, Docker 29.8.2, temporary RabbitMQ 4 and PostgreSQL 17):
  - `pnpm typecheck`: clean. `pnpm lint`: clean.
  - `JUDGE_DOCKER_IT=1 JUDGE_BROKER_IT_URL=… pnpm test`: 182 suites passed, 25 skipped; 1614 tests
    passed, 284 skipped, 0 failed.
  - `pnpm build`: all six apps compiled.
  - Submission persistence integration specs on PostgreSQL: 21 passed.
  - UC02 on PostgreSQL: 0/55 before the fix (same on `main`), 52/55 after it.
- Not verified:
  - A browser or HTTP client going through the real Gateway, Identity login and Learning with all
    six services running (`pnpm dev`); the UC02 test covers Gateway → Submission → PostgreSQL with a
    stubbed Learning and judge queue.
  - Redis delivery to a socket client during a live Submit.

## Remaining

- Not done (to do later): decide the status for unrouted Gateway paths (GW-07, HIS-10); diagnose
  VER-10; a full `pnpm dev` walk-through with seeded data.
- Risks: none introduced by the test fix; it only aligns the test app with the production bootstrap.
