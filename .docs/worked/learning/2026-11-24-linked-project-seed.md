# 2026-11-24 — Dữ liệu mẫu liên dịch vụ

Mở rộng bộ `seed:demo` đã có theo yêu cầu nạp nhiều dữ liệu cho toàn bộ các màn dùng cơ sở dữ liệu. Learning tái sử dụng bộ 5 khóa học, 25 chương, 250 bài tập, 600 câu hỏi và 125 quiz. Identity tạo thêm 200 sinh viên, 12 giảng viên cùng hồ sơ mô phỏng. Các tài khoản mới có địa chỉ `@bkpractice.example.test` và dùng mật khẩu do môi trường cấp qua `ACCOUNT_IMPORT_PASSWORD`.

## Cách chạy

Chạy trong thư mục backend sau các migration Identity, Learning, Submission và Community. Bộ seed Learning cần migration XP `1700000015000`.

```bash
pnpm seed:demo --dry-run
pnpm seed:demo
```

`SEED_DEMO_STUDENTS=1000 pnpm seed:demo` tạo 1.000 sinh viên mô phỏng ngoài hai sinh viên fixture cũ. Giá trị nhận từ 1 đến 1.000. Giữ cấu hình `.env` trỏ vào cơ sở dữ liệu dev hoặc test dành cho dữ liệu mẫu.

## Luồng ghi dữ liệu

1. Identity dùng tiếp RBAC hiện có, thêm tài khoản và hồ sơ với ID ổn định. Giữ mật khẩu và hồ sơ đã được người dùng cập nhật. Dữ liệu mẫu gắn với các ID fixture đã kiểm tra xung đột.
2. Learning nạp danh mục trước để Submission tạo lịch sử gắn đúng bài và tài khoản. Lịch sử có Accepted, sai đáp án, lỗi biên dịch, lỗi lúc chạy và lượt chạy thử. Lời giải Python của các bản Accepted tương ứng với đề trong bộ fixture. Các kết quả là bản ghi mô phỏng, script không gửi job sang Judge.
3. Learning đọc lại ngày chấm đã lưu của các bản Accepted để tạo XP và tiến độ, gồm bài đã giải trong tuần/tháng và hoạt động ở những ngày trước. Mỗi cặp sinh viên–bài chỉ có một tiến độ. Quiz có bài đã làm đạt, chưa đạt và đang làm, với đáp án gắn đúng phiên bản câu hỏi.
4. Community tạo thảo luận toàn hệ thống, theo bài tập và theo học phần. Bình luận, phản hồi, lượt thích, đánh dấu và báo cáo đều tham chiếu bài và tài khoản trong bộ mẫu.

Các bước ghi theo transaction của từng cơ sở dữ liệu. Có thể chạy lại sau lỗi giữa chừng. ID ổn định giữ nguyên ngày của các lượt nộp đã nạp và tránh trùng bản ghi. Số lượng terminal là kế hoạch vì dữ liệu có sẵn được giữ khi trùng khóa.

## Kiểm tra

- Chạy thử bộ sinh dữ liệu mặc định và ở quy mô tối đa. Bộ mặc định lập kế hoạch 202 sinh viên, 13 giảng viên, 17.953 lượt nộp/chạy, 12.209 lượt Accepted, 3.591 lượt làm quiz và 404 bài thảo luận.
- Chạy 1.250 test case fixture với lời giải Python đã sinh, gồm cả các test ẩn trong kho seed.
- Kiểm tra tính ổn định ID, cửa sổ XP, đáp án quiz và quan hệ Community bằng test fixture.
- Chưa ghi vào PostgreSQL. Sandbox từ chối Docker socket và kết nối PostgreSQL trên loopback.
