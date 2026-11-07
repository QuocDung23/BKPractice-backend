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

Run everything locally:

```bash
pnpm dev
```

Or run one application:

```bash
pnpm dev:gateway
pnpm dev:identity
pnpm dev:learning
pnpm dev:submission
pnpm dev:judge
pnpm dev:community
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
