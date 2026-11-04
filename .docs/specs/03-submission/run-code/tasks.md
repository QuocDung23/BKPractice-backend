# SUB-001 Công việc triển khai

## Trạng thái

**Approved — 2026-09-30, chủ sở hữu sản phẩm phê duyệt trong hội thoại. Đang triển khai (2026-10-27): application, infrastructure, migration, API đã xong; còn mục chưa tích bên dưới.**

Đặc tả liên quan: [`./spec.md`](./spec.md) — phiên bản `1.0` ngày `2026-09-30`, trạng thái `Approved`
Kế hoạch liên quan: [`./plan.md`](./plan.md) — Approved 2026-09-30

Nguồn của yêu cầu này: mẫu [`specs/templates/tasks.template.md`](../../templates/tasks.template.md)
và [`docs/agent/working-agreement.md`](../../../agent/working-agreement.md) bước 1.

Xem `.docs/worked/submission/submissions/2026-10-27-run-code-application-infrastructure.md` cho kết quả kiểm chứng.

Đánh dấu các mục không áp dụng là `- [x] N/A — lý do`. Giữ danh sách này đồng bộ với bản triển khai
thực tế; tích một mục nghĩa là mục đó đã hoàn thành và đã được xác minh nếu có liên quan.

## Chuẩn bị

- [x] Khảo sát mã nguồn hiện có và trạng thái repository.
- [x] Spec và plan Approved; chốt `EXECUTED`, 3000 ms/256 MB, watchdog 10 phút, UUID tùy chọn.
- [x] Ghi kết luận câu hỏi mở trong worked entry phê duyệt SRS.
- [x] Xác nhận kiến trúc Submission trong `docs/architecture/`.
- [x] Xác nhận `plan.md` khớp với đặc tả sau khi sửa và không mở rộng phạm vi.
- [x] Xác nhận `pnpm migration:run:submission` chạy được trên môi trường đích.

## Domain

- [x] Tạo aggregate `SubmissionRecord` không phụ thuộc framework trong
      `modules/submissions/domain/`.
- [x] Chuyển `SubmissionKind` và `SubmissionStatus` sang tầng domain; thêm `EXECUTED` cho Run,
      giữ các giá trị cũ để không phá dữ liệu đã lưu.
- [x] Triển khai `createRunRecord`, `markRunQueued`, `markRunFailedToDispatch`.
- [x] Triển khai bất biến `isTerminal` và `canProduceWrongAnswer`.
- [x] Khai báo `SubmissionRepositoryPort`, `JudgeJobPort`, `RealtimePort` trong
      `modules/submissions/domain/ports/`.
- [x] Bổ sung kiểm thử domain: Run không sinh `WRONG_ANSWER`; `PENDING → QUEUED` và
      `PENDING → INTERNAL_ERROR` là các chuyển trạng thái hợp lệ; chuyển trạng thái từ một trạng
      thái cuối cùng bị từ chối.

## Application

- [x] Tạo `RunCodeUseCase` trong `modules/run-code/`.
- [x] Chuyển `SubmissionsService.run()` sang gọi use case, giữ nguyên đường dẫn `POST /api/run` và
      mã `202`.
- [x] Đảm bảo `modules/run-code` KHÔNG import `LearningJudgePackagePort` (SUB-001-FR-004).
- [x] Chỉ triển khai ba port đã lập kế hoạch: repository, judge job, realtime.

## Infrastructure

- [x] Tạo `TypeormSubmissionRepository` hiện thực `SubmissionRepositoryPort`.
- [x] Tạo `RabbitJudgeJobAdapter` hiện thực `JudgeJobPort`.
- [x] Tạo `RedisRealtimeAdapter` hiện thực `RealtimePort`.
- [x] Gắn adapter tại `SubmissionsModule`, không tạo module mới ở cấp service.
- [x] Để lỗi phát realtime được nuốt và ghi log `warn` tại adapter, không ném ra use case.

## Lưu trữ

- [x] Lọc theo `userId` trước khi phân trang trong mọi truy vấn danh sách (SUB-003, `listByOwner`).
- [x] Xác minh Run không tạo quan hệ lưu trữ với Problem và không truy vấn cơ sở dữ liệu của Learning,
      Identity hay Judge.

## Cơ sở dữ liệu / Migration

- [x] Tạo migration `<timestamp>-AddRunStdin.ts` thêm cột `submissions.stdin` kiểu `text` nullable.
- [x] Tạo migration thêm `EXECUTED` vào PostgreSQL enum; không rollback bằng cách âm thầm đổi
      bản ghi `EXECUTED` sang phán quyết khác.
- [x] Có phương án `down` tương ứng; migration phải hoàn tác được.
- [x] Chạy `pnpm migration:run:submission` và xác minh bản ghi Run cũ vẫn đọc được. DB dùng chung trống trước khi chạy nên không có bản ghi Run cũ cần đối chiếu.
- [x] Xác minh `synchronize` vẫn đang tắt và migration `InitialSubmissionSchema` không bị sửa.

## API

- [x] Bổ sung `RunCodeRequestDto` với `language`, `sourceCode`, `stdin` (cho phép rỗng), `problemId`
      UUID tuỳ chọn; UUID sai dạng bị từ chối nhưng UUID không tồn tại không cần tra Learning.
