# BKPractice Backend

NestJS monorepo foundation for BKPractice, an academic Online Judge and learning platform. The
backend contains five bounded-context services and one public API Gateway. `STUDENT`, `LECTURER`,
and `ADMIN` are RBAC roles owned by Identity, not services.

## Architecture

Detailed system, service and dependency decisions are documented in
[`.docs/architecture`](.docs/architecture/system-architecture.md), with accepted decisions in
[`.docs/adr`](.docs/adr/0001-service-specific-internal-architectures.md).
Future features follow the [Spec-Driven Development workflow](.docs/specs/README.md) before
implementation begins. The required step order is the
[working agreement](.docs/agent/working-agreement.md): spec, plan, clarify open questions, then
record finished work under `.docs/worked/`.

```text
Web / Mobile -> API Gateway -> Identity
                         |---> Learning <--- submission.accepted
                         |---> Submission -> judge.request -> RabbitMQ -> Judge -> Docker sandbox
                         |                                      ^              C/C++/Java/Python
                         |                                      `-- judge.result
                         `---> Community
```

Synchronous service-to-service calls use REST. Judge processing and accepted-progress updates use
RabbitMQ. Each stateful service owns its PostgreSQL database and entities; there are no
cross-database foreign keys.

## Repository layout

```text
apps/
  api-gateway/          Public routing, JWT verification, throttling and correlation IDs
  identity-service/     Authentication, users, profiles and RBAC
  learning-service/     Problems, courses, classes, assignments and progress
  submission-service/   Run/submit lifecycle, history and realtime results
  judge-service/        Stateless sandbox execution worker
  community-service/    Posts, comments/replies, likes, bookmarks and reports
libs/
  common/               HTTP bootstrap, health and RabbitMQ infrastructure
  config/               Environment validation and database config helpers
  contracts/            Message payloads and messaging topology names
  shared/               Small context-neutral utilities
docker/
  judge/                Worker and C/C++/Java/Python sandbox images
  postgres/             Development database bootstrap
```

Business entities remain inside their owning application. `libs` contains no shared TypeORM
entities or business repositories.

## Requirements

- Node.js 22 or newer (developed with `v22.23.2`)
- pnpm 10 (developed with `10.33.0`)
- Docker Engine with Compose v2
- Linux is recommended for the Docker-based judge worker

## Installation and environment

```bash
cd bkpractice-backend
pnpm install
pnpm env:setup
```

Replace every placeholder password/secret in `.env`. Startup validates configuration per service;
JWT and internal-service secrets must contain at least 32 characters. Production must use unique,
random secrets and database credentials.

Important variables are grouped as follows:

| Group         | Variables                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------------ |
| App           | `*_PORT`, `NODE_ENV`, `LOG_LEVEL`, `CORS_ORIGINS`                                                      |
| Database      | `*_DATABASE_URL`, `POSTGRES_USER`, `POSTGRES_PASSWORD`                                                 |
| JWT           | `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL`                         |
| RabbitMQ      | `RABBITMQ_URL`, `RABBITMQ_USER`, `RABBITMQ_PASSWORD`                                                   |
| Redis         | `REDIS_URL`                                                                                            |
| Internal REST | `LEARNING_INTERNAL_URL`, `INTERNAL_SERVICE_SECRET`                                                     |
| Judge         | `JUDGE_WORKSPACE_ROOT`, `JUDGE_DOCKER_WORKSPACE_ROOT`, `JUDGE_MAX_OUTPUT_BYTES`, `JUDGE_DOCKER_BINARY` |

## Development infrastructure

```bash
pnpm infra:up
pnpm infra:logs
pnpm infra:down
pnpm compose:config
```

Development runs one PostgreSQL server containing four independently owned databases:

- `bkpractice_identity`
- `bkpractice_learning`
- `bkpractice_submission`
- `bkpractice_community`

Redis is ephemeral and currently stores short-lived submission results for realtime delivery. It
is not used as a business database. RabbitMQ Management is available at
<http://localhost:15672> using the credentials from `.env`.

## Migrations

Run the checked-in baseline migrations after infrastructure is healthy:

```bash
pnpm migration:run:identity
pnpm migration:run:learning
pnpm migration:run:submission
pnpm migration:run:community
```

