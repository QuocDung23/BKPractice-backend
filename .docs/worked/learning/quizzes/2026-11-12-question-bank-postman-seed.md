# 2026-11-12 — Bộ seed Question Bank cho Postman

- Author: Codex, theo yêu cầu chủ sở hữu
- Scope: Dữ liệu mẫu 5 câu hỏi mới cho Learning Question Bank

## Spec and plan

- Spec: `.docs/specs/02-learning/quizzes/spec.md`, LRN-009 1.4 Approved
- Plan: `.docs/specs/02-learning/quizzes/plan.md`
- Tasks: `.docs/specs/02-learning/quizzes/tasks.md`
- Spec status at start: Approved

## Questions clarified

| Question | Conclusion | Source |
| -------- | ---------- | ------ |
| Có Topic/Tag ID để gắn không? | Chưa có; các câu seed dùng mảng rỗng. | Chủ sở hữu; DTO hiện hành |
| Seed có ghi thẳng vào database không? | Không; cung cấp Postman collection để gửi qua Gateway bằng access token của người dùng. | Yêu cầu hiện tại |

## What was done

Thêm Postman collection `test/postman/question-bank-seed.postman_collection.json` gồm năm câu
hỏi mới về SQL primary key, binary search, stack, recursion và độ phức tạp O(1). Mỗi request có
UUID `Idempotency-Key` riêng, body đúng contract hiện tại, option không khai báo ID và taxonomy
để rỗng.

## Why these choices

Question Bank API tạo một câu mỗi request và lấy owner từ access token. Collection gọi API qua
Gateway để dữ liệu được tạo dưới tài khoản đang đăng nhập; không cần cấp `createdBy` trong body
hoặc ghi trực tiếp database.

## How the feature works

1. Người dùng import collection vào Postman.
2. Đặt collection variables `gatewayUrl` và `accessToken`.
3. Gửi từng request POST; Gateway xác thực token rồi chuyển request đến Learning.
4. Learning tạo Question và trả Question/Revision ID.
5. Gửi lại request dùng đúng key để tránh tạo trùng; mỗi request khác có key riêng.

## Configuration

Collection variables: `gatewayUrl` mặc định `http://localhost:3000`; `accessToken` cần được người
dùng nhập trong Postman. Không có thay đổi runtime config.

## Verification

- Commands run and their results: Node parsed collection JSON and checked five request bodies,
  unique key presence, and exactly one correct option per question; pass.
- Not verified: requests were not sent to a running Gateway or database.

## Remaining

- Not done: no database seed was executed.
- Risks: collection needs a valid access token with `question:create` permission.
