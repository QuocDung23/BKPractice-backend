# LRN-001 Công việc triển khai Quản lý Problem

> Cập nhật 2026-11-07: [LRN-008](../self-study/spec.md) thay thế mọi quy định về LECTURER, sở hữu riêng của người tạo, Class, Enrollment, Assignment và tiến độ theo lớp trong tài liệu này. Các yêu cầu còn lại vẫn áp dụng.

## Trạng thái

Approved — Sẵn sàng triển khai

Được chủ sở hữu sản phẩm phê duyệt ngày `2026-09-23`.

Đặc tả liên quan: [`./spec.md`](./spec.md) — phiên bản Approved `1.1`
Kế hoạch liên quan: [`./plan.md`](./plan.md) — Approved ngày `2026-09-23`

Bản sửa đổi `2026-10-24`: T011 đặt `ProblemRepository` tại `domain/repositories/`; các out port còn
lại ở `application/ports/out/`; T021 đặt response mapper ở `presentation/http/mappers/`.

Mọi công việc triển khai đều bắt đầu ở trạng thái chưa hoàn thành. Chỉ đánh dấu `[x]` sau khi cả
phần triển khai lẫn phần kiểm chứng được liệt kê đều hoàn tất. Các mục N/A là những mục duy nhất
được tích sẵn một cách có chủ đích. Danh sách này không thêm hành vi nào vượt ngoài `spec.md` đã
Approved và không thay đổi `plan.md`.

## Chuẩn bị

- [x] **LRN-001-T001 — Xác nhận lại nền tảng triển khai.** Khảo sát trạng thái Git, `spec.md` phiên
      bản `1.1` `Approved`, `plan.md` `Approved`, kiến trúc Learning (DDD + Hexagonal theo ADR 0002),
      các quy tắc phụ thuộc, schema `bkpractice_learning` hiện có, contract ngữ cảnh Gateway, và nền
      tảng RBAC của Identity. Báo cáo mọi xung đột trước khi thay đổi mã nguồn.
      **Phụ thuộc:** Không có.
      **Truy vết:** Quy trình SDD; mục Thứ tự triển khai bước 1 của kế hoạch; Định nghĩa Hoàn thành.

- [ ] **LRN-001-T002 — Giải quyết phụ thuộc về cơ chế truyền quyền `problem:*`.** Access token hiện
      chỉ mang `sub`, `roles`, `type`; nó không mang mã quyền. Xác định seam đã phê duyệt để lấy tám
      quyền `problem:create|read-managed|update|publish|hold|republish|delete|restore`: claim quyền
      trong token của Identity, hoặc một endpoint REST nội bộ đã phê duyệt của Identity.
      **Nếu không seam nào sẵn sàng, DỪNG hướng này và BÁO CÁO** thay vì âm thầm dựa vào phương án
      tạm. Nếu chủ sở hữu chấp nhận phương án tạm, ghi nhận tường minh rằng Learning ánh xạ tám quyền
      này về ảnh chụp vai trò `LECTURER` tin cậy, và rằng ánh xạ đó phải được thay khi seam thật xuất
      hiện. Không bao giờ rơi về dữ liệu do client cung cấp.
      **Kết quả (2026-09-29):** Seam đã được phê duyệt ở ID-003 0.4 và ID-001 1.1: access token mang
      claim `permissions`, Gateway đặt header tin cậy `x-auth-permissions`, tám quyền `problem:*` được
      seed cho `LECTURER`. Không cần phương án tạm. Khi làm task này, chỉ cần xác nhận ID-003-T045 tới
      T048 và ID-001-T045 tới T046 đã triển khai; nếu chưa, DỪNG và BÁO CÁO.
      **Phụ thuộc:** LRN-001-T001.
      **Truy vết:** Mục Phân quyền và Rủi ro của kế hoạch; LRN-001-SR-001, LRN-001-SR-002;
      LRN-001-AC-005, LRN-001-AC-006, LRN-001-AC-030.

- [x] **LRN-001-T003 — Xác nhận các ranh giới service và loại trừ.** Ghi nhận rằng vòng đời Test
      Case, hành vi Judge, dữ liệu Submission, điểm số và tiến độ đều nằm ngoài LRN-001; rằng không
      công việc nào tạo khoá ngoại, truy vấn cơ sở dữ liệu hay thực thể nghiệp vụ dùng chung xuyên
      service; và rằng không có microservice Problem/Topic/Recommendation nào được thêm.
      **Phụ thuộc:** LRN-001-T001.
      **Truy vết:** LRN-001-FR-001, LRN-001-FR-027, LRN-001-FR-028; LRN-001-SR-009;
      LRN-001-AC-022, LRN-001-AC-023.

## Domain

- [x] **LRN-001-T004 — Thêm từ vựng domain và các value object.** Tạo các kiểu độc lập với framework
      cho `ProblemId`, `Slug`, `ProblemTitle`, `ProblemType`, `Difficulty`, `PublishStatus`,
      `DeletedMarker`, `ProblemStatement`, `InputSpecification`, `OutputSpecification`,
      `VisibleExample`, `Constraints`, `ExecutionLimits`, `TopicReference`, `TagReference`,
      `EnabledLanguage`, `StarterCode`, `FunctionContract`, `OopContract`, `CreatedBy`. Value object
      kiểm tra dữ liệu ngay khi khởi tạo và bất biến. Tái dùng `ProblemType` và `SupportedLanguage`
      từ `libs/contracts`; không tạo danh mục ngôn ngữ trùng lặp.
      **Phụ thuộc:** LRN-001-T001.
      **Truy vết:** LRN-001-FR-002, LRN-001-FR-003, LRN-001-FR-016, LRN-001-FR-018,
      LRN-001-FR-020, LRN-001-FR-021, LRN-001-FR-022; LRN-001-AC-010, LRN-001-AC-011,
      LRN-001-AC-012, LRN-001-AC-017.

- [x] **LRN-001-T005 — Hiện thực aggregate root `Problem`.** Aggregate sở hữu state/vòng đời,
      metadata, đề bài, cấu hình theo loại, ngôn ngữ/giới hạn và starter code, dưới dạng một ranh
      giới nhất quán được nạp và lưu như một khối. Aggregate KHÔNG bao gồm vòng đời `TestCase`,
      state của Submission/JudgeResult/Progress, vòng đời Assignment, hay điểm số. Không import
      NestJS/TypeORM/HTTP.
      **Phụ thuộc:** LRN-001-T004.
      **Truy vết:** LRN-001-FR-001, LRN-001-FR-002, LRN-001-FR-014, LRN-001-FR-019,
      LRN-001-FR-023; mục Aggregate root của kế hoạch.

