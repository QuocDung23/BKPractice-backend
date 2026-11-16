# Plan

Each plan lives in a folder for its area. Split plans the same way finished-work notes are split under `.docs/worked/`. Do not leave plan files loose in this directory.

```text
.docs/pm/plan/<area>/
```

`<area>` is:

- `agent` when the plan changes the process, the working agreement, or a repository-wide rule.
- `<service>` when the plan belongs to one service: `api-gateway`, `identity`, `learning`, `submission`, `judge`, or `community`.
- `<service>/<module>` when the plan belongs to one feature module. Use the same module name as the code directory `modules/<module>/`.

Examples:

```text
.docs/pm/plan/agent/
.docs/pm/plan/identity/auth/
```

Create a folder only when that area has a plan to write. Do not create empty folders.

A feature implementation still follows the Approved `spec.md` and the reviewed `plan.md` named by the
[working agreement](../../agent/working-agreement.md), step 2. File the plan for that module here, and do not put several modules into one shared plan. Do not record secrets, tokens, or passwords.

## Available plans

- [API Gateway implementation plan](api-gateway/identity/README.md): các lát cắt nhỏ cho GW-001, chia lớp Gateway `presentation -> application -> infrastructure`.
- [Learning — Quản lý Test Case](learning/problems/test-case-management.md): ghi chú migration, judge-package và rủi ro chỉnh sửa tại chỗ của LRN-002.
- [Identity implementation plan](identity/README.md): smaller execution plans for Authentication, Profile and RBAC, linked to their Approved specs, plans and task checklists.

- [Learning — Progress cá nhân](learning/progress/personal-progress.md): ba API đọc, quy tắc visibility, test cách ly và vận hành retry/DLQ.
- [Learning — Quiz và ngân hàng câu hỏi](../../specs/02-learning/quizzes/plan.md): plan đã được duyệt theo spec 1.3, [task/evidence](../../specs/02-learning/quizzes/tasks.md) và [API/vận hành](learning/quizzes/README.md). Backend đã triển khai; baseline lint/typecheck/test toàn repo được ghi rõ trong worked.
