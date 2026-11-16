# 2026-11-12 — Seed Question Bank trực tiếp qua Learning DB

- Author: Codex, theo yêu cầu chủ sở hữu
- Scope: Seed Topic, Tag và 5 Question vào database Learning hiện có

## Spec and plan

- Spec: `.docs/specs/02-learning/quizzes/spec.md`, LRN-009 1.4 Approved
- Plan: `.docs/specs/02-learning/quizzes/plan.md`
- Tasks: `.docs/specs/02-learning/quizzes/tasks.md`
- Spec status at start: Approved

## Questions clarified

| Question | Conclusion | Source |
| -------- | ---------- | ------ |
| Question thuộc user nào? | User cung cấp UUID owner trong phiên làm việc; script nhận UUID qua tham số, không ghi vào source. | Yêu cầu chủ sở hữu; Question ownership trong LRN-009 |
| Key/hash được xử lý thế nào? | Dùng key cố định trùng Postman fixture, hash cùng thuật toán API; chạy lại bỏ qua bản ghi giống và từ chối payload lệch. | `create-question.use-case.ts`, `command.utils.ts` |
| Có seed trực tiếp trong phiên này không? | Chưa; process hiện tại không có `LEARNING_DATABASE_URL`, và không đọc `.env` theo Repository tooling and safety. | Kết quả kiểm tra biến môi trường; `.docs/agent/working-agreement.md` |

## What was done

Thêm `apps/learning-service/src/database/seed-question-bank.ts` và script
`seed:learning:question-bank`. Script thêm hoặc tái dùng ba Topic (`Cơ sở dữ liệu`, `Thuật toán`,
`Cấu trúc dữ liệu`), năm Tag (`SQL`, `Tìm kiếm`, `Stack`, `Đệ quy`, `Độ phức tạp`), rồi ghi 5 câu
vào hai bảng Question root/revision trong cùng transaction PostgreSQL. Mỗi câu được gắn một Topic
và một Tag. Không tạo migration hay bảng mới. User UUID được truyền lúc chạy, không đưa vào source.

## Why these choices

Seed dùng lại bảng taxonomy Learning hiện có và điền cùng cặp Question root/revision mà Learning
API tạo. Giữ quyền sở hữu và `request_hash` theo contract hiện tại. Advisory lock và kiểm tra
key/hash làm cho lần chạy lại an toàn. Kết quả in ra Topic/Tag IDs để dùng trong API.

## How the feature works

1. Người dùng chạy `pnpm seed:learning:question-bank -- <user-uuid>`; package script nạp cấu hình
   local `.env` vào process người chạy.
2. Script xác thực UUID owner và yêu cầu `LEARNING_DATABASE_URL`.
3. Một transaction lần lượt khóa từng request key và tìm bản ghi theo `(created_by, client_request_id)`.
4. Nếu hash khớp, script bỏ qua câu đã seed; nếu lệch, rollback toàn bộ và báo conflict.
5. Key mới tạo root và revision Question cùng option IDs; script in số câu mới/có sẵn cùng Topic/Tag IDs.

## Configuration

Không đổi runtime config. Lệnh dùng `LEARNING_DATABASE_URL` từ `.env` của người chạy; không lưu
giá trị cấu hình hoặc UUID owner trong source.

## Verification

- Commands run and their results: ESLint cho seed script, Prettier check và `git diff --check` pass.
  `pnpm typecheck` không báo lỗi seed script, nhưng repo còn năm lỗi `officialName` trong
  `test/account-import.integration.spec.ts`.
- Not verified: chưa chạy seed trên database.

## Remaining

- Not done: chưa có seed rows trong database do process hiện tại thiếu `LEARNING_DATABASE_URL`.
- Risks: lệnh seed sẽ ghi dữ liệu vào database Learning được cấu hình trong `.env`; người chạy cần
  xác nhận đúng database và user UUID trước khi thực thi.
