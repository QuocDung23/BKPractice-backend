# 2026-11-11 — Quiz implementation checkpoint

- Author: Codex, sử dụng ponytail ultra.
- Scope: LRN-009 backend MVP; Learning/quizzes, Course integration, Identity permissions/share recipient và Gateway.
- Status: **Hoàn tất bàn giao sau khi resume theo yêu cầu chủ sở hữu**. Checkpoint PAUSED cũ
  được đóng: tài liệu format/link, đối chiếu FR/SR/AC → T008–T060, audit kiến trúc, dọn container test.
- Đây là bàn giao theo quy trình SDD; quality gate toàn repo còn lỗi baseline ngoài LRN-009 (xem Verification).

## Spec and plan

- Spec: [LRN-009 1.3](../../../specs/02-learning/quizzes/spec.md), Approved.
- Plan: [Quiz plan](../../../specs/02-learning/quizzes/plan.md).
- Tasks: [Quiz tasks](../../../specs/02-learning/quizzes/tasks.md).
- Spec status at start: Approved; chủ sở hữu phê duyệt toàn bộ MVP bằng “approved tất cả cho tôi”.
- Không còn câu hỏi sản phẩm chặn code. Không cần xin duyệt lại những quyết định này khi tiếp tục.

## Questions clarified

| Question | Conclusion | Source |
| --- | --- | --- |
| Ai quản lý Learning? | LECTURER chỉ nội dung mình tạo; ADMIN mọi nội dung với permission. | Spec 1.3, FR-002 và các amendment đã duyệt |
| Chia sẻ thế nào? | Private mặc định; grant cho từng lecturer, dùng/clone, không sửa gốc. Thu hồi chặn dùng mới/publish draft nhưng giữ bản đã publish/copy/history. | Q-001 |
| Clone Quiz? | Deep-copy các phiên bản câu thành câu riêng của người clone. | Q-002 |
| Hoàn thành? | User + Quiz, giữ qua revisions và mọi Chapter/Course; không đổi % Progress theo Problem. | Q-003/004 |
| Visibility/attempt? | Chỉ bắt đầu qua Course published; một active attempt; first answer, finish tường minh; lượt cũ tiếp tục sau hide/delete. | Q-005/006 |
| Giới hạn/taxonomy? | 2–6 options, 50 câu/Quiz, 50 Quiz/Chapter; limits và Topic/Tag/difficulty hiện có. | Q-007/008 |

## What was done

Đã triển khai code backend MVP của LRN-009, sau đó hoàn tất đối chiếu checklist và bàn giao:

1. **Ngân hàng câu hỏi:** tạo, sửa bằng revision mới, tìm/lọc/phân trang/detail/usage, share/revoke,
   clone, xoá mềm/restore. Có ID/hash chống tạo trùng khi client retry.
2. **Quiz:** tạo draft rỗng, chỉnh title/description, chọn/bỏ/sắp xếp hàng loạt, preview/readiness,
   thông báo source revision mới, publish, hold/republish, share/revoke, clone sâu, delete/restore.
3. **Mobile:** start/resume, answer trả ngay kết quả/giải thích, khoá lựa chọn đầu tiên, finish,
   review/history/best/completion. Không trả đáp án câu chưa làm; ADMIN không vượt scope attempt.
4. **Courses:** attach/detach/reorder Quiz; một Quiz nhiều Chapter/Course; persistence giữ links
   khi sửa Course/Problem; summary learner lọc nội dung ẩn; Progress và readiness Problem giữ nguyên.
5. **Phân quyền:** owner checks cho Problem/TestCase/Harness/Course và scoped managed lists;
   catalog mới cho LECTURER/ADMIN, không cấp quản lý cho STUDENT.
6. **Persistence:** migration Learning 10 bảng, migration Identity cấp quyền có tracking rollback;
   composite FK, unique active attempt/draft/answer, transaction manager dùng chung, locks và đọc theo lô.
7. **Transport:** DI/module/entity/alias/barrels, Gateway allowlist, request DTO/response Swagger,
   internal Identity lookup active recipient với credential và response tối thiểu `{userId, roles}`.
8. **Tests:** domain, HTTP + PostgreSQL, rollback/retry, lock contention, privacy, sharing/clone,
   Course links, pagination, Swagger, Gateway routes và Identity internal contract.
