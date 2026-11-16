# 2026-11-12 — Make the question bank shared by default

- Author: Codex, using the approved LRN-009 amendment.
- Scope: Learning/quizzes question visibility and reuse policy.

## Spec and plan

- Spec: [LRN-009 1.5](../../../specs/02-learning/quizzes/spec.md), Approved.
- Plan: [Quiz plan](../../../specs/02-learning/quizzes/plan.md).
- Tasks: [Quiz tasks](../../../specs/02-learning/quizzes/tasks.md), T062.
- Spec status at start: Approved; owner confirmed shared questions as the simpler policy on 2026-11-12.

## Questions clarified

| Question                                       | Conclusion                                                                                                                                                   | Source                                              |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| Are bank questions shared by default?          | Yes, all LECTURER users may find and use shared questions. New question requests default to shared; callers may set `isPrivate: true`.                       | Owner confirmation, recorded in LRN-009 1.5 / Q-001 |
| Can another lecturer edit the source question? | No. Only its owner or ADMIN can revise, delete, restore, or manage the source. Another lecturer can clone it; clones are private and independently editable. | Owner confirmation, FR-002/007/026                  |
| Does Quiz sharing change?                      | No. Quizzes remain private and use their existing per-user grants.                                                                                           | Owner confirmation, LRN-009 1.5                     |
| What happens to existing bank rows?            | Migration adds `is_private` with default false, so existing questions become shared.                                                                         | Approved migration plan in T062                     |

## What was done

Updated Question authorization so shared questions are visible to LECTURER users in bank searches and can be selected, previewed, and used when replacing or publishing a Quiz. Private questions still require owner/admin access or a per-user grant. Mutation use cases continue to check ownership. The existing integration fixture now sets `isPrivate: true` explicitly where it tests private access.

Added the optional `isPrivate` create field, `PUT /api/question-bank/questions/:id/visibility` for owner/admin changes, and the visibility field in managed responses and Swagger. New questions default to shared. Both direct question clones and questions copied while cloning a Quiz are private. Added a forward migration for `quiz_bank_questions.is_private`; it defaults existing rows to shared and does not add a table. Added the exact visibility route to the Gateway allowlist and its route matrix. Updated LRN-009, its plan/tasks, and the Learning and Gateway operations guides.

## Why these choices

The policy follows the owner's request to make the bank usable across the teaching team without sharing each question one by one. The `is_private` flag keeps an opt-out for questions that should stay with their owner. Existing `quiz_question_grants` remain useful for private questions. Clone copies are private so a lecturer can edit their own copy without publishing edits to the shared source. Quiz grants remain separate because the approved change covered the question bank only.

## How the feature works

1. A lecturer sends `POST /api/question-bank/questions`; `isPrivate` is optional and defaults to `false`.
2. The controller forwards the value to `CreateQuestionUseCase`; the Question aggregate stores it on the question root. The owner or ADMIN can later change it with `PUT /api/question-bank/questions/:id/visibility`.
3. Bank list SQL returns shared rows plus the caller's own or granted private rows, applying scope before count and pagination. Detail and use cases apply the same visibility rule.
4. A lecturer may select a visible question in a Quiz. Publishing rechecks question visibility. The source remains editable only by its owner or ADMIN.
5. Clone routes create an independent Question with new option IDs and `isPrivate=true`. Quiz cloning also deep-copies its selected questions as private copies.
6. The database migration adds the visibility column. No data backfill is needed because `DEFAULT false` makes existing rows shared. Rolling the migration back drops this visibility setting; private flags set after migration would be lost.

## Configuration

No configuration change.

## Verification

- `pnpm exec prettier --write` on changed code/docs: pass.
- `pnpm exec eslint` on changed TypeScript files: pass.
- `pnpm build`: pass for all six services.
- `pnpm lint`: repository baseline errors only in `test/account-import.integration.spec.ts:238,241` (`no-unsafe-argument`).
- `pnpm typecheck`: repository baseline errors only in `test/account-import.integration.spec.ts` at lines 236, 238, 241, 348, 383 (`officialName`).
- `git diff --check`: pass.
- Not verified: Automated tests were not run in this change; applying migration and live two-lecturer smoke test remain outstanding.

## Remaining

- Not done: Applying the Learning migration to a target database and smoke testing with two lecturer accounts.
- Risks: Existing questions become discoverable to every LECTURER after the migration; this is the approved default. Quiz access rules remain unchanged.
