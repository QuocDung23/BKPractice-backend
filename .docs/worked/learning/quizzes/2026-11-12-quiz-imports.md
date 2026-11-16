# 2026-11-12 — Gộp imports module Quiz

- Author: Codex
- Scope: Learning `quizzes`, chỉ tổ chức lại imports

## Spec and plan

- Spec: `.docs/specs/02-learning/quizzes/spec.md`, LRN-009 1.4 Approved
- Plan: `.docs/specs/02-learning/quizzes/plan.md`, quy tắc import theo layer và barrel
- Tasks: `.docs/specs/02-learning/quizzes/tasks.md`, T061 còn chờ kiểm thử contract
- Spec status at start: Approved

## Questions clarified

| Question | Conclusion | Source |
| -------- | ---------- | ------ |
| Có cần đổi contract hoặc schema? | Không; đây là dọn import trong module Quiz. | Yêu cầu của chủ sở hữu; LRN-009 1.4 |
| Import qua đâu? | Dùng barrel hẹp đã có của `ports/in`, `use-cases`, persistence và HTTP DTO. | `.docs/agent/working-agreement.md`, How to write code |

## What was done

Gộp các import rời rạc trong `quizzes.module.ts` và ba controller ngân hàng câu hỏi, quản lý Quiz,
người học. Token, type và class vẫn giữ tên cũ; chỉ đường import chuyển sang barrel cùng folder.

## Why these choices

Các barrel đã tồn tại và export đúng symbol cần dùng. Gộp import giảm số đường dẫn lặp mà không
thêm alias, lớp hoặc dependency mới.

## How the feature works

Không đổi luồng sản phẩm. Nest module và controller resolve cùng token, use case và DTO qua barrel;
route, body, header và persistence giữ nguyên.

## Configuration

No configuration change.

## Verification

- Commands run and their results: `pnpm build:learning` pass; Prettier và ESLint bốn file pass;
  `git diff --check` pass. `pnpm typecheck` không có lỗi Quiz, nhưng repo còn năm lỗi `officialName`
  có sẵn trong `test/account-import.integration.spec.ts`.
- Not verified: runtime request và integration tests.

## Remaining

- Not done: không có phần import còn chờ đổi trong phạm vi này.
- Risks: thay đổi barrel có thể ảnh hưởng thời điểm load module; build Learning đã resolve được imports.
