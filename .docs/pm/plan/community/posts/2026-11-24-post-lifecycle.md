# Post detail, paged feed and author lifecycle

Scope authorized 2026-11-24: detail, page/filter posts, edit/delete own posts and comments first. Author enrichment and realtime deferred explicitly.

Sources: COM-001/002 Approved specs and plans; Community architecture and Accepted ADR 0002. This is a bounded extension of the existing verified API, not completion of all COM-001/002 tasks. Existing content-only creation remains compatible; title creation, my-content lists, restore and full module extraction remain pending. No spec is changed.

Implementation: add nullable edited_at/deleted_at via a new migration; retain all existing data. New lifecycle rules are plain domain code, invoked by an application use case through a repository port and TypeORM transactional adapter. Lock Post before root/target Comment so delete and interactions serialize consistently. Read/interaction queries must exclude deleted posts/comments and deleted roots. Do not change is_hidden during edits/deletion. Nonowner visible resource ->403, concealed/missing ->404, author repeated deletion/edit after deletion ->409.

GET posts becomes {items,page,pageSize,total}, default20 max50, createdAt/id DESC, no pinned priority; filters scope/problemId/courseId, invalid combinations400. GET posts/:id uses visibility and retains viewer reaction fields. PATCH accepts only nonblank content and DELETE returns204. No hard deletes. Current content limits10000/5000 continue; restricted Markdown validation applies to edits.

Verification: isolated PostgreSQL HTTP tests for read/filter/pagination/ownership/deletion cascading visibility/concurrency and migration; regression, lint, typecheck, Community build. Never inspect real .env or modify application data. Migration execution on application database is left to the operator.
