# 2026-11-22 — Dọn bài tập có nhãn DEMO

Codex triển khai một migration dữ liệu trong Learning theo yêu cầu của chủ sở hữu. [Plan và checklist](../../../pm/plan/learning/problems/remove-demo-problems.md)

## Phạm vi và quyết định

| Câu hỏi                                     | Quyết định                                                                                                                                    |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Nhận diện bài cần dọn thế nào?              | Khớp tiền tố `[DEMO]` trên `problems.title`, bỏ qua viết hoa và khoảng trắng đầu.                                                             |
| Ảnh hưởng tới vòng đời Problem thế nào?     | Migration dùng một lần cho dữ liệu mẫu. Luồng quản lý bài tiếp tục theo đặc tả LRN-001.                                                       |
| Nếu khóa đang xuất bản sẽ hết mục khả dụng? | Chỉ khóa `demo-course-1794753018834` chuyển sang `ON_HOLD`. Nếu có khóa khác rơi vào trường hợp này, migration dừng và báo slug theo LRN-003. |

## Triển khai

TypeORM phát hiện `1700000013000-RemoveDemoProblems.ts` qua glob migration hiện có. Khối SQL khóa các bảng nội dung liên quan trong thời gian kiểm tra điều kiện và xóa. Sau khi có tập ID, migration gỡ các liên kết `RESTRICT` trong `chapter_problems` và `course_problem_history`, rồi xóa bản ghi Problem. Khóa ngoại của test case, mã khởi tạo, harness, ngôn ngữ và các liên kết taxonomy tự dọn các dòng phụ thuộc.

`progress` và biên nhận sự kiện giữ ID lịch sử. Các lượt nộp thuộc Submission được giữ. Khôi phục dữ liệu đã xóa cần bản sao lưu trước khi chạy. `down()` báo rõ yêu cầu này.

## Xác minh

- TypeScript riêng cho migration, lint tập trung trên hai file TypeScript, Prettier và `git diff --check` đều qua.
- `pnpm typecheck` và `pnpm lint` toàn repo báo lỗi dependency ngoài hai file đã sửa. Suite `courses.module.integration.spec.ts` dừng khi thiếu `class-validator` trước khi thực thi test.
- Lần chạy từ terminal chủ sở hữu tới PostgreSQL đã rollback và báo `demo-course-1794753018834`. Bản cập nhật xử lý chính xác slug này và thêm ca tích hợp cho đường chuyển sang `ON_HOLD`.
- Docker socket bị từ chối truy cập. Ca PostgreSQL cách ly còn chờ chạy. Lần thử áp dụng bản cập nhật từ sandbox dừng ở kết nối PostgreSQL với `connect EPERM`.

Không đổi cấu hình.