- [x] **LRN-001-T006 — Hiện thực máy trạng thái vòng đời.** Chỉ các bước chuyển đã phê duyệt: tạo ->
      `DRAFT`; `DRAFT -> PUBLISHED`; `PUBLISHED -> ON_HOLD`; `ON_HOLD -> PUBLISHED`; xoá mềm từ
      `PUBLISHED` hoặc `ON_HOLD` (giữ nguyên `publishStatus`); khôi phục về đúng trạng thái đã bảo
      toàn. Các bước chuyển bị cấm trả về lỗi nghiệp vụ `InvalidProblemState` mà không thay đổi
      state: `DRAFT -> ON_HOLD`, xoá mềm một `DRAFT`, xuất bản lại nội dung không phải `ON_HOLD`,
      tạm giữ nội dung không phải `PUBLISHED`, khôi phục nội dung chưa bị xoá. Quy tắc chuyển trạng
      thái nằm trong aggregate, không nằm trong controller.
      **Phụ thuộc:** LRN-001-T005.
      **Truy vết:** LRN-001-FR-011, LRN-001-FR-013, LRN-001-FR-030, LRN-001-FR-031,
      LRN-001-FR-032, LRN-001-FR-033, LRN-001-FR-034; LRN-001-AC-008, LRN-001-AC-025,
      LRN-001-AC-026, LRN-001-AC-027, LRN-001-AC-028, LRN-001-AC-029.

- [x] **LRN-001-T007 — Hiện thực bộ kiểm tra contract theo từng loại.** `STANDARD` cần đặc tả đầu
      vào/đầu ra; `FUNCTION` cần contract khả gọi theo từng ngôn ngữ (tên hàm, tham số, kiểu trả về)
      cho mọi ngôn ngữ đang bật; `OOP` cần contract cấu trúc theo từng ngôn ngữ (class/interface,
      constructor, phương thức, mức truy cập) cho mọi ngôn ngữ đang bật. Với `FUNCTION`/`OOP`,
      starter code là bắt buộc ở mọi ngôn ngữ đang bật trước khi xuất bản; với `STANDARD` là tuỳ
      chọn. Contract theo từng ngôn ngữ, không phải một trừu tượng hoá trung lập với ngôn ngữ.
      **Phụ thuộc:** LRN-001-T004, LRN-001-T005.
      **Truy vết:** LRN-001-FR-003, LRN-001-FR-014, LRN-001-FR-019; LRN-001-AC-013,
      LRN-001-AC-014, LRN-001-AC-016.

- [x] **LRN-001-T008 — Hiện thực `PublishValidator` như một domain service.** Kiểm tra tiêu đề và đề
      bài không rỗng, loại và độ khó hợp lệ, slug duy nhất và hợp lệ, giới hạn thực thi dương trong
      biên nền tảng, ít nhất một ngôn ngữ được phê duyệt đang bật, và contract bắt buộc theo loại.
      LRN-001 **không** chặn xuất bản theo mức độ sẵn sàng của Test Case — đó là phụ thuộc LRN-002.
      Cùng một validator được dùng bởi xuất bản, xuất bản lại, phần hiển thị mức độ sẵn sàng ở phía
      quản lý, và xem trước.
      **Phụ thuộc:** LRN-001-T006, LRN-001-T007.
      **Truy vết:** LRN-001-FR-012, LRN-001-FR-018, LRN-001-FR-020, LRN-001-FR-032;
      LRN-001-AC-008, LRN-001-AC-009, LRN-001-AC-012, LRN-001-AC-013, LRN-001-AC-014,
      LRN-001-AC-016, LRN-001-AC-017, LRN-001-AC-027.

- [x] **LRN-001-T009 — Hiện thực quy tắc định dạng nội dung.** Đề bài và các phần phù hợp với loại
      dùng Markdown hạn chế. Kiểm tra giới hạn độ dài và tính không rỗng, từ chối payload HTML/script
      thô và nội dung không an toàn tương đương trước khi lưu. Backend lưu Markdown thô đã kiểm tra
      và không bao giờ thực thi nó; việc làm sạch để render an toàn do frontend sở hữu. Không cài đặt
      gói render/sanitize nào ở backend.
      **Phụ thuộc:** LRN-001-T004.
      **Truy vết:** LRN-001-FR-029; LRN-001-SR-007; LRN-001-AC-024.

- [x] **LRN-001-T010 — Thêm unit test cho tầng domain.** Kiểm thử các bất biến của aggregate, việc
      kiểm tra từ vựng, toàn bộ máy trạng thái vòng đời gồm cả các bước chuyển bị cấm, mức độ sẵn
      sàng xuất bản theo từng loại, giới hạn thực thi, ranh giới starter code, và quy tắc định dạng
      nội dung. **Các test này phải chạy được mà không cần PostgreSQL** — đó là mục đích chính của
      ranh giới hexagonal.
      **Phụ thuộc:** LRN-001-T005, LRN-001-T006, LRN-001-T007, LRN-001-T008, LRN-001-T009.
      **Truy vết:** LRN-001-AC-001, LRN-001-AC-004, LRN-001-AC-008, LRN-001-AC-010,
      LRN-001-AC-011, LRN-001-AC-012, LRN-001-AC-013, LRN-001-AC-014, LRN-001-AC-016,
      LRN-001-AC-017, LRN-001-AC-024, LRN-001-AC-025, LRN-001-AC-026, LRN-001-AC-027,
      LRN-001-AC-028, LRN-001-AC-029.

## Port và ranh giới

- [x] **LRN-001-T011 — Định nghĩa các port/ranh giới.** Chỉ thêm `ProblemRepository` (domain
      repository port tại `domain/repositories/`), `TopicTagReader`, `TransactionRunner`
      (application out port tại `application/ports/out/`), `PublishValidator`
      (domain service tại `domain/services/`), `ProblemAuthorizationService` (application service
      tại `application/services/`) và inbound port cho từng use case. Mỗi use case implement
      `I...PortIn` tại `application/ports/in/`; controller inject qua token `..._PORT_IN`. File
      outbound port dùng hậu tố `.port.out.ts`; inbound port dùng `.port.in.ts`; không dùng
      `.port.ts`. Các port không chứa TypeORM, NestJS, HTTP hay kiểu phản hồi của Gateway. Không thêm
      base repository chung, bus CQRS, policy engine hay event store. Principal tin cậy không phải
      out port: `@TrustedPrincipal()`/`TrustedPrincipalGuard` ở presentation đọc header Gateway và
      controller truyền `Principal` vào use case.
      **Phụ thuộc:** LRN-001-T005, LRN-001-T008.
      **Truy vết:** Mục Các port và ranh giới và Tuân thủ kiến trúc của kế hoạch.

