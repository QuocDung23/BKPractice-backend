# Reaction state on the existing Post feed

Scope approved in the session: add likeCount and likedByMe to the current GET /api/community/posts response so frontend reloads show the stored state. Sources: Approved COM-003-FR-008/010 and the batched count rule in its plan. This is the existing list API only; no new detail endpoint, full pagination, lifecycle, Comment reactions or frontend source changes.

Pass the guard-established caller ID into list. Keep the existing visibility/order/50-item limit. For returned Post IDs, issue one grouped reaction query with COUNT and caller-specific BOOL_OR, then merge by ID with number/boolean defaults 0/false. Never return reactor identities. Skip aggregation for empty feeds. Add a typed Swagger response DTO. Verify actual PostgreSQL counts, separate callers, unlike/reload, hidden exclusion, limit and ordering, plus unit assertions of one batch query.

Checklist:

- [x] Caller identity and typed feed reaction fields.
- [x] One grouped query; empty feed bypass.
- [x] Real PostgreSQL/HTTP and regression checks.
- [x] Lint, typecheck, build and work note.
