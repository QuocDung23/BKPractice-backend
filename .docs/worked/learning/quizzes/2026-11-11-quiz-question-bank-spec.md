# 2026-11-11 — Đặc tả Quiz và ngân hàng câu hỏi

- Author: Codex
- Scope: Tài liệu LRN-009 và liên kết trong danh mục spec; không đổi source hoặc cấu hình.

## Spec and plan

- Spec: [LRN-009 — Quiz và ngân hàng câu hỏi](../../../specs/02-learning/quizzes/spec.md).
- Plan: Chưa tạo; người dùng yêu cầu viết spec, chưa yêu cầu chuyển sang lập kế hoạch.
- Tasks: Chưa tạo; không có công việc triển khai được đánh dấu hoàn thành.
- Spec status at start: Chưa tồn tại. Bản mới là `Proposed` 0.1 do còn câu hỏi sản phẩm và
  phụ thuộc đồng bộ các spec hiện hành.
- Đây là công việc tài liệu theo yêu cầu trực tiếp của chủ sở hữu, ở bước đặc tả của SDD.
  Không thực hiện các bước triển khai/migration hoặc coi phê duyệt hướng thiết kế là phê duyệt
  mọi đề xuất chưa được trả lời. Các phần plan/implement/kiểm thử code không áp dụng cho đợt này.

## Questions clarified

| Question                                                                   | Conclusion                                                                                                                                                               | Source                                                                               |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Quiz nằm đâu, liên quan Course ra sao?                                     | Thuộc Learning; nhiều Quiz/Chapter và một Quiz dùng ở nhiều Chapter/Course.                                                                                              | Chủ sở hữu xác nhận trong hội thoại; ADR 0002 giữ một bounded context Learning.      |
| Ai quản lý Learning?                                                       | LECTURER chỉ sửa nội dung mình tạo; ADMIN quản lý mọi nội dung. Đây là yêu cầu mới, khác LRN-008 ADMIN-only.                                                             | Xác nhận trực tiếp của chủ sở hữu; LRN-008 FR-001/002/003 được đối chiếu trong spec. |
| Chấm và phản hồi khi nào?                                                  | Learning chấm bằng đáp án, trả ngay đúng/sai và giải thích mỗi câu; cuối lượt tổng kết. Đạt từ 90% thì hoàn thành.                                                       | Chủ sở hữu xác nhận trong hội thoại.                                                 |
| Câu hỏi thuộc riêng từng Quiz không?                                       | Không; cần ngân hàng để chọn lại và dùng trong nhiều Quiz. Schema sáu bảng từng trao đổi chưa phải thiết kế có hiệu lực.                                                 | Yêu cầu mới nhất của chủ sở hữu và hướng ngân hàng đã trao đổi.                      |
| Có triển khai source, schema hoặc frontend trong lần này không?            | Không; chỉ tạo spec và worked entry, thêm liên kết tài liệu.                                                                                                             | Yêu cầu “lên spec riêng”; working agreement, Documentation-only work.                |
| Có tự sửa các Approved spec đang khác yêu cầu mới không?                   | Không trong đợt này; ghi rõ phụ thuộc phải đồng bộ LRN-008, LRN-003, Identity và kiến trúc trước triển khai.                                                             | Working agreement, Sources of truth; phạm vi người dùng yêu cầu là spec Quiz riêng.  |
| Các chi tiết chia sẻ, tiện ích, công nhận kết quả khi sửa đề đã chốt chưa? | Đã gửi ba câu hỏi cho người dùng. Nếu chưa trả lời thì giữ mở Q-001/002/003, không lấy thời gian chờ làm phê duyệt. Q-004 tới Q-008 ghi rõ các hợp đồng cần review tiếp. | Working agreement, bước 3; mục Câu hỏi mở của LRN-009.                               |

## What was done

Tạo `.docs/specs/02-learning/quizzes/spec.md` với mã LRN-009. Tài liệu phân biệt các quyết định chủ
sở hữu đã xác nhận với đề xuất bản đầu, có yêu cầu chức năng, phân quyền, đầu vào/đầu ra, lỗi,
tình huống biên, bảo mật và tiêu chí nghiệm thu. Thêm liên kết từ `.docs/specs/README.md` để tìm
được spec từ danh mục hiện hành.

