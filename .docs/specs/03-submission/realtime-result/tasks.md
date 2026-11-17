# SUB-004 Công việc triển khai

## Trạng thái

**Approved — 2026-09-30, chủ sở hữu sản phẩm phê duyệt trong hội thoại. Đang triển khai (2026-11-04).**

Đặc tả liên quan: [`./spec.md`](./spec.md) — phiên bản `1.0` ngày `2026-09-30`, trạng thái `Approved`
Kế hoạch liên quan: [`./plan.md`](./plan.md) — Approved 2026-09-30

Nguồn của yêu cầu này: mẫu [`specs/templates/tasks.template.md`](../../templates/tasks.template.md)
và [`docs/agent/working-agreement.md`](../../../agent/working-agreement.md) bước 1.

Phần phát realtime phía Submission và hợp đồng thông báo đã xong. Phần Gateway đã đóng socket theo
`exp`, từ chối danh tính do client gửi và cấu hình CORS. Các mục phụ thuộc Redis (lease 5 kết nối,
Redis dừng hoặc hỏng rồi phục hồi, subscribe lại, kiểm thử trên hạ tầng thật) được **hoãn** tới khi
Redis trên VPS chạy lại; chúng vẫn để chưa tích.

Đánh dấu các mục không áp dụng là `- [x] N/A — lý do`. Giữ danh sách này đồng bộ với bản triển khai
thực tế; tích một mục nghĩa là mục đó đã hoàn thành và đã được xác minh nếu có liên quan.

## Chuẩn bị

- [x] Khảo sát mã nguồn hiện có và trạng thái repository.
- [x] Spec và plan Approved; Socket.IO, payload tối thiểu, polling 5 giây, tối đa 5 kênh
      toàn cụm và đóng khi access token hết hạn.
- [x] Ghi kết luận câu hỏi mở trong worked entry phê duyệt SRS.
- [ ] **Báo cho frontend** rằng thông báo sẽ bỏ các trường thừa. Đây là thay đổi phá vỡ hợp đồng.
- [x] Xác nhận kiến trúc Submission và Gateway trong `docs/architecture/`.
- [ ] Xác nhận `plan.md` khớp với đặc tả sau khi sửa và không mở rộng phạm vi.

## Domain

- [x] N/A — không có quy tắc miền mới. Realtime không mang ý nghĩa nghiệp vụ, chỉ báo rằng có dữ liệu
      mới để đọc.
- [x] Xác minh tầng domain không import ioredis, không import NestJS và không biết tới Gateway.

## Application

- [x] Giữ `RealtimePort` với đúng một phương thức `publishResult(ownerId, notification)`.
      Port nằm ở `domain/ports/realtime.port.ts` như các port khác của module; kiểu
      `SubmissionRealtimeNotification` trùng cấu trúc với `SubmissionResultNotification` (adapter
      kiểm bằng `satisfies SubmissionRealtimeEnvelope`).
- [x] Xác minh `ApplyJudgeResultUseCase` gọi port với `notification` tối thiểu, không phải
      `JudgeResult` thô. Use case này đã tách thành `ApplyRunJudgeResultUseCase` và
      `ApplySubmitJudgeResultUseCase`; cả hai truyền đúng 4 trường.
- [x] Xác minh cả ba luồng nguồn dùng chung một điểm phát, không tạo điểm phát thứ hai. Run, Submit
      và watchdog (`ExpireStaleSubmissionsUseCase`) đều gọi cùng `REALTIME_PORT` →
      `RedisRealtimeAdapter`.
- [x] Xác minh lỗi phát realtime **không** làm hỏng use case áp dụng kết quả: adapter nuốt lỗi và trả
      về bình thường (`redis-realtime.adapter.spec.ts`).

## Infrastructure

- [x] Chuyển `submission-realtime.publisher.ts` thành adapter hiện thực `RealtimePort`, thay vì
      provider độc lập không ai gọi qua port. Nay là `infrastructure/realtime/redis-realtime.adapter.ts`.
