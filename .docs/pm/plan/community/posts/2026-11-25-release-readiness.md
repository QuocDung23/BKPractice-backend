# Community release readiness

Authorized by the owner: fix issues identified in the pre-push review. Sources: Approved COM-001/002 specs and plans; approved Gateway boundary and post lifecycle execution notes; Accepted ADR0002 and Community architecture. No product behavior or Approved spec change.

Tasks: preserve local work on feat/community-discussion and integrate fetched origin/main; verify both leaderboard and Community trusted headers coexist; run Community PostgreSQL checks in CI using its PostgreSQL service container and a disposable database/role; make Community migration commands tolerate configuration injected as environment without a physical .env file; document server rollout and rollback limitations. Keep server credentials outside Git, do not inspect real .env, commit, push or deploy. The production bkpractice-deploy helper is server-owned and unavailable in this repository: document the required migration/restart sequence rather than inventing its implementation.

Validation: lint/typecheck/full tests/build, actual PostgreSQL runner in Compose and CI-container modes, YAML parse and clean Git conflict checks. Record actual results and limitations in worked entry.
