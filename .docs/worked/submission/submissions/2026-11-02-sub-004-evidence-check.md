# 2026-11-02 — SUB-004 evidence check

- Author: Claude (on `fix/sub-004-gateway-socket`)
- Scope: check the SUB-004 items that PR #22 already implemented against the code and tests, tick
  the ones with evidence in `tasks.md`, and add the one missing assertion (persist before publish).
  No product behaviour changed.

## Spec and plan

- Spec: `.docs/specs/03-submission/realtime-result/spec.md` (SUB-004 v1.0)
- Plan: `.docs/specs/03-submission/realtime-result/plan.md`
- Tasks: `.docs/specs/03-submission/realtime-result/tasks.md`
- Spec status at start: Approved

## Questions clarified

| Question                                                               | Conclusion                                                                                                                                                                                | Source                                 |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Which part first?                                                      | Items implemented in PR #22 but not ticked. Redis lease, the Submission Redis `error` listener and frontend/docs work come later.                                                         | User decision                          |
| The plan names one `ApplyJudgeResultUseCase`; the code has three       | Accepted as one emit point: Run, Submit and the watchdog all call the same `REALTIME_PORT`, bound to one `RedisRealtimeAdapter`. The use case was split during SUB-001/SUB-002.           | Code; noted in `tasks.md`              |
| The port takes `SubmissionRealtimeNotification`, not the contract type | Same four fields; the adapter checks the envelope with `satisfies SubmissionRealtimeEnvelope`, so a drift fails typecheck. The port sits in `domain/ports` like the module's other ports. | Code; noted in `tasks.md`              |
| Clean up stale `submission:result:*` keys?                             | No. Nothing writes them any more and their 300-second TTL has long passed.                                                                                                                | `tasks.md` (the item allowed skipping) |

## What was done

- `apply-run-judge-result.use-case.spec.ts`, `apply-submit-judge-result.use-case.spec.ts`: assert the
  repository write is called before `publishResult` (`invocationCallOrder`). The existing tests only
  checked that both were called.
- `apply-run-judge-result.use-case.spec.ts`: new test for an unknown `submissionId`. It returns
  `not-found`, writes nothing and publishes nothing.
- `judge-result.consumer.spec.ts`: new test that the consumer logs one warning for that `not-found`
  outcome. This backs the `run-code/tasks.md` item about rejecting unknown ids with a warning.
- `run-code/tasks.md`: ticked the architecture-doc item (the doc is ALIGNED since 2026-10-27) and the
  unknown-id item. The watchdog item stays open: the late-result half is covered, but "a duplicate
  request creates a new Run record" has no test yet.
- `tasks.md`: ticked items in Chuẩn bị, Domain, Application, Infrastructure, Hợp đồng sự kiện, Lưu
  trữ, Cơ sở dữ liệu, API, API Gateway, Realtime, Phân quyền, Kiểm thử, Xác minh and Tuân thủ kiến
  trúc, each backed by the evidence below.

Evidence used:

- Domain: no `ioredis`, `@nestjs`, socket or gateway import under `modules/submissions/domain`.
- Port and adapter: `domain/ports/realtime.port.ts`, `infrastructure/realtime/redis-realtime.adapter.ts`
  (connects when `status === 'wait'`, publishes only the envelope, no `set`, swallows errors, one
  payload-free warning until the next success). Test: `redis-realtime.adapter.spec.ts`.
- Use cases publish only after `applyRunResultOnce` / `applySubmitVerdictOnce` return a row; both run
  inside `dataSource.transaction`, so the commit is done before publishing. A duplicate or lost race
  returns `null` and publishes nothing (tested in both specs). The watchdog publishes
  `INTERNAL_ERROR` with the record's `kind` (`expire-stale-submissions.use-case.spec.ts`).
- Contracts: `SubmissionResultNotification` and `SubmissionRealtimeEnvelope` in
  `libs/contracts/src/submission.contracts.ts`; channel name unchanged.
- Gateway: only `GatewayProxyController` (`/api`) has HTTP routes; no repository or Redis write;
  emits `submission.result` with the whitelisted notification (`submission-realtime.gateway.spec.ts`).
- Submission has no `socket.io` or `@nestjs/websockets` import.
- Architecture docs (`submission-service.md`, `api-gateway.md`, `system-architecture.md`) already
  describe realtime port → Redis → Gateway.

## Configuration

No configuration change.

## Verification

- Commands run and their results:
  - `pnpm lint` (eslint on `apps/submission-service` and `apps/api-gateway`): clean.
  - `pnpm typecheck`: passed.
  - `pnpm exec jest apps/submission-service apps/api-gateway --runInBand`: 30 suites, 166 tests passed.
  - `pnpm build:submission`, `pnpm build:gateway`: webpack compiled successfully.
  - Not run in this session: the full `pnpm test` over every app.
- Not verified: anything that needs a running Redis (Redis down / recovery, subscribe retry, Gateway
  warn-and-retry). Those items stay unticked.

## Remaining

Still unticked in `tasks.md`:

- Needs Redis: 5-socket lease and releasing it at `exp`; Gateway warn/retry and re-subscribe after
  recovery; no batch after recovery; record still completes with Redis fully down; sixth connection.
- Tests not written yet: two learners isolated, several sessions of one learner, reconnect after a
  gap, logs without token at the Gateway.
- Client-side behaviour (5-second polling, no conclusion from silence): frontend.
- Non-code: frontend notice, plan-vs-spec confirmation, three docs items, FR/SR/AC traceability,
  out-of-scope check, spec → Implemented through review, "matches plan" check.
