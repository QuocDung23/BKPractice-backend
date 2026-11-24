# Community Gateway authentication boundary

Status: Approved by repository owner in the 2026-11-24 session.

## Scope and decision

The owner approved extending COM-001 beyond its existing no-Gateway/no-configuration scope to fix direct-service impersonation. The Approved product spec is unchanged: authenticated identity must come from a trusted Gateway context (COM-001-SR-002). A UUID header check alone does not establish that trust on an exposed port.

## Implementation plan

- Gateway removes client x-internal-* headers and injects x-internal-community-secret only for the Community upstream.
- COMMUNITY_GATEWAY_SECRET is a dedicated private credential shared by Gateway and Community, required with at least 32 characters. Set the same independently generated value on both services; never expose it through frontend configuration. Use private networking or TLS between hosts.
- Community applies TrustedUserGuard on every PostsController endpoint. It compares the credential using timingSafeEqual, validates x-auth-user-id as UUID, and supplies Principal through TrustedPrincipal. Missing or malformed context returns 401 before business logic.
- Docker publishes Community on 127.0.0.1 only. Health endpoints remain available without the business guard.
- No schema, business API, dependency, or Approved spec changes.

## Tasks

- [x] Add the Gateway credential, Community guard/decorator and configuration validation.
- [x] Restrict Docker host binding and document startup requirements.
- [x] Verify HTTP rejection/acceptance, Gateway header replacement, existing Gateway tests, lint, typecheck and builds.
