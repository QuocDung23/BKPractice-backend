# Learning Service Architecture

## Selected style

Learning uses **DDD (tactical) + Hexagonal Architecture**, as decided in
[ADR 0002](../adr/0002-revised-service-internal-architectures.md).

Learning is the only application whose hard part is the model itself. Problem Management alone
carries a lifecycle with explicit transitions, publish-readiness invariants spanning type, enabled
languages, per-language contracts, starter code and execution limits, and a vocabulary that behaves
as a real ubiquitous language: Draft, Publish, Hold, Readiness, Visible Example, Hidden Harness.
DDD names how that model is built; Hexagonal names how it is kept free of framework details.

Problem/TestCase, Course, Progress and Recommendation stay inside this one
bounded context. They must not be split into a Problem Service or Recommendation Service.

LRN-009 1.3 (Approved 2026-11-11) bổ sung Quiz/ngân hàng trong cùng Learning, LECTURER quản lý nội dung mình tạo và ADMIN quản lý mọi nội dung. Chính sách này thay ADMIN-only của LRN-008.

Lịch sử LRN-008 (2026-11-07) chuyển Learning sang tự học: `ADMIN` quản lý nội dung, mọi `ADMIN` có thể quản lý nội dung của nhau; Class, Enrollment và Assignment không còn thuộc sản phẩm Learning.

LRN-009 theo SRS v3 (2026-11-08) phục hồi quyền quản lý nội dung cho `LECTURER` trên nội dung họ tạo, giữ `ADMIN` quản lý tất cả, và thêm báo cáo Course cho Giảng viên. Class, Enrollment và Assignment vẫn không thuộc sản phẩm; Quiz tạm giữ. Learning đọc roster và số lượt nộp qua port/HTTP nội bộ, không truy cập DB Identity hoặc Submission.

## The hexagon

```text
                    DRIVING SIDE (inbound adapters)
        ┌──────────────────────────────────────────┐
        │  REST controllers      RabbitMQ consumers │
        └────────────┬─────────────────┬───────────┘
                     │  invoke a use case
        ╔════════════▼═════════════════▼═══════════╗
        ║  APPLICATION — use cases, one per         ║
        ║  meaningful workflow                      ║
        ║  ┌────────────────────────────────────┐   ║
        ║  │  DOMAIN — aggregates, value        │   ║
        ║  │  objects, domain services,         │   ║
        ║  │  lifecycle, repository ports       │   ║
        ║  └────────────────────────────────────┘   ║
        ╚═══╤═══════════╤═══════════╤═══════════╤═══╝
            │ driven ports          │           │
        repository   reference    principal  transaction
            │        reader          │           │
        ┌───▼───────────▼────────────▼───────────▼───┐
        │  TypeORM      TypeORM     Gateway   DataSource │
        │  adapter      adapter     context   runner     │
        └────────────────────────────────────────────┘
                    DRIVEN SIDE (outbound adapters)
```

The value of the port boundary here is concrete, not decorative: publish-readiness rules and
lifecycle transitions become testable without PostgreSQL.

## Tactical DDD vocabulary

Used where an invariant justifies it, never per table:

- **Aggregate root** — a consistency boundary loaded and saved as a unit, e.g. a Problem together
  with its enabled languages, starter code and type-specific contract.
- **Value object** — an immutable value validated on construction, e.g. a slug, execution limits, a
  visible example, a per-language contract.
- **Domain service** — a rule that belongs to no single aggregate, e.g. publish-readiness
  validation shared by publish, management readiness display and preview.
- **Repository** — a driven port expressed in domain terms, implemented by a TypeORM adapter.

Strategic DDD is out of scope. Learning is one bounded context and stays one; there is no context
map, no anti-corruption layer and no second bounded context.

## Module layout

Preferred feature-first growth:

```text
modules/
├── problems/
├── courses/
├── progress/
└── recommendation/
```

A module with real domain behavior adds `domain` (including `domain/repositories` for aggregate
repositories), `application/ports/out`, `application/use-cases`, `infrastructure` and `presentation`.
A module that is still small stays shallow. Test cases, topics, tags, starter code and supported
languages belong to Problems. Chapters stay with Courses. Progress stores personal achievement;
Recommendation reads public Courses and personal progress.

Creating the four layers for a module that has no invariants is prohibited, exactly as under
ADR 0001.

## Dependency direction

```text
presentation -> application -> domain
infrastructure ----implements----^ application/domain ports
```

