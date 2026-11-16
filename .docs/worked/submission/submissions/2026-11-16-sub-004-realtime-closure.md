# 2026-11-16 — SUB-004 realtime: Submission-side closure

- Author: ngochoai0810 (with Claude)
- Scope: Submission service, `modules/submissions`; `tasks.md` of SUB-004

## Spec and plan

- Spec: `.docs/specs/03-submission/realtime-result/spec.md`
- Plan: `.docs/specs/03-submission/realtime-result/plan.md`
- Tasks: `.docs/specs/03-submission/realtime-result/tasks.md`
- Spec status at start: Approved

## Questions clarified

| Question                                                                                                                    | Conclusion                                                                                                                                                                                                                                                                                                                                                      | Source                                                                                                                          |
| --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| SRS v3 step 12 asks for per-test judging progress in real time; SUB-004 only sends a "ready" notification. Change the spec? | Keep the Approved spec. Per-test progress is recorded as "to do later".                                                                                                                                                                                                                                                                                         | Repository owner, 2026-11-16                                                                                                    |
| SRS v3 step 10a asks for a submit rate limit with a wait time; SUB-001/002 say no rate limit.                               | Keep the Approved specs. Rate limit is "to do later".                                                                                                                                                                                                                                                                                                           | Repository owner, 2026-11-16                                                                                                    |
| Is the Gateway half of SUB-004 still missing?                                                                               | No. `main` (c9ab695) already has the allow-list parser, owner-only forwarding, handshake hardening, close at `exp`, and the five-connection Redis lease under the Gateway's new layered folders. The old local branch `fix/sub-004-gateway-socket` targets deleted paths (`apps/api-gateway/src/realtime/`), so its Gateway code commits were not carried over. | `apps/api-gateway/src/presentation/realtime/submission-realtime.gateway.ts`, `infrastructure/redis/submission-socket-leases.ts` |

## What was done

1. Carried over five Submission test/docs commits from `fix/sub-004-gateway-socket` onto a branch cut
   from the new `main`: save-before-publish ordering assertions, unknown `submissionId` in a Run
   result, rejection of identity/judge fields in the Submit body, the SUB-001/SUB-004 task sync, and
   the 2026-11-04 verification record. One import conflict in `judge-result.consumer.spec.ts` was
   resolved by keeping the `@submission/...` alias imports from `main`.
2. `RedisRealtimeAdapter` now registers an `error` listener on its Redis client. Before this, a Redis
   outage made ioredis print an "Unhandled error event" line on every reconnect attempt, which broke
   the "one `warn`, no spam" rule of the spec. The listener shares the same once-until-recovery flag
   as the publish failure path, and the message carries no payload or connection string.
3. Ticked the SUB-004 tasks that now have test evidence on `main` (lease, close at expiry,
   resubscribe after outage, owner isolation, sixth connection). Each tick names its test file.

## Why these choices

- The listener lives in the adapter, not in `submissions.module.ts`, so the anti-spam flag has one
  owner and the behaviour is unit-testable through the existing `RedisRealtimeClient` interface.
- Gateway code from the old branch was dropped rather than rebased: `main` implements the same
  requirements in the layered structure from the 2026-10-31 Gateway restructure, with its own tests.

## How the feature works

1. Judge publishes `judge.result`; `JudgeResultConsumer` hands it to the Run or Submit apply use case.
2. The use case saves the terminal result first. Only if the row actually changed state does it call
   `RealtimePort.publishResult(ownerId, notification)`.
3. `RedisRealtimeAdapter` publishes `{ userId, notification }` on `REDIS_CHANNELS.submissionResults`.
   The notification is exactly `submissionId` (public id), `kind`, `status`, `ready: true`.
4. The Gateway subscriber parses the envelope against an allow-list and emits `submission.result`
   with only `notification` to sockets whose token `sub` equals `userId`.
5. The client reads the full result over HTTP. Realtime only says "read again".
6. Failure path: if Redis is down, the adapter swallows the error, logs one `warn`, and the use case
   still reports the result as applied. Nothing is queued for later, so there is no burst on recovery.

Documentation points required by the tasks:

- **Minimal contract.** Output fields (`stdout`, `stderr`, `compileOutput`, `error`, score, test
  data) are excluded from realtime because the channel is best-effort and fan-out; the HTTP detail
  endpoint is the only place that applies ownership checks to result content.
- **Polling is the guarantee.** PostgreSQL is the source of truth. A missing notification means
  nothing; clients must poll while a record is pending. Realtime only shortens the wait.
- **Token validity.** Access tokens are stateless (ID-001). The socket closes at the token's `exp`
  and releases its lease; logout or account lock does not revoke a still-valid token.

## Configuration

No configuration change.

## Verification

- Commands run and their results:
  - `pnpm exec jest apps/submission-service apps/api-gateway/src/{presentation,application}/realtime apps/api-gateway/src/infrastructure/redis --runInBand`: 34 suites passed, 2 skipped (integration, no `TEST_DATABASE_URL`); 185 tests passed before the new test, adapter suite 3/3 after.
  - `pnpm typecheck`: clean.
  - `pnpm lint`: clean.
  - `pnpm format:check`: fails on 57 files that are already unformatted on `main` (Identity, docs); files changed on this branch pass `prettier --check`.
- Not verified:
  - Real Redis stop/restart with a live Submit (AC-006, AC-014) — unit evidence only.
  - Multi-session delivery for one learner (AC-013) has no dedicated Gateway test yet.
  - Client-side behaviours (5-second polling, reconnect, silence handling) belong to the frontend.

## Remaining

- Not done (to do later):
  - Tell the frontend about the reduced notification payload (breaking change).
  - Gateway test for multiple sessions of one learner; log-content test on the Gateway.
  - FR/SR/AC traceability sign-off and the `Implemented` status change (needs review).
  - SRS v3 items outside the Approved spec: submit rate limit, per-test real-time progress.
- Risks: `tasks.md` ticks for Gateway items rely on tests written by another contributor on `main`.