- [x] **LRN-001-T012 — Hiện thực chính sách phân quyền và sở hữu Problem.** Đánh giá quyền
      `problem:*` cần thiết cộng với quyền sở hữu, dựa trên principal tin cậy. Một Giảng viên chỉ
      quản lý các Problem do chính mình tạo; `createdBy` luôn là principal tin cậy tại thời điểm tạo;
      quyền sở hữu được thực thi bằng cách so sánh `record.createdBy` với principal ở tầng
      application. `ADMIN` không có thẩm quyền ngầm và chịu cùng các kiểm tra như mọi tác nhân khác.
      Quyền sở hữu không bao giờ được nhận từ client.
      **Phụ thuộc:** LRN-001-T002, LRN-001-T011.
      **Truy vết:** LRN-001-FR-004, LRN-001-FR-009, LRN-001-FR-010; LRN-001-SR-001,
      LRN-001-SR-002, LRN-001-SR-006; LRN-001-AC-005, LRN-001-AC-006, LRN-001-AC-030.

## Tầng application — use case và đầu ra

- [x] **LRN-001-T013 — Hiện thực `CreateProblem`.** Phân quyền tác nhân với `problem:create`; kiểm
      tra từ vựng; kiểm tra tính duy nhất của slug; suy ra `createdBy` từ principal tin cậy; dựng
      aggregate ở `DRAFT`; lưu nguyên tử. Không nhận `createdBy`, mốc thời gian, trạng thái, trường
      ẩn/judge, vai trò hay quyền từ client.
      **Phụ thuộc:** LRN-001-T012, LRN-001-T023.
      **Truy vết:** LRN-001-FR-004, LRN-001-FR-021, LRN-001-FR-022; LRN-001-SR-006;
      LRN-001-AC-001, LRN-001-AC-007, LRN-001-AC-018.

- [x] **LRN-001-T014 — Hiện thực `UpdateProblem`.** Phân quyền theo quyền sở hữu và trạng thái
      (`DRAFT` hoặc `PUBLISHED` chỉnh sửa được tại chỗ; `ON_HOLD` và đã xoá mềm thì không); chỉ áp
      dụng các trường trong danh sách cho phép; chạy kiểm tra theo loại. `problemType` chỉ đổi được
      khi Problem ở `DRAFT`; đổi loại ở trạng thái khác là `InvalidProblemState`, và `type_config`
      phải khớp loại mới. Không trường nào thay đổi được `id`, `slug`, `createdBy`, `createdAt`,
      `publishStatus`, `deletedAt` hay các trường ẩn/nội bộ. Cập nhật một Problem `PUBLISHED` phải
      bảo toàn mức độ sẵn sàng xuất bản.
      **Phụ thuộc:** LRN-001-T012, LRN-001-T023.
      **Truy vết:** LRN-001-FR-010, LRN-001-FR-017, LRN-001-FR-018, LRN-001-FR-019,
      LRN-001-FR-021; LRN-001-SR-006; LRN-001-AC-007, LRN-001-AC-016.

- [x] **LRN-001-T015 — Hiện thực `PublishProblem`.** Phân quyền theo quyền sở hữu; nạp state hiện
      tại; chạy toàn bộ kiểm tra mức độ sẵn sàng dựa trên state đã lưu, không dựa trên khẳng định
      của người gọi; chuyển `DRAFT -> PUBLISHED` nguyên tử. Thất bại thì giữ `DRAFT` và trả về tập
      điều kiện còn thiếu/không hợp lệ.
      **Phụ thuộc:** LRN-001-T008, LRN-001-T012, LRN-001-T023.
      **Truy vết:** LRN-001-FR-011, LRN-001-FR-012, LRN-001-FR-030; LRN-001-AC-008,
      LRN-001-AC-009, LRN-001-AC-025.

- [x] **LRN-001-T016 — Hiện thực `HoldProblem` và `RepublishProblem`.** Tạm giữ thực hiện bước
      chuyển `PUBLISHED` sang `ON_HOLD`: Problem bị loại khỏi khám phá của người học nhưng giữ định
      danh ổn định, và không message nào được gửi tới Submission/Judge. Xuất bản lại kiểm tra lại mức
      độ sẵn sàng dựa trên state đã lưu, rồi thực hiện bước chuyển `ON_HOLD` sang `PUBLISHED` một
      cách nguyên tử; thất bại thì giữ nguyên `ON_HOLD`.
      **Phụ thuộc:** LRN-001-T006, LRN-001-T008, LRN-001-T012, LRN-001-T023.
      **Truy vết:** LRN-001-FR-013, LRN-001-FR-031, LRN-001-FR-032; LRN-001-AC-026,
      LRN-001-AC-027, LRN-001-AC-030.

- [x] **LRN-001-T017 — Hiện thực `SoftDeleteProblem` và `RestoreProblem`.** Xoá mềm: yêu cầu
      `PUBLISHED` hoặc `ON_HOLD`; đặt `deletedAt`; giữ bản ghi, ID ổn định và `publishStatus` đã lưu;
      không đụng lịch sử Submission; không xoá cứng, không purge. Khôi phục: yêu cầu dấu xoá đang
      được đặt; gỡ dấu xoá; Problem trở về đúng trạng thái đã bảo toàn mà không kiểm tra lại nội
      dung. Xoá một `DRAFT` và khôi phục một Problem chưa bị xoá đều là lỗi nghiệp vụ.
      **Phụ thuộc:** LRN-001-T006, LRN-001-T012, LRN-001-T023.
      **Truy vết:** LRN-001-FR-013, LRN-001-FR-033, LRN-001-FR-034; LRN-001-AC-028,
      LRN-001-AC-029, LRN-001-AC-030, LRN-001-AC-031.

- [x] **LRN-001-T018 — Hiện thực `GetPublishedProblem` và `ListPublishedProblems`.** Chỉ nội dung
      `PUBLISHED` và chưa bị xoá. Tra cứu theo ID ổn định hoặc slug; liệt kê có phân trang, lọc theo
      `problemType`/`difficulty`/`topic`/`tag`, tìm theo tiêu đề bằng `ILIKE` không phân biệt hoa
      thường, sắp xếp mặc định mới nhất trước. Kết quả rỗng là thành công. Problem bản nháp, tạm giữ
      và đã xoá mềm không được để lộ sự tồn tại, kể cả qua số đếm. Danh mục chỉ dành cho người đã
      xác thực.
      **Phụ thuộc:** LRN-001-T012, LRN-001-T023.
      **Truy vết:** LRN-001-FR-005, LRN-001-FR-006, LRN-001-FR-007, LRN-001-FR-008;
      LRN-001-SR-003; LRN-001-AC-002, LRN-001-AC-003, LRN-001-AC-004.

