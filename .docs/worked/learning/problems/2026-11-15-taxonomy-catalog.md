# 2026-11-15 — LRN-010: Danh mục chủ đề (`GET /api/topics`) và seed 10 Topic

- Author: opencode
- Scope: `learning-service/modules/problems` — thêm endpoint chỉ đọc `GET /api/topics`, port/use
  case/adapter, DTO, controller, seed script; `api-gateway` — thêm route và prefix; `package.json` —
  thêm `seed:learning:taxonomy`. Không đổi hành vi route hiện có.

## Spec and plan

- Spec: [LRN-010 Danh mục chủ đề](../../../specs/02-learning/taxonomy-catalog/spec.md) — `1.0`,
  Approved `2026-11-15`.
- Plan: [plan.md](../../../specs/02-learning/taxonomy-catalog/plan.md) — Approved cùng ngày.
- Tasks: [tasks.md](../../../specs/02-learning/taxonomy-catalog/tasks.md).
- Architecture: [Learning Service](../../../architecture/learning-service.md),
  [Dependency rules](../../../architecture/dependency-rules.md),
  [ADR 0002](../../../adr/0002-revised-service-internal-architectures.md).

## Questions clarified

| Question                           | Conclusion                                                                                                                   | Source                                                 |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Nguồn dữ liệu ban đầu cho `topics` | Seed script `seed:learning:taxonomy`, không dùng migration.                                                                  | Người dùng, 2026-11-15                                 |
| Danh mục ban đầu gồm những gì      | 10 Topic: Mảng, Sắp xếp, Chuỗi, OOP, Đồ thị, Cấu trúc cây, Quy hoạch động, Đệ quy, Tìm kiếm nhị phân, Ngăn xếp/Hàng đợi.     | Người dùng, 2026-11-15                                 |
| Có làm `GET /api/tags` không       | Không. v1 chỉ `GET /api/topics`; Tag ngoài phạm vi.                                                                          | Người dùng, 2026-11-15                                 |
| Ai được đọc danh mục               | Mọi người dùng đã xác thực; không cần mã quyền mới.                                                                          | Người dùng, 2026-11-15                                 |
| Token in-port đặt ở đâu            | Cùng file port (`list-topics.port.in.ts`), không thêm vào `problem.tokens.ts` vì file đó chỉ chứa token out-port/repository. | Convention hiện có (`list-public-problems.port.in.ts`) |
| Có tạo module mới không            | Không. Module `problems` đã sở hữu entity `Topic`/`Tag` và out port `TopicTagReader`.                                        | Code hiện có                                           |
| Có migration mới không             | Không. Bảng `topics` đã có từ `1700000003000-InitialLearningSchema.ts`.                                                      | Migration hiện có                                      |

## What was done

- Thêm `listTopics()` vào out port `TopicTagReader` và trả `TopicCatalogEntry { id, name }`.
- Cài `TopicTagTypeOrmReader.listTopics()` bằng
  `SELECT "id", "name" FROM "topics" ORDER BY "name" ASC`; không phân trang, không lọc.
- Thêm in port `list-topics.port.in.ts` (`IListTopicsPortIn` + `LIST_TOPICS_PORT_IN`) và
  `ListTopicsUseCase` chỉ đọc.
- Thêm `TopicListResponseDto { items: TopicResponseDto[] }` (tái dùng DTO `{ id, name }` đã có) và
  `ListTopicsQueryDto` rỗng để `ValidationPipe` toàn cục từ chối mọi tham số truy vấn.
- Thêm `PublicTopicsController` tại `@Controller('api/topics')` với
  `@UseFilters(ProblemExceptionFilter)` + `@UseGuards(TrustedPrincipalGuard)` + `@ApiBearerAuth()`
  và Swagger cho `200`/`400`/`401`.
- Đăng ký controller, provider use case và binding `LIST_TOPICS_PORT_IN -> ListTopicsUseCase` trong
  `ProblemsModule`; bổ sung `problems.module.spec.ts`.
- Thêm route `['GET', /^\/api\/topics\/?$/]` vào `learningRoutes` và `'/api/topics'` vào
  `learningPrefixes`. Prefix là bắt buộc vì `/api/topics` phải đi qua `rejectUnsafePath` như các
  route Learning khác.
- Thêm `apps/learning-service/src/database/seed-taxonomy.ts` và script
  `seed:learning:taxonomy`: transaction + `pg_advisory_xact_lock`, `INSERT ... ON CONFLICT ("name")
DO NOTHING`, thông báo lỗi an toàn (không in chuỗi kết nối).
- Mở rộng e2e harness: thêm `PublicTopicsController` + `ListTopicsUseCase` vào test app, cho
  `InMemoryTopicTagReader` một catalog thay đổi được (`setCatalog`), và viết
  `topics.api.e2e.spec.ts`.
