# SUB-002 Công việc triển khai

## Trạng thái

**Approved — 2026-09-30, chủ sở hữu sản phẩm phê duyệt trong hội thoại. Đang triển khai (2026-10-27):
luồng Submit (`SubmitCodeUseCase`, port Learning), áp dụng kết quả, outbox, relay và watchdog Submit
đã xong; còn mục chưa tích bên dưới.** Xem
`.docs/worked/submission/submissions/2026-10-27-submit-result-outbox.md` và
`.docs/worked/submission/submissions/2026-10-27-submit-code-use-case.md`.

Đặc tả liên quan: [`./spec.md`](./spec.md) — phiên bản `1.0` ngày `2026-09-30`, trạng thái `Approved`
Kế hoạch liên quan: [`./plan.md`](./plan.md) — Approved 2026-09-30

Nguồn của yêu cầu này: mẫu [`specs/templates/tasks.template.md`](../../templates/tasks.template.md)
và [`docs/agent/working-agreement.md`](../../../agent/working-agreement.md) bước 1.

Đánh dấu các mục không áp dụng là `- [x] N/A — lý do`. Giữ danh sách này đồng bộ với bản triển khai
thực tế; tích một mục nghĩa là mục đó đã hoàn thành và đã được xác minh nếu có liên quan.

## Chuẩn bị

- [x] Khảo sát mã nguồn hiện có và trạng thái repository.
- [x] Spec và plan Approved; LRN-002-FR-015 xác nhận ngôn ngữ/Problem, không sửa Learning.
      **Lưu ý 2026-10-27:** endpoint gói judge hiện tại của Learning
      (`problems.controller.ts`) chưa hiện thực LRN-002-FR-015; nó chỉ trả `404` khi Problem không tồn
      tại. Xem mục Rủi ro trong worked entry SubmitCode.
- [x] Chốt điểm Judge thiếu `null`, event accepted 100, outbox at-least-once, watchdog 10 phút.
- [x] Ghi kết luận câu hỏi mở trong worked entry phê duyệt SRS.
- [x] Xác nhận kiến trúc Submission trong `docs/architecture/`.
- [x] Xác nhận `plan.md` khớp với đặc tả sau khi sửa và không mở rộng phạm vi.
- [ ] Xác minh URL nội bộ của Learning không đi qua Gateway.

## Domain

- [x] Bổ sung `isOfficiallyAccepted` vào aggregate dùng chung.
- [x] Định danh sự kiện sinh đúng một lần và giữ lại. Không tách hàm `ensureAcceptedEventId`: use case
      chỉ sinh `eventId` trên đường ghi thắng của cập nhật có điều kiện, rồi lưu vào
      `accepted_event_id` và outbox (`event_id` khoá chính) trong cùng giao dịch.
- [x] Triển khai `applyVerdict` với bất biến trạng thái cuối cùng không đổi.
- [x] Triển khai `toJudgeVerdictStatus` có kiểm tra, thay cho ép kiểu `as SubmissionStatus`.
- [x] Thêm `DecidingScore` phân biệt điểm `0` với chưa có điểm.
- [x] Thêm kiểm thử domain: Run không được là nộp bài chính thức; `INTERNAL_ERROR` không đủ điều
      kiện chấp nhận; trạng thái cuối cùng không bị ghi đè.

## Application

- [x] Tạo `SubmitCodeUseCase` với thứ tự: lấy gói judge → kiểm tra ngôn ngữ → kiểm tra sẵn sàng →
      lưu bản ghi → phát việc → chuyển `QUEUED`. Kiểm tra ngôn ngữ và sẵn sàng chính là việc Learning
      cấp gói thành công (plan, bước 2 của use case); `404` thành `ProblemNotSubmittableError`.
- [x] Tạo `ApplyJudgeResultUseCase` — tên thực tế `ApplySubmitJudgeResultUseCase` trong
      `application/`, cạnh `ApplyRunJudgeResultUseCase` đã có.
