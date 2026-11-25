# Paginated root comments on the existing Post API

Owner accepted adding a paginated comment-reading API. Sources: Approved COM-002-FR-005/010/013, AC-009/016 and Comments plan ListRootComments/API rules. Scope is GET /api/community/posts/:id/comments on the existing small Posts module; separate reply-list endpoints, lifecycle, Comment likes and full domain extraction remain unfinished feature work.

Accept page >=1 (default 1), pageSize 1..50 (default 20), reject unknown query fields and invalid UUIDs. Verify the Post is visible (hidden Posts only visible to their author), then select only visible root comments (not hidden or caller is comment author), ordered createdAt ASC/id ASC. Return items/page/pageSize/total and a grouped visible replyCount for only returned roots. Do not leak replies or counts of hidden roots; a hidden reply only counts for its own author when the root is visible. Author representations include moderation status based on the existing is_hidden field. Map plain DTOs instead of returning relations.

Use the Community transaction manager with REPEATABLE READ so visibility, total, page and reply counts share a database snapshot. No migration, configuration or dependency change. Test HTTP through real PostgreSQL for ordering, paging, validation, hidden Post/root/reply rules, empty/out-of-range pages and author status. Preserve the existing create-comment API.

Checklist:

- [x] Query/response DTOs and Swagger.
- [x] Snapshot-consistent paginated root query and batched reply counts.
- [x] Real PostgreSQL HTTP cases and regression checks.
- [x] Lint, typecheck, build and worked entry.