- [x] **LRN-001-T019 — Hiện thực `GetManagedProblem` và `ListManagedProblems`.** Kiểm tra quyền sở
      hữu; mọi trạng thái đang hoạt động gồm bản nháp và `ON_HOLD`; kèm thông tin mức độ sẵn sàng
      xuất bản. Không nhận `lecturerId` từ client. Hỗ trợ cờ `includeDeleted` giới hạn trong phạm vi
      chủ sở hữu (mặc định `false`); Problem đã xoá mềm chỉ xuất hiện qua cờ này. Không trả về đáp án
      Test Case ẩn ở dạng thô.
      **Phụ thuộc:** LRN-001-T012, LRN-001-T023.
      **Truy vết:** LRN-001-FR-009, LRN-001-FR-023; LRN-001-SR-003; LRN-001-AC-031.
      Bổ sung `publishStatus` và `search` để truy vấn cho bộ chọn gắn bài trong đúng phạm vi chủ sở
      hữu. Kiểm tra bộ lọc tác động đến cả danh sách và tổng số trước phân trang.

- [x] **LRN-001-T020 — Hiện thực `PreviewProblem`.** Kiểm tra quyền sở hữu; chiếu ra biểu diễn hướng
      người học của bản nháp hiện tại mà không xuất bản, không thực thi mã, không thay đổi
      state/mốc thời gian, và không làm Problem khám phá được qua danh mục công khai.
      **Phụ thuộc:** LRN-001-T012, LRN-001-T021.
      **Truy vết:** LRN-001-FR-024, LRN-001-FR-028; LRN-001-AC-019.

- [x] **LRN-001-T021 — Hiện thực result model và mapper phản hồi.** Application trả result model;
      `presentation/http/mappers/` chuyển result model sang response DTO. Phép chiếu công khai và
      phép chiếu quản lý là hai danh sách cho phép tách biệt, được ánh xạ tường minh. Entity TypeORM
      không bao giờ được trả về trực tiếp. Phản hồi công khai không chứa `publishStatus`, `deletedAt`,
      Test Case ẩn, kết quả ẩn mong đợi, harness, lời giải nội bộ, lệnh biên dịch/Docker hay thông tin
      xác thực nội bộ; starter code chỉ phơi bày cho các ngôn ngữ đang bật.
      **Phụ thuộc:** LRN-001-T005.
      **Truy vết:** LRN-001-FR-015, LRN-001-FR-019, LRN-001-FR-023, LRN-001-FR-025;
      LRN-001-SR-004, LRN-001-SR-010; LRN-001-AC-015, LRN-001-AC-020.

## Lưu trữ

- [x] **LRN-001-T022 — Mở rộng model lưu trữ Problem.** Thêm ánh xạ cột `type_config` (jsonb, cho
      phép null) và `deleted_at` (timestamptz, cho phép null) vào entity TypeORM hiện có. Đổi giá trị
      enum `PublishStatus` từ `ARCHIVED` sang `ON_HOLD`. Giữ `hidden_harness` ở chế độ
      `select: false`. Không chuyển entity vào `libs/`.
      **Phụ thuộc:** LRN-001-T005.
      **Truy vết:** LRN-001-FR-013, LRN-001-FR-033; mục Lưu trữ của kế hoạch.

- [x] **LRN-001-T023 — Hiện thực adapter TypeORM cho domain repository `ProblemRepository`.** Đặt
      adapter tại `infrastructure/persistence/`; nó hiện thực interface ở `domain/repositories/` và
      không được import ngược vào domain. Sở hữu các query builder cho liệt kê/tìm/lọc/phân trang nội
      dung đã xuất bản (luôn kèm `deleted_at IS NULL`), tra cứu theo slug/id, chèn slug duy nhất với
      xung đột ràng buộc duy nhất ánh xạ thành lỗi nghiệp vụ `DuplicateSlug`, truy vấn quản lý theo
      phạm vi chủ sở hữu với cờ `includeDeleted`, các bước chuyển xoá mềm và khôi phục nguyên tử, và
      lưu aggregate nguyên tử qua `TransactionRunner`. Chỉ dùng datasource của Learning. Ánh xạ hai
      chiều giữa aggregate domain và model lưu trữ tại ranh giới hạ tầng.
      **Phụ thuộc:** LRN-001-T011, LRN-001-T022.
      **Truy vết:** LRN-001-FR-005, LRN-001-FR-007, LRN-001-FR-008, LRN-001-FR-021,
      LRN-001-FR-033, LRN-001-FR-034; LRN-001-SR-009; LRN-001-AC-018, LRN-001-AC-022.

- [x] **LRN-001-T024 — Hiện thực `TopicTagReader`.** Kiểm tra sự tồn tại của từng ID Topic/Tag được
      tham chiếu khi tạo/cập nhật và từ chối các tham chiếu không tồn tại mà không âm thầm tạo ra
      chúng. Tái dùng các bảng nối `problem_topics`/`problem_tags` hiện có. Các phép join khi khám
      phá có tính phòng thủ, coi tham chiếu thiếu là vắng mặt/rỗng. LRN-001 không triển khai CRUD
      danh mục Topic/Tag.
      **Phụ thuộc:** LRN-001-T011.
      **Truy vết:** LRN-001-FR-017; LRN-001-AC-005.

- [x] **LRN-001-T025 — Hiện thực `TransactionRunner`.** Adapter dùng `DataSource` của TypeORM, điều
      phối nạp aggregate, kiểm tra và lưu một cách nguyên tử, để một lần kiểm tra dữ liệu, phân quyền
      hay chuyển trạng thái thất bại không commit thay đổi dở dang nào.
      **Phụ thuộc:** LRN-001-T011.
      **Truy vết:** LRN-001-FR-011, LRN-001-FR-030; LRN-001-AC-025.

- [x] **LRN-001-T026 — Thêm test lưu trữ và đồng thời.** Kiểm chứng tính đúng đắn của truy vấn
      liệt kê/lọc/tìm/phân trang kèm `deleted_at IS NULL`; bộ lọc rỗng và kết quả rỗng vẫn hợp lệ;
      JSONB `type_config` round-trip đúng; các bước chuyển xoá mềm/khôi phục là nguyên tử và bị ẩn
      khỏi truy vấn mặc định; một cuộc đua giữa xoá và khôi phục để lại đúng một kết quả nhất quán;
      tạo slug đồng thời thì nhiều nhất một Problem sở hữu slug đó. Xác nhận không datasource, khoá
      ngoại hay thực thể nghiệp vụ dùng chung xuyên service nào được import lúc chạy.
      **Phụ thuộc:** LRN-001-T023, LRN-001-T024, LRN-001-T025, LRN-001-T028.
      **Truy vết:** LRN-001-FR-008, LRN-001-FR-022; LRN-001-AC-002, LRN-001-AC-003,
      LRN-001-AC-018, LRN-001-AC-022, LRN-001-AC-028, LRN-001-AC-031.

