# 2026-11-24 - Real PostgreSQL verification

- Author: Codex
- Scope: Execute real HTTP/database checks of existing Community Post interactions, with no product-code changes.

## Spec and plan

- Approved COM-001/002 hidden-content rules and COM-003-FR-005/006/009/012/013.
- Plan: existing hidden-interactions execution plan; `.docs/pm/plan/community/posts/2026-11-24-real-postgres-verification.md`.
- Tasks: focused live-database checklist; larger unfinished feature tasks remain open.
- Spec status at start: Approved. Approved specs unchanged.

## Questions clarified

| Question                                     | Conclusion                                                                                                                              | Source                                  |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Does the owner want real database execution? | Yes, explicitly requested real verification after manual Postman testing.                                                               | Current session                         |
| Which data may be modified?                  | Only a new randomly named test database, dedicated test role and data created in it.                                                    | Stated isolation scope                  |
| Is public Gateway login part of this suite?  | No. Owner manually verified login and normal Community calls. This suite uses the real Community guard with a test internal credential. | Test design and previous manual results |

## What was done

Added `apps/community-service/src/modules/posts/posts.postgres.integration.spec.ts`. Unlike the earlier repository-fake tests, this loads the real PostsModule, real TypeORM repositories and PostgreSQL, runs the checked-in initial migration with synchronize=false, starts a Nest HTTP server on an ephemeral loopback port, and applies the production guard, validation pipe and exception filter. No business methods or repositories are mocked.

Added `scripts/test-community-postgres.mjs`. It generates a random role/database/password, creates the isolated resources through Docker PostgreSQL, passes the temporary URL to the existing pnpm test command and removes exactly those generated resources in finally. It never reads runtime environment files or prints the test password. URL guards prevent the test from targeting ordinary database/user names.

The HTTP helper sends actual network requests; assertions query actual stored rows. Race tests use a separate QueryRunner transaction to hold a hide update, observe PostgreSQL lock waits via pg_stat_activity, then commit and assert the blocked interaction is denied. A temporary AFTER INSERT trigger raises a real database error, proving the inserted reaction is rolled back and a later retry succeeds after removing the trigger.

## Why these choices

The existing Docker PostgreSQL is available and uses the same database engine as the application. A separate database/role avoids modifying the owner's active Community data or relying on application secrets. Actual migration execution tests the unique constraint used by ON CONFLICT DO NOTHING. Actual lock waits and a database-triggered failure validate behavior that repository mocks cannot prove. All code under test remains unchanged.

## How verification works

1. The runner creates an isolated role/database and starts the existing pnpm test script with a temporary URL in the child environment.
2. The test validates the isolated database/user naming, runs the real migration and starts Community HTTP on a random local port.
3. Each test resets only its isolated data and seeds a Post.
4. Requests run against real controllers/services/repositories; SQL assertions verify stored rows.
5. The suite closes connections; the runner drops its generated database and role.

## Configuration

No runtime configuration change. No real .env file was inspected or changed. The runner resolves the published PostgreSQL port through Docker Compose and uses the current development container's bootstrap user `bkpractice`. The test-only child-process variable is `COMMUNITY_TEST_DATABASE_URL`; normal test runs skip this suite when absent. No dependency or migration file was added.

## Verification

Command: `node scripts/test-community-postgres.mjs`.

| Actual scenario                            | Observed result                                                                                                                   |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| 20 concurrent PUT requests by one user     | All 200, liked=true, likeCount=1; exactly one stored reaction                                                                     |
| 20 concurrent DELETE requests              | All 200, liked=false; caller reaction removed, another user's reaction retained                                                   |
| Hidden Post policy                         | Nonauthor PUT/DELETE/comment 404 without count disclosure; author PUT/comment 409; author DELETE 200; other stored like preserved |
| Hidden parent Comment                      | Both author and another user's replies return 404; no reply stored                                                                |
| Hide Post while PUT waits on row lock      | PostgreSQL lock wait observed; hide commits; PUT returns 404; no reaction stored                                                  |
| Hide Post while comment creation waits     | Lock wait observed; hide commits; comment returns 404; no comment stored                                                          |
| Hide parent while reply waits              | Lock wait observed; hide commits; reply returns 404; only root remains                                                            |
| AFTER INSERT trigger raises database error | HTTP 500 without raw database failure in response; reaction count zero; later retry 200 with one stored like                      |

Final result: 8/8 tests passed (38.47 seconds). Expected error output for the intentionally forced rollback case is part of this test, not an unexpected application failure. Both test runs cleaned their generated databases and roles.

First run: 7/8 passed; the parent-lock observer matched SQL text that PostgreSQL may truncate in pg_stat_activity. Replaced that observer with the isolated test application name plus wait_event_type=Lock. Second run passed all 8. No product logic was changed to make tests pass.

- `corepack pnpm typecheck`: passed.
- `corepack pnpm lint`: passed.
- Build: N/A, only test/runner/documentation files added; runtime source is unchanged.
- CodeGraph: N/A, no configured `.codegraph/` directory.

## Remaining

- This verifies current Post likes/comments, not unfinished Comment reactions, full feed projections or soft deletion.
- Gateway JWT/CSRF integration remains a separate boundary; the owner's real login/Postman flow already exercised normal public calls.
- The runner requires Docker Desktop running, Node with bundled Corepack, the repository dependencies and the development PostgreSQL container. It can be rerun with `node scripts/test-community-postgres.mjs`.
- Existing unrelated edits and active service data are preserved. No commit or push was created.