- [x] Bổ sung kết nối Redis nếu chưa kết nối, trước khi phát.
- [x] **Xoá lệnh `redis.set` hiện tại.** Khóa `submission:result:<id>` không nơi nào đọc, và nó đang
      lưu dữ liệu ẩn không cần thiết với TTL 300 giây.
- [x] Nuốt lỗi phát tại adapter, thay vì để lỗi Redis ném ra khỏi use case.
- [x] Ghi log `warn` một dòng và chống spam lặp lại khi Redis hỏng kéo dài.
- [x] Không log nội dung thông báo, vì nó chứa định danh người dùng.

## Hợp đồng sự kiện

- [x] Thêm `SubmissionResultNotification` gồm public `submissionId`, `kind`, `status`, `ready: true`
      vào `@app/contracts`.
- [x] Thêm `SubmissionRealtimeEnvelope` gồm `userId` và `notification`.
- [x] Giữ nguyên tên kênh `REDIS_CHANNELS.submissionResults`.
- [x] Đổi nội dung thông báo từ `{ userId, result: JudgeResult }` sang
      `{ userId, notification: SubmissionResultNotification }`.
- [x] N/A — không có message RabbitMQ nào cho tính năng này.
- [x] **Triển khai đổi hợp đồng đồng thợt ở cả Submission và Gateway**, vì triển khai lệch pha sẽ hỏng.
      Hai phía cùng vào `main` qua PR #22.

## Lưu trữ

- [x] N/A — tính năng này không thay đổi truy vấn lưu trữ nào. Đọc kết quả vẫn đi qua
      `GetSubmissionDetailUseCase` và `ListSubmissionHistoryUseCase` của `SUB-003`.
- [x] N/A — không có cơ chế lưu thông báo chưa gửi. Việc đó sẽ biến best-effort thành giao có bảo đảm, và
      `specs/00-system/communication.md` chưa phê duyệt. Polling của `SUB-003` là cơ chế bảo đảm duy
      nhất.
- [x] Xác minh PostgreSQL vẫn là nguồn chân lý; realtime chỉ là thông báo "hãy đọc lại".

## Cơ sở dữ liệu / Migration

- [x] N/A — không có bảng, cột hay index nào thay đổi. PostgreSQL đã lưu đầy đủ kết quả.
- [x] N/A — không có migration cho tính năng này.
- [x] Cân nhắc dọn khóa Redis `submission:result:*` còn sót. Không dọn: code không còn ghi khóa này và
      TTL 300 giây đã tự hết hạn.

## API

- [x] N/A — không có route HTTP mới. Realtime đi qua kênh đẩy, không đi qua REST.
- [x] Xác minh Gateway **không** thêm HTTP route nào để đăng ký kênh.
- [x] Xác minh tên sự kiện phía client là `submission.result`.
- [x] N/A — Swagger không mô tả kênh đẩy ở mục HTTP nào, nên không có gì cần cập nhật.

## API Gateway

- [x] Siết `isEnvelope` thành kiểm tra danh sách trường cho phép của hợp đồng mới, thay vì ép kiểu rồi
      chuyển nguyên payload.
- [x] Kiểm tra `kind` và `status` thuộc tập giá trị đã biết; giá trị lạ phải bị loại.
- [x] Chuyển tiếp **chỉ** `notification` xuống phòng `user:<userId>`, không chuyển `userId` hay trường
      nào ngoài danh sách cho phép.
- [x] Giữ xác thực token khi kết nối và `join` phòng theo `sub`.
- [x] Từ chối handshake có tham số chủ sở hữu/vai trò/quyền do client gửi; danh tính chỉ lấy từ token.
- [x] Áp dụng Redis lease nguyên tử giới hạn 5 kết nối toàn cụm mỗi danh tính; từ chối kết nối
      thứ sáu, giải phóng lease khi disconnect, từ chối kết nối mới khi Redis không sẵn sàng.
      `SubmissionSocketLeases` + kiểm thử năm/sáu kết nối trên main (2026-11-16).
- [x] Đóng socket đúng lúc access token hết hạn theo `exp` và giải phóng lease.
      Đã đóng socket theo `exp` (2026-10-28); lease được giải phóng trong `handleDisconnect` (main, 2026-11-16).
