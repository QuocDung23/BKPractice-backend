# Community rollout checklist

This checklist accompanies the Community discussion changes on feat/community-discussion, based on origin/main e8c36bb. API callers must use paged post responses and explicit PUT/DELETE likes. The production SSH helper `/usr/local/sbin/bkpractice-deploy` lives outside this repository; its current behavior cannot be verified here.

## Before merging

- Include all source, migration, alias, test, configuration-template and documentation changes in the feature commit. Do not commit real environment files, credentials, generated dist/node_modules, or PostgreSQL data.
- Run lint, typecheck, tests and build. CI now runs the 70-case Community PostgreSQL suite on a dedicated temporary database/role in the existing PostgreSQL service container. It does not share test tables with Learning or Submission.
- Review frontend callers: GET posts returns `{items,page,pageSize,total}`; GET detail returns viewer reaction fields; PUT/DELETE `posts/:id/reactions/like` replace POST toggle. PATCH uses `{content}`; DELETE content returns204. Public projections omit isHidden/isPinned; author status is in moderation.

## Required server configuration

- Set one independently generated COMMUNITY_GATEWAY_SECRET of at least32 characters in the server runtime configuration for both Gateway and Community. Do not use the template placeholder and do not put this key in frontend environment variables. Existing INTERNAL_SERVICE_SECRET for leaderboard remains separate.
- Confirm the Community database exists and COMMUNITY_DATABASE_URL is reachable from the migration container and service containers. Docker localhost inside a container is not the PostgreSQL container.
- Keep Community private: Docker peers use `http://community-service:3005`; host binding remains127.0.0.1. Public callers use Gateway only.

## Rollout sequence

1. Obtain the new migration and app images for the same immutable Git commit SHA. The migration target contains source/ts-node; the runtime target contains only compiled runtime output.
2. Using the migration image and the server's existing private Docker network/environment configuration, run `pnpm migration:run:community`. These scripts now tolerate the absence of a physical `.env` when variables are injected into the container. Do not run this command in the runtime image.
3. Require migration success before replacing app containers. Update Gateway and Community together with the same Community secret. Preserve existing leaderboard configuration and routing.
4. Check Gateway/Community health, then use a fresh Bearer session through Gateway to read the paged feed and a detail. Exercise create/edit/comment/like/delete on a dedicated smoke-test post only.
5. Ensure the server-owned deploy helper includes steps2-4 before merging to main, because a main push triggers the existing production workflow automatically. This repository change does not claim that the external helper has been updated.

## Rollback

The additive migration keeps old content and existing child records. Reverting the migration removes edited/deleted markers and may reveal previously deleted content. Rolling back to old app code that ignores deleted_at can also reveal soft-deleted content. Do not treat a simple image rollback as visibility-safe after users have deleted content. Plan rollback with a database backup and a compatible version that still respects deletion.
