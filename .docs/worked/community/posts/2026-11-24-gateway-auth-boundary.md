# 2026-11-24 - Community Gateway authentication boundary

- Author: Codex
- Scope: Authentication boundary for existing Community APIs, Gateway forwarding, runtime configuration and local Docker exposure.

## Spec and plan

- Spec: `.docs/specs/05-community/posts/spec.md`, COM-001-SR-002 and AC-004.
- Plan: `.docs/specs/05-community/posts/plan.md` and owner-approved scope addendum `.docs/pm/plan/community/posts/2026-11-24-gateway-auth-boundary.md`.
- Tasks: COM-001-T004 plus the focused checklist in the addendum. Remaining COM-001 tasks are not completed by this change.
- Spec status at start: Approved. The Approved spec was not modified.

## Questions clarified

| Question                                                             | Conclusion                                                                                                 | Source                                               |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Does validating a UUID header establish Gateway trust?               | No. Any direct caller can construct a valid UUID. Authenticate the internal hop before accepting identity. | Existing exposed port and controller; COM-001-SR-002 |
| May the existing no-Gateway/no-configuration plan scope be extended? | Owner explicitly approved a complete fix including Gateway and Docker on 2026-11-24.                       | Session approval, recorded in the addendum           |
| Does this work complete Posts or other Community features?           | No. This is the existing APIs' authentication boundary only.                                               | Session priority and focused addendum                |

## What was done

Added `common/auth/principal.ts`, `trusted-user.guard.ts`, `trusted-principal.decorator.ts` and barrel exports. `TrustedUserGuard.canActivate(context)` receives the HTTP execution context, removes any stale attached principal, validates the internal credential and user UUID, attaches a Principal and returns true, or throws a normalized 401 exception. `TrustedPrincipal` reads only the principal established by the guard and rejects absent context. Permissions are a read-only set, empty when omitted.

`posts.controller.ts` applies the guard to every endpoint, including reads, and passes the verified principal user ID to existing create/comment/like operations. `posts.module.ts` registers the guard. Swagger now declares bearer authentication and the 401 response. No business workflow or database schema was changed.

`GatewayProxyService.forward` strips all client `x-internal-*` headers as before, then adds `x-internal-community-secret` only for the Community target. Other upstreams receive no Community credential. The private ConfigService property supplies the credential on this route. Tests assert that forged credentials are replaced and not passed to another service.

`libs/config/src/environment.ts` requires `COMMUNITY_GATEWAY_SECRET` with at least 32 characters for Gateway and Community. `.env.example` provides a placeholder; README explains deployment coordination. `docker-compose.yml` publishes Community on loopback only. TypeScript/Jest add narrowly scoped Community aliases; Posts DTO/entity/module barrels were added for the touched module.

## Why these choices

A dedicated private credential proves the internal caller possesses a Gateway credential; a UUID alone proves only syntax. Node crypto's timingSafeEqual compares equal-length credentials without a content-dependent comparison. UUID validation uses the already installed class-validator. Nest guards and parameter decorators keep transport authentication at the controller boundary and do not couple domain rules to HTTP. No dependency was added.

The credential is limited to the Community route to avoid propagating it to unrelated upstreams. Loopback publication reduces exposure while retaining local access. Private networking or TLS remains necessary between separate hosts.

## How the feature works

1. A client authenticates through Gateway's existing token/session middleware, which removes client identity headers and sets verified identity.
2. Gateway removes client internal headers and adds its private Community credential when forwarding to Community.
3. Community validates the credential, user UUID and permissions header shape before invoking a handler.
4. The decorator supplies the established Principal; existing business methods receive its user ID.
5. Direct requests without a valid credential, or requests with missing/malformed identity, receive 401 before repository or service business calls.
6. Health endpoints remain outside the guarded Posts controller.

## Configuration

- `.env.example` and runtime environments: new `COMMUNITY_GATEWAY_SECRET`, same independently generated private value on Gateway and Community, at least 32 characters. The example is a placeholder and must be replaced before startup.
- Both services now fail startup validation if this key is absent or too short. Coordinate configuration before restarting either service.
- Gateway transport header: `x-internal-community-secret`, added only after stripping incoming internal headers.
- `docker-compose.yml`: host binding for port 3005 is now `127.0.0.1`.
- `tsconfig.json` and `jest.config.ts`: narrow aliases for Community authentication and Posts.
- No real `.env` or credentials were inspected or modified. No migration or dependency change.

## Verification

- Baseline: typecheck, lint and 9 existing Community tests passed before implementation.
- Focused test run: 7 suites, 167 tests passed, covering Community HTTP acceptance/rejection, existing Community tests, Gateway forwarding/error handling and environment validation.
- `pnpm typecheck`: passed after fixing a test fixture's header type and again on the final alias configuration.
- `pnpm build:gateway`: passed.
- `pnpm build:community`: passed; final build also passed after alias and Swagger changes.
- `docker compose --env-file .env.example config --quiet`: exit 0. Docker emitted a local config-file access warning; no containers were started.
- Initial post-change lint identified import ordering only; final `pnpm lint` passed after import fixes.
- `git diff --check` excluding pre-existing Husky output: passed.
- CodeGraph: N/A, no `.codegraph/` directory exists.

- Final Community HTTP rerun: 8 tests passed after alias/Swagger changes.
- Prettier formatting was applied after import fixes.
- COM-001-T004 and the focused addendum checklist were marked complete; other feature tasks remain open.
- The old plan survey said no Community tests existed; this checkout already had 9 baseline tests. No schema or endpoint foundation differed from the survey.

## Remaining

- Full monorepo test suite and unrelated service builds were not run; checks target the changed services and shared configuration.
- No real database, JWT session service, live deployment or running Docker containers were exercised; HTTP tests use real Nest transport with mocked business methods.
- Runtime configuration still needs the new private credential before startup. Never expose it in frontend variables or over untrusted plaintext transport.
- Validation, hidden-content interactions, idempotent likes, and missing Community feature APIs remain separate work.
- Husky generated file modifications already existed after dependency installation and were left untouched.
