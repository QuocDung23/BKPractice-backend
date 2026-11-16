# 2026-11-16 — JDG-002 language runners: registry and trust boundary

- Author: ngochoai0810 (with Claude)
- Scope: Judge service, `modules/judge` (runners, engine error path)

## Spec and plan

- Spec: `.docs/specs/04-judge/language-runners/spec.md`
- Plan: `.docs/specs/04-judge/language-runners/plan.md`
- Tasks: `.docs/specs/04-judge/language-runners/tasks.md`
- Spec status at start: Approved v1.0 (2026-10-07)

## Questions clarified

| Question                                                                                              | Conclusion                                                                                                                                                                    | Source                                     |
| ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Which toolchain, flags, Java entrypoint and Python check apply?                                       | Fixed by the spec table and D-08.1 to D-08.3; no new decision needed.                                                                                                         | `spec.md`, "Quyết định khi duyệt"          |
| Source size and diagnostic limits?                                                                    | `sourceCode` at most 1 MiB (validated in JDG-001), diagnostics bounded by the JDG-005 output cap.                                                                             | D-08.5                                     |
| What does an unapproved language produce?                                                             | The existing behaviour is kept: `INTERNAL_ERROR`, no sandbox call. Only the error type and message changed. The final verdict policy for invalid requests belongs to JDG-001. | `judge.engine.ts`; JDG-001 tasks T03/T06   |
| Java base image: spec says `eclipse-temurin:21-jdk`, Dockerfile uses `eclipse-temurin:21-jdk-alpine`. | **Open.** Changing either side is a contract change that needs the owner's approval. Not changed here.                                                                        | `docker/judge/java/Dockerfile`, spec table |

## What was done

- Added `UnsupportedLanguageError`. `RunnerRegistry.get` throws it for anything outside the approved
  catalog, and its message never echoes the requested value (the old message interpolated request
  data into the result).
- `JudgeEngine` now copies an error message into `JudgeResult.stderr` only for the two error types
  whose messages are fixed and host-free (`SandboxUnavailableError`, `UnsupportedLanguageError`).
  Any other failure becomes `Judge internal error`, so a filesystem or daemon message carrying a
  host path cannot reach the learner.
- Added `runner.registry.spec.ts`: a table copied from the spec asserts image, source filename,
  compile argv and execute argv for `c`, `cpp`, `java`, `python`, iterating `SUPPORTED_LANGUAGES`
  so a catalog change without a runner fails the test.
- Added engine tests: unapproved language creates no workspace and no container; hostile source and
  stdin leave filename, image and argv unchanged; Python syntax failure stops after the compile
  stage with `COMPILE_ERROR`; unexpected error text does not leak.
- Added `language-runners.integration.spec.ts` (opt-in, real Docker): for each language a valid
  program, a syntax error and a crashing program.

The four runner classes already matched the approved toolchain table, so they were not edited.

## Why these choices

- A typed error instead of a string match lets the engine decide what is safe to expose without
  parsing messages, and gives JDG-001 a stable hook for its validation stage.
- The contract table is duplicated in the test on purpose: the spec says a flag, entrypoint or image
  change is a contract change, so it should require editing a test that names the contract.
- Integration tests go through `JudgeEngine` with the real `DockerSandboxAdapter` (reusing the
  JDG-005 port) rather than calling Docker directly, so they prove the wiring a request really uses.

## How the feature works

1. `JudgeConsumer` receives a `JudgeRequest` and calls `JudgeEngine.judge`.
2. The engine asks `RunnerRegistry` for the runner of `request.language`. An unapproved value throws
   before any workspace exists, and the result is `INTERNAL_ERROR` with a fixed message.
3. The engine writes the source under the runner's trusted filename and runs the runner's fixed
   compile argv in the sandbox with timeout `max(3 × timeLimitMs, 10 000)` ms.
4. A non-zero compile exit is `COMPILE_ERROR` (Python's `py_compile` included); a compile timeout is
   `TIME_LIMIT_EXCEEDED`. Otherwise each test case runs the runner's fixed execute argv.
5. Request data only ever becomes file content or stdin; it never becomes argv, filename or image.

## Configuration

No configuration change.

## Verification

- Commands run and their results:
  - `pnpm exec jest apps/judge-service --runInBand`: 6 suites passed, 44 tests passed; Docker suites skipped.
  - `pnpm exec eslint "apps/judge-service/**/*.ts"`: clean.
  - `pnpm typecheck`: clean.
  - `JUDGE_DOCKER_IT=1 pnpm exec jest apps/judge-service --runInBand` (Docker 29.8.2): 8 suites, 67 tests
    passed, including 12 language-runner cases; no sandbox container left behind.
- Not verified:
  - Image contents and versions (T16) and the missing-image path (T12).

## Remaining

- Not done (to do later): T10 image parity (Java base image decision), T11 diagnostics review with
  real compiler output, T12 missing-image provenance, T16 image/toolchain checks, T17 traceability table,
  T18 full `pnpm lint/test/build`.
- Risks: the Docker suites are opt-in, so a toolchain regression is caught only when someone runs them.
