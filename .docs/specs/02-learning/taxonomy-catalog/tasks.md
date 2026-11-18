# LRN-010 — Công việc triển khai Danh mục chủ đề

## Trạng thái và phạm vi

Approved — checklist lập 2026-11-15 theo [spec LRN-010](./spec.md) và [plan](./plan.md).
Giữ ID task để truy vết. Mỗi task ghi mã yêu cầu/tiêu chí nghiệm thu liên quan. Không task nào được
thêm hành vi ngoài đặc tả.

## Chuẩn bị

- [x] **LRN-010-T001 — Nền tảng.** Đọc spec, plan, kiến trúc Learning và ADR 0002; xác nhận module
      `problems` sở hữu `Topic` và `TopicTagReader` (spec "Bối cảnh", "Kiến trúc áp dụng").
- [x] **LRN-010-T002 — Ranh giới.** Xác nhận `topics` đã tồn tại trong migration
      `1700000003000-InitialLearningSchema.ts`, không cần migration mới; `/api/topics` không nằm trong
      `AUTH_PUBLIC_ROUTES`; không thêm quyền RBAC (spec "Ngoài phạm vi", X-01, X-02).

## Application

- [x] **LRN-010-T003 — Out port.** Thêm `listTopics()` vào `TopicTagReader` (FR-001, FR-002).
- [x] **LRN-010-T004 — In port.** Tạo `list-topics.port.in.ts` với `IListTopicsPortIn` và token
      `LIST_TOPICS_PORT_IN` (plan C-01).
- [x] **LRN-010-T005 — Use case.** Tạo `ListTopicsUseCase` chỉ đọc, không phát event, không ghi
      (FR-001, FR-007).
- [x] **LRN-010-T006 — Unit application.** Use case gọi out port đúng một lần, trả nguyên danh sách,
      danh sách rỗng trả `[]`, lỗi reader không trả danh mục một phần (AC-002, AC-004, SR-004).

## Persistence

- [x] **LRN-010-T007 — Adapter.** Cài `listTopics()` bằng
      `SELECT "id", "name" FROM "topics" ORDER BY "name" ASC`, không phân trang (FR-002, FR-003, FR-004).
- [x] **LRN-010-T008 — Unit adapter.** Kiểm chuỗi SQL, mệnh đề `ORDER BY`, và việc trả nguyên row
      (AC-003).

## Presentation

- [x] **LRN-010-T009 — Response DTO.** `TopicListResponseDto { items: TopicResponseDto[] }`, tái dùng
      `TopicResponseDto` sẵn có (FR-002, R-03).
- [x] **LRN-010-T010 — Query DTO.** DTO rỗng `ListTopicsQueryDto` để `ValidationPipe` toàn cục trả
      `400` cho mọi tham số truy vấn (FR-005, AC-005).
- [x] **LRN-010-T011 — Controller.** `public-topics.controller.ts` với `GET /api/topics`,
      `@UseFilters(ProblemExceptionFilter)` + `@UseGuards(TrustedPrincipalGuard)` + `@ApiBearerAuth()`;
      Swagger cho `200`/`400`/`401` (FR-001, FR-005, SR-001, AC-001).
- [x] **LRN-010-T012 — Unit controller.** Trả `{ items }`, gọi đúng port, không thêm trường; pipe từ
      chối `?unsupported=1` và chấp nhận query rỗng (AC-002, AC-005, AC-008).

## Wiring

- [x] **LRN-010-T013 — Module.** Đăng ký controller, provider use case và binding
      `LIST_TOPICS_PORT_IN -> ListTopicsUseCase` (plan M-04).
- [x] **LRN-010-T014 — Module spec.** Bổ sung `INBOUND_BINDINGS` và test wiring controller mới
      (plan M-05).

## Gateway

- [x] **LRN-010-T015 — Route.** Thêm `['GET', /^\/api\/topics\/?$/]` vào `learningRoutes` và
      `'/api/topics'` vào `learningPrefixes` (FR-001, SR-003).
- [x] **LRN-010-T016 — Gateway spec.** `GET /api/topics` được forward; `GET /api/topicsX`,
      `GET /api/topics/id`, `POST /api/topics` và unsafe path dưới `/api/topics` bị chặn.

## Seed

- [x] **LRN-010-T017 — Seed script.** `apps/learning-service/src/database/seed-taxonomy.ts` nạp 10
      Topic đã duyệt; idempotent theo `name`; dùng `LEARNING_DATABASE_URL`; thông báo lỗi an toàn
      (FR-008, AC-006).
- [x] **LRN-010-T018 — Script npm.** Thêm `seed:learning:taxonomy` vào `package.json` cùng dạng với
      `seed:identity:rbac` (FR-008).

## Kiểm chứng

- [x] **LRN-010-T019 — Tĩnh.** `pnpm lint`, `pnpm typecheck` sạch.
- [x] **LRN-010-T020 — Test.** `pnpm test`: 170 suite pass, 24 suite skip (integration cần DB); 1440
      test pass, gồm unit test mới, `problems.module.spec.ts` và e2e `topics.api.e2e.spec.ts`.
- [x] **LRN-010-T021 — Build.** `pnpm build` thành công cho cả 6 service (Definition of Done).
- [x] **LRN-010-T022 — Hành vi HTTP.** E2E xác nhận `401` khi thiếu principal, `400` với
      `?unsupported=1`, `200` với danh mục, `200` với `items: []`, `404` với `POST` (AC-001, AC-004,
      AC-005).
- [ ] **LRN-010-T023 — Chạy seed thật.** Chạy `pnpm seed:learning:taxonomy` hai lần trên cơ sở dữ
      liệu Learning của người dùng và xác nhận số dòng `topics` không tăng ở lần thứ hai (AC-006). Chưa
      làm: cần `.env` thật và ghi dữ liệu, để người dùng thực hiện.
- [x] **LRN-010-T024 — Chỉ mục.** `codegraph sync .` sau khi đổi source.
- [x] **LRN-010-T025 — Worked note.**
      `.docs/worked/learning/problems/2026-11-15-taxonomy-catalog.md` đã ghi, kèm phần còn lại.