Spec mô tả câu hỏi tồn tại độc lập trong ngân hàng, Quiz chọn câu/phiên bản có thứ tự, và Chapter
liên kết Quiz. Nó thay thế hướng nhập câu hỏi riêng cho mỗi Quiz đã được đề xuất ban đầu trong
hội thoại; không khẳng định database hoặc API tương ứng đã tồn tại.

## Why these choices

Ngân hàng đáp ứng yêu cầu tránh nhập câu lặp. Giữ phiên bản nội dung được xuất bản và bộ đề của
lượt làm giúp sửa câu nguồn không chấm lại lịch sử. Chấm từng câu trong Learning phù hợp với
nghiệp vụ so đáp án và ranh giới Judge chỉ thực thi mã. Tách kết thúc lượt khỏi đạt 90% giữ đúng
ý nghĩa hoàn thành; retry an toàn không cho một câu tăng điểm nhiều lần.

Để `Proposed` vì chia sẻ giữa LECTURER, tiện ích bản đầu, hiệu lực thành tích khi đổi đề và các
hợp đồng khác chưa được chủ sở hữu chốt hết. Những mục này được ghi thành câu hỏi, không chọn
ngầm để viết code. Không đưa bảng/cột, endpoint hay class vào yêu cầu sản phẩm; phần HOW thuộc
plan sau review.

## How the feature works

Đợt này chỉ ghi lại luồng sản phẩm dự kiến, chưa tạo tính năng chạy được:

1. LECTURER/ADMIN soạn câu và đáp án trong ngân hàng, tìm/lọc và chọn nhiều câu để tạo Quiz nháp.
2. Người quản lý xem trước, xuất bản Quiz với phiên bản câu đã chọn rồi gắn vào các Chapter
   trong phạm vi được quản lý; sửa ngân hàng không tự đổi Quiz đã publish.
3. Người học bắt đầu lượt với bộ đề cố định. Mobile gửi lựa chọn; Learning lưu và trả đúng/sai,
   đáp án cùng giải thích của riêng câu đó, không mở bộ đáp án các câu còn lại.
4. Khi đủ câu, kết thúc tổng hợp số đúng/sai, tỷ lệ và đạt/chưa đạt theo ngưỡng 90%; lịch sử
   không bị ghi đè khi làm lại. Quy tắc phiên bản/thành tích và tích hợp Course còn chờ review.
5. Lỗi quyền, đầu vào, lựa chọn trùng/xung đột và lỗi lưu không được sửa dữ liệu một phần hoặc
   lộ đáp án. Các AC trong spec là yêu cầu để xác minh ở lần triển khai tương lai, chưa phải
   kết quả kiểm thử đã chạy.

## Configuration

No configuration change.

## Verification

- Kiểm tra tài liệu bằng Python: đủ các mục theo template, 25 FR/7 SR/25 AC có ID duy nhất,
  mỗi FR được tham chiếu trong AC và các liên kết Markdown tới file nội bộ đều tồn tại: qua.
- `pnpm exec prettier --check` trên ba file tài liệu và `git diff --check`: qua.
- Đối chiếu các quyết định đã chốt với hội thoại, LRN-003, LRN-008 và kiến trúc Learning.
- Not verified: Không chạy lint/typecheck/test/build vì không đổi code; không có API, migration
  hoặc tính năng Quiz để kiểm thử. Kiểm tra tài liệu không phải bằng chứng tính năng đã chạy.

## Remaining

- Not done: Đóng Q-001 tới Q-008, xử lý xung đột với spec hiện hành, review/phê duyệt rồi mới
  tạo plan/tasks và triển khai. Không tự đổi trạng thái `Approved` trong lần viết này.
- Risks: LRN-008 và code đang ADMIN-only; chỉ thêm spec này không thay đổi quyền thực tế.
  Quy tắc chia sẻ, phiên bản/hoàn thành, trạng thái và giới hạn chưa được phép suy ra từ code.
