# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Mandatory process (read first)

`AGENTS.md` is only a map; the binding process is `.docs/agent/working-agreement.md`. Before editing
product code: confirm an **Approved** `spec.md` (under `.docs/specs/`) plus `plan.md`/`tasks.md`,
list and settle open questions with the user (never fill gaps with assumptions), and after the work
write a worked entry at `.docs/worked/<service>[/<module>]/YYYY-MM-DD-short-name.md`
(template is in the working agreement). Precedence: architecture + ADRs + Approved spec > plan >
tasks. If they conflict with code, stop and report; do not change requirements or architecture
yourself. Definition of done: `.docs/specs/00-system/definition-of-done.md`.

Repository rules that are easy to violate:

- Use `pnpm` only (never npm/yarn/bun or their lockfiles). Run only scripts that exist in `package.json`.
- Never open, read, grep, or source `.env` or secret-bearing `.env.*`; only `.env.example` may be inspected.
- Schema changes go through TypeORM migrations; `synchronize` stays off.
- Do not commit or push unless explicitly asked. Commits follow Conventional Commits (types:
  feat, fix, refactor, perf, docs, test, build, ci, chore, revert), enforced by commitlint.
- `.codegraph/` exists: prefer `codegraph node|query|explore` over grep for locating symbols, and run
  `codegraph sync .` after changing source. Never hand-edit or commit `.codegraph/` contents.
- Project docs/worked entries are largely written in Vietnamese; follow the language of the surrounding file.

## Commands

```bash
pnpm install && pnpm env:setup        # env:setup creates .env from template; fill in secrets
pnpm infra:up                         # postgres + redis + rabbitmq via docker compose
pnpm migration:run:<identity|learning|submission|community>   # also :generate:/:revert:
pnpm dev                              # all six apps; or dev:gateway|identity|learning|submission|judge|community
pnpm build                            # or build:<app>; nest monorepo, webpack
pnpm lint | pnpm typecheck | pnpm format:check
pnpm test                             # jest --runInBand over all *.spec.ts
pnpm exec jest path/to/file.spec.ts --runInBand        # single file
pnpm exec jest -t "test name" --runInBand              # single test by name
pnpm judge:images:build               # sandbox images; Judge needs a Docker daemon
```

Integration specs (e.g. `problem.typeorm-repository.integration.spec.ts`) are skipped unless
`TEST_DATABASE_URL` is set, and it must point at a database whose name ends in `_test` or `_lrn001`.

Lint specifics: `no-explicit-any` is an error, `consistent-type-imports` is enforced, and
`import-x/order` requires alphabetized groups with blank lines between them.

## Architecture

NestJS monorepo (Node 22, pnpm 10): six apps in `apps/` and four libs in `libs/`. Ports: gateway 3000,
identity 3001, learning 3002, submission 3003, judge 3004, community 3005 (`/health`, `/docs` Swagger).

- **api-gateway** is the only public entry; verifies JWT, strips caller-supplied identity headers and
  re-derives them from the token, throttles, adds correlation IDs, and routes `/api/*` to services.
  It owns no persistence.
- **identity / learning / submission / community** each own their own PostgreSQL database (one dev
  server, four DBs), entities and migrations. No cross-service imports of entities, repositories,
  datasources, or migrations, and no cross-DB foreign keys.
- **judge** is a stateless RabbitMQ worker that runs untrusted code in Docker sandboxes (Hexagonal +
  Pipeline). It accepts no client-supplied compiler/filename/Docker args; it has no DB, aggregates, or repositories.
- Sync calls between services are REST (Submission fetches hidden judge data from Learning's internal
  endpoint, guarded by `INTERNAL_SERVICE_SECRET`). Async flow: `judge.request` -> Judge -> `judge.result`
  -> Submission -> `submission.accepted` -> Learning. Exchange/queue/routing names live in `libs/contracts`.
  Consumers are idempotent (terminal-state checks, `lastEventId`) with manual ACK, retry, and dead-letter queues.
- **libs** (`@app/common`, `@app/config`, `@app/contracts`, `@app/shared`) hold only context-neutral
  infrastructure, env validation, message contracts, and utilities. Business entities, use cases, and
  repositories must never go in `libs/`.

