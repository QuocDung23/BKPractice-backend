# Bảng xếp hạng XP luyện tập

Status: Approved

Phê duyệt theo kế hoạch web đã review và xác nhận Dễ 10 XP, Vừa 20 XP, Khó 30 XP, tính cả bài đã giải trước đây. [Kế hoạch liên repo](../../../../../review/plan-bang-xep-hang-web.md)

1. Lần `Accepted` chính thức đầu tiên của một sinh viên trên một bài lập trình tạo một khoản XP, cố định theo độ khó tại lúc ghi nhận. Nộp lại, chạy thử và bài sai không cộng XP. Backfill bản ghi đã giải theo độ khó hiện tại, giữ `solvedAt` gốc.
2. Bảng toàn trường chỉ xếp sinh viên đang hoạt động có XP trong kỳ từ bài đang xuất bản và chưa xóa. Kỳ tuần bắt đầu thứ Hai, kỳ tháng bắt đầu ngày 1 theo giờ Việt Nam. Xếp XP giảm dần, rồi thời điểm bài giải cuối cùng trong kỳ tăng dần, rồi ID tăng dần.
3. `GET /api/leaderboard` dùng phiên sinh viên, nhận `period`, `page` và `limit`. Response trả kỳ, thời gian tạo kết quả, Top 3, phần danh sách phân trang từ hạng 4, tổng số hàng của danh sách và thẻ người xem. Người xem 0 XP có `rank: null`.
4. Identity xác nhận điều kiện tham gia và trả tên hiển thị, avatar cho các hàng cần hiển thị. Dữ liệu bảng hạng công bố hạng, XP, số bài và thông tin hồ sơ công khai. Lỗi phụ thuộc trả trạng thái thử lại.
5. Nghiệm thu mốc đổi kỳ, thứ tự đồng XP, cơ chế chống cộng trùng, XP cố định sau khi đổi độ khó, chuyển đổi dữ liệu cũ, quyền truy cập và hạng người xem ngoài trang.