- [x] Xác minh Gateway không lưu trữ kết quả nghiệp vụ ở bất kỳ đâu.

## Messaging

- [x] N/A — không phát và không tiêu thụ hàng đợi có ACK. Tính năng dùng Redis pub/sub.

## Realtime

- [x] Xác minh thông báo chỉ phát **sau khi** bản ghi đã lưu và giao dịch đã hoàn tất.
- [x] Xác minh nội dung thông báo chỉ gồm public `submissionId`, `kind`, `status`, `ready: true`.
- [x] Xác minh thông báo không chứa `stdout`, `stderr`, `compileOutput`, `error`, điểm số, Test Case,
      kết quả mong đợi, harness, lệnh biên dịch hay tham số sandbox.
- [x] Xác minh Gateway log `warn` một dòng khi Redis không sẵn sàng và tự thử lại khi kết nối trở lại.
      `SubmissionResultSubscriber.logRedisUnavailable` log một lần cho tới khi `ready`.
- [x] Xác minh `subscribe` không bị bỏ sót khi kết nối thất bại lúc khởi động rồi hồi phục.
      Subscriber đăng ký lại ở sự kiện `ready`.
- [x] Xác minh khi Redis hồi phục không có loạt thông báo gộp cho các kết quả phát sinh lúc hỏng.
      Pub/sub không lưu; subscriber chỉ chuyển message đang tới.
- [x] Xác minh không có cơ chế lưu thông báo chưa gửi, để best-effort không biến thành giao có bảo đảm.
      Adapter bỏ thông báo khi lỗi; Gateway chỉ chuyển tiếp message đang tới.
- [x] Xác minh cả Run và Submit của cùng một người học đều phát thông báo, phân biệt được bằng `kind`.

## Phân quyền

- [x] Xác minh mở kênh thiếu hoặc sai token thì không thiết lập được kênh nào.
- [x] Xác minh kênh chỉ nhận thông báo của chủ sở hữu token, không của người khác.
      Cùng bằng chứng với kiểm thử hai người học.
- [x] Xác minh không có đường để khách chọn danh tính khác qua tham số chung.
- [x] Xác minh kênh đóng khi token hết hạn; logout/khóa tài khoản không thu hồi token còn hạn theo ID-001.
- [x] N/A — không tách quyền theo vai trò cho kênh realtime.

## Kiểm thử

- [x] Kiểm thử thông báo chỉ xảy ra sau khi bản ghi đã lưu, theo đúng thứ tự.
- [x] Kiểm thử nội dung thông báo chỉ gồm public `submissionId`, `kind`, `status`, `ready: true`.
- [x] Kiểm thử thông báo KHÔNG chứa `stdout`, `stderr`, `compileOutput`, `error`, điểm số, Test Case,
      harness, lệnh biên dịch hay tham số sandbox.
- [ ] Kiểm thử Redis dừng hoàn toàn → bản ghi vẫn hoàn tất, vẫn đọc được kết quả qua polling.
- [x] Kiểm thử Redis hỏng rồi phục hồi → không có loạt thông báo gộp cho các kết quả phát sinh lúc
      hỏng.
      `submission-result.subscriber.spec.ts`: chỉ chuyển message mới sau khi hồi phục (2026-11-16).
- [x] Kiểm thử `subscribe` được gọi lại khi kết nối thất bại lúc khởi động rồi hồi phục.
      `submission-result.subscriber.spec.ts` (2026-11-16).
- [x] Kiểm thử hai người học, một người nộp bài → kênh của người kia không nhận thông báo.
      `submission-realtime.gateway.spec.ts`: chỉ socket của chủ envelope nhận (2026-11-16).
- [x] Kiểm thử mở kênh kèm tham số chủ sở hữu/vai trò/quyền → handshake bị từ chối.
- [x] Kiểm thử mở kênh thiếu hoặc sai token → không có kênh nào được thiết lập.
- [x] Kiểm thử giao lại cùng một kết quả → không có thông báo thứ hai.
- [ ] Kiểm thử kết nối gián đoạn rồi mở lại → không mất kết quả phát sinh trong lúc gián đoạn.
- [x] Kiểm thử nhiều phiên cùng một người học → mọi phiên đều có thể nhận; không phiên nào của người
      khác.
      `submission-realtime.gateway.spec.ts`: hai phiên cùng người học đều nhận (2026-11-16).
