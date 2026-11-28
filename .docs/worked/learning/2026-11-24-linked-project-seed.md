# 2026-11-24 — Dữ liệu mẫu liên dịch vụ

Mở rộng bộ `seed:demo` theo yêu cầu nạp dữ liệu cho các màn dùng cơ sở dữ liệu. Mặc định Identity seed 13 tài khoản giảng viên, gồm chủ sở hữu danh mục cũ và 12 hồ sơ mô phỏng. Learning tái sử dụng bộ 5 khóa học, 25 chương, 250 bài tập, 600 câu hỏi và 125 quiz. Các giảng viên mới có địa chỉ `@bkpractice.example.test` và dùng mật khẩu do môi trường cấp qua `ACCOUNT_IMPORT_PASSWORD`. Bộ seed tài khoản loại toàn bộ sinh viên khỏi fixture.

## Cách chạy

Chạy trong thư mục backend sau các migration Identity, Learning và Community.

```bash
pnpm seed:demo --dry-run
pnpm seed:demo
```

Tùy chọn `SEED_DEMO_STUDENT_IDS` nhận các UUID phân tách bằng dấu phẩy của tài khoản sinh viên test đã tồn tại. Khi được cung cấp, lệnh thêm lịch sử nộp, XP và lượt làm quiz cho các UUID đó. Chế độ này cần các migration của Submission và migration XP `1700000015000` của Learning. Cấu hình `.env` trỏ vào cơ sở dữ liệu dev hoặc test dành cho dữ liệu mẫu.

## Luồng ghi dữ liệu

1. Identity dùng tiếp RBAC và seed giảng viên theo ID ổn định. Nếu có danh sách sinh viên test, Identity chỉ đọc để kiểm tra từng tài khoản có vai trò sinh viên và đang hoạt động.
2. Learning nạp danh mục. Community tạo thảo luận toàn hệ thống, theo bài tập và theo học phần dưới tên các giảng viên fixture, kèm bình luận, phản hồi, lượt thích, đánh dấu và báo cáo.
3. Chế độ có sinh viên test tạo lịch sử Accepted, sai đáp án, lỗi biên dịch, lỗi lúc chạy và lượt chạy thử cho những tài khoản đã chọn. Learning đọc lại ngày chấm để tạo XP, tiến độ và hoạt động. Quiz có lượt đạt, chưa đạt và đang làm. Các kết quả là bản ghi mô phỏng, script không gửi job sang Judge.

Các bước ghi theo transaction của từng cơ sở dữ liệu. Có thể chạy lại sau lỗi giữa chừng. ID ổn định giữ nguyên ngày của các lượt nộp đã nạp và tránh trùng bản ghi. Số lượng terminal là kế hoạch vì dữ liệu có sẵn được giữ khi trùng khóa.

## Kiểm tra

- Chạy thử bộ sinh dữ liệu mặc định với 13 giảng viên, 390 bài thảo luận và không có tài khoản sinh viên hoặc hoạt động sinh viên mới. Chế độ chọn sinh viên test cũng được kiểm tra ở dry-run.
- Chạy 1.250 test case fixture với lời giải Python đã sinh, gồm cả các test ẩn trong kho seed.
- Kiểm tra tính ổn định ID, cửa sổ XP, đáp án quiz và quan hệ Community bằng test fixture.
- Chưa ghi vào PostgreSQL. Sandbox từ chối Docker socket và kết nối PostgreSQL trên loopback.