Generate or revert per bounded context:

```bash
pnpm migration:generate:identity
pnpm migration:revert:identity
pnpm migration:generate:learning
pnpm migration:revert:learning
pnpm migration:generate:submission
pnpm migration:revert:submission
pnpm migration:generate:community
pnpm migration:revert:community
```

`synchronize` is always disabled. Migration commands load `.env`, TypeScript, and path aliases
without requiring compiled output.

After migrations, seed the RBAC catalog so Identity issues `course:*`, `problem:*` and other
feature permissions (the catalog is seeded by a script, not by a migration):

```bash
pnpm seed:identity:rbac
```

## Running services

Start Gateway, Identity, Learning, Submission, and Judge for local development:

```bash
pnpm dev
```

Start Community separately with `pnpm dev:community` when you need it.

Or run one of the default applications:

```bash
pnpm dev:gateway
pnpm dev:identity
pnpm dev:learning
pnpm dev:submission
pnpm dev:judge
```

Build/start containers for all applications with the optional Compose profile:

```bash
pnpm judge:images:build
pnpm apps:up
```

The judge worker requires access to a Docker daemon. Compose mounts the Docker socket and maps
`.judge-workspaces` to the same host path used by nested sandbox containers. On Linux the worker
must run as UID 1000 (the sandbox user) and refuses to start otherwise; create `.judge-workspaces`
owned by UID 1000 and set `DOCKER_GID` to the group that owns the Docker socket. Sandbox containers
carry the label `bkpractice.judge.sandbox=1`; after a worker crash, with no worker running, remove
leftovers with `docker rm -f $(docker ps -aq --filter label=bkpractice.judge.sandbox=1)`. Treat Docker socket
access as privileged operational infrastructure and never expose the Judge HTTP port publicly in
production.

## Ports, health, and Swagger

| App         | Port | Health                         | Swagger                      |
| ----------- | ---: | ------------------------------ | ---------------------------- |
| API Gateway | 3000 | <http://localhost:3000/health> | <http://localhost:3000/docs> |
| Identity    | 3001 | <http://localhost:3001/health> | <http://localhost:3001/docs> |
| Learning    | 3002 | <http://localhost:3002/health> | <http://localhost:3002/docs> |
| Submission  | 3003 | <http://localhost:3003/health> | <http://localhost:3003/docs> |
| Judge       | 3004 | <http://localhost:3004/health> | <http://localhost:3004/docs> |
| Community   | 3005 | <http://localhost:3005/health> | <http://localhost:3005/docs> |

For the current production API origin, browser authentication flow, and public
Swagger page, see the [frontend integration guide](.docs/guides/frontend-api.md).
The VPS Swagger configuration is in [docker/swagger](docker/swagger/README.md).

The gateway is the only intended public entry point. It routes `/api/auth|users|profile|roles` to
Identity, `/api/problems|courses|assignments|classes` to Learning, `/api/submissions|run` to
Submission, and `/api/community` to Community. It removes caller-supplied identity headers and
replaces them with values derived from the verified access token.

## RabbitMQ topology

| Exchange                | Queue                          | Routing key           | Consumer   |
| ----------------------- | ------------------------------ | --------------------- | ---------- |
| `bkpractice.judge`      | `judge.requests`               | `judge.request`       | Judge      |
| `bkpractice.submission` | `submission.results`           | `judge.result`        | Submission |
| `bkpractice.learning`   | `learning.submission.accepted` | `submission.accepted` | Learning   |

All exchanges are durable direct exchanges. Messages are persistent and use confirm channels,
manual ACK, bounded retry (`x-retry-count`) and dead-letter queues under
`bkpractice.dead-letter`. Submission terminal-state checks and Learning `lastEventId` handling make
the current consumers idempotent for redelivery.

## Judge design and security

`LanguageRunner` has whitelisted implementations for C (`gcc`), C++ (`g++`), Java
(`javac`/`java`), and Python (`python3`). No client-supplied filename, compiler command, Docker
command, expected output, hidden test, or harness is accepted. Submission obtains hidden judge data
from Learning's protected internal endpoint.

