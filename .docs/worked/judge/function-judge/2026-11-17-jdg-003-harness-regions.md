# 2026-11-17 — JDG-003 function judge: harness requirement and region rules

- Author: ngochoai0810 (with Claude)
- Scope: Judge service, `modules/judge` (validator, engine, harness diagnostics)

## Spec and plan

- Spec: `.docs/specs/04-judge/function-judge/spec.md`
- Plan: `.docs/specs/04-judge/function-judge/plan.md`
- Tasks: `.docs/specs/04-judge/function-judge/tasks.md`
- Spec status at start: Approved v1.0 (2026-10-07)

## Questions clarified

| Question                                                                                                | Conclusion                                                                                                                                                                                      | Source                                                        |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Who defines the callable contract (function name, types, filename)?                                     | Learning. The Judge only requires a harness compatible with the language.                                                                                                                       | D-09.1                                                        |
| How are learner code and harness laid out?                                                              | One source file, harness after the learner code. No multi-file support.                                                                                                                         | D-09.2, FR-013                                                |
| How is a failure attributed?                                                                            | By the region of the reported line: harness region gives `INTERNAL_ERROR`, learner region gives `COMPILE_ERROR` or `RUNTIME_ERROR`; a crash with no line is `RUNTIME_ERROR`.                    | D-09.3                                                        |
| What if the reported line is in another file (a system header, a library module)?                       | The spec does not say. Such a location carries no region information, so it is treated like "no line diagnosed" and attributed to the learner. This reading is mine.                            | FR-007 wording; g++ and CPython output observed on 2026-11-17 |
| Does a STANDARD request use a harness if one is sent?                                                   | No. JDG-001's input table limits `hiddenHarness` to FUNCTION/OOP, so the engine ignores it for STANDARD.                                                                                        | JDG-001 input table                                           |
| A learner leaves a brace open in C. `gcc` reports it at the end of the file, inside the harness region. | **Open.** The literal rule gives `INTERNAL_ERROR` for what is a learner mistake. Implemented as written and covered by a test that documents it; needs the owner's decision on amending D-09.3. | `function-judge.integration.spec.ts`                          |

## What was done

- `validateJudgeRequest` rejects a FUNCTION request whose harness is missing or blank, so it can
  never be judged with STANDARD semantics.
- `JudgeEngine` builds one source file (learner code, blank line, harness) for FUNCTION/OOP and
  remembers how many lines the learner region has.
- New `application/harness-diagnostics.ts` holds four pure functions: find the first compile error
  line, find the innermost crash frame, keep only learner-region compile diagnostics, keep only
  learner-region stack frames. They only trust locations in the runner's own source file.
- The engine uses them to turn a harness-region compile error or crash into `HarnessFailureError`,
  which becomes `INTERNAL_ERROR` with the fixed message `Harness failure`, and to filter
  `compileOutput` and `stderr` so harness source never reaches a result.
- Runtime `stderr` now has the sandbox working directory removed, as compile output already had.

For a caller: a FUNCTION problem is now judged through its harness with errors attributed to the
right side, and a broken harness shows up as a system error instead of blaming the learner.

## Why these choices

- The region logic is text-only and separate from the engine, so it is tested with real compiler
  output samples and reused by OOP in JDG-004.
- Filtering drops whole diagnostic blocks rather than masking words, because GCC and CPython echo
  the offending source line, which for a harness line is the hidden harness itself.
- Locations in other files are ignored after real `g++` output showed an unclosed learner brace
  reported first at line 308 of a system header; comparing that number with the learner region
  would have blamed the harness.

## How the feature works

1. Submission sends a `JudgeRequest` with `problemType=FUNCTION` and Learning's `hiddenHarness`.
2. Validation rejects a missing or blank harness with `INTERNAL_ERROR`.
3. The engine writes the combined file under the runner's filename and compiles once.
4. On a compile failure the first error line decides: harness region means `INTERNAL_ERROR` with no
   diagnostics; otherwise `COMPILE_ERROR` with learner-region diagnostics only.
5. Each test case runs in its own container with the test's `stdin` passed verbatim; the harness
   prints the output that is compared with `expectedOutput`. A mismatch is `WRONG_ANSWER`.
6. On a crash the innermost frame in the source file decides: harness region means
   `INTERNAL_ERROR`; learner region or no frame means `RUNTIME_ERROR` with harness frames removed.

## Configuration

No configuration change.

## Verification

- Commands run and their results:
  - `JUDGE_DOCKER_IT=1 pnpm exec jest apps/judge-service --runInBand`: 13 suites, 158 tests passed
    (Docker 29.8.2), including 22 FUNCTION cases across C, C++, Java and Python.
  - `pnpm exec eslint "apps/judge-service/**/*.ts"`: clean. `pnpm typecheck`: clean.
  - `pnpm build:judge`: compiled successfully.
- Not verified:
  - State isolation between test cases (T17) and a harness that exhausts time or memory (T18).
  - C and C++ crashes cannot be attributed: those toolchains print no line at run time, so every
    such crash is `RUNTIME_ERROR`, as D-09.3 allows.
  - End-to-end with a real FUNCTION problem from Learning.

## Remaining

- Not done (to do later): T17, T18, T19 traceability and full Definition-of-Done run.
- Risks: the unclosed-brace case in C above; a harness that prints learner-controlled text in an
  exception message could still reveal what it chose to print.
