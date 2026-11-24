# Real PostgreSQL verification

Owner request: run real database checks for current Post interactions. Sources: Approved COM-003 concurrency/visibility rules and existing hidden-interactions plan. No product behavior change.

Use real Nest HTTP, PostsModule, TypeORM and the checked-in migration, with synchronize=false. Create a random isolated database and login role, inject the test URL without reading .env files, then remove only those generated resources. The test rejects normal database/user names.

Checklist:

- [x] 20 concurrent PUT requests persist one like.
- [x] 20 concurrent DELETE requests preserve another user's like.
- [x] Hidden Post/parent policies and preservation of stored likes.
- [x] Two-connection moderation races, observing pg_stat_activity lock waits by test application name (query text may be truncated).
- [x] Real AFTER INSERT failure rolls back and a retry succeeds.
- [x] Clean test database/role; run lint/typecheck and write results.

Public Gateway JWT login was manually verified by the owner. This suite uses the real Community guard with an isolated internal credential, without mocking business operations or repositories.
