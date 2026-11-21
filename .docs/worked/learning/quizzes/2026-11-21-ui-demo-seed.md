# 2026-11-21 — UI demo seed cho Identity và Learning

- Author: Codex
- Scope: Seed data cho Identity và Learning; không tạo tài khoản Admin, class, enrollment, attempt hoặc progress.

## Spec and plan

- Spec: Không có. Người dùng yêu cầu bỏ qua bước spec và implement trực tiếp.
- Plan: Không có; phạm vi và số lượng được chốt trong cuộc trao đổi với người dùng.
- Tasks: Không có; người dùng yêu cầu bỏ qua phần spec.
- Spec status at start: N/A theo chỉ đạo trực tiếp của người dùng.

## Questions clarified

| Question                                       | Conclusion                                                                                                                 | Source                                                                                                                 |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Seed những service nào?                        | Chỉ Identity và Learning.                                                                                                  | Chốt trong cuộc trao đổi với người dùng.                                                                               |
| Tài khoản demo gồm những ai?                   | 2 Student (`123220167`, `123220111`) và 1 Lecturer (`dungproqt3333@gmail.com`); mật khẩu lấy từ `ACCOUNT_IMPORT_PASSWORD`. | Chốt trong cuộc trao đổi với người dùng; biến đã có trong `.env.example`.                                              |
| Learning có bao nhiêu dữ liệu?                 | 5 course, mỗi course 5 chapter; mỗi chapter có 10 problem, 24 câu Question Bank và 5 quiz; mỗi quiz có 10 câu.             | Chốt trong cuộc trao đổi với người dùng; Question Bank được tách riêng với quiz.                                       |
| Class, enrollment và Admin có được seed không? | Không tạo tài khoản Admin, class hoặc enrollment. RBAC catalog hiện có được tái sử dụng để gán role Student/Lecturer.      | Chốt trong cuộc trao đổi với người dùng; helper RBAC hiện hữu trong `apps/identity-service/src/database/seed-rbac.ts`. |
| File đặt ở đâu?                                | Tất cả ở `seed-data/` ngoài các thư mục app; có JSON fixtures và script nạp DB; không có README hoặc `ui-demo`.            | Chốt trong cuộc trao đổi với người dùng.                                                                               |

## What was done

Tạo JSON fixtures trong `seed-data/data/identity/` và `seed-data/data/learning/`. Identity có 3 tài khoản. Learning có 5 khóa học, 25 chương, 250 bài tập, 600 câu Question Bank và 125 quiz với 1.250 liên kết câu hỏi. Mỗi quiz dùng 10 câu thuộc Question Bank của cùng chương.

Thêm script riêng cho Identity và Learning cùng script tổng hợp dưới `seed-data/scripts/`. Thêm các lệnh `pnpm seed:demo:identity`, `pnpm seed:demo:learning` và `pnpm seed:demo`. Các script thêm users, profiles, role assignments, course structure, problems, test cases, question revisions, quiz revisions và các liên kết cần cho UI.

Tài khoản Student đầu tiên là Ngọc Trần (`123220167@sv1.dut.udn.vn`); tài khoản thứ hai là Trần Gia Huy (`123220111@sv1.dut.udn.vn`). Lecturer là Thầy Quốc Dũng (`dungproqt3333@gmail.com`). Script hash mật khẩu bằng Argon2; mật khẩu không nằm trong JSON.

## Why these choices

- Giữ JSON và script ngoài các app theo vị trí người dùng đã chốt, đồng thời để Question Bank và quiz ở các file riêng.
- Tái sử dụng `seedRbac()` và `seedTaxonomy()` hiện có, không viết lại catalog. Script không gọi entrypoint RBAC tạo bootstrap Admin.
- ID trong fixtures ổn định để chạy lại không tạo bản ghi trùng. Các insert Learning dùng `ON CONFLICT DO NOTHING`; Identity kiểm tra xung đột tài khoản trước khi thêm.
- Mỗi service seed trong transaction riêng. Nếu một service hoàn tất rồi service còn lại lỗi, chạy lại lệnh là an toàn.
- Bổ sung script seed vào lint/typecheck để thay đổi mới được kiểm tra theo repo.

## How the feature works

1. Người dùng chạy một trong ba lệnh seed; Node nạp `.env` theo quy ước script hiện có.
2. `seed:demo` gọi Identity trước. Script kiểm tra `ACCOUNT_IMPORT_PASSWORD`, đọc fixtures, gọi RBAC catalog helper, hash mật khẩu, rồi tạo users, profiles và role assignments trong transaction Identity. Không tạo tài khoản Admin.
3. Script Learning khởi tạo DataSource riêng, thêm Topic catalog đã được duyệt, rồi ghi courses, chapters, problems, test cases, Question Bank revisions, quizzes, quiz revisions và các liên kết trong transaction Learning.
4. Script kiểm tra lại số lượng bản ghi. Khi thành công, terminal xác nhận số tài khoản, course, problem, bank question và quiz đã sẵn sàng.
5. Nếu thiếu migration, không kết nối được DB hoặc fixture bị sai, transaction của service lỗi sẽ rollback. `seed:demo` có thể đã commit service chạy trước đó; chạy lại sau khi khắc phục lỗi là an toàn.

## Configuration

- `package.json`: thêm ba lệnh `seed:demo:*`; các lệnh dùng `.env` và `ACCOUNT_IMPORT_PASSWORD` đã có.
- `package.json`: mở rộng lint để bao gồm `seed-data/scripts/**/*.ts`.
- `tsconfig.json`: thêm seed scripts vào typecheck.
- Không sửa `.env`, không thêm biến môi trường và không ghi giá trị secret vào fixtures hoặc tài liệu.

## Verification

- `pnpm lint`: pass.
- `pnpm typecheck`: pass.
- `pnpm test`: pass, 181 suites passed và 30 skipped; lần chạy trong sandbox bị chặn bind loopback nên được chạy lại với quyền kết nối loopback.
- `pnpm build`: pass cho cả sáu app.
- Kiểm tra JSON: pass, xác nhận đúng tổng số lượng, phân bố theo chương, một đáp án đúng mỗi câu và các quiz tham chiếu đúng question revision.
- `pnpm seed:demo`: pass; Identity và Learning báo seed hoàn tất.
- Không xác minh đăng nhập qua UI/API hoặc khả năng chạy lời giải trong Judge.

## Remaining

- Not done: Không tạo attempts, progress, class, enrollment hoặc Admin account theo phạm vi đã chốt.
- Risks: Nội dung problem, starter code và câu hỏi được tạo cho UI demo, chưa được biên tập học thuật đầy đủ; starter code chỉ là khung, không phải lời giải hoàn chỉnh để submit qua Judge.
