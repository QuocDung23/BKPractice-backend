# 2026-11-11 — Plan và checklist chi tiết LRN-009

- Author: Codex
- Scope: Tài liệu kế hoạch, tasks, metadata/liên kết và worked entry cho Quiz/ngân hàng.

## Spec and plan

- Spec: [LRN-009 0.1](../../../specs/02-learning/quizzes/spec.md).
- Plan: [Kế hoạch draft](../../../specs/02-learning/quizzes/plan.md).
- Tasks: [Checklist T001–T060](../../../specs/02-learning/quizzes/tasks.md).
- Spec status at start: `Proposed`; giữ nguyên trạng thái sau đợt tài liệu này.
- Chủ sở hữu yêu cầu tường minh viết tiếp plan/tasks chi tiết để follow. Vì vậy tạo draft review
  ngay trong khi spec còn mở; không coi đây là approved implementation plan hoặc bắt đầu code.
  Yêu cầu này chỉ mở rộng phạm vi tài liệu của lần viết spec trước, không cho phép migration,
  cài dependency, sửa runtime hoặc triển khai tính năng.

## Questions clarified

| Question                                                       | Conclusion                                                                                                                                  | Source                                                                                                                    |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Có lập plan khi spec Proposed không?                           | Chủ sở hữu yêu cầu tường minh draft plan/tasks; ghi trạng thái và gates rõ, không tự Approve hoặc implement.                                | Yêu cầu hiện tại; working agreement và SDD giữ cổng Approved trước code.                                                  |
| Q-001 tới Q-008 có được tự chọn mặc định không?                | Không; nhóm thành G-01 tới G-05, tasks T002–T005 cần quyết định thật.                                                                       | Mục Câu hỏi mở của LRN-009.                                                                                               |
| Quyền Learning mới có thể chỉ thêm role vào guard không?       | Không; phải đồng bộ spec và catalog/migration Identity, owner checks cùng scoped reads của các module cũ.                                   | LRN-009 FR-002; source authorization Problems/Courses đang ADMIN-only và Identity migration LearningSelfStudyPermissions. |
| Entity liên kết Chapter/Quiz thuộc đâu?                        | Courses; Quizzes giữ nội dung/phiên bản/lượt làm. Chỉ giao tiếp qua own read ports/projections, không import entity/write repo module khác. | Kiến trúc Learning và dependency rules.                                                                                   |
| Bản đề của mỗi attempt phải có một JSONB snapshot riêng không? | Không phải yêu cầu schema của spec; plan dùng QuizRevision và QuestionRevision bất biến, giữ FK để bảo toàn đề.                             | FR-012/016; spec mô tả hành vi cố định nội dung, không cố định cách lưu.                                                  |
| Chấm có dùng Judge/event hoặc sửa Progress không?              | Không trong phạm vi hiện tại. Chấm HTTP trong Learning; Progress/Course completion chỉ đổi nếu Q-004 được duyệt thêm.                       | FR-001, Đầu ra và Ngoài phạm vi của spec.                                                                                 |
| Các lệnh validation đã chạy trên code chưa?                    | Không; chỉ kiểm tài liệu trong đợt này. Lệnh test/build/lint/typecheck nằm trong plan/tasks cho implementation sau.                         | Phạm vi người dùng; working agreement, Documentation-only work.                                                           |

## What was done

Tạo `plan.md` theo template với các gates, khảo sát source hiện hành, ranh giới module, ba
aggregate, phương án tám bảng, immutable revisions, nguyên tử/retry/concurrency, migration,
API/DTO/permissions, bảo mật và chiến lược test. Plan tách phần chưa được chốt khỏi phương án
kỹ thuật để không biến schema/endpoint dự kiến thành yêu cầu sản phẩm đã duyệt.

Tạo `tasks.md` với 60 task theo mười chặng. Mỗi task có đầu ra/kiểm chứng, dependency và truy
vết; bảng cuối đối chiếu 25 FR, 7 SR và 25 AC của spec. Không đánh dấu task implementation
hoàn thành. Tiện ích clone/import/ôn có task điều kiện, không mặc nhiên mở scope.

Cập nhật metadata spec để dẫn tới draft mới mà không thay yêu cầu hoặc trạng thái. Cập nhật
danh mục `.docs/specs/README.md` và `.docs/pm/plan/README.md` để tìm được plan/tasks. Không sửa
nội dung Approved spec khác hoặc worked entry lịch sử của lần soạn spec.

