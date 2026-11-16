# 2026-11-13 — Rebase compatibility for Quiz progress

- Author: Codex
- Scope: Keep the rebased Quiz branch buildable and include Quiz completion in managed Course reports.

## Spec and plan

- Spec: [Progress 1.1](../../../specs/02-learning/progress/spec.md) and [Quiz 1.6](../../../specs/02-learning/quizzes/spec.md).
- Plan: [Progress plan](../../../specs/02-learning/progress/plan.md) and [Quiz plan](../../../specs/02-learning/quizzes/plan.md).
- Tasks: LRN-006-T036–T042; T042 records the report integration regression.
- Spec status at start: Approved.

## Questions clarified

| Question                                  | Conclusion                                                                                                                                | Source                                        |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| How does a Quiz count in a Course report? | Count it as a Learning Item when the student has a `FINISHED` attempt with `passed=true`; use completion by user + Quiz across revisions. | LRN-006 FR-012/FR-019; LRN-009 pass threshold |
| Does publishing or progress add schema?   | No. Read `chapter_quizzes`, `quizzes`, and `quiz_attempts` through the existing Learning database.                                        | LRN-006 amendment 1.1                         |

## What was done

The managed student Course report now builds the same visible Problem/Quiz structure used by personal
Course progress. It loads solved Problems and passed Quizzes for the roster and feeds typed completion
keys into `CourseCompletionCalculator`. Submission counts remain based on the retained Problem
history. Added a regression for a Quiz-only Course report.

Removed duplicate `createdBy` properties that made the managed Course and Problem list code fail to
compile after rebase. Updated the Identity recipient-controller test fixture for the expanded user
management repository and hasher constructor.

## Why these choices

Course progress is defined over visible Learning Items with equal weight. The report therefore uses
the existing Problem progress and Quiz attempt sources rather than adding a separate progress table
or changing Quiz behavior. The compile fixes remove duplicate copies of existing owner filters; they
do not change authorization behavior.

## How the feature works

1. The report reader loads the managed Course's chapters and currently published, non-deleted
   Problem and Quiz links.
2. The use case loads roster students, solved Problem timestamps, passed Quiz timestamps, and retained
   Problem submission counts.
3. The use case tags completion keys as `PROBLEM:<id>` or `QUIZ:<id>` and the shared calculator
   produces Course and Chapter totals.
4. A Quiz counts as complete after a passed finished attempt; later failed attempts and Quiz revision
   changes do not remove completion.

## Configuration

No configuration change. No database migration or schema change.

## Verification

- `pnpm typecheck`: passed.
- `pnpm build:learning`: passed.
- ESLint on all changed TypeScript files: passed.
- Six targeted Course, Progress, and Quiz suites: 73/73 tests passed.
- Quiz, Progress PostgreSQL, and Course repository integration suites: 70 tests skipped because
  `TEST_DATABASE_URL` is unavailable.
- Identity recipient HTTP test could not run because the sandbox denied listening on
  `127.0.0.1` (`EPERM`).
- `git fetch origin` completed; the remote Quiz branch tip remained `a130007`. The rebased branch is
  based on current `origin/main`, and the Quiz source tree matches the pre-rebase backup exactly.
- CodeGraph was not available in the environment; no `.codegraph/` directory exists.

## Remaining

- The working tree has local compatibility fixes that must be committed before they are included in a
  push.
- Run the skipped database integration suites with the isolated test database before claiming those
  cases verified.
- A `--force-with-lease` push must use a freshly fetched `origin/feat/learning-quiz`; it will be
  rejected if that remote branch advances after this fetch.
