# 2026-11-23 — UUID của bài luyện tập seed

| Mục     | Chi tiết                                                           |
| ------- | ------------------------------------------------------------------ |
| Tác giả | Codex                                                              |
| Phạm vi | Kiểm tra `problemId` tại API Chạy thử, Nộp bài và Lịch sử theo bài |

## Đặc tả và kế hoạch

| Tính năng | Đặc tả đã Approved                                              | Kế hoạch                                                     | Checklist                                                      |
| --------- | --------------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------- |
| Chạy thử  | [SUB-001](../../specs/03-submission/run-code/spec.md)           | [Plan](../../specs/03-submission/run-code/plan.md)           | [Tasks](../../specs/03-submission/run-code/tasks.md)           |
| Nộp bài   | [SUB-002](../../specs/03-submission/submit-code/spec.md)        | [Plan](../../specs/03-submission/submit-code/plan.md)        | [Tasks](../../specs/03-submission/submit-code/tasks.md)        |
| Lịch sử   | [SUB-003](../../specs/03-submission/submission-history/spec.md) | [Plan](../../specs/03-submission/submission-history/plan.md) | [Tasks](../../specs/03-submission/submission-history/tasks.md) |

## Câu hỏi đã làm rõ

| Câu hỏi                                      | Kết luận                                                                                     | Nguồn                                                                |
| -------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `problemId` cần nhận các phiên bản UUID nào? | UUID v4 đang dùng và UUID v5 từ dữ liệu seed.                                                | Xác nhận của chủ repo và các bài seed `c02-ch01-p04`, `c04-ch01-p04` |
| Thay đổi áp dụng ở đâu?                      | `problemId` trong `POST /api/run`, `POST /api/submissions` và bộ lọc `GET /api/submissions`. | Ba điểm nhận ID trong luồng luyện tập                                |

## Thay đổi và cách hoạt động

`IsProblemId()` dùng bộ kiểm tra `isUUID` của `class-validator` cho cả v4 và v5. Ba DTO dùng chung decorator này để nhận cùng một định dạng ID và giữ cách báo lỗi UUID hiện có.

Frontend gửi ID đang có của bài tập. Sau validation, Chạy thử lưu ID làm nhãn tuỳ chọn, Nộp bài dùng ID để lấy gói chấm từ Learning, còn Lịch sử dùng ID để lọc bản ghi. ID của bài đã seed dùng được trực tiếp với cột UUID hiện có. Con trỏ phân trang tiếp tục dùng UUID v4.

## Cấu hình

Các API dùng cấu hình hiện có. Bản sửa dùng dữ liệu seed và schema hiện có.

## Xác minh

- `pnpm lint`, `pnpm typecheck` và `pnpm build:submission` đều pass.
- `pnpm test --runTestsByPath` chạy sáu bộ test liên quan. Tất cả 43 test đều pass.
- Bộ validation thực tế nhận cả hai ID của bài “Đếm số chẵn #04” và UUID v4 ở ba điểm nhận request. Đầu vào sai định dạng và UUID v3 vẫn trả lỗi ở `problemId`.
- Chưa xác minh luồng trên VPS hoặc kết quả chấm từ Judge. Bản sửa hiện ở workspace local.
