# Paginated replies on existing Community comments

Owner accepted the next step: read replies of a root comment. Sources: Approved COM-002-FR-006/010/013 and Comments plan ListReplies/API. Add GET /api/community/comments/:commentId/replies in the existing small Posts module; no lifecycle, Comment likes or schema changes.

Reuse page/pageSize validation (1/20 defaults, max size 50, safe integer page). Within one REPEATABLE READ snapshot, load the root plus Post and reject missing comments, reply-as-root, hidden root not owned by caller, or hidden Post not owned by caller with 404 before reading counts. Select only replies of that root and Post, visible if public or owned by caller; order createdAt ASC/id ASC. Map plain reply DTOs with parentCommentId, without nested relation graphs or reply counts. Only reply authors receive moderation.status. Preserve normal root-comment/create APIs.

Checklist:

- [x] Replies controller and typed Swagger DTOs.
- [x] Snapshot-consistent visibility, root validation, paging and response mapping.
- [x] Real PostgreSQL tests including root/Post/reply privacy and validation.
- [x] Lint, typecheck, build, docs and worked entry.