- [x] Thêm `applyVerdictOnce` chống giao lại trùng ở tầng lưu trữ — tên thực tế
      `applySubmitVerdictOnce`; trả bản ghi đã cập nhật hoặc `null` (thay cho số hàng) để use case
      có `publicId`/`userId` cho realtime.
- [x] Ghi một hàng outbox `submission.accepted` cùng transaction áp dụng `ACCEPTED`, UNIQUE theo
      `submission_id` và `event_id`.
- [x] Triển khai relay với broker confirm, retry hàng pending cùng `eventId`; Learning khử trùng.
- [x] Đặt `score: 100` tường minh cho event tiến độ, giữ điểm Judge 0/null trong bản ghi.
- [x] Chỉ triển khai năm port đã lập kế hoạch: repository, judge job, learning package, accepted
      event, realtime.

## Infrastructure

- [x] Tạo `TypeormSubmissionRepository` với các cập nhật có điều kiện.
- [x] Tạo `RabbitJudgeJobAdapter` hiện thực `JudgeJobPort` cho cả `RUN` và `SUBMIT`.
- [x] Tạo `RabbitAcceptedEventAdapter` hiện thực `AcceptedEventPort`.
- [x] Mở rộng `LearningJudgeClient` thành `HttpLearningJudgePackageAdapter` theo hợp đồng đã chốt;
      `LearningJudgeClient` đã bị xoá.
- [x] Tạo `RedisRealtimeAdapter` chỉ nhận đối tượng thông báo tối thiểu, không nhận `JudgeResult` thô.
- [x] Gắn adapter tại `SubmissionsModule`.

## Lưu trữ

- [x] Triển khai lọc theo `userId` trước khi phân trang trong mọi truy vấn danh sách (SUB-003,
      `listByOwner`).
- [x] Giữ nguyên ràng buộc `UNIQUE (submission_id)` trên `submission_results` như lớp bảo vệ thứ
      hai chống bản ghi kết quả trùng.
- [x] Xác minh không có truy cập cơ sở dữ liệu xuyên service và không có khoá ngoại tới Problem.
- [x] Xác minh `problem_id` chỉ là UUID thuần túy, không được dùng để tra cứu.

## Cơ sở dữ liệu / Migration

- [x] Tạo migration `<timestamp>-MakeSubmissionScoreNullable.ts` cho phép `score` là `NULL` và bỏ
      giá trị mặc định.
- [x] Tạo migration bảng `submission_accepted_outbox` và index hàng pending; không xóa event chưa
      giao khi rollback. Migration backfill các Submit `ACCEPTED` mà consumer cũ chưa phát xong.
- [x] Viết `down` có bước `COALESCE(score, 0)` trước khi siết lại `NOT NULL`.
- [x] Chạy `pnpm migration:run:submission` (2026-10-27, người dùng chạy trên DB chung; cả hai
      migration commit trong một transaction). Outbox sau migration: `total = 0`,
      `pending = 0` — không có event cũ bị kẹt nên backfill không chèn hàng nào.
- [x] Ghi nhận giới hạn: các bản ghi `score = 0` cũ không phân biệt được với chưa có điểm.
- [x] Xác minh `synchronize` vẫn tắt và migration `InitialSubmissionSchema` không bị sửa.

## API

- [x] Giữ nguyên route `POST /api/submissions` với mã `202`.
- [x] Bổ sung `SubmitCodeRequestDto` với `problemId`, `language`, `sourceCode`.
- [x] Kiểm thử `problemId` UUID v5 từ dữ liệu bài luyện tập seed.
- [x] Tạo DTO kết quả nộp bài liệt kê tường minh các trường trả về; không tuần tự hoá thẳng entity.
- [x] Bật `ValidationPipe` với `whitelist: true` và `forbidNonWhitelisted: true` nếu `main.ts` chưa
      có; dùng chung với Run. Đã có sẵn trong `configureHttpApp` (`libs/common/src/bootstrap.ts`).
- [x] Cập nhật Swagger khi hình dạng phản hồi thay đổi.
- [x] Xác minh phản hồi không chứa Test Case, kết quả mong đợi, harness hay tham số runtime.