- [x] Tạo DTO kết quả Run liệt kê tường minh các trường trả về; không tuần tự hoá thẳng entity
      TypeORM.
- [x] Bật `ValidationPipe` với `whitelist: true` và `forbidNonWhitelisted: true` nếu `main.ts` chưa
      có; không viết lại nếu đã có.
- [x] Xác minh route `/api/run` vẫn được Gateway proxy với tiền tố `/api/run`.
- [x] Cập nhật Swagger cho route Run nếu hình dạng phản hồi thay đổi.

## Messaging

- [x] Xác minh `JudgeRequest` với `mode: 'RUN'` được phát qua `bkpractice.judge` / `judge.request`.
- [x] Xác minh consumer phân biệt `mode: 'RUN'` và **không** gọi accepted-event port.
- [x] Xác minh hành vi khi giao lại trùng: bản ghi kết quả không bị tạo lần hai.
- [x] Xác minh kết quả có `submissionId` không tồn tại bị loại và ghi log cảnh báo.

## Realtime

- [x] Xác minh kết quả Run được phát sau khi bản ghi đã lưu, cho đúng chủ sở hữu.
- [x] Xác minh khi Redis không sẵn sàng thì bản ghi Run vẫn hoàn tất và vẫn đọc được trong lịch sử.
- [x] N/A — nội dung thông báo, hình dạng kênh và vòng đời kênh thuộc `SUB-004`.

## Phân quyền

- [x] Xác minh chủ sở hữu bản ghi chỉ đến từ header tin cậy `x-auth-user-id` do Gateway xác minh.
- [x] Kiểm thử trường `userId`, vai trò, quyền trong body bị từ chối.
- [x] Xác minh không có hạn mức tần suất nào được áp trong Submission.
- [x] Xác minh không có quyền `submission:run` riêng trong v1.

## Kiểm thử

- [x] Kiểm thử ngôn ngữ ngoài danh mục, mã nguồn rỗng, `stdin` quá dài → từ chối, không tạo bản ghi.
- [x] Kiểm thử Run hợp lệ → bản ghi `QUEUED`, `JudgeJobPort.publish` gọi đúng một lần.
- [x] Kiểm thử Run **không** phát `submission.accepted` và Learning không nhận thay đổi tiến độ.
- [x] Kiểm thử `problemId` không tồn tại vẫn tạo bản ghi và không có lời gọi HTTP tới Learning.
- [x] Kiểm thử `JudgeJobPort.publish` ném lỗi → bản ghi ở `INTERNAL_ERROR`, không ở `QUEUED`.
- [x] Kiểm thử giao lại cùng một kết quả hai lần → không có bản ghi kết quả trùng.
- [x] Kiểm thử kết quả không lỗi → trạng thái không phải `WRONG_ANSWER`.
- [x] Kiểm thử Judge báo `ACCEPTED` cho Run → lưu `EXECUTED`, không phát `submission.accepted`.
- [ ] Kiểm thử watchdog 10 phút chuyển bản ghi còn chờ sang `INTERNAL_ERROR`, result muộn không
      ghi đè; request trùng tạo bản ghi Run mới.
- [x] Kiểm thử `RealtimePort` ném lỗi → bản ghi vẫn hoàn tất, use case không ném lỗi ra ngoài.
- [x] Kiểm thử thiếu access token → `401`, không tạo bản ghi.
- [x] Chạy `pnpm lint`.
- [x] Chạy `pnpm typecheck`.
- [x] Chạy `pnpm test`.
- [x] Chạy `pnpm build:submission`.

## Tài liệu

- [x] Cập nhật [`.docs/architecture/submission-service.md`](../../../architecture/submission-service.md)
      khi trạng thái từ PARTIALLY ALIGNED chuyển sang ALIGNED cho phần Run. Đã ALIGNED ngày 2026-10-27.
- [ ] Ghi chú migration `stdin` vào tài liệu vận hành.
- [x] N/A — tài liệu tương tác phía Gateway không thay đổi.

## Xác minh

- [ ] Đối chiếu bản triển khai với từng `FR-001` … `FR-015`, `SR-001` … `SR-009` và `AC-001` …
      `AC-016` của `spec.md`.
- [x] Xác nhận không có hành vi Ngoài phạm vi nào được thêm vào, đặc biệt là hạn mức, lưu nháp,
      chạy trên Test Case công khai và xếp hạng.
- [ ] Chỉ cập nhật trạng thái đặc tả sang `Implemented` thông qua quy trình review đã được phê duyệt.
- [x] Ghi lại kết quả kiểm chứng và các hành vi chưa được xác minh.

## Tuân thủ kiến trúc

- [x] Xác minh chiều phụ thuộc `controller → use case → domain port ← adapter`.
- [x] Xác minh tầng domain không import TypeORM, NestJS, RabbitMQ hay ioredis.
- [x] Xác minh `modules/run-code` không import bất kỳ port nào của Submit.
- [x] Xác minh bản triển khai khớp với mục Tuân thủ kiến trúc của `plan.md`.
