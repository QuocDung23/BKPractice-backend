# 2026-11-27 — Quiz XP implementation

- Author: Codex
- Scope: Learning Quiz XP awards and leaderboard aggregation
- Branch: `update/xp-ranking-for-quizz`

## Spec and plan

- Spec: [LRN-009 Quiz 1.7](../../../specs/02-learning/quizzes/spec.md); [XP leaderboard 1.1](../../../specs/02-learning/leaderboard/spec.md).
- Plan: [Quiz plan](../../../specs/02-learning/quizzes/plan.md); [leaderboard plan](../../../specs/02-learning/leaderboard/plan.md).
- Tasks: [Quiz tasks T070–T074](../../../specs/02-learning/quizzes/tasks.md); [leaderboard tasks](../../../specs/02-learning/leaderboard/tasks.md).
- Spec status at start: Approved.

## Questions clarified

| Question                                      | Conclusion                                                                            | Source                     |
| --------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------- |
| Should a Quiz pass before rollout receive XP? | No backfill; a user who passed before rollout cannot earn XP on a later retry.        | Owner response, 2026-11-27 |
| How much XP does a pass award?                | First pass per user + Quiz: EASY 10, MEDIUM 20, HARD 30 based on the passed revision. | Owner approval, 2026-11-27 |

## What was done

Added Quiz difficulty to the Quiz revision and create/update APIs, defaulting to EASY for older
clients and migrated revisions. Quiz clones preserve their source difficulty. Learner Quiz intro and
attempt responses expose the difficulty; finish summaries expose `xpAwarded`.

In `modules/quizzes`, a newly finished passing attempt checks for any earlier pass by the same user
on that Quiz. If none exists, it stores 10/20/30 XP based on its pinned revision. A transaction
advisory lock serializes finishes for the same user + Quiz, and a partial unique index protects the
one-award rule. No past attempts receive XP from the migration.

In `modules/leaderboard`, the period reader combines Quiz awards with existing Problem XP. It keeps
`solved` as the Problem count, adds `quizzesPassed`, and breaks equal XP using the latest award time.
Swagger now describes the added response field. Module documentation was updated under
`.docs/pm/plan/learning/`.

## Why these choices

The existing Quiz completion rule and 90% pass threshold remain the source of truth. Storing XP on
the winning attempt keeps award and finish in the existing Learning transaction; the advisory lock
and database index protect against concurrent retries. Revision difficulty is copied into drafts
and frozen when published, so later edits cannot change XP already awarded. The leaderboard reads
both sources from Learning and does not add a generic reward service or change Submission.

## How the feature works

1. The lecturer sets difficulty when creating a Quiz or edits it while the revision is a draft.
2. Learning persists the published revision difficulty and pins its ID to each new attempt.
3. `POST /api/quiz-attempts/:id/finish` locks the attempt and the user + Quiz award key, then the
   domain computes the existing 90% pass result.
4. For a newly finished pass, the repository checks for a previous passed attempt. If none exists,
   the domain records XP from the pinned revision; the attempt, pass result and award commit in the
   same transaction. Replaying a finished attempt returns its saved award amount.
5. `GET /api/leaderboard` aggregates Problem XP and Quiz awards within the selected period. Failed
   attempts and users with a pre-rollout pass receive no Quiz XP.

## Configuration

No configuration change.

## Verification

- `pnpm typecheck` — passed.
- Targeted ESLint on changed TypeScript files — passed.
- `pnpm build:learning` — passed.
- `pnpm exec prettier --check` on changed documentation — passed.
- `git diff --check` — passed.
- Tests were not run. Migration up/down and API behavior were not checked against PostgreSQL.

## Remaining

- Not done: acceptance tests for no-backfill, in-progress attempts, replays, concurrent passes,
  period boundaries, counts and tie-breaks; PostgreSQL migration up/down; live API inspection.
- Risks: runtime behavior and migration SQL have only been type/lint/build checked. Keep the spec
  Approved and the implementation tasks open until those checks pass.
