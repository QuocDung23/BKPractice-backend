# 2026-11-24 — Cho nộp lại đến khi giải đúng

Luồng nộp bài áp dụng quy tắc mới theo yêu cầu đã xác nhận. Tài khoản có thể nộp lại sau phán quyết sai hoặc lỗi. Trong lúc chấm, yêu cầu đồng thời bị chặn qua chỉ mục duy nhất của PostgreSQL. Sau Accepted, backend chặn nộp tiếp cho bài đó. [Kế hoạch SUB-002](../../../specs/03-submission/submit-code/plan.md)

`GET /api/submissions/problems/:problemId/status` trả trạng thái và mã công khai của lượt nộp liên quan. API xác định tài khoản từ ngữ cảnh Gateway. Submit trả `SUBMISSION_IN_PROGRESS` khi đã có bài chờ chấm và `SUBMISSION_ALREADY_SUBMITTED` khi đã giải. Bài sai vẫn còn trong lịch sử. Sự kiện cộng XP chỉ phát khi Accepted.

Migration `1792515607000` gỡ khóa của những bài sai từ luồng cũ và ưu tiên khóa của một bản ghi Accepted hoặc đang chấm. 54 kiểm thử đơn vị đạt. Kiểm thử PostgreSQL được bỏ qua vì thiếu database kiểm thử. Lệnh `pnpm migration:run:submission` chưa áp dụng được migration vì môi trường chặn kết nối PostgreSQL với lỗi `EPERM`.
