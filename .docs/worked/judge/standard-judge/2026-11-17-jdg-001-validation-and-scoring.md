# 2026-11-17 — JDG-001 standard judge: validation stage, scoring, poison messages

- Author: ngochoai0810 (with Claude)
- Scope: Judge service, `modules/judge` (application use case, validator, engine, consumer)

## Spec and plan

- Spec: `.docs/specs/04-judge/standard-judge/spec.md`
- Plan: `.docs/specs/04-judge/standard-judge/plan.md`
- Tasks: `.docs/specs/04-judge/standard-judge/tasks.md`
- Spec status at start: Approved v1.0 (2026-10-07)

## Questions clarified

| Question                                                                                     | Conclusion                                                                                                                                                                                                                                                    | Source                                                           |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Stop or continue after a wrong test, and how is score computed?                              | Stop at the first wrong test; score is the sum of passed tests' `score`, no scaling, no default.                                                                                                                                                              | D-01, FR-010                                                     |
| What does a successful Run report?                                                           | `ACCEPTED` with `mode=RUN`; expected output may be absent.                                                                                                                                                                                                    | D-02                                                             |
| Which fields are enough to correlate an invalid request?                                     | `executionId`, `submissionId` and a valid `mode`, because `JudgeResult` requires all three. A message missing any of them is treated as uncorrelatable. This reading is mine; the spec says "đủ định danh" without listing `mode`.                            | FR-002, FR-024, `JudgeResult` contract                           |
| Do real requests satisfy the Submit rules (expected output and integer score on every test)? | Yes. Learning's `BuildJudgePackageUseCase` always sets both, and Submission's Run request sends one test with only `stdin`.                                                                                                                                   | `build-judge-package.use-case.ts`, `rabbit-judge-job.adapter.ts` |
| May the Judge keep results in memory to avoid recomputing a redelivered request?             | **Open.** Not implemented. D-07.1 says the Judge keeps no result, so a redelivery after a failed publish is judged again and Submission ignores the duplicate.                                                                                                | D-07, D-07.1                                                     |
| Unparseable JSON: log + ACK + drop (FR-024) or retry then DLQ?                               | **Open deviation.** `RabbitMqService.consume` parses JSON itself and sends a parse failure through its retry (3) then DLQ path. No code runs and retries are bounded, but it is not "ACK and drop". Changing the shared service is outside this spec's scope. | `libs/common/src/messaging/rabbitmq.service.ts`                  |

## What was done

- **Validation stage.** `validateJudgeRequest` checks an untyped payload against the spec's input
  table: safe IDs, mode, problem type, approved language, non-empty source of at most 1 MiB (UTF-8
  bytes), non-empty ordered test cases, at most 100 for Submit, each text field at most 1 MiB,
  Submit tests with expected output and a non-negative integer score, positive finite limits. It
  returns `valid`, `rejected` (still correlatable) or `poison`.
- **Use case.** `ProcessJudgeRequestUseCase` runs validation, then either calls the pipeline, builds
  an `INTERNAL_ERROR` result from the identifiers alone, or returns nothing for a poison message.
- **Consumer.** `JudgeConsumer` now only moves messages: it hands the raw payload to the use case,
  publishes the result, and for a poison message logs one payload-free warning and returns, which
  acknowledges it.
- **Engine fixes.** Removed the `score || 100` fallback, so `ACCEPTED` with score 0 is reported as
  measured. An empty test set can no longer be `ACCEPTED`. Compile diagnostics have the sandbox
  working directory `/workspace/` removed before they go into the result.

A caller sees these differences: malformed requests no longer reach a compiler; a Submit whose tests
all carry score 0 gets score 0 instead of 100; a message that cannot be tied to a submission is
dropped instead of producing a result nobody can match.

## Why these choices

- The validator is a pure function over `unknown`, so it runs before any typed code trusts the
  payload and can be tested without Nest or a sandbox.
- The use case depends on a small `JudgePipeline` interface bound to `JudgeEngine` in the module.
  This keeps the consumer transport-only (working agreement) without rewriting the engine.
- The engine keeps its own empty-test guard although the validator already rejects that case: the
  spec states it as a rule of the evaluation itself (AC-008), not only of input checking.
- `RabbitMqService` was left untouched because three services share it.

## How the feature works

1. Submission publishes `judge.request`; `RabbitMqService` delivers the parsed payload to `JudgeConsumer`.
2. The consumer calls `ProcessJudgeRequestUseCase.execute(payload)`.
3. Validation decides the path:
   - valid: `JudgeEngine` selects the runner, compiles once, runs tests in order, stops at the first
     failure, and returns verdict, counts, score and summed execution time;
   - rejected: an `INTERNAL_ERROR` result with the original identifiers and a fixed message;
   - poison: no result.
4. The consumer publishes the result to `judge.result` with `messageId = executionId`. Only when the
   broker confirms does the handler return, which lets `RabbitMqService` acknowledge the request.
5. Submission stores the result and decides what the learner may see.
6. Failure paths: a publish error rejects the handler, so the request is retried (at most three
   times, then dead-lettered); sandbox failure becomes `INTERNAL_ERROR`; the workspace is disposed
   in every case.

## Configuration

No configuration change.

## Verification

- Commands run and their results:
  - `JUDGE_DOCKER_IT=1 pnpm exec jest apps/judge-service --runInBand`: 11 suites, 109 tests passed (Docker 29.8.2).
  - `pnpm exec eslint "apps/judge-service/**/*.ts"`: clean.
  - `pnpm typecheck`: clean.
  - `pnpm build:judge`: compiled successfully.
- Not verified:
  - Publish failure, redelivery and dead-lettering against a real RabbitMQ broker (T13, T14, T16).
  - End-to-end Submit through Gateway, Submission, Learning and Judge.
  - Full `pnpm lint` and `pnpm test` across the repository on this branch.

## Remaining

- Not done (to do later): T04 (parse-failure policy in the shared messaging service), T13/T14/T16
  broker-level tests, T18 full Definition-of-Done run, FR/AC traceability sign-off.
- Risks: a request re-delivered after a failed publish runs the learner's code again; results are
  expected to be identical but timing figures can differ.