Each execution receives a unique temporary workspace. Docker is spawned with an argument array,
not a shell, and applies no network, one CPU, memory/swap limits, PID limits, all capabilities
dropped, `no-new-privileges`, a read-only root filesystem, bounded output, and a hard timeout.
Workspaces are removed in a `finally` block. The C++ path is the initial POC; FUNCTION/OOP harness
contracts and injection points exist, but production-grade per-language harness generation is a
future feature.

## Quality workflow

```bash
pnpm lint
pnpm lint:fix
pnpm typecheck
pnpm format
pnpm format:check
pnpm test
pnpm test:watch
pnpm test:cov
pnpm build
```

Husky runs `pnpm exec lint-staged` on pre-commit and `pnpm exec commitlint --edit "$1"` on
commit-msg. Staged TypeScript is linted/fixed and formatted; JSON, Markdown, and YAML are formatted.
Commit messages follow Conventional Commits, for example `feat(judge): add cpp runner`.

## Troubleshooting

- If startup reports invalid environment, compare `.env` with `.env.example`; important secrets do
  not silently fall back.
- If migrations cannot connect, wait for `docker compose ps` to show PostgreSQL healthy and check
  database URLs/passwords.
- If Judge reports Docker unavailable, verify `docker info`, build sandbox images with
  `pnpm judge:images:build`, and check Docker socket permissions.
- If RabbitMQ consumers cannot start, inspect <http://localhost:15672> and confirm the AMQP URL.
- Husky requires a real Git checkout. If dependencies were installed from an exported source tree
  without `.git`, run `pnpm install` again after placing it inside the repository.

## Current foundation boundaries

Implemented business slices intentionally remain narrow: registration/login/refresh/logout,
published problem listing and internal judge packaging, queued Run/Submit/history/realtime results,
accepted progress updates, and basic post/comment/reply/like operations. Full lecturer/admin CRUD,
permission guards inside every service, assignment scoring, recommendations, bookmarks/reports UI,
moderation workflows, password recovery, email verification, outbox-based exactly-once event
publication, and complete FUNCTION/OOP harness generators are subsequent phases.

### Community Gateway authentication

Gateway and Community require the same private `COMMUNITY_GATEWAY_SECRET` (at least 32 random characters). Set it in each service's runtime environment before starting or restarting either service; the value in `.env.example` is a placeholder. Never put this secret in frontend environment variables. Requests to `/api/community/*` must go through the authenticated API Gateway; direct requests with only `x-auth-user-id` return `401`. Docker exposes port 3005 only on `127.0.0.1`. Keep inter-service traffic private or use TLS when services run on separate hosts. Community still starts separately with `pnpm dev:community`.

### Community Post likes: API change

`POST /api/community/posts/:id/reactions/like` has been removed. Frontend callers must use `PUT` to enable their own like and `DELETE` to disable it. Both return HTTP 200 with `{ liked, likeCount }`; retrying the same operation keeps the requested state. Send no body (an empty object is also accepted); client user IDs, reaction types and counts are rejected.

Hidden posts return 404 for nonauthors on either operation. The author receives 409 when enabling a like or creating a comment on a hidden post, but can disable their own like. Existing likes are preserved when content is hidden. Replies to hidden parent comments return 404. These changes use the existing schema and require no migration. Comment likes remain future feature work. Post detail now includes viewer reaction fields.

### Real PostgreSQL Community checks

With Docker Desktop and the Compose PostgreSQL service running, execute:

```sh
node scripts/test-community-postgres.mjs
```

This uses the development PostgreSQL bootstrap user `bkpractice`, creates a separate random database/role, runs the real Community migration and HTTP integration tests, then removes only those test resources. It does not use application credentials or alter active service data. Coverage includes 20 simultaneous like/unlike requests, hidden-content policies, row-lock races and transaction rollback after a forced database failure. An expected 500 error log appears during the rollback test. The suite is skipped in ordinary pnpm test runs unless the runner supplies its isolated test URL.

### Reaction state in the Post feed

Authenticated `GET /api/community/posts` now includes numeric `likeCount` and boolean `likedByMe` on each Post. The flag belongs to the authenticated caller; it is not client-selectable. Reload this endpoint after like/unlike to read the persisted state. Posts without reactions return `0`/`false`. Counts are aggregated in one additional query for the returned Post IDs, with the paginated response described below.

### Paginated root comments

