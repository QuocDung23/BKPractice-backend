# 2026-11-24 — Thông báo lỗi theo thao tác

Phạm vi gồm Identity, Gateway và các phản hồi lỗi của Learning, Submission và Community. Đối chiếu [ERR-001](../../../specs/00-system/error-responses/spec.md), [ID-008](../../../specs/01-identity/change-password/spec.md) và luồng đặt lại mật khẩu ID-007.

## Nguyên nhân và xử lý

- `ChangePassword.execute` phân biệt sai mật khẩu hiện tại, độ dài mật khẩu mới, mật khẩu mới trùng và thông tin bảo mật thay đổi hoặc không xác minh được. `AuthFailureFilter` trả mã và thông báo tiếng Việt riêng cho từng trường hợp qua cùng định dạng đã dùng tại Gateway. Các mã mới giữ HTTP 401 để tương thích với endpoint hiện có.
- `RefreshSession.execute` trả lỗi phiên khi tài khoản không còn hợp lệ. Mã trao đổi Microsoft bị từ chối hướng dẫn bắt đầu lại đăng nhập Microsoft. Các lỗi này giữ tính riêng tư về trạng thái tài khoản.
- `VerifyPasswordResetOtp.execute` và `ResetPasswordWithGrant.execute` gắn nguyên nhân theo bước thực hiện. Filter giữ HTTP 400 và mã chung cho yêu cầu không hợp lệ, nêu đúng bước cần xử lý. OTP sai, hết hạn và tài khoản không đủ điều kiện nhận cùng phản hồi ở bước xác minh.
- `LeaderboardController.get` nêu rõ khi người gọi thiếu vai trò sinh viên, khi tài khoản không còn đủ điều kiện và khi dịch vụ hồ sơ chưa trả dữ liệu.

## Kiểm tra

156 bài kiểm thử liên quan qua, gồm đổi mật khẩu bị từ chối, lỗi phiên, OTP, định dạng lỗi chung, việc Gateway giữ mã lỗi và các bộ ánh xạ lỗi Learning, Submission và Community. Typecheck, ESLint trên các tệp thay đổi và build Identity, Learning qua. Chưa chạy với phiên đăng nhập thật. Các thay đổi này không cần migration.
