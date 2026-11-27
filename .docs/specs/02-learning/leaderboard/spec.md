# Bảng xếp hạng XP luyện tập

Status: Approved

Amendment Quiz XP 1.1 — 2026-11-27. XP của Quiz được cộng vào cùng bảng xếp hạng với XP bài lập
trình. Không thay đổi quy tắc XP Problem hiện hành đã duyệt theo [kế hoạch web liên repo](../../../../../review/plan-bang-xep-hang-web.md).

1. **XP Problem:** Lần `Accepted` chính thức đầu tiên của một sinh viên trên một Problem lập trình
   tạo XP cố định theo độ khó lúc ghi nhận: EASY 10, MEDIUM 20, HARD 30. Nộp lại, chạy thử và bài
   sai không cộng XP. Dữ liệu solved cũ giữ `solvedAt` gốc và được migration hiện hành backfill.
2. **XP Quiz:** Lượt pass đầu tiên đạt ngưỡng 90% của mỗi cặp (`userId`, `quizId`) tạo đúng một
   khoản XP: EASY 10, MEDIUM 20, HARD 30 theo độ khó của Quiz revision được pass. Mức thưởng cố
   định sau khi cấp. Fail, retry, revision mới hoặc cùng Quiz ở Chapter/Course khác không cấp thêm.
   Thời điểm ghi XP là `finishedAt` của lượt pass đầu tiên.
3. **Ranh giới rollout Quiz:** Không backfill XP cho Quiz đã pass trước ngày phát hành tính năng.
   Người đã pass trước đó không nhận XP khi làm lại; attempt còn `IN_PROGRESS` tại rollout có thể
   nhận XP nếu lần pass đầu tiên được hoàn tất sau rollout. Revision đã publish nhưng chưa có độ
   khó được gán EASY cho các lượt pass tương lai; migration này không tạo XP.
4. **Phạm vi ranking:** Chỉ xếp sinh viên đang hoạt động có XP trong kỳ. XP Problem đến từ Problem
   đang `PUBLISHED` và chưa xóa; XP Quiz đến từ Quiz đang `PUBLISHED` và chưa xóa. Kỳ tuần bắt đầu
   thứ Hai, kỳ tháng bắt đầu ngày 1 theo giờ Việt Nam.
5. **Thứ tự:** XP giảm dần, rồi thời điểm cấp XP gần nhất trong kỳ tăng dần, rồi ID tăng dần.
6. **API:** `GET /api/leaderboard` dùng phiên sinh viên, nhận `period`, `page` và `limit`. Response
   trả kỳ, thời gian tạo kết quả, Top 3, danh sách phân trang từ hạng 4, tổng số hàng, XP, `solved`
   (số Problem đã giải), `quizzesPassed` (số Quiz pass đầu tiên trong kỳ) và thẻ người xem. Người
   xem 0 XP có `rank: null`.
7. **Identity:** Identity xác nhận điều kiện tham gia và trả tên hiển thị, avatar cho các hàng cần
   hiển thị. Lỗi phụ thuộc trả trạng thái thử lại.
8. **Nghiệm thu:** Kiểm mốc đổi kỳ, tie-break, award idempotency của cả Problem và Quiz, XP Quiz qua
   revision/course, rollout không backfill, độ khó cũ mặc định, quyền truy cập và hạng ngoài trang.

Người dùng chỉ thấy tổng XP; breakdown theo nguồn chưa thuộc API ranking.