Path aliases (`tsconfig.json` and mirrored in `jest.config.ts`): `@app/*` for libs and `@gateway`,
`@identity`, `@learning`, `@submission`, `@judge`, `@community` for each app's `src`. Use aliases, never
`../..` to cross module boundaries. Adding an alias means updating both files.

### Internal architecture differs per service (ADR 0002)

Gateway = Layered; Identity/Submission/Community = Clean Architecture; Learning = DDD + Hexagonal;
Judge = Hexagonal + Pipeline. Code is feature-first under `modules/<feature>/` and grows
`domain/ application/ infrastructure/ presentation/` only when warranted. Dependency direction
(`.docs/architecture/dependency-rules.md`): presentation -> application -> domain, with infrastructure
implementing application/domain ports. Controllers/consumers handle transport only; workflows belong in
use cases. Several modules (e.g. Identity, Community) are still in a transitional, shallower shape.

### Learning `problems` module (the reference implementation of the target shape)

`apps/learning-service/src/modules/problems/` is the most fully layered module:

- `domain/`: `Problem` aggregate, immutable self-validating value objects, domain services
  (publish/content/contract validators), and the outbound `ProblemRepository` port.
- `application/`: one `*.use-case.ts` per operation, exposed through inbound ports in `ports/in/*.port.in.ts`
  (token `..._PORT_IN`) and command objects in `command/`; outbound ports in `ports/out/`
  (transaction runner, topic/tag reader); application errors in `errors/`.
- `infrastructure/`: TypeORM repository, persistence mapper (TypeORM entity <-> aggregate), transaction runner/context.
- `presentation/http/`: controllers, request/response mappers, `ProblemExceptionFilter`, and the
  `@TrustedPrincipal()` decorator / `TrustedPrincipalGuard` that read `x-auth-user-id|roles|permissions`
  (managed use cases take `Principal` as the first `execute()` argument; public reads are only guarded).
- DI wiring is in `problems.module.ts` using `Symbol` tokens from `problem.tokens.ts` and `@Inject(...)`;
  inbound ports are bound with `useExisting` to use-case classes, so controllers depend on the interface and call `execute()`.
  The TypeORM entities in `entities/problem.entity.ts` are the persistence model only; the aggregate is the domain model.
- Domain must not import `@nestjs/*`; domain validators are plain classes registered with `useFactory` in the module.
  Importing `@app/contracts` (`ProblemType`, `SupportedLanguage`) into domain is allowed by the plan.
- `problems.controller.ts` (internal judge-package route) intentionally keeps direct repository access; the plan marks it REUSE/unchanged.
- The managed routes need `x-auth-permissions` from the Gateway; that comes from Identity/Gateway work on `origin/feat/01-identity`
  and is not part of Learning.

Code style from the working agreement: functions/methods start with an active verb (`createSubmission`),
keep code short without hiding intent, use decorators (e.g. `@TrustedPrincipal()`) for cross-cutting
transport values, and prefer `unknown` over `any` (with a one-line reason if `any` is unavoidable).

## Folder map

Use this map to open the right file before searching. Tests are co-located `*.spec.ts` files (Jest
`testRegex: .*\.spec\.ts$`); `test/` holds only cross-module integration specs.

### Repository root