## Cơ sở dữ liệu / Migration

- [x] **LRN-001-T027 — Viết migration LRN-001.** Tạo
      `apps/learning-service/src/database/migrations/<timestamp>-Lrn001ProblemManagement.ts` mà không
      sửa migration nền tảng và giữ `synchronize: false`. Phần up phải: thêm cột `type_config` jsonb
      cho phép null; thêm cột `deleted_at` timestamptz cho phép null; tạo lại enum `publish_status`
      bằng cách thêm `ON_HOLD`, chuyển mọi bản ghi `ARCHIVED` cũ thành `ON_HOLD`, rồi bỏ giá trị
      `ARCHIVED`; thêm ràng buộc CHECK cho `problem_type IN ('STANDARD','FUNCTION','OOP')` và cho
      giới hạn thời gian/bộ nhớ dương trong trần nền tảng; thêm `UNIQUE (problem_id, language)` vào
      `starter_codes`; thêm các partial index `WHERE deleted_at IS NULL` cho
      `(publish_status, created_at DESC)`, `(publish_status, problem_type)`,
      `(publish_status, difficulty)` và `(created_by)`. Phần down gỡ đúng những thứ đã thêm theo thứ
      tự ngược lại và khôi phục các giá trị enum; không bảng nội dung nào bị xoá.
      **Phụ thuộc:** LRN-001-T022.
      **Truy vết:** LRN-001-FR-003, LRN-001-FR-013, LRN-001-FR-018, LRN-001-FR-019,
      LRN-001-FR-020, LRN-001-FR-021, LRN-001-FR-033; mục Thay đổi cơ sở dữ liệu/Migration của kế
      hoạch.

- [x] **LRN-001-T028 — Kiểm chứng vòng đời migration.** Trên một cơ sở dữ liệu `bkpractice_learning`
      cách ly, chạy `pnpm migration:run:learning`, kiểm tra schema và dữ liệu đã chuyển đổi, chạy
      `pnpm migration:revert:learning`, kiểm chứng phần down, rồi chạy lại migration. Xác nhận
      `synchronize` vẫn tắt và không schema của service nào khác bị tạo hay thay đổi. Kiểm chứng
      riêng việc chuyển đổi enum với dữ liệu `ARCHIVED` có sẵn.
      **Phụ thuộc:** LRN-001-T027.
      **Truy vết:** Yêu cầu về migration của Định nghĩa Hoàn thành; chiến lược cơ sở dữ liệu;
      LRN-001-AC-028.

## Infrastructure

- [x] **LRN-001-T029 — Hiện thực cơ chế principal tin cậy.** (Điều chỉnh 2026-10-27: thay
      `RequestPrincipalProvider` bằng `@TrustedPrincipal()` + `TrustedPrincipalGuard`.) Đọc các
      header tin cậy do Gateway thiết lập (`x-auth-user-id`, `x-auth-roles`, `x-auth-permissions`)
      và dịch chúng thành một principal độc lập với framework; header quyền thiếu thì coi là tập
      rỗng (ID-003-FR-022). Từ chối ngữ cảnh bị thiếu hoặc không nhất quán như phòng thủ nhiều lớp
      cho các lời gọi trực tiếp hoặc định tuyến sai. Phải từ chối header định danh/vai trò giả mạo
      do client gửi và không bao giờ chấp nhận một token của nhà cung cấp Microsoft hay một refresh
      token như một principal.
      **Phụ thuộc:** LRN-001-T011.
      **Truy vết:** LRN-001-FR-004; LRN-001-SR-002, LRN-001-SR-012; LRN-001-AC-005,
      LRN-001-AC-007.

- [x] **LRN-001-T030 — Hiện thực adapter quyền `problem:*`.** Theo kết quả của LRN-001-T002, đánh
      giá tám quyền `problem:*` qua seam đã phê duyệt: kiểm mã quyền cần thiết có trong tập quyền của
      principal (từ `x-auth-permissions`). Không dùng phương án tạm ánh xạ theo vai trò. Không bao giờ
      rơi về dữ liệu do client cung cấp.
      **Phụ thuộc:** LRN-001-T002, LRN-001-T012, LRN-001-T029.
      **Truy vết:** LRN-001-SR-001, LRN-001-SR-002, LRN-001-SR-012; LRN-001-AC-005,
      LRN-001-AC-006, LRN-001-AC-030.

- [x] **LRN-001-T031 — Thêm test cho các adapter hạ tầng.** Kiểm thử việc ánh xạ giữa lớp lưu trữ và
      domain, việc chuyển đổi xung đột ràng buộc duy nhất thành lỗi nghiệp vụ, hành vi của
      `TransactionRunner` khi rollback, việc từ chối header giả mạo ở decorator/guard principal, và
      việc kiểm tra quyền không bao giờ đọc dữ liệu từ client.
      **Phụ thuộc:** LRN-001-T023, LRN-001-T024, LRN-001-T025, LRN-001-T029, LRN-001-T030.
      **Truy vết:** LRN-001-SR-002, LRN-001-SR-009, LRN-001-SR-012; LRN-001-AC-007,
      LRN-001-AC-018.

## API / Presentation

- [x] **LRN-001-T032 — Tạo các DTO request.** Thêm `CreateProblemRequestDto`,
      `UpdateProblemRequestDto` (dạng partial), các contract payload theo từng loại, và các DTO query
      cho bộ lọc. Bộ lọc danh sách quản lý bổ sung cờ `includeDeleted` giới hạn trong phạm vi chủ sở
      hữu (mặc định `false`). Ngữ nghĩa `PATCH`: trường bị bỏ qua thì giữ nguyên, `null` xoá một
      trường cho phép null, giá trị rỗng bị từ chối ở nơi có bất biến không-rỗng. Không payload nào
      đặt được `publishStatus`, `deletedAt`, `createdBy` hay các trường ẩn/nội bộ. Tái dùng
      `ValidationPipe` toàn cục với `whitelist` và `forbidNonWhitelisted`.
      **Phụ thuộc:** LRN-001-T004.
      **Truy vết:** LRN-001-FR-003, LRN-001-FR-010, LRN-001-FR-016, LRN-001-FR-018;
      LRN-001-SR-006, LRN-001-SR-008; LRN-001-AC-007, LRN-001-AC-010, LRN-001-AC-011.

- [x] **LRN-001-T033 — Tạo các DTO response.** `ProblemSummaryResponseDto` và
      `ProblemDetailResponseDto` cho phía công khai; `ManagedProblemResponseDto` cho phía quản lý,
      bổ sung `publishStatus`, `createdAt`/`updatedAt`, các lỗi về mức độ sẵn sàng xuất bản, và — chỉ
      trong luồng `includeDeleted` — dấu `deletedAt`. Tất cả đều là phép chiếu tường minh.
      **Phụ thuộc:** LRN-001-T021.
      **Truy vết:** LRN-001-FR-023, LRN-001-FR-025; LRN-001-SR-004, LRN-001-SR-010;
      LRN-001-AC-015, LRN-001-AC-020.