- [ ] Kiểm thử không nhận thông báo nào → client không kết luận bản ghi chưa xong.
- [x] Kiểm thử bản ghi `INTERNAL_ERROR` → thông báo nêu trạng thái lỗi hệ thống, không phải phán quyết
      lời giải.
- [x] Kiểm thử token hết hạn sau khi kênh mở → kênh ngừng nhận; logout trước hạn không đóng token.
- [x] Kiểm thử kết nối thứ sáu trên Gateway khác bị từ chối; Redis lỗi thì realtime mới bị từ chối.
      `submission-socket-leases.spec.ts`: cùng khóa owner giữa các Gateway, fail-closed khi Redis lỗi (2026-11-16).
- [ ] Kiểm thử client polling 5 giây khi còn chờ và đọc sớm khi có thông báo.
- [x] Kiểm thử thông báo nhận được sai hình thức hoặc có trường lạ → bị loại, không chuyển tiếp.
- [ ] Kiểm thử log không chứa token và không chứa payload thông báo ở mức thông tin.
- [x] Chạy `pnpm lint`.
- [x] Chạy `pnpm typecheck`.
- [x] Chạy `pnpm test`.
- [x] Chạy `pnpm build:submission`.
- [x] Chạy `pnpm build:gateway`.

## Tài liệu

- [x] Ghi rõ hợp đồng thông báo tối thiểu và lý do loại bỏ toàn bộ output khỏi realtime.
      Ghi tại worked entry 2026-11-16-sub-004-realtime-closure.md.
- [x] Ghi rõ polling là cơ chế bảo đảm, còn realtime chỉ là tối ưu độ trễ.
      Ghi tại worked entry 2026-11-16-sub-004-realtime-closure.md.
- [x] Ghi rõ hiệu lực token stateless theo ID-001 và chính sách đóng kênh khi hết hạn.
      Ghi tại `.docs/worked/submission/submissions/2026-11-16-sub-004-realtime-closure.md` (2026-11-16).
- [x] N/A — không có thay đổi hợp đồng sự kiện RabbitMQ.

## Xác minh

- [ ] Đối chiếu bản triển khai với từng `FR-001` … `FR-016`, `SR-001` … `SR-012` và `AC-001` …
      `AC-016` của `spec.md`.
- [x] Xác minh bằng kiểm thử rằng `stdout` và `stderr` **không còn** lọt tới trình duyệt qua đường
      realtime hiện tại.
- [ ] Xác minh bằng kiểm thử rằng kết quả tới được người học **kể cả khi Redis dừng hoàn toàn**.
- [ ] Xác nhận không có hành vi Ngoài phạm vi nào được thêm vào.
- [ ] Chỉ cập nhật trạng thái đặc tả sang `Implemented` thông qua quy trình review đã được phê duyệt.
- [ ] Ghi lại kết quả kiểm chứng và các hành vi chưa được xác minh.

## Tuân thủ kiến trúc

- [x] Xác minh chiều phụ thuộc `use case → RealtimePort ← RedisRealtimeAdapter`.
- [x] Xác minh Submission chỉ phát, Gateway chỉ nhận và chuyển tiếp, và không service nào gọi trực
      tiếp vào service kia ngoài Redis pub/sub.
- [x] Xác minh Submission không mở kết nối tới trình duyệt và không mở socket.
- [x] Xác minh Gateway không lưu trữ kết quả nghiệp vụ.
- [x] Xác minh không thêm chiều thông báo ngược so với `specs/00-system/communication.md`.
- [x] Xác minh PostgreSQL vẫn là nguồn chân lý; realtime chỉ là thông báo "hãy đọc lại".
- [ ] Xác minh bản triển khai khớp với mục Tuân thủ kiến trúc của `plan.md`.
