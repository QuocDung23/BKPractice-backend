# 2026-11-24 — Bảng xếp hạng XP luyện tập

- Tác giả · Codex
- Phạm vi · Learning, Identity và API Gateway

## Đặc tả và kế hoạch

[Đặc tả đã duyệt](../../../specs/02-learning/leaderboard/spec.md) · [Kế hoạch triển khai](../../../specs/02-learning/leaderboard/plan.md) · [Công việc](../../../specs/02-learning/leaderboard/tasks.md)

| Câu hỏi                           | Kết luận                                                                                            | Nguồn      |
| --------------------------------- | --------------------------------------------------------------------------------------------------- | ---------- |
| Xếp hạng theo chỉ số nào?         | Tổng XP. Số bài là chỉ số phụ.                                                                      | Người dùng |
| Cách tính XP và xử lý dữ liệu cũ? | Dễ 10, Vừa 20, Khó 30. Bài đã giải giữ ngày Accepted gốc và nhận XP theo độ khó khi chạy migration. | Người dùng |

## Luồng xử lý

1. Khi Learning xử lý sự kiện `submission.accepted`, transaction tiến độ ghi XP cùng lần giải đầu của từng cặp sinh viên–bài. Ràng buộc duy nhất và receipt hiện có xử lý nộp đồng thời và event giao lại. Khi xử lý Accepted cũ đến muộn, ngày giải sớm nhất tiếp tục được lưu.
2. Migration `1700000015000-AddLeaderboardXp` bổ sung cột `progress.awarded_xp`, tính điểm từ tiến độ có sẵn và thêm index cho khoảng thời gian xếp hạng. Giữ điểm cùng tiến độ để thao tác ghi có chung transaction và giá trị đã cấp được cố định.
3. Gateway xác thực phiên và chuyển tiếp `GET /api/leaderboard`. Learning giới hạn kỳ theo giờ Việt Nam, cộng XP từ bài đang xuất bản, đối chiếu sinh viên hoạt động với Identity theo lô rồi xếp hạng.
4. Identity cấp tên hiển thị và avatar ký số cho các hàng cần hiển thị. Learning trả bục, trang hiện tại và hạng người xem từ cùng lần tính. Lỗi tra cứu Identity trả HTTP 503 để web có thể thử lại.

## Cấu hình

`libs/config/src/environment.ts` cho Gateway đọc `INTERNAL_SERVICE_SECRET`, dùng cùng giá trị đã cấu hình cho Learning và Identity. Learning dùng `IDENTITY_SERVICE_URL` hiện có. Áp dụng migration Learning trước khi chạy các tiến trình đã cập nhật.

## Kiểm tra

- 246 bài kiểm thử backend liên quan qua, gồm mốc đổi kỳ, đồng XP, điều kiện sinh viên, phân trang, quyền Gateway và dữ liệu hồ sơ. Typecheck, ESLint trên các tệp thay đổi và build Gateway, Identity, Learning đều qua.
- Hai nhóm kiểm thử HTTP có sẵn cần lắng nghe trên localhost. Sandbox trả `listen EPERM`. Docker socket bị từ chối, nên các ca PostgreSQL dành cho migration và thứ tự ghi Accepted chưa chạy.
- Migration chưa áp dụng vào cơ sở dữ liệu dự án.