## Why these choices

Ngân hàng, Quiz và attempt có bất biến riêng nên dùng ba aggregate/repository, không repository
per table. Câu hỏi/options được giữ cùng immutable revision; QuizRevision pin question revisions
và attempt pin QuizRevision, tránh nhân đôi đề đầy đủ ở mỗi attempt mà vẫn bảo toàn lịch sử.

Đặt liên kết trong Courses giữ ownership Chapter và toàn vẹn reorder/save. Tái dùng storage
transaction theo DataSource giúp cross-module reads không lấy thêm pool connection. Attempt
row lock chung cho answer/finish và unique answers giải quyết double score, finalize race và
replay. Quyền Learning phải làm trước các API mới để việc cấp lại LECTURER không mở sửa chéo.

Gates và task có điều kiện giữ draft bám spec Proposed, không tự quyết sharing, completion
version, state machine, limits hoặc taxonomy. Người follow nhìn thấy điểm phải dừng và sản phẩm
cần chốt thay vì phát hiện muộn khi đã viết migration.

## How the feature works

Đợt này chỉ thay quy trình tài liệu để người triển khai follow:

1. Đọc spec rồi plan, dùng T001–T007 đóng câu hỏi, đồng bộ nguồn chân lý và review contracts.
2. Follow quyền Learning, domain, schema/repository, sau đó API ngân hàng và API soạn Quiz.
3. Làm liên kết Course/Chapter trước access reader/start attempt để visibility có nguồn kiểm rõ.
4. Làm start/resume/answer/finish/history. Answer và finish cùng khoá attempt; commit rồi mới
   phản hồi. Bản revision cố định không bị sửa khi cập nhật ngân hàng hoặc publish Quiz mới.
5. Nối module/Gateway, chạy E2E/privacy/regression và các gate thật. Cập nhật tasks/worked theo
   bằng chứng, nêu fail/skip thay vì gọi toàn repo xanh.
6. Chưa qua gate hoặc gặp yêu cầu mâu thuẫn thì dừng implementation liên quan, cập nhật spec
   bằng quyết định chủ sở hữu; không tự hoàn thiện hành vi bằng mặc định kỹ thuật.

## Configuration

No configuration change.

Plan có liệt kê alias/DI/migration registration cần làm sau này; các thay đổi đó chưa được áp
dụng. Không mở `.env` hoặc chạy lệnh migration có nạp secret trong lần tài liệu này.

## Verification

- Kiểm tài liệu bằng Python: đủ 22 mục của template plan, 60 task mở có ID duy nhất và thứ tự,
  dependency tồn tại/không vòng, đủ 25 FR/7 SR và tham chiếu 25 AC; links mới/hồ sơ LRN-009
  tồn tại, scripts pnpm trong plan có trong package.json: qua.
- `pnpm exec prettier --check` trên sáu file tài liệu thay đổi và `git diff --check`: qua.
- Phát hiện link cũ `api-gateway/identity/README.md` trong `.docs/pm/plan/README.md` đã thiếu từ
  HEAD; không sửa link không liên quan. Link Quiz/plan/tasks mới đều hợp lệ.
- Đọc đối chiếu các điểm chạm hiện hành: Course aggregate/Chapter/repository/view, Problems và
  Courses authorization, transaction storage, Identity catalog/migration, Gateway, package scripts.
- Not verified: Không chạy code lint/typecheck/test/build hoặc migration; những lệnh trong
  plan/tasks là hướng dẫn tương lai, không phải bằng chứng đã chạy. Không có `.codegraph/` nên
  không index/sync; cũng không có thay đổi source.

## Remaining

- Not done: Quyết định Q-001 tới Q-008, đồng bộ spec hiện hành, review/Approve spec và plan;
  toàn bộ 60 task triển khai vẫn mở. Chưa có endpoint, schema mới hoặc Quiz chạy được.
- Risks: Quyền Learning thật vẫn ADMIN-only; các API/schema/revision strategy là draft cần review.
  LRN-008 và Course/Identity specs chưa được sửa trong đợt này; không được bắt đầu code chỉ vì
  đã có plan/tasks chi tiết.