- [x] **LRN-001-T034 — Hiện thực các route công khai.** `GET /api/problems` và
      `GET /api/problems/:idOrSlug`, đều yêu cầu Bearer token vì danh mục chỉ dành cho người đã xác
      thực. Bản nháp, tạm giữ và đã xoá mềm trả về `404` mà không lộ state. Thay thế hành vi liệt kê
      entity thô hiện có. Thứ tự sắp xếp là mặc định cố định; không nhận trường sắp xếp do client
      điều khiển. **Lưu ý khi khai báo route: `/api/problems/managed` phải đứng trước
      `/api/problems/:idOrSlug`, nếu không NestJS sẽ khớp `managed` vào tham số `:idOrSlug`.**
      **Phụ thuộc:** LRN-001-T018, LRN-001-T029, LRN-001-T032, LRN-001-T033.
      **Truy vết:** LRN-001-FR-005, LRN-001-FR-006, LRN-001-FR-007, LRN-001-FR-008;
      LRN-001-AC-002, LRN-001-AC-003, LRN-001-AC-004.

- [x] **LRN-001-T035 — Hiện thực các route quản lý và chuyển trạng thái.** `POST /api/problems`,
      `PATCH /api/problems/:id`, `POST /api/problems/:id/publish`, `POST /api/problems/:id/hold`,
      `POST /api/problems/:id/republish`, `DELETE /api/problems/:id` (chỉ xoá mềm),
      `POST /api/problems/:id/restore`, `GET /api/problems/managed`,
      `GET /api/problems/managed/:id`, `POST /api/problems/:id/preview`. Mỗi route gọi đúng một use
      case; controller chỉ lo transport, không truy cập TypeORM và không chứa chuỗi `if/else` nghiệp
      vụ. Tác nhân luôn lấy từ principal tin cậy.
      **Phụ thuộc:** LRN-001-T013, LRN-001-T014, LRN-001-T015, LRN-001-T016, LRN-001-T017,
      LRN-001-T019, LRN-001-T020, LRN-001-T032, LRN-001-T033.
      **Truy vết:** LRN-001-FR-004, LRN-001-FR-009, LRN-001-FR-010, LRN-001-FR-011,
      LRN-001-FR-024, LRN-001-FR-031, LRN-001-FR-032, LRN-001-FR-033, LRN-001-FR-034;
      LRN-001-AC-001, LRN-001-AC-009, LRN-001-AC-019, LRN-001-AC-026, LRN-001-AC-027,
      LRN-001-AC-028, LRN-001-AC-029.

- [x] **LRN-001-T036 — Giữ nguyên route judge-package nội bộ.** Bảo toàn
      `GET internal/problems/:id/judge-package/:language` cùng `InternalServiceGuard` và
      `@ApiExcludeEndpoint`. Contract dữ liệu judge được bảo vệ không đổi và không thuộc phạm vi
      LRN-001; không tạo endpoint công khai tương đương.
      **Phụ thuộc:** LRN-001-T035.
      **Truy vết:** LRN-001-FR-026; LRN-001-SR-005; LRN-001-AC-021.

- [x] **LRN-001-T037 — Cập nhật Swagger.** Mô tả các endpoint công khai và quản lý, các DTO, yêu cầu
      Bearer, ngữ nghĩa `PATCH`, và các mã lỗi. Route judge-package nội bộ vẫn giữ
      `@ApiExcludeEndpoint`. Các ví dụ Swagger không chứa Test Case ẩn, kết quả ẩn mong đợi, harness,
      lời giải nội bộ, thông tin xác thực hay lệnh runtime.
      **Phụ thuộc:** LRN-001-T034, LRN-001-T035.
      **Truy vết:** Phần tài liệu API của Định nghĩa Hoàn thành; LRN-001-SR-004;
      LRN-001-AC-020.

- [x] **LRN-001-T038 — Nối dây composition root của module Problems.** Đăng ký các use case,
      `PublishValidator` và `ProblemAuthorizationService` làm provider của Nest; bind
      `ProblemRepository`, `TopicTagReader`, `TransactionRunner` với adapter tương ứng; dùng
      `@TrustedPrincipal()`/`TrustedPrincipalGuard` ở presentation; bind 12 inbound port token tới
      use case class bằng `useExisting`; chỉ phơi bày
      những provider mà tầng presentation cần. Giữ phần nối dây module không chứa hành vi nghiệp vụ
      và không có trừu tượng hoá trùng lặp. Không đụng các module Courses/Assignments/Progress.
      **Phụ thuộc:** LRN-001-T013 tới LRN-001-T021, LRN-001-T023 tới LRN-001-T025,
      LRN-001-T029, LRN-001-T030, LRN-001-T034, LRN-001-T035.
      **Truy vết:** Mục Adapter hạ tầng và Tuân thủ kiến trúc của kế hoạch; LRN-001-FR-001.
      **Kết quả kiểm chứng:** boot thật trước đó fail DI (`design:paramtypes` emit `Object` cho
      param interface do `import type`). Đã sửa: thêm `@Inject(TOKEN)` cho mọi constructor nhận
      interface port, chuyển import của 4 class cụ thể (`ProblemAuthorizationService`,
      `ContentFormatValidator`, `PublishValidator`, `ProblemResultMapper`) sang value import, thêm
      `@Injectable()` cho 3 domain service. Kiểm chứng: `pnpm typecheck`, `eslint`,
      `pnpm build:learning`, boot với Postgres/RabbitMQ thật (14 route map, "successfully started"),
      HTTP smoke test đúng hành vi (401 thiếu xác thực, 401 duplicate header, 403 thiếu quyền/role,
      200 list công khai và managed, 400 validation Nest shape), 12/12 test suite (159 test) pass.

## Tích hợp API Gateway

- [x] **LRN-001-T039 — Kiểm chứng định tuyến `/api/problems` ở Gateway.** Xác nhận Gateway hiện có
      chuyển tiếp mọi thao tác Problem tới Learning, bảo vệ chúng như các route không công khai (danh
      mục chỉ dành cho người đã xác thực theo quyết định đã phê duyệt 3), loại bỏ các header
      `x-auth-user-id`/`x-auth-roles` giả mạo, và chỉ chuyển tiếp ngữ cảnh đã xác minh. Không dự
      kiến thay đổi nghiệp vụ nào ở Gateway; chỉ sửa nếu phát hiện vấn đề tương thích hẹp ở tầng
      truyền tải.
      **Phụ thuộc:** LRN-001-T034, LRN-001-T035.
      **Truy vết:** LRN-001-FR-006; LRN-001-SR-002; LRN-001-AC-005, LRN-001-AC-007.

