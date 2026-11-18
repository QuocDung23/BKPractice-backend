# LRN-010 Kế hoạch triển khai Danh mục chủ đề

## Trạng thái

Approved

Kế hoạch này bám phiên bản `1.0` (Approved `2026-11-15`) của [đặc tả LRN-010](./spec.md). Nó không
mở rộng đặc tả: không thêm endpoint, không thêm trường phản hồi, không đổi hành vi của
`/api/problems`, `/api/courses`, `/api/progress` hay `/api/recommendations`.

## Đặc tả liên quan

- [LRN-010 Danh mục chủ đề](./spec.md) — Approved, phiên bản `1.0`, ngày duyệt `2026-11-15`.
- [LRN-001 Quản lý Problem](../problems/spec.md) — Topic/Tag là liên kết metadata của Problem.
- [LRN-009 Quiz và ngân hàng câu hỏi](../quizzes/spec.md) — dùng chung bảng `topics`/`tags`.

Đặc tả là nguồn chân lý cho hình dạng phản hồi, quy tắc phân quyền, thứ tự, seed và các trường hợp
lỗi. Kế hoạch chỉ mô tả cách đặt code và cách kiểm chứng.

## Kiến trúc áp dụng

- [Kiến trúc Learning Service](../../../architecture/learning-service.md): DDD + Hexagonal, luồng
  `presentation -> application -> domain`, adapter hạ tầng cài đặt out port.
- [Quy tắc phụ thuộc](../../../architecture/dependency-rules.md): presentation không gọi thẳng
  repository; application chỉ phụ thuộc port.
- [ADR 0002](../../../adr/0002-revised-service-internal-architectures.md): kiến trúc nội bộ từng
  service; Learning giữ mô hình hiện hành.

Tính năng thuộc module có sẵn `apps/learning-service/src/modules/problems`, không tạo module mới:
module này đã sở hữu entity `Topic`, `Tag` và out port `TopicTagReader`.

## Phân loại thay đổi

