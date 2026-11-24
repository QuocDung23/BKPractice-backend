# 2026-11-25 - Community pre-push readiness

- Author: Codex
- Scope: integrate latest main, preserve Community work, fix CI verification and migration image compatibility.

## Spec and plan

Approved COM-001/COM-002 specs and plans, approved Gateway boundary and lifecycle execution plans. Release execution plan: `.docs/pm/plan/community/posts/2026-11-25-release-readiness.md`. Community architecture and Accepted ADR0002 remain unchanged. The owner requested corrections before pushing; no Approved spec changed.

## Questions clarified

| Question                                  | Conclusion                                                                                                                                                                                                                   | Source                                  |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Which branch is the merge target?         | Fetched origin/main e8c36bb, containing the new practice XP leaderboard.                                                                                                                                                     | Remote Git refs and user review request |
| May we preserve and integrate local work? | Yes, necessary to the requested pre-push corrections. Created feat/community-discussion, temporarily stashed all tracked/untracked work, fast-forwarded and restored it. No conflicts occurred; stash restoration succeeded. | User request                            |
| Should we change the production helper?   | The helper lives at /usr/local/sbin/bkpractice-deploy on the server, outside this repo. No implementation or server access is available; document its required migration/restart ordering instead.                           | Existing CI workflow                    |
| Which secret is used?                     | Dedicated COMMUNITY_GATEWAY_SECRET for Gateway/Community; keep existing leaderboard INTERNAL_SERVICE_SECRET separate.                                                                                                        | Approved boundary plan and latest main  |

## What changed and how it flows

The feature branch is based on e8c36bb. Gateway retains both the Community private header and leaderboard internal header logic; a regression now verifies the two credentials go only to their corresponding upstreams, stripping forged client headers.

The verify job runs the Community PostgreSQL integration suite before publish. It passes the existing CI service-container ID and ci role to the runner. The runner resolves the published PostgreSQL port, creates a uniquely named database and least-privilege login role, invokes installed Jest directly, and removes those generated resources in finally. Local runs retain the Compose path. Direct Jest resolution removes the Windows-specific assumption about Corepack's installation path.

Community migration run/revert use --env-file-if-exists=.env. The migration image can use injected configuration without requiring a secret-bearing file to be copied into the image. Local .env-based app execution still works. Node flag syntax was checked with an intentionally nonexistent nonsecret file.

README links a rollout checklist covering API compatibility, shared secret, migration image versus runtime image, coordinated replacement and rollback visibility risks. No real environment file was read, and no app data or production resources were changed. The owner subsequently authorized committing and pushing feat/community-discussion; this entry records the verified content prepared for that commit.

## Verification

- Full repository tests: 186 suites passed, 1656 tests passed; 32 suites/424 tests skipped without their dedicated integration configuration.
- Full lint and typecheck passed; all six service builds passed.
- Isolated Community PostgreSQL tests: 70/70 passed in Compose mode and 70/70 in CI container mode, with generated database/role cleanup confirmed.
- Workflow YAML and Compose configuration parsed; script syntax and optional environment-file flag checked.
- Final Git review found no unresolved merge entries. These completed checks are reused for the pre-push step; product source has not changed since verification.
- Restored the approved loopback-only host binding for Community before committing. No real .env file was read or included.

## Configuration

New test-only runner inputs: COMMUNITY_TEST_POSTGRES_CONTAINER and COMMUNITY_TEST_POSTGRES_USER. CI sets these to the service-container ID and ci role; local default bootstrap role remains bkpractice. Runtime variables, service ports, dependencies and lockfile were not changed by this release-readiness slice.

## Remaining deployment boundary

The server must supply the same independently generated Community secret to Gateway and Community and run the new Community migration before replacing the apps. The external production helper, GitHub-hosted execution and production smoke tests cannot be verified locally. Rolling back to code that ignores deleted_at or reverting the migration may reveal soft-deleted content; the checklist describes this explicitly.