Bằng chứng T039 (2026-11-04): GW-002 kiểm thử đủ 21 method/path Problem, metadata đã xác minh,
không có ngoại lệ ẩn danh, cookie/CSRF, header nội bộ và traversal. Gateway có 196 tests pass;
lint/typecheck riêng và build Gateway pass. Xem [worked Gateway Problems](../../../worked/api-gateway/learning/problems/2026-11-04-gateway-routes.md).
Kiểm tra toàn repo và smoke test stack thật còn mở trong tasks GW-002; việc đóng T039 chỉ xác nhận contract Gateway.

## Messaging

- [x] **N/A — LRN-001 không phát ra domain event bắt buộc nào ở phiên bản này.** Không có exchange,
      queue, routing key, retry, ACK/NACK hay DLQ nào được phê duyệt. Consumer `submission.accepted`
      hiện có trong module Progress không thuộc phạm vi LRN-001. Nhu cầu event cho
      Chapter/Assignment/Recommendation thuộc về các đặc tả được phê duyệt riêng.

## Realtime

- [x] **N/A — Quản lý Problem không có yêu cầu realtime.** Không có hành vi Socket.IO hay Redis nào;
      PostgreSQL vẫn là nguồn chân lý.

## Phân quyền và Bảo mật

- [x] **LRN-001-T040 — Hiện thực việc ánh xạ lỗi chuẩn hoá.** Giữ lỗi domain/application độc lập với
      framework và ánh xạ ở tầng Presentation về quy ước hiện có: `401` khi thiếu/sai token; `403`
      khi thiếu quyền hoặc quyền sở hữu; `404` khi không tồn tại hoặc không hiển thị, không lộ sự tồn
      tại của nội dung bản nháp/tạm giữ/đã xoá mềm; `400` cho lỗi kiểm tra dữ liệu; `409` cho slug
      trùng, trạng thái không hợp lệ và xung đột đồng thời. Các bước chuyển vòng đời không hợp lệ và
      các lỗi về mức độ sẵn sàng trả về lỗi nghiệp vụ có cấu trúc, không phải `500` chung chung.
      Không đưa vào cấu trúc lỗi mới.
      **Phụ thuộc:** LRN-001-T013 tới LRN-001-T020, LRN-001-T035.
      **Truy vết:** LRN-001-FR-030; LRN-001-SR-003, LRN-001-SR-012; LRN-001-AC-003,
      LRN-001-AC-005, LRN-001-AC-025, LRN-001-AC-030.

- [x] **LRN-001-T041 — Thực hiện rà soát bảo mật tập trung.** Kiểm chứng rằng đầu vào công khai không
      thể đặt người tạo, trạng thái, dấu xoá, mốc thời gian, vai trò hay quyền; rằng nội dung bản
      nháp, tạm giữ và đã xoá mềm không bị lộ qua liệt kê/tìm/lọc/chi tiết/lỗi/đếm; rằng tài liệu
      judge ẩn không xuất hiện trong phản hồi, log hay ví dụ Swagger; rằng đầu vào ngôn ngữ/giới
      hạn/starter code không trở thành lệnh runtime do client điều khiển; rằng không có truy vấn cơ
      sở dữ liệu xuyên service; và rằng header Authorization, bí mật service và tài liệu judge ẩn
      không bị ghi log.
      **Phụ thuộc:** LRN-001-T021, LRN-001-T029 tới LRN-001-T040.
      **Truy vết:** Toàn bộ LRN-001-SR-001 tới LRN-001-SR-012; LRN-001-AC-015,
      LRN-001-AC-020, LRN-001-AC-021.

## Kiểm thử

- [x] **LRN-001-T042 — Thêm test API/E2E.** Bao phủ: Giảng viên có thẩm quyền tạo được `DRAFT` với ID
      ổn định và người tạo tin cậy; Học viên bị từ chối; giả mạo người tạo bị bỏ qua; người học chỉ
      thấy nội dung `PUBLISHED` chưa bị xoá, kể cả khi tra cứu chính xác theo id/slug; chủ sở hữu cập
      nhật được các trường trong danh sách cho phép còn Giảng viên khác nhận `403`; bản nháp hợp lệ
      xuất bản được còn bản nháp thiếu điều kiện bị từ chối nguyên tử; tạm giữ và xuất bản lại; xoá
      mềm và khôi phục về đúng trạng thái trước đó; các mục đã xoá chỉ hiện qua `includeDeleted`;
      xem trước không xuất bản và không thực thi.
      **Phụ thuộc:** LRN-001-T034 tới LRN-001-T040.
      **Truy vết:** LRN-001-AC-001 tới LRN-001-AC-014, LRN-001-AC-019, LRN-001-AC-026
      tới LRN-001-AC-031.

- [x] **LRN-001-T043 — Thêm test bảo mật và bảo mật dữ liệu ẩn.** Kiểm tra phản hồi, lỗi, log và ví
      dụ Swagger công khai không chứa tài liệu ẩn, thông tin xác thực hay lệnh runtime; route judge
      nội bộ từ chối bí mật giả mạo và người gọi công khai; các nỗ lực gán hàng loạt và giả mạo header
      định danh đều thất bại; lỗi phân quyền/kiểm tra dữ liệu/chuyển trạng thái không commit thay đổi
      dở dang nào.
      **Phụ thuộc:** LRN-001-T041, LRN-001-T042.
      **Truy vết:** LRN-001-SR-002 tới LRN-001-SR-006, LRN-001-SR-010, LRN-001-SR-011;
      LRN-001-AC-007, LRN-001-AC-015, LRN-001-AC-020, LRN-001-AC-021, LRN-001-AC-025.

## Tài liệu

- [x] **LRN-001-T044 — Cập nhật tài liệu hướng tới việc triển khai.** Giữ Swagger đồng bộ; ghi lại
      cảnh báo về việc áp dụng/hoàn tác migration, đặc biệt là chuyển đổi enum `ARCHIVED -> ON_HOLD`;
      ghi lại tình trạng của cơ chế truyền quyền `problem:*` và mọi phương án tạm đã được chấp nhận;
      ghi lại rủi ro còn lại của việc chỉnh sửa tại chỗ nội dung đã xuất bản khi đã có Submission
      tham chiếu. Không mô tả các tính năng Ngoài phạm vi như thể đã có sẵn.
      **Phụ thuộc:** LRN-001-T028, LRN-001-T037, LRN-001-T040 tới LRN-001-T043.
      **Truy vết:** Định nghĩa Hoàn thành; mục Khả năng quan sát và Rủi ro của kế hoạch.

