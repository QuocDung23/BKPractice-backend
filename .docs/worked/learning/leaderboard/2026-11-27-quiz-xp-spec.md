# 2026-11-27 — Quiz XP in the leaderboard spec

- Author: Codex
- Scope: Learning Quiz and leaderboard requirements/planning documents

## Spec and plan

- Spec: [LRN-009 Quiz and question bank](../../../specs/02-learning/quizzes/spec.md), version 1.7; [XP leaderboard](../../../specs/02-learning/leaderboard/spec.md), Quiz XP amendment 1.1.
- Plan: [Quiz plan](../../../specs/02-learning/quizzes/plan.md); [leaderboard plan](../../../specs/02-learning/leaderboard/plan.md).
- Tasks: [Quiz tasks](../../../specs/02-learning/quizzes/tasks.md), T070–T074; [leaderboard tasks](../../../specs/02-learning/leaderboard/tasks.md).
- Spec status at start: Approved.

## Questions clarified

| Question                                      | Conclusion                                                                                                               | Source                                                                              |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Should a Quiz pass before rollout receive XP? | No. Only a first pass completed after rollout can earn XP; an existing pass stays unawarded, including on retry.         | Owner response, 2026-11-27                                                          |
| What award applies to a qualifying pass?      | One award per user + Quiz, across revisions and Course links; EASY 10, MEDIUM 20, HARD 30, based on the passed revision. | Owner request to update the specs based on the preceding recommendation, 2026-11-27 |

## What was done

LRN-009 now requires an immutable difficulty on each published Quiz revision and gives XP for the
learner's first passing attempt after rollout. The finish result reports `xpAwarded`; retries,
failed attempts, later revisions and repeated Course links do not grant more XP. The XP leaderboard
now includes these Quiz awards, keeps `solved` as the programming Problem count, adds
`quizzesPassed`, and breaks equal XP by the latest award time.

The Quiz and leaderboard plans/tasks record the pending implementation work. The spec index now
shows LRN-009's current status and the XP amendment. No application code or migration changed.

## Why these choices

The 90% pass rule and the stable user + Quiz completion identity already exist in LRN-009. Reusing
them makes XP a reward for a completed Quiz rather than for each answer or retry. The 10/20/30 tiers
match Problem XP. Quiz revision difficulty is frozen at publish so later edits cannot change an
award already earned. Existing revisions without difficulty default to EASY for future XP only;
that migration does not create an award. The no-backfill policy follows the owner's choice and
prevents old completion history from changing the ranking retroactively.

Learning owns both Quiz attempts and leaderboard scoring, so the plan keeps the award in Learning
and does not add a Submission/Judge event or a generic reward service.

## How the feature works

After implementation, the flow will be:

1. A learner finishes a Quiz attempt.
2. Learning computes the result from saved answers and applies the 90% threshold.
3. If this is the learner's first qualifying pass after rollout, Learning records one award based
   on the difficulty of the attempt's published Quiz revision and returns its amount as
   `xpAwarded`.
4. The leaderboard adds the award in the period containing the attempt's `finishedAt`. It combines
   Quiz XP with the existing Problem XP and reports the two completion counts separately.
5. Failed attempts, retries, and users who already passed before rollout receive no new XP.

## Configuration

No configuration change.

## Verification

- Commands run and results: inspected the current specs, plans, tasks, Learning architecture and
  related code paths; `git diff --check` passed.
- Not verified: no tests or builds run; no XP implementation or database migration was applied.

## Remaining

- Not done: implement Quiz difficulty persistence, one-time awards, migration, finish response and
  leaderboard aggregation per T070–T074 and the leaderboard task list.
- Risks: Quiz passes completed before rollout do not award XP; existing published revisions map to
  EASY for future awards until revised with an explicit difficulty.
