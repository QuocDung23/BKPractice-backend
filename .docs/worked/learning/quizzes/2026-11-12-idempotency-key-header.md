# 2026-11-12 — Đưa idempotency key vào header

- Author: Codex, theo yêu cầu chủ sở hữu
- Scope: Learning `quizzes` HTTP contract cho tạo/clone câu hỏi và Quiz

## Spec and plan

- Spec: `.docs/specs/02-learning/quizzes/spec.md`, LRN-009 phiên bản 1.4, Approved
- Plan: `.docs/specs/02-learning/quizzes/plan.md`
- Tasks: `.docs/specs/02-learning/quizzes/tasks.md`, LRN-009-T061
- Spec status at start: Approved 1.3; chủ sở hữu duyệt đổi contract sang header ngày 2026-11-12

## Questions clarified

| Question | Conclusion | Source |
| -------- | ---------- | ------ |
| Key nằm ở đâu trên HTTP request? | Header `Idempotency-Key`; body chỉ chứa dữ liệu nghiệp vụ. | Chủ sở hữu xác nhận; LRN-009 1.4 |
| Có tạo bảng idempotency riêng không? | Không. Tiếp tục lưu key/hash trên root Question/Quiz hiện có. | Chủ sở hữu xác nhận; `quiz.entities.ts` |
| Có cần đổi Gateway không? | Không. Gateway proxy chuyển tiếp headers; nó không thay đổi ý nghĩa key. | `gateway-proxy.service.ts` |

## What was done

Các API Learning tạo câu hỏi, tạo Quiz, clone câu hỏi và clone Quiz đọc UUID từ header
`Idempotency-Key`. DTO body không còn khai báo `clientRequestId`/`RequestIdDto`; controller
đọc key qua custom parameter decorator và `ParseUUIDPipe` kiểm tra UUID rồi chuyển key nội bộ vào
use case. Swagger công bố header bắt buộc. Integration fixtures đã được đổi sang gửi header và body
thuần nghiệp vụ. Spec, plan, task và hướng dẫn module đã được cập nhật theo contract mới. Gateway
contract fixture xác nhận header được forward.

## Why these choices

Header là metadata của thao tác HTTP, nên tách nó khỏi dữ liệu câu hỏi/Quiz trong body. Giữ khóa
và hash trên các bảng root hiện có duy trì retry-safe semantics mà không thêm bảng hoặc migration.
Gateway đã chuyển tiếp header tổng quát nên không cần thêm xử lý đặc biệt ở Gateway.

## How the feature works

1. Client tạo UUID mới cho một thao tác create/clone và gửi ở header `Idempotency-Key`.
2. Gateway xác thực request và chuyển nguyên header đến Learning.
3. Controller Learning kiểm tra UUID, lấy principal đáng tin cậy và chuyển key với body vào use case.
4. Use case kiểm tra quyền, hash payload, khóa và tìm key theo người tạo trong repository.
5. Key/payload đã tồn tại thì trả resource cũ nếu hash khớp, hoặc trả conflict nếu payload khác.
   Key mới thì tạo resource và lưu key/hash trên root Question/Quiz trong transaction.
6. Client retry cùng thao tác bằng cùng header key; thao tác create/clone mới dùng key mới.

## Configuration

No configuration change.

## Verification

- Commands run and their results: `git diff --check` pass; targeted search confirmed HTTP DTOs no
  longer expose `clientRequestId` and internal use-case mapping is retained. `pnpm typecheck`
  reports no errors in this change after the parameter decorator fix; it still exits 2 on five
  existing `officialName` type errors in `test/account-import.integration.spec.ts`.
- Not verified: lint, typecheck, tests, build, and live Gateway-to-Learning request.

## Remaining

- Not done: execute quality checks and mark LRN-009-T061 complete.
- Risks: callers that still put `clientRequestId` in the body must move it to `Idempotency-Key`;
  missing or invalid header now returns HTTP 400.