## Kiểm chứng

- [x] **LRN-001-T045 — Chạy các lệnh kiểm chứng của repository.** Khảo sát `package.json` và chạy
      đúng các script hiện có, chỉ dùng pnpm: `pnpm lint`, `pnpm typecheck`, `pnpm test` và
      `pnpm build`. Chỉ sửa các lỗi thuộc phạm vi, chạy lại cho tới khi pass, và ghi lại kết quả
      chính xác cùng mọi lỗi có sẵn không liên quan. Không che lỗi bằng `any`, `@ts-ignore` hay việc
      tắt lint trên diện rộng.
      **Phụ thuộc:** LRN-001-T042, LRN-001-T043, LRN-001-T044.
      **Truy vết:** Các kiểm tra chất lượng của Định nghĩa Hoàn thành.

## Tuân thủ kiến trúc

- [x] **LRN-001-T046 — Kiểm chứng tuân thủ DDD + Hexagonal.** Xác nhận tầng domain không import
      NestJS/TypeORM/JWT/HTTP và test được không cần cơ sở dữ liệu; tầng application chỉ phụ thuộc
      các kiểu domain và các port; tầng presentation là driving adapter chỉ lo transport; tầng
      infrastructure là driven adapter được gắn ở composition root; aggregate được biện minh bởi bất
      biến chứ không tạo cho mỗi bảng; không có context map, anti-corruption layer hay bounded
      context thứ hai; lớp lưu trữ và policy của Problem vẫn nằm trong `bkpractice_learning`; không
      có entity hay use case Problem nào trong `libs/`.
      **Phụ thuộc:** LRN-001-T038, LRN-001-T045.
      **Truy vết:** ADR 0002; `dependency-rules.md` mục Learning DDD rules; mục Tuân thủ kiến trúc
      của kế hoạch; LRN-001-AC-023.

## Xác minh cuối cùng

- [x] **LRN-001-T047 — Đối chiếu bản triển khai với đặc tả đã Approved.** Rà soát từng
      `LRN-001-FR-001` tới `LRN-001-FR-034`, `LRN-001-SR-001` tới `LRN-001-SR-012`, và
      `LRN-001-AC-001` tới `LRN-001-AC-031` với code, test, migration, Swagger và các kết quả kiểm
      chứng đã ghi lại. Xác nhận không có hành vi Ngoài phạm vi nào được thêm vào: CRUD Test Case,
      hành vi Judge, Run/Submit, Course/Assignment, tiến độ, versioning, công cụ tìm kiếm bên ngoài,
      xoá cứng, hay microservice mới. Báo cáo mọi sai lệch, hành vi chưa kiểm chứng được và rủi ro
      còn lại; đừng viết lại đặc tả đã Approved để bản triển khai trông có vẻ tuân thủ.
      **Phụ thuộc:** LRN-001-T044, LRN-001-T045, LRN-001-T046.
      **Truy vết:** Đặc tả đã Approved phiên bản 1.1; Định nghĩa Hoàn thành.

- [ ] **LRN-001-T048 — Hoàn tất bàn giao theo SDD.** Cập nhật mọi ô đánh dấu một cách trung thực,
      giữ lại các mục N/A đã được biện minh, đính kèm bằng chứng kiểm chứng và migration, có được sự
      review của con người, và chỉ chuyển trạng thái đặc tả sang `Implemented` rồi `Verified` thông
      qua quy trình SDD đã phê duyệt.
      **Phụ thuộc:** LRN-001-T047.
      **Truy vết:** Quy trình SDD; Định nghĩa Hoàn thành.

## Bảng tổng hợp độ phủ

### Yêu cầu chức năng

| Yêu cầu               | Công việc triển khai chính               | Công việc kiểm thử/xác minh chính |
| --------------------- | ---------------------------------------- | --------------------------------- |
| LRN-001-FR-001–FR-005 | T003, T005, T013, T018, T022, T023, T038 | T026, T042, T047                  |
| LRN-001-FR-006–FR-010 | T012, T014, T018, T019, T023, T034, T035 | T026, T042, T047                  |
| LRN-001-FR-011–FR-015 | T006, T007, T008, T015, T021, T025, T027 | T010, T042, T043, T047            |
| LRN-001-FR-016–FR-020 | T004, T007, T008, T024, T027, T032       | T010, T026, T042, T047            |
| LRN-001-FR-021–FR-025 | T004, T013, T020, T021, T023, T033       | T010, T042, T043, T047            |
| LRN-001-FR-026–FR-030 | T003, T009, T025, T036, T040             | T031, T043, T047                  |
| LRN-001-FR-031–FR-034 | T006, T016, T017, T022, T023, T027, T035 | T026, T028, T042, T047            |

### Yêu cầu bảo mật

| Yêu cầu               | Công việc triển khai và xác minh                     |
| --------------------- | ---------------------------------------------------- |
| LRN-001-SR-001–SR-003 | T012, T018, T019, T029, T030, T040, T041, T043, T047 |
| LRN-001-SR-004–SR-006 | T021, T032, T033, T036, T037, T041, T043, T047       |
| LRN-001-SR-007–SR-009 | T003, T009, T023, T027, T041, T047                   |
| LRN-001-SR-010–SR-012 | T021, T029, T030, T033, T040, T041, T043, T047       |

### Tiêu chí nghiệm thu

| Tiêu chí nghiệm thu   | Công việc xác minh                 |
| --------------------- | ---------------------------------- |
| LRN-001-AC-001–AC-007 | T010, T026, T042, T047             |
| LRN-001-AC-008–AC-014 | T010, T042, T047                   |
| LRN-001-AC-015–AC-021 | T031, T041, T042, T043, T047       |
| LRN-001-AC-022–AC-025 | T026, T031, T042, T043, T046, T047 |
| LRN-001-AC-026–AC-031 | T026, T028, T042, T047             |

## Tham chiếu Định nghĩa Hoàn thành

LRN-001 chỉ Hoàn thành khi mọi mục có liên quan trong
[`specs/00-system/definition-of-done.md`](../../00-system/definition-of-done.md) đều được thoả mãn,
LRN-001-T001 tới LRN-001-T048 đã hoàn thành hoặc được đánh dấu N/A một cách hợp lệ, migration đã
được kiểm chứng cả chiều up lẫn down, `pnpm lint`, `pnpm typecheck`, `pnpm test` và `pnpm build` đều
pass, Swagger đã cập nhật, và mọi FR/SR/AC đã được đối chiếu với bản triển khai. Chỉ hoàn thành phần
code là chưa đủ.

> File này là một danh sách kiểm tra triển khai, không phải một đặc tả. Không thêm yêu cầu và không
> âm thầm thay đổi `spec.md` hay `plan.md` đã Approved trong lúc thực hiện các công việc này.
