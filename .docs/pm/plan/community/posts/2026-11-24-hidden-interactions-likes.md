# Existing Community interactions and explicit Post likes

Scope: owner requested fixing interactions with hidden content and replacing the existing Post like toggle with explicit on/off operations on 2026-11-24.

## Sources and limits

Approved COM-001/002 visibility and new-interaction rules; Approved COM-003 FR-005/006/007/009/012/013 and PUT/DELETE routes. This is a bounded repair of the existing Posts module, not completion of COM-003. Comment reactions, soft deletion, full domain/use-case extraction and reaction fields on feed projections still depend on the unfinished COM-001/002 implementation. They are not silently marked complete.

## Design

- Hidden Post: nonauthor receives 404 before interaction storage/count access; author creating a comment or enabling a like receives 409. Author may remove their existing like idempotently.
- Replies require a public root comment of the same Post. Hidden/missing/wrong-Post parent yields 404 without saving.
- PUT /api/community/posts/:id/reactions/like enables the caller's like. DELETE disables it. Both return 200 with `{ liked, likeCount }`. Remove the POST toggle.
- Retain the existing unique `(post_id, user_id)` constraint. Use INSERT ON CONFLICT DO NOTHING to enable and scoped DELETE to disable. No schema or dependency changes.
- Use the existing Community connection's transaction manager for validation/write/count. Shared row locks prevent the Post or parent Comment being hidden during the checked write. Restrict the joined parent lock to the comments table so PostgreSQL does not attempt to lock the nullable side of an outer join.
- Use empty request DTOs with the existing validation pipe to reject client userId/type/count fields. Keep trusted authentication and UUID pipes.

## Checklist

- [x] Hidden Post and parent Comment interaction rules.
- [x] Explicit idempotent PUT/DELETE Post likes and removal of toggle route.
- [x] Transactional writes/counts and conflict-safe SQL.
- [x] HTTP, policy, regression and TypeORM SQL-generation tests.
- [x] Lint, typecheck, Community build, API migration note and worked entry.