9. **Resume 2026-11-11 (chỉ tài liệu/audit, không đổi code):** gộp hai hàng grant của plan vào bảng
   schema chính; sửa nhãn draft lịch sử trong spec cho khớp phê duyệt 1.3; sửa link preflight hỏng
   trong tasks; tick T008–T060 kèm bằng chứng từng task; audit kiến trúc T058 (domain thuần, boundary
   Courses→Quizzes một chiều qua read port, barrel, không secret trong diff, không `.codegraph/`);
   dọn container test `bkpractice-lrn009-test` (kiểm không còn volume mồ côi).

Một số lỗi được bắt và sửa trong kiểm thử: owner filter bị `.where` ghi đè; TypeORM pagination
với tên cột thay vì property; publish response chưa phản ánh published revision; publish không có
draft vẫn tự tạo revision; contract `userId` giữa Identity và Learning; test LRN-008 giả định luôn
là migration cuối. Những lỗi này đã được sửa, không còn là mục chặn.

## Why these choices

- Giữ một bounded context Learning theo DDD + Hexagonal; không tạo Quiz service hoặc đưa chấm qua Judge.
- Ba aggregate Question/Quiz/QuizAttempt và ba repositories; không repository riêng mỗi bảng.
- Immutable revisions để attempts/history không đổi khi soạn lại; không nhân toàn bộ đề vào mỗi attempt.
- Tái dùng TransactionRunner và AsyncLocalStorage của Learning; Courses đọc Quiz qua own read port,
  không import write repository/entity xuyên module. Identity chỉ được gọi HTTP, không đọc DB xuyên service.
- Dùng dependency hiện có, không thêm package, queue, Redis cache đáp án hoặc framework ACL chung.

## How the feature works

Lecturer tạo câu trong bank → tạo Quiz draft → replace danh sách ID/revision → preview → publish →
gắn vào Chapter. Tạo tại bộ chọn gồm hai bước độc lập, giữ ID nếu attach thất bại để retry.

Người học start từ Quiz có Course published, server pin revision; chọn option thì lock attempt,
chấm/lưu trong transaction và trả feedback sau commit. Retry cùng option trả dữ liệu đã lưu; khác
option trả 409. Trả lời đủ mới finish. Đạt bằng phép so nguyên `correctCount * 100 >= total * 90`.
Lượt đạt ghi nhận completion theo Quiz; lượt mới không xoá thành tích cũ.

Các nguồn bị ẩn/xoá/thu hồi không làm thay nội dung đã pin. Preview draft không trả nội dung nguồn
đã mất quyền; published content/copies/history giữ theo Q-001. Sharing xác minh user ACTIVE/LECTURER
ở Identity; revoke không lệ thuộc người nhận còn active hay còn role.

## Configuration

- `libs/config/src/environment.ts`: Identity thêm `INTERNAL_SERVICE_SECRET` optional; Learning thêm
  `IDENTITY_SERVICE_URL` optional. Sharing cần cấu hình cả hai; missing/outage không cấp quyền thành công.
- `docker-compose.yml`: Learning dùng URL nội bộ Identity.
- `tsconfig.json`, `jest.config.ts`: alias ứng dụng cho module Quiz.
- Template `.env.example` đã có các key cần dùng; không đọc hoặc sửa real `.env`.
- Không chạy migrations trên database thật, không deploy, không commit/push.

## Verification

Kết quả thực tế (chạy sau code cuối; phiên resume không đổi source nên không chạy lại):

| Lệnh/kiểm tra | Kết quả |
| --- | --- |
| `pnpm build` | Pass cả 6 service ở lần chạy cuối. |
| `pnpm lint` | Chỉ còn 2 lỗi baseline `no-unsafe-argument` trong `test/account-import.integration.spec.ts:238,241`. |
| `pnpm typecheck` | Chỉ còn 5 lỗi baseline `officialName` trong cùng file, dòng 236/238/241/348/383. |
| `pnpm test --silent --json --outputFile=<temporary-result-file>` với PostgreSQL test riêng | 149 suites pass, 1 suite baseline fail compile, 8 suites skip; 1.231 tests pass, 33 skip. |
| Nhóm Learning/Gateway/RBAC + tests nội bộ Quiz Identity trong kết quả toàn repo cuối | 91 suites pass, 937 tests pass. |
| `quizzes/quiz.integration.spec.ts` | 14 tests pass với HTTP/PostgreSQL thật; pool một connection và root-lock contention ở pool hai connections. |
| Identity migration integration được bổ sung cuối | Chạy lại riêng pass 1/1: up/down, preserve grants, seed hai lần vẫn 70 mappings, STUDENT không nhận quyền, JWT mới có permission Quiz. |
| ESLint các TypeScript file thay đổi | Pass ở lần chạy theo file; lint mới của Identity migration test cũng pass. |
| Direct migration entry point bằng ts-node/tsconfig-paths | Import DataSource Learning được, `synchronize=false`; không kết nối DB thật. |
| `git diff --check` | Pass trước các ghi chú documentation cuối. |
| Resume 2026-11-11 (doc-only) | Link check toàn bộ tài liệu Quiz/pm-plan: chỉ còn 1 link preflight hỏng, đã sửa. `git diff --check` chạy lại sau resume: pass. Không chạy lại lint/typecheck/test/build vì không có thay đổi source. |

