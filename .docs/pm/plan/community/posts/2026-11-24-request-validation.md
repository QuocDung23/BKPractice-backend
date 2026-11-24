# Community request validation patch

Scope approved by the owner in the 2026-11-24 session: reject whitespace-only post/comment content, malformed route UUIDs and mismatched Post scope/target combinations on existing APIs.

## Sources

- Approved COM-001: FR-003, FR-004, FR-014; plan PostTarget and ParseUUIDPipe rules.
- Approved COM-002: FR-015 and AC-008; plan UUID routes and trimmed content inherited from COM-001.
- Community architecture: retain the existing small Posts module for this bounded patch.

## Implementation

Apply trim during DTO transformation, then existing string/length checks. Use a class-validator constraint to require the matching UUID target and reject any supplied target for another scope, including null. Validate route IDs with ParseUUIDPipe before business calls. Preserve unknown-field rejection and existing authentication. Test through real Nest HTTP transport with production validation and error filter, mocking only business operations.

This is a bounded fix to current endpoints, not the full COM-001/COM-002 implementation. Full domain value objects, Markdown filtering, title, lifecycle, hidden-content handling and idempotent likes remain separate work. Large feature tasks must not be marked complete by this partial patch. No runtime configuration, dependencies or migration changes.

## Checklist

- [x] Trim content before non-empty and length checks for posts and comments.
- [x] Reject invalid scope/target combinations.
- [x] Validate post UUIDs on comment and like routes.
- [x] Verify invalid inputs never reach business methods and valid boundaries still succeed.
- [x] Run relevant tests, lint, typecheck, Community build and write the work note.