Authenticated `GET /api/community/posts/:id/comments?page=1&pageSize=20` returns `{ items, page, pageSize, total }`. Defaults are page 1 and size 20; size may be 1..50. Page must be a positive safe integer. Only visible root comments count toward total, ordered oldest first with UUID as a tie-breaker. Each item has `replyCount` counting only replies visible to the caller. A comment author also receives `moderation.status` (`VISIBLE` or `HIDDEN`); other callers do not receive moderation metadata. Hidden Posts return 404 to nonauthors. Out-of-range pages return empty items while preserving total. This endpoint returns roots; use the separate paginated replies endpoint for reply contents. No migration is required.

### Paginated replies

Authenticated `GET /api/community/comments/:commentId/replies?page=1&pageSize=20` reads replies of a root comment and returns `{ items, page, pageSize, total }`. Defaults/limits match root-comment paging. Each item includes its `parentCommentId`, without nested replies or a replyCount. Both the root and its Post must be visible to the caller; missing/inaccessible roots or a reply used as a root return 404. Hidden replies are visible only to their author, who also receives moderation.status. Owning the Post/root does not grant access to another author's hidden reply. No migration is required.

### Community post detail, pagination and own-content changes

Run `corepack pnpm migration:run:community` before restarting Community. The lifecycle migration adds nullable `edited_at` / `deleted_at` to posts/comments and read indexes; existing content is retained. It was verified on an isolated database, not applied automatically to the application database. Reverting it discards deletion/edit markers and can make deleted content visible again.

All routes require the Gateway Bearer token:

| Method | Path                                                   | Result                                              |
| ------ | ------------------------------------------------------ | --------------------------------------------------- |
| GET    | `/api/community/posts?page=1&pageSize=20&scope=GLOBAL` | `{ items, page, pageSize, total }`                  |
| GET    | `/api/community/posts/:id`                             | Post including `likeCount`, `likedByMe`, `editedAt` |
| PATCH  | `/api/community/posts/:id`                             | Updated Post, HTTP 200                              |
| DELETE | `/api/community/posts/:id`                             | Soft delete, HTTP 204                               |
| PATCH  | `/api/community/comments/:id`                          | Updated Comment/reply, HTTP 200                     |
| DELETE | `/api/community/comments/:id`                          | Soft delete, HTTP 204                               |

PATCH body: `{ "content": "Updated content" }`. Post limit 10000, comment limit 5000, after trimming. Empty content, raw HTML outside Markdown code, unsafe inline Markdown links and immutable fields are rejected. No body is required for DELETE; unexpected fields are rejected.

Post feed uses default 20/max 50 per page, ordered `createdAt DESC, id DESC` without pinned priority. Optional filters: `scope`, `problemId`, `courseId`; both target filters together or a target inconsistent with scope produce 400. Out-of-range pages return empty items and the visible total. Frontend must read `response.items` instead of treating the response as an array. Public post projections omit storage flags; authors receive `deletedAt` and `moderation.status`.

Only the author can edit/delete: visible content of someone else gives 403; missing/concealed content gives 404; editing/deleting one's already deleted content gives 409. Deletion preserves comments/replies/likes. Deleted posts disappear from normal reads for everyone and block interactions; deleting a root comment also removes its replies from the visible thread. Deleted replies do not count toward replyCount. Edit does not unhide moderated content. Own-content management lists, restoration, post titles, author enrichment, realtime and full COM-001/002 extraction remain separate work.

### Community release checks

The pre-push and server rollout checklist is in [Community deployment checklist](.docs/pm/plan/community/posts/2026-11-25-deployment-checklist.md). Gateway and Community need the same private COMMUNITY_GATEWAY_SECRET. Their production replacement must follow a successful Community migration; the server-owned bkpractice-deploy helper is not in this repository and must implement that ordering.

Community database tests run automatically in the existing GitHub verification job. The runner uses COMMUNITY_TEST_POSTGRES_CONTAINER and COMMUNITY_TEST_POSTGRES_USER for its CI service container, or local Docker Compose when no container is specified. Every run creates and removes its own database and role. The runner invokes the installed Jest CLI directly, without assuming a system Corepack installation path. Community migration run/revert accept environment-injected configuration even when no physical .env file exists in the migration image.