| Path                                        | What lives there                                                                                                                                                                                                                  |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/<app>/src/main.ts`, `<app>.module.ts` | Bootstrap and the app's root Nest module (composition root: config, TypeORM connection, feature modules)                                                                                                                          |
| `apps/<app>/src/modules/<feature>/`         | Feature code; the internal layout differs per app (see below)                                                                                                                                                                     |
| `apps/<app>/src/modules/<app>.entities.ts`  | Entity registry used by both the root module and `database/data-source.ts` (Identity, Learning, Community). Submission lists its entities inline in `submission-service.module.ts` and `database/data-source.ts`                  |
| `apps/<app>/src/database/`                  | `data-source.ts` (TypeORM CLI), `migrations/<timestamp>-<Name>.ts`, migration specs; Identity also has `seed-rbac.ts` and `seed-admin.ts`. Gateway and Judge have no database                                                     |
| `libs/common/src/`                          | `bootstrap.ts` (shared HTTP bootstrap), `health/`, `http/` (request-id middleware, CSRF and browser-credential helpers), `messaging/` (RabbitMQ module and service)                                                               |
| `libs/config/src/`                          | `environment.ts` (Zod env schema per service), `database.config.ts` (`databaseOptions()`)                                                                                                                                         |
| `libs/contracts/src/`                       | `messaging.constants.ts` (`RABBIT_EXCHANGES`, `RABBIT_QUEUES`, `RABBIT_ROUTING_KEYS`, `REDIS_CHANNELS`), `judge.contracts.ts` (languages, problem types, statuses), `submission.contracts.ts`, `auth.contracts.ts` (cookie names) |
| `libs/shared/src/`                          | Context-neutral utilities (`output-normalizer.ts`)                                                                                                                                                                                |
| `docker/`                                   | `Dockerfile` (app images), `judge/Dockerfile.worker` and `judge/{c,cpp,java,python}/` sandbox images, `postgres/init-databases.sh` (creates the four DBs), `swagger/` (VPS Swagger)                                               |
| `scripts/setup-env.mjs`                     | `pnpm env:setup`                                                                                                                                                                                                                  |
| `review/`                                   | Gitignored local review notes; not a source of truth                                                                                                                                                                              |
| `dist/`                                     | Build output; never edit                                                                                                                                                                                                          |

### `.docs/`

| Path                                 | What lives there                                                                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `agent/working-agreement.md`         | The binding process                                                                                                                  |
| `architecture/`                      | `system-architecture.md`, `dependency-rules.md` (what each layer may import), `service-architectures.md`, one `<service>.md` per app |
| `adr/`                               | `0002` (in force) supersedes `0001`                                                                                                  |
| `specs/00-system/`                   | Cross-cutting specs: service boundaries, communication, database strategy, roles and permissions, judge security, definition of done |
| `specs/<NN-service>/<feature>/`      | `spec.md`, `plan.md`, `tasks.md` (`01-identity`, `02-learning`, `03-submission`, `04-judge`, `05-community`)                         |
| `specs/gateway/<service>/<feature>/` | Gateway-side spec and plan for exposing that feature                                                                                 |
| `specs/templates/`                   | `spec.template.md`, `plan.template.md`, `tasks.template.md`                                                                          |
| `pm/plan/<service>/<module>/`        | Module design docs, one folder per module                                                                                            |
| `guides/frontend-api.md`             | Frontend integration guide                                                                                                           |
| `worked/<service>/<module>/`         | Worked entries                                                                                                                       |

Spec feature names do not map one-to-one to code modules: `02-learning/test-cases` is implemented
inside `modules/problems` and `chapters` inside `modules/courses`, while `assignments`,
`enrollments`, `recommendation` and `self-study` have specs (some also have migrations) but no
module code yet.

### api-gateway (Layered, no `modules/`)

```text
apps/api-gateway/src/
├── presentation/                                may use application/, never infrastructure/
│   ├── controllers/gateway-proxy.controller.ts  catch-all /api/* proxy
│   ├── middleware/gateway-auth.middleware.ts    verifies the session, rewrites x-auth-* headers
│   ├── guards/gateway-throttling.ts
│   └── realtime/submission-realtime.gateway.ts  Socket.IO namespace /submissions
├── application/
│   ├── proxy/gateway-proxy.constants.ts         route prefix -> service table (edit to expose a prefix)
│   ├── proxy/gateway-proxy.service.ts           request forwarding
│   ├── auth/gateway-session.service.ts
│   └── realtime/                                submission result parsing and dispatch
└── infrastructure/
    ├── identity/identity-session.client.ts      HTTP client to Identity
    └── redis/                                   submission-result subscriber, socket leases
```

### identity-service (Clean Architecture, partially aligned)

```text
apps/identity-service/src/modules/
├── identity.entities.ts
├── auth/       login, refresh, logout, Microsoft (MSAL) login, password reset, account import
├── profiles/   profile and avatar
├── rbac/       roles and permissions; domain/permission-catalog.ts is seeded by database/seed-rbac.ts
└── users/      user management; the User entity is users/infrastructure/persistence/user.entity.ts
```

Each module has `domain/`, `application/`, `infrastructure/`, `presentation/`, a `<feature>.module.ts`,
and an `index.ts` barrel in every folder. Identity's own conventions:

- Use cases are grouped per file (`auth/application/use-cases/auth.use-cases.ts`,
  `profiles/application/profile.use-cases.ts`, `rbac/application/use-cases.ts`). Ports are in
  `application/ports.ts`, or `auth/application/ports/*.ports.ts`.
- `infrastructure/` subfolders are named by technology: `persistence/` (TypeORM `*.entity.ts` and
  `*.repository.ts`), `security/` (Argon2, JWT), `redis/` and `memory/` (auth-flow store),
  `microsoft/`, `brevo/` (mail), `account-import/` (XLSX parser), `storage/` (R2 avatars).
- `presentation/` holds `*.controller.ts`, `*.dto.ts`, `*-failure.filter.ts` (error to HTTP
  mapping), guards (`rbac.guard.ts`, `account-import.guard.ts`) and `auth-cookie.ts`.

### learning-service (DDD + Hexagonal)

```text
apps/learning-service/src/
├── infrastructure/persistence/transaction-storage.ts   transaction context shared by modules
└── modules/
    ├── learning.entities.ts
    ├── problems/   problems, test cases, harnesses, internal judge package
    ├── courses/    courses and chapters
    └── progress/   per-user progress, fed by submission.accepted
```

Every Learning module uses this layout; a folder exists only when it has code:

```text
modules/<feature>/
├── <feature>.module.ts         DI wiring: binds port tokens to use cases and adapters
├── <feature>.tokens.ts         Symbol tokens (problem.tokens.ts, course.tokens.ts, progress.tokens.ts)
├── entities/*.entity.ts        TypeORM persistence model only
├── domain/                     no @nestjs/* or TypeORM imports
│   ├── *.aggregate.ts          (progress/ uses plain domain files)
│   ├── value-objects/  services/  errors/
│   └── repositories/*.repository.port.out.ts
├── application/
│   ├── ports/in/<operation>.port.in.ts      one inbound port per operation
│   ├── ports/out/*.port.out.ts              transaction runner, readers of other modules
│   ├── use-cases/<operation>.use-case.ts    one class per operation, implements its port
│   └── command/  results/  models/principal.ts  errors/  services/
├── infrastructure/
│   ├── persistence/            *.typeorm-repository.ts, *.persistence-mapper.ts, transaction runner/context
│   └── problems/ | readers/    adapters for out-ports (in courses/ and progress/)
├── presentation/
│   ├── http/                   public-*.controller.ts, managed-*.controller.ts, dto/, mappers/, filters/, decorators/, guards/
│   └── messaging/              RabbitMQ consumers (progress.consumer.ts)
└── testing/                    fakes, DB helpers and factories for specs (also inside some layers)
```

- One operation keeps the same name across layers, e.g. `publish-course`:
  `ports/in/publish-course.port.in.ts`, `use-cases/publish-course.use-case.ts`, and a method in
  `presentation/http/managed-courses.controller.ts`.
- `courses/` and `progress/` keep an `index.ts` in each folder; `problems/` does not yet.
- `problems/problems.controller.ts` and `internal-service.guard.ts` serve the internal judge-package
  route that Submission calls.
- Modules reach each other only through out-ports; courses reads problems through
  `courses/infrastructure/problems/problem-catalog.adapter.ts`.

### submission-service (Clean Architecture + Event-Driven)

```text
apps/submission-service/src/modules/
├── submissions/
│   ├── domain/             submission-record.ts, submission-history.ts
│   │   └── ports/*.port.ts repository, judge-job, accepted-event (+ outbox), learning-judge-package, realtime
│   ├── application/        one *.use-case.ts per operation, flat: submit-code, apply-run-judge-result,
│   │                       apply-submit-judge-result, list-submission-history, get-submission-detail,
│   │                       expire-stale-submissions, relay-accepted-events
│   ├── infrastructure/     persistence/ (entities, TypeORM repository, accepted-event outbox),
│   │                       messaging/ (rabbit-*.adapter.ts), http/ (Learning judge-package client),
│   │                       realtime/ (Redis publish), scheduling/ (watchdog, outbox relay)
│   └── presentation/       submissions.controller.ts, judge-result.consumer.ts (+ parser), dto/, decorators/
└── run-code/               application/run-code.use-case.ts, presentation/run-code.controller.ts, dto/
```

Submission's ports predate the `.port.in` / `.port.out` naming rule and are named
`domain/ports/*.port.ts`.

### judge-service (Hexagonal + Pipeline, stateless)

```text
apps/judge-service/src/modules/judge/
├── judge.consumer.ts               driving adapter: consumes judge.request
├── judge.engine.ts                 orchestrator / pipeline
├── compiler-error.parser.ts
├── runners/                        language-runner.ts (port), {c,cpp,java,python}.runner.ts, runner.registry.ts
└── sandbox/docker-sandbox.executor.ts
```

### community-service (Clean Architecture target, still shallow)

```text
apps/community-service/src/modules/
├── community.entities.ts
└── posts/   posts.controller.ts, posts.service.ts (uses TypeORM directly), posts.module.ts,
             dto/, entities/ (post, comment, reaction, bookmark, report)
```

A new non-trivial workflow adds `domain/ application/ infrastructure/ presentation/` inside its
feature instead of growing `posts.service.ts`.

### Realtime result path across apps

Judge publishes `judge.result` → Submission `presentation/judge-result.consumer.ts` → use case →
`infrastructure/realtime/redis-realtime.adapter.ts` publishes on `REDIS_CHANNELS.submissionResults`
→ Gateway `infrastructure/redis/submission-result.subscriber.ts` → `application/realtime/` →
`presentation/realtime/submission-realtime.gateway.ts` → browser.

### The `@/` alias is overloaded

`@/` resolves to different apps depending on the rest of the path (`tsconfig.json`; Jest mirrors it
in `moduleNameMapper`, specific patterns first):

- `@/modules/{courses,problems,progress}/*` and `@/infrastructure/persistence` → learning-service
- `@/application/proxy/*`, `@/application/realtime` and `@/infrastructure/redis` → api-gateway
- every other `@/*` path → identity-service

A new Learning module `modules/foo` therefore needs a new `@/modules/foo/*` entry in both files;
without it, `@/modules/foo/...` silently resolves into Identity. Submission, Judge and Community
have no `@/` mapping: use `@submission/...`, `@judge/...` or `@community/...`, or add and verify a
mapping first as the working agreement requires.

### Where new code goes

| Change                  | Location                                                                                                                                                                                                                                                                     |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New Learning operation  | `ports/in/<op>.port.in.ts`, `use-cases/<op>.use-case.ts`, a controller method, `dto/` and `mappers/`; bind the token in `<feature>.module.ts`                                                                                                                                |
| New TypeORM entity      | Learning and Community: `modules/<feature>/entities/`; Identity and Submission: `infrastructure/persistence/`. Register it in `<app>.entities.ts` (Submission: the module and data-source lists) and in `TypeOrmModule.forFeature`, then `pnpm migration:generate:<service>` |
| New RabbitMQ message    | Names in `libs/contracts/src/messaging.constants.ts`, payload types in `libs/contracts/src/*.contracts.ts`                                                                                                                                                                   |
| New public route prefix | `apps/api-gateway/src/application/proxy/gateway-proxy.constants.ts`                                                                                                                                                                                                          |
| New env variable        | `libs/config/src/environment.ts` and `.env.example`                                                                                                                                                                                                                          |
| New spec                | `.docs/specs/<NN-service>/<feature>/`, starting from `.docs/specs/templates/`                                                                                                                                                                                                |
| Module design doc       | `.docs/pm/plan/<service>/<module>/`                                                                                                                                                                                                                                          |
| Worked entry            | `.docs/worked/<service>/<module>/YYYY-MM-DD-short-name.md`                                                                                                                                                                                                                   |
