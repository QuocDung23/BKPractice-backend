# 2026-11-17 — JDG-004 OOP judge: harness requirement and verification

- Author: ngochoai0810 (with Claude)
- Scope: Judge service, `modules/judge` (validator, tests)

## Spec and plan

- Spec: `.docs/specs/04-judge/oop-judge/spec.md`
- Plan: `.docs/specs/04-judge/oop-judge/plan.md`
- Tasks: `.docs/specs/04-judge/oop-judge/tasks.md`
- Spec status at start: Approved v1.0 (2026-10-07)

## Questions clarified

| Question                                                                                                                           | Conclusion                                                                                                                                                                                                                       | Source                          |
| ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Who defines the class contract and the operation syntax inside stdin?                                                              | Learning. The Judge passes stdin verbatim and never parses it.                                                                                                                                                                   | D-10.1, FR-008                  |
| File layout and error attribution?                                                                                                 | Same as JDG-003: one file, harness after the learner code, attribution by the region of the reported line.                                                                                                                       | D-10.2, D-10.4                  |
| What state may survive between test cases?                                                                                         | No process state: each test runs in its own container. Files in the request's workspace are shared between its test cases, which the sandbox spec approved.                                                                      | D-10.3; JDG-005 D-11.4          |
| A learner omits a method the contract requires. The harness is the code that calls it, so the error is reported on a harness line. | **Open.** The literal rule gives `INTERNAL_ERROR` in C++, Java and Python, although the mistake is the learner's. Implemented as written and covered by a test that documents it; needs the owner's decision on amending D-10.4. | `oop-judge.integration.spec.ts` |
| Is there an OOP contract for C?                                                                                                    | Not exercised. C has no classes; the tests cover C++, Java and Python. Which languages an OOP problem enables is Learning's decision.                                                                                            | LRN-001                         |

## What was done

- `validateJudgeRequest` now requires a non-blank harness for every non-STANDARD problem type, so
  an OOP request without one is answered with `INTERNAL_ERROR` and never judged as STANDARD.
- No engine change was needed: the single-file layout, region attribution and harness filtering
  added for JDG-003 already apply to any request that carries a harness. An engine test now pins
  that for `problemType=OOP`.
- Added `oop-judge.integration.spec.ts`. Its contract is a `Counter` class with `inc()` and
  `get()`; stdin is an operation sequence such as `inc inc get`. `get` also reports a static count
  of constructed objects, which stays at 1 in the second test case and so proves that no process
  state carries over.

## Why these choices

- Reusing the JDG-003 mechanism follows D-10.4, which states the rules are the same; a separate OOP
  code path would only duplicate them.
- The process-state check is built into the accepted case rather than a separate test, so the
  normal path fails loudly if containers are ever reused across test cases.

## How the feature works

1. Submission sends `problemType=OOP` with Learning's harness; validation rejects a missing or blank one.
2. The engine writes learner code followed by the harness into the runner's source file and compiles once.
3. For each test case a new container runs the program with the operation sequence on stdin; the
   harness builds the object, applies the operations and prints the observed result.
4. Output is compared with `expectedOutput`; a mismatch is `WRONG_ANSWER`.
5. Compile errors and crashes are attributed by region exactly as in JDG-003, and harness text is
   filtered out of `compileOutput` and `stderr`.

## Configuration

No configuration change.

## Verification

- Commands run and their results:
  - `JUDGE_DOCKER_IT=1 pnpm exec jest apps/judge-service --runInBand`: 14 suites, 178 tests passed
    (Docker 29.8.2), including 17 OOP cases across C++, Java and Python.
  - `pnpm exec eslint "apps/judge-service/**/*.ts"`: clean. `pnpm typecheck`: clean.
  - `pnpm build:judge`: compiled successfully.
- Not verified:
  - A harness or submission that hits the time, memory or output ceiling in an OOP request (AC-004
    relies on the JDG-005 sandbox tests).
  - Reflection/serialization restrictions of D-10.5: nothing in the Judge enforces them; they depend
    on what the runner images contain.
  - End-to-end with a real OOP problem from Learning.

## Remaining

- Not done (to do later): T19 resource-ceiling case, T20 traceability and full Definition-of-Done run.
- Risks: the missing-method attribution above; D-10.5 has no enforcement point in the Judge.