- Cập nhật các mock `TopicTagReader` trong unit test cũ (`problem-result.mapper`,
  `create-problem`, `update-problem`) và `InMemoryTopicTagReader` để không vỡ type sau khi port có
  thêm method.

## Why these choices

- **Đặt trong module `problems`:** endpoint trả metadata của Problem và dùng chung bảng `topics` với
  LRN-001/LRN-009. Tạo module mới sẽ nhân đôi quyền sở hữu bảng mà không có lợi ích.
- **`@UseFilters(ProblemExceptionFilter)` là bắt buộc:** `readTrustedPrincipal` ném `UnauthorizedError`
  (một `ApplicationError`, không phải `HttpException`). Không có filter này,
  `AllExceptionsFilter` coi là lỗi lạ và trả `500`, trái LRN-010-AC-001.
- **DTO truy vấn rỗng:** `ValidationPipe` toàn cục bật `whitelist` + `forbidNonWhitelisted`. Nếu
  handler không khai `@Query()` với một class, tham số lạ bị bỏ qua im lặng, trái
  LRN-010-FR-005. Tham số không dùng đặt tên `_query` theo `argsIgnorePattern` của ESLint.
- **Không thêm quyền RBAC:** đặc tả không yêu cầu; Gateway đã bắt buộc token cho mọi `/api/*` ngoài
  `AUTH_PUBLIC_ROUTES`, và `/api/topics` không nằm trong danh sách public.
- **Seed bằng script, không migration:** đặc tả cấm nạp dữ liệu bằng migration; seed idempotent cho
  phép chạy lại trên mọi môi trường mà không tạo bản ghi trùng.
- **`ON CONFLICT ("name") DO NOTHING`:** không đổi tên và không xoá Topic đã tồn tại, đúng quy tắc
  nghiệp vụ của đặc tả.

## How the feature works

1. Browser gọi `/api/topics` qua BFF Next; BFF chuyển tiếp tới API Gateway.
2. Gateway xác minh access token, bỏ header định danh do client gửi, đặt `x-auth-user-id` /
   `x-auth-roles` / `x-auth-permissions`, rồi khớp `learningRoutes` và chuyển tiếp tới Learning.
3. `PublicTopicsController` chạy `TrustedPrincipalGuard` (thiếu/sai principal → `UnauthorizedError`
   → `401` qua filter), `ListTopicsQueryDto` (tham số lạ → `400` qua `ValidationPipe`), rồi gọi
   `IListTopicsPortIn.execute()`.
4. `ListTopicsUseCase` gọi `TopicTagReader.listTopics()`; adapter chạy một câu `SELECT` trên bảng
   `topics` và trả nguyên thứ tự `ORDER BY "name" ASC`.
5. Controller bọc kết quả thành `{ items: [...] }`; không thêm trường nào khác.

## Configuration

- Không thêm biến môi trường. Script đọc `LEARNING_DATABASE_URL` giống
  `apps/learning-service/src/database/data-source.ts`.
- Lệnh vận hành mới: `pnpm seed:learning:taxonomy` (chạy một lần cho mỗi cơ sở dữ liệu Learning).
- Không đổi `.env` và không đọc `.env` thật trong quá trình làm.

## Verification

- `pnpm typecheck` — pass.
- `pnpm lint` — pass, không warning.
- `pnpm test` — 170 suite pass, 24 suite skip; 1440 test pass, 281 skip. Các suite skip là
  integration test cần cơ sở dữ liệu thật.
- E2E mới `topics.api.e2e.spec.ts` — 5 test pass: `401` khi thiếu principal, `200` + danh mục,
  `200` + `items: []`, `400` với `?unsupported=1`, `404` với `POST`.
- `pnpm build` — cả 6 service build thành công.
- `codegraph sync .` — 19 file thay đổi được cập nhật vào index.
- Chưa chạy `pnpm seed:learning:taxonomy` trên cơ sở dữ liệu thật: cần `.env` và ghi dữ liệu, nên để
  người dùng chạy.

## Remaining

- Not done: chưa chạy seed thật trên môi trường của người dùng; vì vậy danh mục vẫn rỗng cho tới khi
  chạy `pnpm seed:learning:taxonomy`.
- Not done: chưa nối frontend. Bộ lọc Topic và trang Problems là việc của repo `bkpractice-frontend`
  với spec riêng (`problems-integration`).
- Not done: chưa commit/push (không được yêu cầu).
- Note: `.env.example` đang có thay đổi từ trước, không phải thay đổi của công việc này và không bị
  sửa trong quá trình làm.
- Note: `GET /api/tags` và mọi thao tác ghi Topic vẫn ngoài phạm vi; muốn quản lý Topic lúc chạy cần
  một đặc tả khác.