| Mã   | Loại      | Đường dẫn                                                                                                                                                  | Nội dung                                                                                                                                            |
| ---- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| C-01 | CREATE    | `modules/problems/application/ports/in/list-topics.port.in.ts`                                                                                             | `IListTopicsPortIn` + token `LIST_TOPICS_PORT_IN` (token in-port đặt trong chính file port, theo convention của `list-public-problems.port.in.ts`). |
| C-02 | CREATE    | `modules/problems/application/use-cases/list-topics.use-case.ts`                                                                                           | Use case chỉ đọc, gọi `TopicTagReader.listTopics()`.                                                                                                |
| C-03 | CREATE    | `modules/problems/presentation/http/dto/topic-list-response.dto.ts`                                                                                        | `TopicListResponseDto { items: TopicResponseDto[] }`, tái dùng `TopicResponseDto` sẵn có.                                                           |
| C-04 | CREATE    | `modules/problems/presentation/http/dto/list-topics-query.dto.ts`                                                                                          | DTO rỗng: mọi tham số truy vấn bị global `ValidationPipe` từ chối (`400`).                                                                          |
| C-05 | CREATE    | `modules/problems/presentation/http/public-topics.controller.ts`                                                                                           | `GET /api/topics`, guard principal tin cậy, filter lỗi module, Swagger.                                                                             |
| C-06 | CREATE    | `modules/problems/presentation/http/public-topics.controller.spec.ts`                                                                                      | Unit test controller.                                                                                                                               |
| C-07 | CREATE    | `modules/problems/application/use-cases/list-topics.use-case.spec.ts`                                                                                      | Unit test use case.                                                                                                                                 |
| C-08 | CREATE    | `apps/learning-service/src/database/seed-taxonomy.ts`                                                                                                      | Seed 10 Topic, idempotent theo `name`.                                                                                                              |
| C-09 | CREATE    | `.docs/worked/learning/problems/2026-11-15-taxonomy-catalog.md`                                                                                            | Ghi chú công việc.                                                                                                                                  |
| M-01 | MODIFY    | `modules/problems/application/ports/out/topic-tag-reader.port.out.ts`                                                                                      | Thêm `listTopics()`.                                                                                                                                |
| M-02 | MODIFY    | `modules/problems/infrastructure/persistence/topic-tag.typeorm-reader.ts`                                                                                  | Cài `listTopics()` bằng `SELECT "id", "name" FROM "topics" ORDER BY "name" ASC`.                                                                    |
| M-03 | MODIFY    | `modules/problems/infrastructure/persistence/topic-tag.typeorm-reader.spec.ts`                                                                             | Test `listTopics()` gồm SQL và thứ tự.                                                                                                              |
| M-04 | MODIFY    | `modules/problems/problems.module.ts`                                                                                                                      | Thêm controller, use case provider, binding `LIST_TOPICS_PORT_IN -> ListTopicsUseCase`.                                                             |
| M-05 | MODIFY    | `modules/problems/problems.module.spec.ts`                                                                                                                 | Thêm vào `INBOUND_BINDINGS` và test wiring controller mới.                                                                                          |
| M-06 | MODIFY    | `apps/api-gateway/src/application/proxy/gateway-proxy.constants.ts`                                                                                        | Thêm route `GET /api/topics` vào `learningRoutes` và prefix vào `learningPrefixes`.                                                                 |
| M-07 | MODIFY    | `apps/api-gateway/src/application/proxy/gateway-proxy.service.spec.ts`                                                                                     | Thêm route hợp lệ và route bị chặn.                                                                                                                 |
| M-08 | MODIFY    | `package.json`                                                                                                                                             | Thêm script `seed:learning:taxonomy`.                                                                                                               |
| R-01 | REUSE     | `modules/problems/application/ports/out/topic-tag-reader.port.out.ts`                                                                                      | Đọc taxonomy qua out port có sẵn; không tạo repository mới.                                                                                         |
| R-02 | REUSE     | `modules/problems/presentation/http/guards/trusted-principal.guard.ts`, `filters/problem-exception.filter.ts`, `decorators/trusted-principal.decorator.ts` | Xác thực principal và ánh xạ lỗi theo đúng pattern của `public-problems.controller.ts`.                                                             |
| R-03 | REUSE     | `modules/problems/presentation/http/dto/problem-response.dto.ts` (`TopicResponseDto`)                                                                      | Không định nghĩa lại DTO `{ id, name }`.                                                                                                            |
| R-04 | REUSE     | `apps/identity-service/src/database/seed-rbac.ts`                                                                                                          | Khuôn seed: `DataSource`, `require.main === module`, thông báo lỗi an toàn.                                                                         |
| X-01 | NO CHANGE | `apps/api-gateway/src/application/auth/auth-constants.ts`                                                                                                  | `/api/topics` không nằm trong `AUTH_PUBLIC_ROUTES`, nên Gateway đã bắt buộc token.                                                                  |
| X-02 | NO CHANGE | Migration                                                                                                                                                  | Bảng `topics` đã tồn tại; đặc tả cấm nạp dữ liệu bằng migration.                                                                                    |

## Luồng request

```text
Browser
  -> Next BFF /api/[...path]
  -> API Gateway  (kiểm token, bỏ header client tự đặt, đặt x-auth-user-id/roles/permissions)
  -> learningRoutes khớp ("GET", /^\/api\/topics\/?$/)
  -> Learning  PublicTopicsController
        TrustedPrincipalGuard -> readTrustedPrincipal (thiếu/sai header: UnauthorizedError)
        ListTopicsQueryDto    -> global ValidationPipe (tham số lạ: 400)
        IListTopicsPortIn.execute()
          -> TopicTagReader.listTopics()
             -> TypeOrmTransactionContext.getManager().query(...)
        -> TopicListResponseDto
  <- { items: [ { id, name } ] }
```

## Quyết định triển khai

1. **Controller đặt tên `public-topics.controller.ts`** để khớp `public-problems.controller.ts` và
   `public-courses.controller.ts`; route `@Controller('api/topics')`.
2. **Bắt buộc `@UseFilters(ProblemExceptionFilter)`** cùng `@UseGuards(TrustedPrincipalGuard)`.
   `readTrustedPrincipal` ném `UnauthorizedError` (một `ApplicationError`, không phải `HttpException`);
   nếu thiếu filter này, `AllExceptionsFilter` sẽ trả `500` thay vì `401` như đặc tả yêu cầu.