- Domain imports no NestJS, TypeORM, RabbitMQ, Redis, HTTP or JWT code. It is testable with plain
  constructor calls.
- Application depends only on domain types (including domain repository ports) and its own out ports.
- REST controllers and message consumers are both driving adapters. They call one use case and
  translate its result; they do not implement multi-step workflows.
- TypeORM repositories, internal REST responses and RabbitMQ publishing are driven adapters bound at
  the module composition root.

Relations between Learning-owned tables are valid. References to Identity or Submission are plain
external IDs and never cross-database TypeORM relations.

## Ports

Two kinds of boundary exist inside the hexagon:

- **Driven port** — a port reached by the core, implemented by an infrastructure adapter. Aggregate
  repository ports (e.g. `ProblemRepository`) are declared in `domain/repositories/`; other driven
  ports (e.g. `CourseStructureReader`, `TransactionRunner`) are declared in
  `application/ports/out/`. All driven ports are implemented in `infrastructure/`. Port files use
  `<name>.port.out.ts`; inbound port interfaces use `<name>.port.in.ts` under
  `application/ports/in/`, and controllers inject them through `<NAME>_PORT_IN` tokens. Never
  `<name>.port.ts`.
- **Internal boundary** — a rule or service used only inside the core, with no infrastructure adapter.
  Pure domain rules (e.g. `PublishValidator`, `DifficultyLadder`) live in `domain/services/`;
  application-only services (e.g. Problem authorization) live in `application/services/`. Both keep
  use cases free of framework and infrastructure details.

### When to create a port

Introduce a port only when it isolates a real business boundary, enables a meaningful test seam, or
supports a second implementation. Do not create a port for every table (repository per table is
prohibited), and do not add empty layers for diagram symmetry.

### Cross-module reads

Learning is one bounded context in one database (`bkpractice_learning`). A module may read tables
owned by another Learning module, but only through **its own read port** (e.g.
`CourseStructureReader`, `RecommendationCandidateReader`).

Rules:

- Do not import another module's entity, repository or datasource.
- Do not call another module's write repository.
- If the owning module exports a read query (a projection), prefer calling that query instead of
  re-implementing the same visibility rules.
- No cross-database TypeORM relations; `created_by` and `user_id` are plain external IDs.

### Ports shared between modules

`TransactionRunner` (LRN-001) is a shared port. Import it from the module that owns it; do not copy
it and do not move it into `libs/`. The trusted principal is a transport concern: reuse LRN-001's
`@TrustedPrincipal()`/`TrustedPrincipalGuard` in presentation instead of introducing a shared
principal port. Avoid creating a generic shared Learning service.

Course, Problem and Progress transaction contexts reuse the same infrastructure-only AsyncLocalStorage for
each DataSource. Read adapters use the active manager so a Course workflow does not acquire a
second pool connection to read Problem references. Separate requests and DataSources retain
isolated transaction state.

## Current implementation and status

Problems and Courses use domain aggregates, application use cases and TypeORM adapters. Course
controllers depend on inbound use case ports, and its aggregate repository port lives in the domain.
The accepted submission event updates personal Progress through a use case, domain aggregate and
TypeORM adapter. Personal Problem/Course progress reads use focused inbound and read ports, a pure completion calculator and HTTP response mapping.
Hidden judge data is exposed only through a protected internal endpoint. LRN-008 removes the old
Class, Enrollment and Assignment entities with a new migration; historical migrations remain intact.

Status: **PARTIALLY ALIGNED**. Recommendation still needs implementation.
The retired classroom schema must be removed by the LRN-008 migration before deployment is considered
complete.

## Incremental alignment

- Implement recommendations over every published Course under the revised LRN-007 scope.
- Put repository and message implementations behind focused driven ports (see Ports above).
- Keep the TypeORM entity as the persistence model and map it to the domain object at the
  infrastructure boundary. Do not move either into `libs/`.
- Add module behavior for Progress (LRN-006) and Recommendation (LRN-007) only when implemented;
  do not create empty folders.
- Keep internal cross-module interaction explicit via read ports; avoid a generic shared Learning
  service.

## References

- [ADR 0002: Revised Service Internal Architectures](../adr/0002-revised-service-internal-architectures.md)
- [ADR 0001: Service-specific Internal Architectures](../adr/0001-service-specific-internal-architectures.md)
- [Dependency Rules](../architecture/dependency-rules.md)
- [Service Architecture Matrix](../architecture/service-architectures.md)
- [System Architecture](../architecture/system-architecture.md)
- [Learning Service deployment notes](../learning-service-operations.md)
