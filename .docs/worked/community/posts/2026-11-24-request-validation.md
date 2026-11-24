# 2026-11-24 - Community request validation

- Author: Codex
- Scope: Three approved validation fixes on existing Community endpoints: whitespace-only content, invalid route UUIDs and scope/target mismatches.

## Spec and plan

- Spec: `.docs/specs/05-community/posts/spec.md` (COM-001-FR-003, FR-004, FR-014) and `.docs/specs/05-community/comments/spec.md` (content validation, COM-002-AC-008).
- Plan: existing Posts/Comments plans and focused execution note `.docs/pm/plan/community/posts/2026-11-24-request-validation.md`.
- Tasks: bounded verification checklist in the focused note, cross-referenced from both feature task files. Larger domain/DTO/controller tasks remain open.
- Spec status at start: Approved for both. Approved specs were not changed.

## Questions clarified

| Question                                                    | Conclusion                                                                                                                                                                  | Source                                                            |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Which changes are authorized now?                           | Whitespace-only content, route UUIDs and scope/target validation on existing APIs.                                                                                          | Owner accepted the preceding three-item proposal in this session. |
| Are limits applied before or after trim?                    | Validate after trim: posts 1..10,000 characters, comments 1..5,000.                                                                                                         | COM-001-FR-014 and Comments reuse of the content rule.            |
| What is a valid target?                                     | GLOBAL has no target; PROBLEM requires only problemId; COURSE requires only courseId. Matching values must be UUIDs; unrelated fields including explicit null are rejected. | COM-001-FR-003/004 and PostTarget in plan.                        |
| Does the patch implement the complete COM-002 feature gate? | No. The owner requested fixes to existing endpoints; the full Comments implementation still requires the remaining COM-001 dependencies.                                    | Session scope and existing COM-002-T001.                          |

## What was done

`dto/create-post.dto.ts` and `create-comment.dto.ts` trim string content during class-transformer conversion before existing type/minimum/maximum checks run. Non-string values remain unchanged so class-validator rejects them instead of coercing them. Blank, whitespace-only, missing and overlong content returns 400. Valid padded content is passed to existing business methods already trimmed.

Added `dto/post-target.constraint.ts` and exported it through the DTO barrel. `PostTargetConstraint.validate(value, args)` receives an unknown field value and validation context. It returns true only for a UUID on the matching scope, or an omitted value on other scopes. It does not query Learning or modify inputs. `defaultMessage(args)` describes the target rule; the existing shared error mapper preserves the standardized validation envelope. DTOs reference the concrete constraint file to avoid importing their own folder barrel in a cycle. Swagger describes target requirements and trimmed length limits.

`PostsController.comment` and `like` now use ParseUUIDPipe on the existing `id` parameter. Malformed IDs are rejected with 400 before the PostsService is called. The guard still runs first. Swagger documents the bad-request response.

Added `validation.http.spec.ts` using a real Nest HTTP application, the production validation pipe and exception filter, and mocked PostsService methods. Tests cover invalid content and targets, valid targets, trimmed maximum lengths, invalid/valid route IDs, parent UUID validation and rejection of client author fields. Invalid requests must leave every relevant business method uncalled.

## Why these choices

This retains the existing DTO/class-validator request boundary and framework error handling for a narrow fix. Class-transformer already participates in the globally enabled ValidationPipe, and both libraries are installed. A single constraint checks the two related target fields because conditional UUID checks alone skipped unrelated supplied IDs. ParseUUIDPipe is the plan's standard for route identifiers. No new framework, dependency, persistence operation or cross-service access is introduced.

Full domain PostTarget/RestrictedMarkdown, title, lifecycle and module extraction remain separate plan work; this boundary patch does not claim those tasks or the complete Approved features are implemented. Prior Gateway authentication, configuration, aliases and unrelated working-tree changes are preserved.

## How the feature works

1. A request reaches the existing guarded controller through Gateway.
2. Authentication is checked first, then UUID route parsing and DTO transformation/validation run.
3. String content is trimmed, checked for type/non-emptiness/length, and Post target fields are checked against scope.
4. Invalid input returns 400 through the existing error filter without invoking business operations or persistence.
5. Valid input reaches existing business methods with a valid route UUID, trimmed content and a consistent Post target.

## Configuration

No configuration change. No real environment files were read, changed or created. No migration or dependency changes.

## Verification

- `corepack pnpm typecheck`: passed.
- `corepack pnpm build:community`: passed.
- `corepack pnpm test apps/community-service --silent`: passed, 4 suites and 49 tests (32 new HTTP validation cases).
- `corepack pnpm lint`: passed.
- Prettier applied to touched source and the focused execution note.
- `git diff --check` on the touched Posts module: passed.
- CodeGraph: N/A; there is no `.codegraph/` directory.

## Remaining

- No real database or live Gateway/Identity session flow was exercised; HTTP tests mock business methods and use the internal test credential.
- Full monorepo tests and unrelated service builds are outside this bounded change.
- Markdown filtering, title, lifecycle and other larger feature tasks remain open. Hidden-content interactions and idempotent like operations are the next separate fixes.
- Existing unrelated changes, including prior authentication work and generated Husky files, are preserved.
