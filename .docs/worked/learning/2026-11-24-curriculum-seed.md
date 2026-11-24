# 2026-11-24 — Bổ sung bộ bài học có thứ tự

Mở rộng seed Learning để bổ sung nội dung cho database đã có dữ liệu. Bộ mới gồm bảy khóa, từ nhập môn tới mảng và tiền tố, chuỗi và bảng băm, sắp xếp và tìm kiếm, stack/queue/heap, cây và đồ thị, rồi quy hoạch động. Mỗi khóa có ba chương với mục tiêu ngắn. Bốn bài tập trong mỗi chương được xếp theo độ khó và đi kèm một quiz ôn tập ba câu.

## Nạp vào database Learning

Trong `BKPractice-backend`, đặt `LEARNING_DATABASE_URL` trong `.env` theo kết nối PostgreSQL muốn seed. Để nạp vào database production đang mở trong DBeaver, dùng host, port và tên database của kết nối Learning đó cùng tài khoản có quyền ghi. Database đích cần có các migration Learning. Chạy lệnh từ máy có thể kết nối tới database.

```bash
pnpm seed:demo:learning --curriculum-only --dry-run
pnpm seed:demo:learning --curriculum-only
```

Chế độ này đưa vào 7 khóa, 21 chương, 84 bài tập, 63 câu hỏi ngân hàng và 21 quiz. Lệnh chạy lại dùng cùng ID và slug. Script báo rõ khi slug trùng bản ghi mang ID khác. Thao tác seed Learning áp dụng trong một transaction.

Dry-run chỉ đọc các fixture. Sau khi seed báo `Learning demo data ready`, có thể xác nhận bộ khóa mới trên DBeaver bằng truy vấn sau.

```sql
SELECT count(*) FROM courses WHERE slug LIKE 'curriculum-%' AND deleted_at IS NULL;
```

## Tổ chức dữ liệu

Các bài mới dùng đề, dữ liệu vào/ra và lời giải tham chiếu riêng. Mỗi bài có một test công khai và ba test ẩn. Hàm tạo fixture rà ID, slug, câu hỏi lặp và liên kết tới chương. Bài và quiz lưu thứ tự trong từng chương theo mối liên kết với chapter, thay cho việc suy chapter từ tiền tố khóa hoặc vị trí trong một nhóm 10 bài.

Lần seed bổ sung giữ ID và tiến độ của dữ liệu đã có. Lệnh tổng `seed:demo` vẫn đọc bộ cũ cùng bộ mới, trong khi `--curriculum-only` chỉ ghi bộ mới. Seed hoạt động tùy chọn dùng lời giải tham chiếu của bài mới và chọn bài không lặp theo kích thước danh mục.

## Kiểm chứng

TypeScript, ESLint cho script seed và cả năm test fixture đều đạt. Dry-run xác nhận số lượng của bộ mới và seed tổng mặc định tạo 0 tài khoản sinh viên. Lời giải tham chiếu chạy đúng với 336 test case trong bộ mới và 250 ca đối chiếu độc lập cho năm bài. Kết nối tới PostgreSQL local bị sandbox chặn nên chưa chạy lệnh ghi dữ liệu.