Full test cuối chạy trước khi bổ sung các assertion seed/JWT trong Identity migration test; test đó
đã được chạy riêng và pass sau bổ sung. Không gọi toàn repo xanh vì lỗi baseline vẫn còn.

Các suite skip gồm các integration Identity cần URL DB riêng và Progress consumer cần RabbitMQ
vhost test riêng. Quiz HTTP/PostgreSQL và migration mới không bị skip. Không dùng broker hoặc DB
đang chạy của dự án để tránh thay đổi dữ liệu thật.

Database kiểm thử: container riêng `bkpractice-lrn009-test`, PostgreSQL 17 Alpine, loopback port
55439, database `bkpractice_quiz_test`. **Container đã được dọn ở phiên resume 2026-11-11**
(`docker rm -f`, không còn volume mồ côi); tái tạo theo hướng dẫn ở tài liệu module khi cần chạy lại
integration. Không dừng container PostgreSQL/RabbitMQ/Redis của dự án.
Không dựa vào file `/tmp` để khôi phục code; source và kết quả chính đã được ghi ở đây.

## Remaining

Đóng tại phiên resume 2026-11-11:

1. Đọc checkpoint, Git status, AGENTS/working agreement; giữ toàn bộ thay đổi chưa commit — xong.
2. Hoàn thiện tài liệu: gộp bảng grant, sửa link preflight, sửa nhãn draft/gate lịch sử — xong.
3. Đối chiếu FR/SR/AC và tick T008–T060 theo bằng chứng — xong (tasks.md cập nhật kèm evidence).
4. Giới hạn kiểm chứng vẫn đúng như ghi ở Verification: tests HTTP dùng trusted principal headers
   theo deployment contract; chưa smoke test qua cụm Gateway/Identity/Learning thật hoặc giao diện
   mobile; token mới test cục bộ, chưa test phiên refresh/login thực trên môi trường triển khai.
5. Worked/evidence bàn giao hoàn tất; không chạy lại lint/typecheck/test/build vì resume chỉ đổi
   tài liệu, không đổi source (chỉ `git diff --check` và link check chạy lại).
6. Container test riêng đã dọn; không chạy down/migration trên database thật.

Còn mở (ngoài phạm vi LRN-009, không blocker mới đã biết):

- Lỗi baseline lint/typecheck của `test/account-import.integration.spec.ts` (ghi ở Verification);
  sửa là quyết định riêng của chủ sở hữu.
- Smoke test môi trường thật, deploy và refresh/login thực: chờ chủ sở hữu cấp phép môi trường.
- Spec giữ `Approved`; chuyển `Implemented/Verified` là quyết định của chủ sở hữu sau khi xem
  bằng chứng này.

Tài liệu theo module đã được review/format và kiểm tra link ở phiên resume:

- [Quiz API/vận hành](../../../pm/plan/learning/quizzes/README.md).
- [Course links](../../../pm/plan/learning/courses/quizzes.md).
- [Identity RBAC](../../../pm/plan/identity/rbac/learning-quizzes.md).
- [Identity share-recipient](../../../pm/plan/identity/users/quiz-share-recipient.md).
- [Gateway routes](../../../pm/plan/api-gateway/learning/quizzes.md).

Rủi ro vận hành: migration down Learning xoá dữ liệu Quiz; phải backup/review deployment khi được
phép đưa lên môi trường thật. Learning tiếp tục dựa trusted Gateway/network boundary hiện có.
Không có commit, push hoặc deployment được thực hiện.