3. **DTO truy vấn rỗng là bắt buộc.** Nếu handler không khai `@Query()` với một class, `ValidationPipe`
   không chạy và tham số lạ bị bỏ qua im lặng, trái LRN-010-FR-005. Tham số không dùng đặt tên `_query`
   để không vi phạm quy tắc biến không dùng.
4. **Token in-port nằm trong file port**, không thêm vào `problem.tokens.ts`: file đó chỉ chứa token
   out-port/repository.
5. **Không phân trang, không lọc, không tìm kiếm.** Adapter trả toàn bộ bảng; đặc tả không cho phép
   tham số để thay đổi tập kết quả.
6. **Seed dùng raw SQL** `INSERT INTO "topics" ("name") VALUES ($1) ON CONFLICT ("name") DO NOTHING`,
   chạy trong một transaction, đọc `LEARNING_DATABASE_URL` như `apps/learning-service/src/database/data-source.ts`.
   Không import `@learning/*` để script chạy được chỉ với `ts-node`.
7. **Không thêm quyền RBAC.** Đặc tả không yêu cầu mã quyền; thêm quyền mới sẽ vượt phạm vi.
8. **Giữ style import trực tiếp** của module `problems` (module này chỉ có barrel ở
   `application/ports/out` và `domain/value-objects`); không refactor barrel toàn module.

## Kiểm thử

| Lớp        | Kiểm chứng                                                                                                       |
| ---------- | ---------------------------------------------------------------------------------------------------------------- |
| Use case   | Gọi đúng out port một lần và trả nguyên danh sách; danh sách rỗng trả `[]`.                                      |
| Adapter    | SQL đúng chuỗi, đúng `ORDER BY "name" ASC`, trả nguyên row.                                                      |
| Controller | Trả `{ items }`; gọi đúng port; không thêm trường.                                                               |
| Module     | Binding `LIST_TOPICS_PORT_IN` và wiring controller mới (bổ sung `problems.module.spec.ts`).                      |
| Gateway    | `GET /api/topics` được forward tới Learning; `GET /api/topicsX` bị chặn; unsafe path dưới `/api/topics` bị chặn. |
| Thủ công   | `401` khi không có principal; `400` khi có `?foo=1`; `200` + danh mục sau khi seed.                              |

Test e2e gọi DB thật không bắt buộc: đặc tả không yêu cầu, và repo chưa có harness e2e Learning chạy
trong CI cho module này. Hành vi `401`/`400` được kiểm bằng unit test ở guard/DTO và bằng lệnh thủ
công ghi trong worked note.

## Vận hành

- Chạy `pnpm seed:learning:taxonomy` một lần trên mỗi cơ sở dữ liệu Learning. Script idempotent nên
  chạy lại an toàn.
- Chạy seed **trước** khi frontend dùng bộ lọc Topic; nếu chưa seed, endpoint trả `items: []` (đúng
  đặc tả) và bộ lọc rỗng.
- Không có migration mới, không có biến môi trường mới.

## Rủi ro

| Rủi ro                                               | Giảm thiểu                                                              |
| ---------------------------------------------------- | ----------------------------------------------------------------------- |
| Quên `ProblemExceptionFilter` làm `401` thành `500`  | Ghi thành quyết định số 2 và kiểm bằng test controller/guard.           |
| Quên DTO truy vấn rỗng làm tham số lạ bị bỏ qua      | Ghi thành quyết định số 3; test controller với `?foo=1` ở mức pipe.     |
| Quên `learningPrefixes` làm mất kiểm tra unsafe path | M-06 thêm cả hai danh sách; M-07 kiểm unsafe path.                      |
| Seed chạy trên DB đã có Topic trùng tên              | `ON CONFLICT ("name") DO NOTHING`; không đổi tên, không xoá.            |
| Bảng `topics` chưa có ai ghi dữ liệu                 | Seed là nguồn ghi duy nhất trong phạm vi này; ghi rõ trong worked note. |

## Ngoài phạm vi của kế hoạch

Mọi mục trong "Ngoài phạm vi" của đặc tả, đặc biệt: `GET /api/tags`, CRUD Topic, giao diện quản trị
Topic, đếm Problem theo Topic, thay đổi frontend.