## Messaging

- [x] Phát `JudgeRequest` với `mode: 'SUBMIT'`, Test Case và giới hạn lấy từ gói judge.
- [x] Xác minh mã nguồn chỉ nằm trong trường `sourceCode`, không dựng tên file hay lệnh.
- [x] Làm `JudgeResultConsumer` mỏng: giải mã, gọi một use case, ACK/NACK ở adapter.
- [x] Xác minh bản ghi `RUN` với `ACCEPTED` không bao giờ gọi `AcceptedEventPort`.
- [x] Xác minh phát `submission.accepted` với `messageId = acceptedEventId` và nội dung đúng sáu
      trường đã phê duyệt.
- [x] Xác minh kết quả không hợp lệ về hình thức bị NACK, không bị ACK như một kết quả rác.
- [x] Xác minh kết quả Submit cho bản ghi không tồn tại bị loại (NACK) và ghi log lỗi qua
      `RabbitMqService`.
- [x] Xác minh hành vi ACK/NACK, retry và hàng chết theo quy ước hiện có (ném lỗi → retry 3 lần →
      dead-letter).
- [x] Xác minh Submission không gọi trực tiếp API cập nhật tiến độ của Learning.

## Realtime

- [x] Xác minh thông báo realtime được phát **sau khi** bản ghi đã lưu.
- [x] Xác minh đối tượng truyền cho `RealtimePort` không chứa `stdout`, `stderr`, Test Case hay
      harness.
- [x] Xác minh khi Redis không sẵn sàng thì bản ghi vẫn hoàn tất và sự kiện tiến độ vẫn được phát
      (adapter nuốt lỗi; event đã nằm trong outbox trước khi gọi realtime).
- [x] N/A — nội dung thông báo, hình dạng kênh và vòng đời kênh thuộc `SUB-004`.

## Phân quyền

- [x] Xác minh chủ sở hữu chỉ đến từ header tin cậy `x-auth-user-id`.
- [x] Kiểm thử thiếu access token → `401`, không tạo bản ghi (controller từ chối trước khi gọi use case).
- [x] Kiểm thử body chứa `userId`, vai trò, quyền → bị từ chối. Có kiểm thử riêng cho
      `SubmitCodeRequestDto` (`submit-code-request.dto.spec.ts`).
- [ ] Xác minh URL gói judge chỉ nhận header nội bộ và không định tuyến qua Gateway.
- [x] Xác minh không có hạn mức tần suất nào được áp.
- [x] Xác minh không có quyền `submission:submit` riêng trong v1; mọi vai trò xác thực nộp được.

## Kiểm thử

- [x] Kiểm thử ngôn ngữ chưa bật cho Problem → từ chối, `JudgeJobPort` không được gọi. Kiểm thử ở
      mức port: Learning trả `404` → không lưu, không phát việc. End-to-end phụ thuộc LRN-002-FR-015.
- [x] Kiểm thử Problem không tồn tại hoặc chưa sẵn sàng → từ chối, không tạo bản ghi.
- [x] Kiểm thử dữ liệu judge lấy từ port Learning, không lấy từ body.
- [x] Kiểm thử body chứa Test Case, giới hạn, trạng thái, điểm, chủ sở hữu → bị từ chối
      (`submit-code-request.dto.spec.ts`).
- [x] Kiểm thử Submit hợp lệ → bản ghi `QUEUED`, phản hồi không chứa phán quyết.
- [x] Kiểm thử áp dụng phán quyết → mọi trường kết quả lưu trong một giao dịch.
- [x] Kiểm thử bản ghi đã ở trạng thái cuối cùng nhận kết quả mới → không đổi, không có bản ghi kết
      quả mới.
- [x] Kiểm thử hai lần xử lý đồng thời → chỉ một lần ghi, trạng thái nhất quán. Đã viết kiểm thử tích
      hợp `typeorm-submission.repository.integration.spec.ts`, nhưng chưa chạy được trên PostgreSQL thật
      (cần `TEST_DATABASE_URL` trỏ tới DB `*_test`), nên chưa tích.
      Đã chạy trên PostgreSQL 17 thật (container tạm, DB `submission_test`) ngày 2026-11-16: pass, lặp 5/5.
- [x] Kiểm thử `ACCEPTED` → `AcceptedEventPort` gọi đúng một lần với nội dung đúng.
- [x] Kiểm thử `INTERNAL_ERROR` với điểm bất kỳ → `AcceptedEventPort` không được gọi.
- [x] Kiểm thử `ACCEPTED` với điểm Judge `0` hoặc `null` → bản ghi giữ giá trị đó, event mang 100.
- [ ] Kiểm thử crash trước/sau broker confirm → outbox retry cùng `eventId`, Learning chỉ áp dụng
      tiến độ một lần.
- [x] Kiểm thử watchdog 10 phút và kết quả Judge đến sau không ghi đè `INTERNAL_ERROR`. Watchdog
      expire cả Run và Submit; kết quả muộn bị bỏ qua vì `INTERNAL_ERROR` là trạng thái cuối.
- [x] Kiểm thử phát sự kiện thất bại → hàng outbox giữ pending để lần sau thử lại (outbox thay cho
      "dấu hiệu" của thiết kế cũ).
- [x] Kiểm thử Run với `ACCEPTED` → không phát `submission.accepted`.
- [x] Kiểm thử lỗi chuẩn bị hoặc lỗi phát việc → bản ghi không ở `QUEUED` vô hạn.
- [ ] Kiểm thử Learning không nhận bất kỳ thay đổi tiến độ nào ngoài `submission.accepted`.
- [x] Chạy `pnpm lint`.
- [x] Chạy `pnpm typecheck`.
- [x] Chạy `pnpm test`.
- [x] Chạy `pnpm build:submission`.

## Tài liệu

- [x] Xác minh adapter dùng đúng gói judge LRN-002 theo `problemId + language`, không thêm
      `allowedLanguages` hoặc thay đổi hợp đồng Learning.
- [x] Cập nhật [`docs/architecture/submission-service.md`](../../../architecture/submission-service.md)
      khi trạng thái chuyển khỏi PARTIALLY ALIGNED. Đã chuyển sang ALIGNED sau SUB-003.
- [ ] Ghi chú migration `score` và giới hạn dữ liệu `0` cũ vào tài liệu vận hành.
- [x] Ghi lại các sai lệch đã được phê duyệt (trong hai worked entry SUB-002).

## Xác minh

- [ ] Đối chiếu bản triển khai với từng `FR-001` … `FR-023`, `SR-001` … `SR-013` và `AC-001` …
      `AC-020` của `spec.md`.
- [x] Xác nhận `AC-009` bằng kiểm thử chạy đồng thời thật, không bằng giả định về tuần tự.
      Đã chạy trên PostgreSQL 17 thật (container tạm, DB `submission_test`) ngày 2026-11-16: pass, lặp 5/5.
- [x] Xác nhận không có hành vi Ngoài phạm vi nào được thêm vào, đặc biệt là hạn mức, xếp hạng,
      chấm điểm Assignment và xem lời giải của sinh viên.
- [ ] Chỉ cập nhật trạng thái đặc tả sang `Implemented` thông qua quy trình review đã được phê duyệt.
- [x] Ghi lại kết quả kiểm chứng và các hành vi chưa được xác minh.

## Tuân thủ kiến trúc

- [x] Xác minh chiều phụ thuộc `controller → use case → domain port ← adapter`.
- [x] Xác minh `JudgeResultConsumer` không điều phối trực tiếp repository, RabbitMQ, HTTP hay
      Redis.
- [x] Xác minh tầng domain không import TypeORM, NestJS, RabbitMQ hay ioredis.
- [x] Xác minh Submission không chứa biên dịch, runner hay sandbox.
- [x] Xác minh Submission không giả định Learning có consumer nào.
- [x] Xác minh bản triển khai khớp với mục Tuân thủ kiến trúc của `plan.md`.
