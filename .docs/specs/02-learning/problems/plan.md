# LRN-001 Kế hoạch triển khai Quản lý Problem

> Cập nhật 2026-11-07: [LRN-008](../self-study/spec.md) thay thế mọi quy định về LECTURER, sở hữu riêng của người tạo, Class, Enrollment, Assignment và tiến độ theo lớp trong tài liệu này. Các yêu cầu còn lại vẫn áp dụng.

## Trạng thái

Approved

Được chủ sở hữu sản phẩm phê duyệt ngày `2026-09-23`.

Kế hoạch này bám theo phiên bản `1.1` (Approved) của đặc tả LRN-001 và là tài liệu thiết kế cho giai
đoạn tasks/triển khai. Nó không triển khai Quản lý Problem và không thay đổi đặc tả. Sau khi được
phê duyệt, `tasks.md` được dẫn xuất từ kế hoạch này.

Bản sửa đổi `2026-10-24`: `ProblemRepository` là domain repository port tại
`domain/repositories/`; các out port còn lại ở `application/ports/out/`; response mapper ở
`presentation/http/mappers/`. Thay đổi này không đổi hành vi nghiệp vụ hay `spec.md`.

## Đặc tả liên quan

- [LRN-001 Quản lý Problem](./spec.md)
- Trạng thái: `Approved`
- Phiên bản: `1.1`
- Ngày phê duyệt: `2026-09-06`

Đặc tả là nguồn chân lý cho aggregate Problem, vòng đời của nó (`DRAFT`/`PUBLISHED`/`ON_HOLD` cộng
với dấu xoá mềm/khôi phục), ba loại problem đã phê duyệt (`STANDARD`/`FUNCTION`/`OOP`), các từ vựng
loại/độ khó/ngôn ngữ đã phê duyệt, chính sách phân quyền và sở hữu, các yêu cầu bảo mật, và các loại
trừ. Kế hoạch này không thêm Loại Problem, trạng thái vòng đời, giá trị hiển thị, mô hình tính điểm,
hệ thống versioning, hành vi Test Case, hành vi Judge, hay bất kỳ yêu cầu nào không có trong đặc tả
đã Approved.

## Service đích

Service: Learning Service

State và policy của Problem vẫn nằm trong `bkpractice_learning`. Các request Problem công khai đi tới
Learning qua API Gateway (nơi đã định tuyến `/api/problems` tới Learning Service và xác minh access
token của BKPractice). Submission và Judge chỉ tham chiếu Problem qua định danh ngoài ổn định và
không bao giờ được sở hữu hay trực tiếp lưu trữ aggregate Problem của Learning.

LRN-001 không tạo microservice Problem, không chuyển các khái niệm domain của Problem vào `libs/`,
và không đụng tới lớp lưu trữ của Identity, Submission hay Judge.

## Kiến trúc service bắt buộc

Kiến trúc: **DDD + Hexagonal Architecture** (theo
[ADR 0002](../../../adr/0002-revised-service-internal-architectures.md)).

Learning giữ Quản lý Problem bên trong module `problems` của một bounded context Learning duy nhất,
theo đúng chiều phụ thuộc đã được tài liệu hoá:

```text
presentation -> application -> domain
infrastructure ----implements----^ các port của application/domain
```

Theo cách diễn đạt hexagonal: các controller REST là **driving adapter** gọi vào use case, còn
repository TypeORM và transaction runner là các **driven adapter** được lõi gọi ra thông qua port.
Principal tin cậy được đọc ở tầng presentation bằng decorator/guard và truyền vào use case như một
tham số. Chiều phụ thuộc không đổi so với cách diễn đạt trước đó; điều được nhấn mạnh thêm là ranh
giới port/adapter và việc mô hình hoá bằng các khối DDD tactical.

- DDD chỉ dùng ở mức **tactical**: aggregate root `Problem`, các value object (slug, giới hạn thực
  thi, ví dụ hiển thị, contract theo ngôn ngữ), một domain service cho việc kiểm tra mức độ sẵn sàng
  xuất bản, và repository dưới dạng port. Một aggregate được biện minh bởi bất biến, không tạo cho
  mỗi bảng. DDD strategic (context map, anti-corruption layer, nhiều bounded context) nằm ngoài
  phạm vi — Learning là một bounded context duy nhất.
- Module được tổ chức theo hướng feature-first trong khu vực
  `apps/learning-service/src/modules/problems/` hiện có. Các thư mục tầng (`domain`, `application`,
  `infrastructure`, `presentation`) được đưa vào vì vòng đời Problem, kiểm tra xuất bản, kiểm tra
  theo loại, quyền sở hữu và phép chiếu công khai/nội bộ đều là hành vi thật; không thêm thư mục
  rỗng hay trừu tượng hoá chung chung nào.
- Test case, topic, tag, các ngôn ngữ được hỗ trợ cho problem và starter code vẫn thuộc sở hữu của
  Learning và thuộc khu vực Problems. Chúng không bị chuyển sang service khác.
- Việc `ProblemsController` nối thẳng tới TypeORM ở nền tảng hiện tại chính là trạng thái
  `PARTIALLY ALIGNED` đã được ghi nhận. LRN-001 căn chỉnh điều này một cách tiệm tiến bằng các use
  case thật và các port tập trung; nó không viết lại Courses/Assignments/Progress hay các module
  Learning khác.
- Không xáo trộn cấu trúc thư mục trên toàn repository và không đưa vào một base repository chung.

## Ảnh hưởng tới mã nguồn hiện có

### Nền tảng hiện tại (kết quả khảo sát)

- `apps/learning-service/src/modules/problems/entities/problem.entity.ts` định nghĩa các entity
  TypeORM `Problem`, `Topic`, `Tag`, `TestCase`, `StarterCode` và `ProblemLanguage`. Bảng `problems`
  đã có sẵn: `id` dạng UUID, `title` (≤200), `slug` duy nhất (≤220), `description` (text),
  `problem_type` (varchar), enum `difficulty` (`EASY`/`MEDIUM`/`HARD`), `input_specification` và
  `output_specification` cho phép null, `examples` (jsonb mặc định `[]`), `constraints` cho phép
  null, `time_limit_ms`/`memory_limit_mb`, enum `publish_status`
  (`DRAFT`/`PUBLISHED`/`ARCHIVED` — LRN-001 sẽ migrate thành `DRAFT`/`PUBLISHED`/`ON_HOLD`),
  `created_by` dạng UUID bên ngoài, và `created_at`/`updated_at`. Chưa có cột `deleted_at`.
- Migration `apps/learning-service/src/database/migrations/1700000003000-InitialLearningSchema.ts`
  tạo các bảng `problems`, `test_cases`, `starter_codes`, `problem_languages`, `problem_topics`,
  `problem_tags`, `topics`, `tags`, cùng các bảng Learning khác, chỉ với khoá ngoại nội bộ.
- `apps/learning-service/src/modules/problems/problems.controller.ts` hiện phơi bày
  `GET api/problems` (trả về entity thô cho trạng thái `PUBLISHED`) và route nội bộ được bảo vệ
  `GET internal/problems/:id/judge-package/:language`, được bảo vệ bởi
  `apps/learning-service/src/modules/problems/internal-service.guard.ts`. Route liệt kê là một sai
  lệch về bảo mật/danh sách cho phép (tuần tự hoá entity thô) và sẽ được thay bằng các phản hồi
  chiếu của LRN-001. Route judge-package nội bộ được giữ nguyên.
- `apps/learning-service/src/modules/learning.entities.ts` và
  `apps/learning-service/src/database/data-source.ts` đăng ký các model lưu trữ của Learning và dùng
  `synchronize: false`. Schema môi trường trong `libs/config/src/environment.ts` đã yêu cầu sẵn
  `LEARNING_DATABASE_URL`, `RABBITMQ_URL` và `INTERNAL_SERVICE_SECRET`.
- `libs/contracts/src/index.ts` đã export sẵn danh mục kỹ thuật dùng chung `SUPPORTED_LANGUAGES`
  (`c`, `cpp`, `java`, `python`), `PROBLEM_TYPES` (`STANDARD`, `FUNCTION`, `OOP`), và các transport
  contract của Judge/Submission trong `libs/contracts/src/judge.contracts.ts` và
  `libs/contracts/src/submission.contracts.ts`.
- API Gateway (`apps/api-gateway/src/auth/gateway-auth.middleware.ts`) xác minh Bearer access token,
  loại bỏ `x-auth-user-id`/`x-auth-roles` do client gửi, và đặt lại các header đó từ claim đã xác
  minh. `apps/api-gateway/src/proxy/gateway-proxy.service.ts` chuyển tiếp `/api/problems*` tới
  Learning. Các controller của Submission và Community đã đọc header tin cậy `x-auth-user-id` từ ngữ
  cảnh Gateway.
- `libs/common/src/bootstrap.ts` cung cấp `ValidationPipe` toàn cục (transform, whitelist,
  `forbidNonWhitelisted`) và Swagger. `libs/common/src/http/request-id.middleware.ts` cung cấp
  correlation ID. `libs/shared/src/output-normalizer.ts` là một helper kỹ thuật chung.
- Identity sở hữu nền tảng RBAC: `Role`/`Permission`/`user_roles`/`role_permissions` nằm trong
  `bkpractice_identity` (`apps/identity-service/src/modules/rbac/entities/*` và migration Identity
  ban đầu). Tập claim của access token Identity hiện mang `sub`, `roles` và `type`; nó chưa mang các
  mã quyền hiệu lực.

### Phân loại thay đổi

| Phân loại | Cách xử lý dự kiến                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REUSE     | Các bảng `problems`/`topics`/`tags`/`problem_topics`/`problem_tags`/`problem_languages`/`starter_codes`/`test_cases` hiện có và entity của chúng; danh mục kỹ thuật dùng chung `ProblemType`/`SupportedLanguage`; route judge-package nội bộ và `InternalServiceGuard`; datasource/registry entity của Learning; việc định tuyến `/api/problems` và làm sạch header của Gateway; bootstrap validation/Swagger/correlation dùng chung; nền tảng RBAC role/permission hiện có của Identity |
| MODIFY    | `apps/learning-service/src/modules/problems/entities/problem.entity.ts` (thêm cột `type_config` dạng JSONB và dấu `deleted_at`; giữ `hidden_harness` ở chế độ `select: false`); `apps/learning-service/src/modules/problems/problems.module.ts` (composition/wiring); `apps/learning-service/src/modules/problems/problems.controller.ts` (tái cấu trúc thành các controller chỉ lo transport, giữ nguyên route nội bộ)                                                                  |
| CREATE    | Các kiểu/bất biến/value object của domain Problem; aggregate Problem và máy trạng thái vòng đời; kiểm tra xuất bản và kiểm tra theo loại; các port và use case của tầng application; service phân quyền/sở hữu Problem; adapter lưu trữ TypeORM; guard/decorator principal tin cậy và adapter quyền; DTO/controller ở tầng presentation; migration TypeORM; các test unit/integration/API/bảo mật tập trung                                                                              |
| REMOVE    | Không có. Hành vi liệt kê entity thô của `GET api/problems` được thay thế, nhưng không xoá bỏ contract lưu trữ hay transport nào. Endpoint judge-package nội bộ vẫn giữ nguyên.                                                                                                                                                                                                                                                                                                          |

Các entity TypeORM nông hiện tại vẫn đóng vai trò model lưu trữ trong quá trình căn chỉnh tiệm tiến
này. Chúng không bị sao chép vào `libs/` và không bị thay thế bằng một cuộc viết lại Clean
Architecture trên toàn repository.

## Ranh giới module

Quản lý Problem được triển khai như module `problems` của Learning Service
(`apps/learning-service/src/modules/problems/`), nhất quán với
`.docs/architecture/learning-service.md`. Không tạo microservice Problem và không tạo module Learning
mới. Test case, topic, tag, ngôn ngữ được hỗ trợ và starter code vẫn nằm trong khu vực Problems;
việc quản trị danh mục Topic/Tag không thuộc phạm vi triển khai của LRN-001.

## Thay đổi ở tầng domain

### Từ vựng domain (độc lập với framework)

Tái sử dụng các giá trị đã Approved từ đặc tả và danh mục dùng chung hiện có:

| Khái niệm             | Biểu diễn điều gì                                                                                     | Loại          |
| --------------------- | ----------------------------------------------------------------------------------------------------- | ------------- |
| `ProblemId`           | Định danh ổn định dựa trên UUID (`LRN-001-FR-002`); không bao giờ là tiêu đề                          | Id của entity |
| `Slug`                | Giá trị tra cứu duy nhất dễ đọc; giảng viên cung cấp khi tạo; bất biến sau khi tạo                    | Value object  |
| `ProblemTitle`        | Metadata hiển thị ≤200 ký tự; không duy nhất toàn cục, không bao giờ là định danh                     | Value object  |
| `ProblemType`         | Đúng một trong `STANDARD`, `FUNCTION`, `OOP`; bất biến sau khi xuất bản                               | Enum/Value    |
| `Difficulty`          | Một trong `EASY`, `MEDIUM`, `HARD`; metadata khám phá, không phải kết quả Judge                       | Enum/Value    |
| `PublishStatus`       | Một trong `DRAFT`, `PUBLISHED`, `ON_HOLD`; chỉ thay đổi qua các bước chuyển chuyên biệt               | Enum/Value    |
| `DeletedMarker`       | Mốc thời gian `deletedAt` cho phép null; khi được đặt, Problem bị ẩn khỏi mọi truy vấn và có thể      | Value object  |
|                       | khôi phục về `PublishStatus` đã được bảo toàn                                                         |               |
| `ProblemStatement`    | Mô tả dạng Markdown hạn chế và các phần phù hợp với loại                                              | Value object  |
| `InputSpecification`  | Contract đầu vào chỉ dành cho STANDARD; bắt buộc trước khi xuất bản với STANDARD                      | Value object  |
| `OutputSpecification` | Contract đầu ra chỉ dành cho STANDARD; bắt buộc trước khi xuất bản với STANDARD                       | Value object  |
| `VisibleExample`      | `input`/`output`/`explanation` hiển thị cho người học; không bao giờ là Test Case ẩn                  | Value object  |
| `Constraints`         | Văn bản ràng buộc nghiệp vụ/bài toán; không bao giờ là lệnh biên dịch/Docker                          | Value object  |
| `ExecutionLimits`     | `timeLimitMs` và `memoryLimitMb` dương, nằm trong biên an toàn của nền tảng                           | Value object  |
| `TopicReference`      | Tham chiếu tới một Topic sẵn có do Learning sở hữu, theo ID ổn định                                   | Quan hệ/Ref   |
| `TagReference`        | Tham chiếu tới một Tag sẵn có do Learning sở hữu, theo ID ổn định                                     | Quan hệ/Ref   |
| `EnabledLanguage`     | Một giá trị ngôn ngữ được hỗ trợ đang bật cho Problem này (tập con của danh mục dùng chung)           | Value object  |
| `StarterCode`         | Mã nguồn hiển thị cho người học theo từng ngôn ngữ đang bật; loại trừ harness ẩn                      | Value object  |
| `FunctionContract`    | Contract khả gọi theo từng ngôn ngữ (tên, tham số, kiểu trả về) cho `FUNCTION`                        | Value object  |
| `OopContract`         | Contract class/interface theo từng ngôn ngữ (class, constructor, phương thức, mức truy cập) cho `OOP` | Value object  |
| `CreatedBy`           | ID người dùng Identity bên ngoài; không bao giờ là quan hệ CSDL xuyên service (`LRN-001-FR-022`)      | Value/Ref     |
| `ProblemStatus`       | Trạng thái vòng đời hiện tại, chỉ phơi bày trong biểu diễn quản lý (`LRN-001-FR-023`)                 | Read model    |

Không thành phần nào của aggregate Problem biểu diễn Submission, JudgeResult, Progress, vòng đời
Assignment, vòng đời Test Case, điểm số, hay trạng thái đã giải. Điểm tối đa ở mức Problem là Ngoài
phạm vi một cách tường minh. Một Problem đã xoá mềm giữ lại `PublishStatus` được gán cho nó cùng với
một `DeletedMarker`; việc khôi phục đơn giản là gỡ dấu xoá để trạng thái đã bảo toàn hoạt động trở lại.

### Aggregate root `Problem`

Aggregate `Problem` sở hữu:

```text
Problem
 ├── state/vòng đời: publishStatus + deletedMarker + quy tắc chuyển trạng thái
 │                   (DRAFT -> PUBLISHED -> ON_HOLD; PUBLISHED/ON_HOLD -> đã xoá mềm; khôi phục)
 ├── metadata: title, slug, difficulty, topics, tags, mốc thời gian
 ├── đề bài: description, phần input/output (STANDARD), ví dụ hiển thị, ràng buộc
 ├── cấu hình theo loại: type_config (contract FUNCTION/OOP theo từng ngôn ngữ)
 ├── ngôn ngữ/giới hạn: các ngôn ngữ đang bật, giới hạn thời gian/bộ nhớ dương
 └── starter code: mã nguồn hiển thị cho người học theo từng ngôn ngữ
```

Aggregate KHÔNG bao gồm:

- vòng đời `TestCase` (thuộc LRN-002 tương lai; bảng `test_cases` hiện có được giữ nguyên),
- state của Submission/JudgeResult/Progress (do Submission/Progress Service sở hữu),
- vòng đời Assignment (thuộc tính năng Assignment của Learning trong tương lai; chỉ tham chiếu
  `problemId` ổn định).

Lớp lưu trữ của aggregate chỉ được cập nhật thông qua các use case của tầng application. Việc gán
hàng loạt trạng thái vòng đời, người tạo, mốc thời gian, dữ liệu ẩn hay các trường judge nội bộ không
bao giờ được chấp nhận.

### Máy trạng thái vòng đời (`LRN-001-FR-011`, `LRN-001-FR-013`, `FR-031`–`FR-034`, Quy tắc nghiệp vụ)

Chỉ các bước chuyển đã phê duyệt:

```text
tạo -> DRAFT
DRAFT -> PUBLISHED        (hành động xuất bản tường minh; nguyên tử; thất bại mà không đổi state khi kiểm tra không qua)
PUBLISHED -> ON_HOLD      (tạm giữ tường minh; vẫn bị loại khỏi khám phá của người học)
ON_HOLD -> PUBLISHED      (xuất bản lại tường minh; kiểm tra lại mức độ sẵn sàng dựa trên state đã lưu; nguyên tử)
PUBLISHED -> đã xoá mềm   (xoá tường minh; đặt dấu xoá, publishStatus vẫn là PUBLISHED)
ON_HOLD -> đã xoá mềm     (xoá tường minh; đặt dấu xoá, publishStatus vẫn là ON_HOLD)
đã xoá mềm -> (PUBLISHED | ON_HOLD)  (khôi phục tường minh; gỡ dấu xoá, phục hồi publishStatus trước đó)
```

- Việc tạo luôn sinh ra `DRAFT` (`LRN-001-FR-004`, `LRN-001-AC-001`); lưu bản nháp không bao giờ
  ngầm xuất bản nó.
- Xoá mềm giữ lại bản ghi và `publishStatus` đã lưu (quyết định đã phê duyệt 19-20); đây là cơ chế
  gỡ bỏ duy nhất và không bao giờ phá huỷ dữ liệu hay lịch sử Submission (`LRN-001-FR-033`,
  `LRN-001-AC-028`). Khả năng hiển thị với người học đòi hỏi `publishStatus = PUBLISHED` và không có
  dấu xoá.
- Khôi phục gỡ dấu xoá và kích hoạt lại trạng thái đã bảo toàn (`PUBLISHED` hoặc `ON_HOLD`) mà không
  kiểm tra lại nội dung, vì nội dung và metadata không thể chỉnh sửa khi đang bị xoá
  (`LRN-001-FR-034`, `LRN-001-AC-029`).
- Các bước chuyển bị cấm (`InvalidProblemState`; là lỗi nghiệp vụ; state không đổi `LRN-001-FR-030`,
  `LRN-001-AC-025`): `ON_HOLD/DELETED -> *` ngoài các cạnh được phép tường minh, `DRAFT -> ON_HOLD`,
  `DRAFT -> xoá mềm`, xuất bản lại một Problem không phải `ON_HOLD`, tạm giữ một Problem không phải
  `PUBLISHED`, xoá một `DRAFT`, và khôi phục một Problem chưa bị xoá.
- Quy tắc chuyển trạng thái nằm trong aggregate của domain, không nằm trong controller. Mỗi bước
  chuyển ánh xạ tới một yêu cầu: publish/republish -> `FR-011`/`FR-012`/`FR-032`; hold -> `FR-031`;
  delete -> `FR-033`; restore -> `FR-034`.

### Mô hình theo từng loại (`LRN-001-FR-003`, `LRN-001-FR-014`, quyết định đã phê duyệt 10-12)

Một aggregate `Problem` duy nhất với trường phân biệt `problem_type`. Không có cây kế thừa và không
có service riêng cho từng loại.

- `STANDARD`: đề bài + `inputSpecification` + `outputSpecification` + ví dụ hiển thị + ràng buộc khi
  có liên quan + giới hạn thực thi + ít nhất một ngôn ngữ đang bật. Không lưu cấu hình contract theo
  loại.
- `FUNCTION`: đề bài cộng với contract khả gọi theo từng ngôn ngữ (tên hàm `functionName`, tham số
  kèm tên/kiểu, kiểu trả về), được kiểm tra cho mọi ngôn ngữ đang bật khi xuất bản. Starter code là
  bắt buộc cho mọi ngôn ngữ đang bật trước khi xuất bản.
- `OOP`: đề bài cộng với contract cấu trúc theo từng ngôn ngữ (tên class/interface bắt buộc,
  contract constructor tuỳ chọn, các phương thức kèm tham số/giá trị trả về, các quy tắc về mức truy
  cập có liên quan), được kiểm tra cho mọi ngôn ngữ đang bật khi xuất bản. Starter code là bắt buộc
  cho mọi ngôn ngữ đang bật trước khi xuất bản.

Quyết định về contract theo từng ngôn ngữ (quyết định đã phê duyệt 12) có nghĩa là `type_config`
chuẩn tắc dạng JSONB chứa một map `languageContract`/`ooContract` khoá theo các giá trị
`SupportedLanguage` đã phê duyệt; nó không phải một trừu tượng hoá trung lập với ngôn ngữ. Các giá
trị contract theo từng ngôn ngữ được kiểm tra tại ranh giới application, đối chiếu với tập ngôn ngữ
đang bật.

### Dữ liệu dùng chung và dữ liệu theo loại

- Các cột `Problem` dùng chung bao gồm tiêu đề, đề bài/mô tả, trạng thái, độ khó, giới hạn, slug,
  người tạo, mốc thời gian, ví dụ, phần input/output cho STANDARD, cùng các bảng con về ngôn ngữ và
  starter code.
- Cấu trúc theo loại cho `FUNCTION`/`OOP` nằm trong một cột JSONB `type_config` cho phép null, được
  phân biệt bởi `problem_type` (không bao giờ null với `FUNCTION`/`OOP` khi xuất bản; luôn null với
  `STANDARD`). Cách này giữ cho bảng chung không bị một loạt cột nullable theo từng loại mất kiểm
  soát, đồng thời tránh chuẩn hoá quá mức thành nhiều bảng cho một tập nhỏ các trường contract đã
  được phê duyệt.

### Giới hạn thực thi (`LRN-001-FR-020`, `LRN-001-AC-017`)

`timeLimitMs` (số nguyên, mili giây) và `memoryLimitMb` (số nguyên, megabyte) là các value object do
Learning sở hữu. Cả hai phải dương và nằm trong các trần an toàn đã phê duyệt của nền tảng (các hằng
số khi triển khai, ví dụ thời gian ≤ 10.000 ms, bộ nhớ ≤ 1024 MB), được kiểm tra ở cả mức DTO lẫn mức
domain. Judge sở hữu việc thực thi và MAY áp dụng trần nền tảng chặt hơn; Learning không bao giờ làm
suy yếu ràng buộc bảo mật của Judge.

### Chính sách slug (quyết định đã phê duyệt 13, `LRN-001-FR-021`)

- Giảng viên cung cấp slug khi tạo (bắt buộc, ≤220 ký tự, đúng mẫu, duy nhất).
- Slug bất biến sau khi tạo; việc cập nhật nó bị từ chối (`MassAssignmentResistantField` /
  `InvalidProblemState`).
- Slug không bao giờ được sinh từ tiêu đề, và tiêu đề không bao giờ trở thành định danh (tiêu đề
  tiếng Việt có dấu vẫn được hỗ trợ; đổi tiêu đề không bao giờ đổi ID ổn định).

### Liên kết Topic/Tag (`LRN-001-FR-017`, quyết định đã phê duyệt 14)

- Một Problem MAY tham chiếu không hoặc nhiều giá trị `Topic` và `Tag` sẵn có do Learning sở hữu,
  theo ID ổn định. Không cái nào bắt buộc khi xuất bản.
- LRN-001 không triển khai CRUD danh mục Topic/Tag; nó chỉ kiểm tra rằng từng ID được tham chiếu có
  tồn tại và từ chối các tham chiếu không tồn tại mà không âm thầm tạo ra chúng.
- Các bảng nối `problem_topics`/`problem_tags` hiện có được tái sử dụng. Việc một luồng tương lai gỡ
  bỏ Topic/Tag không được âm thầm để lộ hay làm hỏng một phản hồi Problem (các phép join khi khám phá
  có tính phòng thủ và coi tham chiếu thiếu là vắng mặt/rỗng).

### Định dạng nội dung (`LRN-001-FR-029`, `LRN-001-AC-024`, quyết định đã phê duyệt 9)

- Đề bài và các phần phù hợp với loại dùng Markdown hạn chế. Backend kiểm tra giới hạn độ dài và
  tính không rỗng, đồng thời từ chối payload HTML/script thô và nội dung không an toàn tương đương
  trước khi lưu.
- Việc làm sạch để render an toàn do frontend sở hữu; backend lưu Markdown thô đã được kiểm tra và
  không bao giờ thực thi nó. Backend Learning không cài đặt gói render/sanitize Markdown/HTML hay
  trình soạn thảo nào trong kế hoạch này.

## Tầng application / Use case

Chỉ triển khai các thao tác mà đặc tả đã Approved yêu cầu. Tên gọi ở đây mang tính khái niệm và phải
tuân theo quy ước của repository khi triển khai.

### `CreateProblem`

- **Tác nhân:** `LECTURER` đã xác thực, có quyền `problem:create`.
- **Đầu vào:** `title`, `slug`, đề bài/mô tả, đúng một `type` được phê duyệt, một `difficulty` được
  phê duyệt, và metadata công khai ban đầu tuỳ chọn (phần input/output, ví dụ, ràng buộc, tham chiếu
  topic/tag, ngôn ngữ đang bật, starter code, giới hạn). Không nhận `createdBy`, mốc thời gian,
  trạng thái, trường ẩn/judge, vai trò hay quyền.
- **Luồng:** phân quyền tác nhân; kiểm tra từ vựng; kiểm tra tính duy nhất của slug; suy ra
  `createdBy` từ principal tin cậy; dựng aggregate ở `DRAFT`; lưu một cách nguyên tử.
- **Đầu ra:** `problemId` ổn định, trạng thái `DRAFT` hiện tại, metadata quản lý an toàn, và thông
  tin kiểm tra/mức độ sẵn sàng.
- **Lỗi:** chưa xác thực `401`; bị từ chối `403`; slug trùng/không hợp lệ `409`/`400`; từ vựng không
  xác định `400`; không thay đổi state.

### `UpdateProblem`

- **Tác nhân:** `LECTURER` là chủ sở hữu, có quyền `problem:update`.
- **Đầu vào:** danh sách cho phép một phần gồm các trường thay đổi được (`title`, các phần đề bài,
  đặc tả `input`/`output` khi có liên quan, `difficulty`, `examples` hiển thị, `constraints`, tham
  chiếu Topic/Tag, tập ngôn ngữ đang bật, starter code theo từng ngôn ngữ, giới hạn dương, và cấu
  hình contract theo từng ngôn ngữ (`type_config`) cho `FUNCTION`/`OOP`), và `problemType` chỉ khi
  Problem còn ở `DRAFT`, theo ngữ nghĩa cập nhật tường minh.
- **Luồng:** phân quyền theo quyền sở hữu và trạng thái (`DRAFT` hoặc `PUBLISHED` chỉnh sửa được tại
  chỗ; Problem `ON_HOLD` và đã xoá mềm thì không); chỉ áp dụng các trường trong danh sách cho phép
  (xem mục DTO/kiểm tra dữ liệu); chạy kiểm tra theo loại; lưu. `problemType` chỉ đổi được khi
  Problem đang ở `DRAFT` (loại bất biến sau khi xuất bản, theo mục Toàn vẹn lịch sử của đặc tả); đổi
  loại khi không phải `DRAFT` là lỗi `InvalidProblemState`, và sau khi đổi loại thì `type_config`
  cùng phần đề bài theo loại phải khớp loại mới, nếu không là lỗi kiểm tra dữ liệu `400`. Không
  trường nào có thể thay đổi `id`, `slug`, `createdBy`, `createdAt`, `publishStatus`, `deletedAt`
  (dấu xoá), các trường ẩn/nội bộ, hay bỏ qua một bước chuyển trạng thái. Việc cập nhật một Problem `PUBLISHED` phải
  bảo toàn mức độ sẵn sàng xuất bản (ví dụ ít nhất một ngôn ngữ đang bật và contract bắt buộc theo
  loại), khớp với `LRN-001-FR-012`/`FR-018`; một thay đổi làm một Problem đã xuất bản trở nên không
  hợp lệ sẽ bị từ chối mà không thay đổi state.
- **Đầu ra:** biểu diễn quản lý an toàn đã được làm mới.
- **Lỗi:** `404` không tìm thấy; `403` không phải chủ sở hữu; `409` trạng thái không hợp lệ; `400`
  lỗi kiểm tra dữ liệu/cấu hình theo loại.

### `PublishProblem`

- **Tác nhân:** `LECTURER` là chủ sở hữu, có quyền `problem:publish`.
- **Đầu vào:** chỉ `problemId` ổn định và ngữ cảnh tác nhân tin cậy.
- **Luồng:** phân quyền theo quyền sở hữu; nạp state hiện tại; chạy toàn bộ kiểm tra mức độ sẵn sàng
  xuất bản dựa trên state đã lưu (không bao giờ dựa trên khẳng định của người gọi); chuyển
  `DRAFT -> PUBLISHED` một cách nguyên tử.
- **Đầu ra:** trạng thái `PUBLISHED` kết quả và biểu diễn Problem an toàn.
- **Lỗi:** kiểm tra xuất bản thất bại thì giữ state `DRAFT` và trả về tập điều kiện còn
  thiếu/không hợp lệ; xuất bản một Problem không phải `DRAFT` là lỗi nghiệp vụ về trạng thái không
  hợp lệ; không có thay đổi dở dang.

### `HoldProblem`

- **Tác nhân:** `LECTURER` là chủ sở hữu, có quyền `problem:hold`.
- **Luồng:** phân quyền theo quyền sở hữu; `PUBLISHED -> ON_HOLD`; bị loại khỏi khám phá của người
  học nhưng vẫn giữ định danh ổn định/lịch sử.
- **Lỗi:** tạm giữ một Problem không phải `PUBLISHED` hoặc bị từ chối là lỗi nghiệp vụ (`409`/`403`);
  không thay đổi state.
- **Ranh giới:** bản ghi không bị đụng tới; không gửi message nào tới Submission/Judge.

### `RepublishProblem`

- **Tác nhân:** `LECTURER` là chủ sở hữu, có quyền `problem:republish`.
- **Luồng:** phân quyền theo quyền sở hữu; kiểm tra lại mức độ sẵn sàng xuất bản dựa trên state đã
  lưu; `ON_HOLD -> PUBLISHED` một cách nguyên tử; khôi phục khả năng hiển thị với người học.
- **Lỗi:** không đủ mức độ sẵn sàng thì giữ Problem ở `ON_HOLD` và trả về tập điều kiện còn
  thiếu/không hợp lệ; xuất bản lại một Problem không phải `ON_HOLD` là lỗi nghiệp vụ về trạng thái
  không hợp lệ; không có thay đổi dở dang.

### `SoftDeleteProblem`

- **Tác nhân:** `LECTURER` là chủ sở hữu, có quyền `problem:delete`.
- **Luồng:** phân quyền theo quyền sở hữu; yêu cầu trạng thái `PUBLISHED` hoặc `ON_HOLD`; đặt dấu
  xoá (`deletedAt`); giữ lại bản ghi, ID ổn định và `publishStatus` đã lưu.
- **Lỗi:** xoá một `DRAFT`, hoặc Problem không tồn tại/bị từ chối, là lỗi nghiệp vụ; không thay đổi
  state.
- **Ranh giới:** chỉ xoá mềm — không xoá cứng, không purge, không tương tác với Submission/Judge.

### `RestoreProblem`

- **Tác nhân:** `LECTURER` là chủ sở hữu, có quyền `problem:restore`.
- **Luồng:** phân quyền theo quyền sở hữu; yêu cầu dấu xoá đang được đặt; gỡ dấu xoá; Problem trở về
  trạng thái đã bảo toàn trước đó (`PUBLISHED` hoặc `ON_HOLD`) mà không kiểm tra lại nội dung.
- **Lỗi:** khôi phục một Problem chưa bị xoá, hoặc không tồn tại/bị từ chối, là lỗi nghiệp vụ; không
  thay đổi state.
- **Ranh giới:** không có chỉnh sửa nội dung nào diễn ra trong lúc khôi phục; lịch sử Submission
  không bị sửa đổi.

### `GetPublishedProblem`

- **Tác nhân:** người dùng đã xác thực (STUDENT trở lên) theo quyết định hiển thị danh mục đã phê
  duyệt.
- **Luồng:** tra cứu theo ID ổn định hoặc slug với điều kiện `PUBLISHED` và chưa bị xoá; Problem bản
  nháp, tạm giữ và đã xoá mềm không được để lộ sự tồn tại.
- **Đầu ra:** phép chiếu công khai (đề bài, ví dụ hiển thị, ràng buộc, giới hạn để hiển thị, các
  ngôn ngữ đang bật, starter code của ngôn ngữ đang bật, metadata đã phê duyệt). Không có trạng thái
  bản nháp, tạm giữ hay đã xoá mềm, và không có dấu xoá.
- **Lỗi:** `404` cho nội dung không hiển thị/không tồn tại, mà không tiết lộ state chưa công khai.

### `ListPublishedProblems`

- **Tác nhân:** người dùng đã xác thực (STUDENT trở lên).
- **Luồng:** chỉ nội dung đã xuất bản, chưa bị xoá, có phân trang, có lọc (`problemType`,
  `difficulty`, `topic`, `tag`), tìm theo tiêu đề (`ILIKE`, không phân biệt hoa thường), sắp xếp mặc
  định mới nhất trước.
- **Đầu ra:** các bản tóm tắt công khai (id, slug, tiêu đề, loại, độ khó, tóm tắt Topic/Tag, ngôn
  ngữ đang bật, mốc thời gian đã phê duyệt). Kết quả rỗng là thành công; số lượng bản nháp, tạm giữ
  và đã xoá mềm không bao giờ bị lộ.
- **Lỗi:** đầu vào phân trang/lọc sai định dạng -> lỗi phía client; không lộ dữ liệu ẩn.

### `GetManagedProblem`

- **Tác nhân:** `LECTURER` là chủ sở hữu với quyền `problem:read-managed` (chủ sở hữu đọc nội dung
  của chính mình) hoặc quyền tương ứng.
- **Luồng:** kiểm tra quyền sở hữu; mọi trạng thái đang hoạt động (bao gồm bản nháp và `ON_HOLD`);
  kèm thông tin về mức độ sẵn sàng xuất bản. Một Problem đã xoá mềm chỉ được trả về qua luồng
  xem/khôi phục nội dung đã xoá tường minh (`includeDeleted`), không bao giờ theo mặc định.
- **Đầu ra:** biểu diễn quản lý gồm `publishStatus`, dấu xoá khi có `includeDeleted`,
  `createdAt`/`updatedAt`, và các lỗi về mức độ sẵn sàng xuất bản; không kèm đáp án Test Case ẩn ở
  dạng thô.

### `ListManagedProblems`

- **Tác nhân:** `LECTURER` là chủ sở hữu.
- **Luồng:** không nhận `lecturerId` từ client; quyền sở hữu luôn được suy ra từ principal tin cậy.
  Hỗ trợ cờ query `includeDeleted` giới hạn trong phạm vi chủ sở hữu (mặc định `false`) để có thể
  liệt kê các Problem đã xoá mềm phục vụ luồng khôi phục; bản nháp cũng có thông tin mức độ sẵn sàng
  khi phù hợp.
- **Bộ lọc tùy chọn:** `publishStatus` lọc theo trạng thái và `search` tìm theo tiêu đề hoặc slug
  không phân biệt hoa thường. Áp dụng cả hai bộ lọc cùng quyền sở hữu trước khi đếm và phân trang
  để bộ chọn gắn bài vào chương truy vấn đúng các bài đã xuất bản mà người gọi có quyền quản lý.
- **Đầu ra:** các bản tóm tắt quản lý có phân trang, bao gồm bản nháp, `ON_HOLD`, và (khi được yêu
  cầu) các mục đã xoá mềm, kèm thông tin mức độ sẵn sàng và dấu xoá khi phù hợp.

### `PreviewProblem`

- **Tác nhân:** `LECTURER` là chủ sở hữu.
- **Luồng:** kiểm tra quyền sở hữu; chiếu ra biểu diễn hướng người học của bản nháp hiện tại mà
  không xuất bản, không thực thi mã, và không thay đổi state/mốc thời gian.
- **Đầu ra:** phần thân theo hình dạng công khai nhưng chưa khám phá được qua danh mục/chi tiết công
  khai.
- **Lỗi:** không tồn tại/bị từ chối `404`/`403`; không thay đổi state.

### Các port và ranh giới

Chỉ đưa vào các seam thật sự. `ProblemRepository` là **domain repository port** tại
`domain/repositories/`; các port còn lại là **application out port** tại `application/ports/out/`.
Tên file outbound port dùng hậu tố `.port.out.ts`; inbound port dùng `.port.in.ts` tại
`application/ports/in/`; mỗi use case có inbound port interface và controller inject qua token
`..._PORT_IN`; không dùng `.port.ts`. Command của use case đặt tại `application/command/`.
`PublishValidator` là domain service tại `domain/services/`; `ProblemAuthorizationService` là
application service tại `application/services/`.

| Port                          | Trách nhiệm                                                                                                                                                                                                                                    | Adapter                                            |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `ProblemRepository`           | Nạp/lưu aggregate; truy vấn nội dung đã xuất bản (chưa bị xoá); liệt kê có lọc/tìm kiếm/phân trang; tra cứu theo slug + id; đảm bảo tính duy nhất; truy vấn quản lý theo phạm vi chủ sở hữu, bao gồm cả nội dung đã xoá mềm (`includeDeleted`) | Adapter TypeORM trong `infrastructure/persistence` |
| `TopicTagReader`              | Kiểm tra sự tồn tại của các ID Topic/Tag khi tạo/cập nhật                                                                                                                                                                                      | Adapter TypeORM (các bảng do Learning sở hữu)      |
| `PublishValidator`            | Kiểm tra mức độ sẵn sàng ở tầng domain, dùng chung bởi `PublishProblem`, phần hiển thị mức độ sẵn sàng của `GetManagedProblem`/`ListManagedProblem`, và xem trước                                                                              | Domain service; không truy cập CSDL xuyên service  |
| `ProblemAuthorizationService` | Đánh giá quyền `problem:*` cần thiết + quyền sở hữu, dựa trên principal tin cậy                                                                                                                                                                | Application service; nhận `Principal` từ use case  |
| `TransactionRunner`           | Điều phối nạp aggregate + kiểm tra + lưu một cách nguyên tử                                                                                                                                                                                    | Adapter dùng `DataSource` của TypeORM              |

Principal tin cậy không phải out port: `@TrustedPrincipal()` (param decorator) và
`TrustedPrincipalGuard` đọc header Gateway ở tầng presentation; controller truyền `Principal` vào
inbound port. Route public dùng guard để giữ `401` khi thiếu principal, còn route managed dùng
decorator trực tiếp.

Không thêm base repository chung, bus CQRS, policy engine, event store, hay service Problem riêng.

## Lưu trữ

Toàn bộ lớp lưu trữ của Problem vẫn nằm trong `bkpractice_learning`.

- Tái sử dụng các cấu trúc `problems`, `topics`, `tags`, `problem_topics`, `problem_tags`,
  `problem_languages`, `starter_codes` và `test_cases` hiện có.
- `problem_type` được lưu kèm ràng buộc CHECK trên các giá trị đã phê duyệt (`STANDARD`, `FUNCTION`,
  `OOP`); `difficulty` và `publish_status` đã dùng enum của PostgreSQL. Enum `publish_status` được
  migrate thành `DRAFT`/`PUBLISHED`/`ON_HOLD` (các bản ghi `ARCHIVED`, nếu có, được chuyển thành
  `ON_HOLD`).
- Một cột `deleted_at` kiểu timestamptz cho phép null hiện thực dấu xoá mềm (`LRN-001-FR-033`). Xoá
  mềm giữ lại bản ghi và giữ nguyên `publish_status`; mọi truy vấn mặc định đều lọc
  `deleted_at IS NULL`, và khả năng hiển thị với người học còn đòi hỏi thêm
  `publish_status = 'PUBLISHED'`. Việc khôi phục gỡ dấu xoá một cách nguyên tử
  (`UPDATE "problems" SET deleted_at = NULL WHERE id = $1 AND deleted_at IS NOT NULL`), đưa Problem
  trở về trạng thái đã bảo toàn trước đó.
- `type_config` (cột JSONB mới cho phép null trên `problems`) chứa contract FUNCTION/OOP theo từng
  ngôn ngữ; tầng application kiểm tra cấu trúc phân biệt này trước khi lưu. Lý do: dữ liệu contract
  được lấy trọn vẹn cùng aggregate, không bao giờ bị lọc, và là nội dung do người soạn đề viết, nên
  JSONB đơn giản hơn các bảng con riêng và tránh được một loạt cột nullable theo từng loại (quyết
  định đã phê duyệt 12).
- `starter_codes` được bổ sung ràng buộc `UNIQUE (problem_id, language)` để starter code theo từng
  ngôn ngữ là duy nhất; starter code cho ngôn ngữ đang tắt/không được hỗ trợ bị từ chối trước khi lưu.
- `createdBy` vẫn là một UUID Identity bên ngoài thuần tuý, không có khoá ngoại. Không bảng nào của
  Identity, Submission hay Judge được Learning tham chiếu bằng quan hệ TypeORM.
- Các thao tác đọc công khai không bao giờ `.select` `hidden_harness` và không bao giờ truy vấn đáp
  án Test Case (thiết lập `select: false` hiện có trên `hidden_harness` được giữ nguyên).

### Cân bằng chuẩn hoá cơ sở dữ liệu

- Một bảng `problems` cho aggregate dùng chung cộng với một cột JSONB `type_config` cho phép null là
  mức cân đối: nó tránh một loạt cột nullable không kiểu, đồng thời tránh chuẩn hoá quá mức một
  contract theo loại nhỏ và đã được phê duyệt thành nhiều bảng.
- Liên kết Topic/Tag vẫn nằm trong các bảng nối hiện có; ngôn ngữ và starter code vẫn nằm trong các
  bảng con hiện có. Các bảng Learning khác (courses, assignments, progress, enrollments, v.v.) không
  bị đụng tới.

## Thay đổi cơ sở dữ liệu

Đích: `bkpractice_learning`. Một migration TypeORM trong tương lai (mô tả dưới đây, chưa tạo ở giai
đoạn này) sẽ:

- `ALTER TABLE "problems" ADD COLUMN "type_config" jsonb NULL` (contract FUNCTION/OOP phân biệt theo
  loại).
- `ALTER TABLE "problems" ADD COLUMN "deleted_at" timestamptz NULL` (dấu xoá mềm).
- Tạo lại enum `publish_status` thành `DRAFT`/`PUBLISHED`/`ON_HOLD`: thêm `ON_HOLD`, chuyển mọi bản
  ghi `ARCHIVED` cũ thành `ON_HOLD`, rồi bỏ giá trị `ARCHIVED`.
- Thêm ràng buộc CHECK trên `problems`: `problem_type IN ('STANDARD','FUNCTION','OOP')`,
  `time_limit_ms > 0 AND time_limit_ms <= <trần-nền-tảng>`,
  `memory_limit_mb > 0 AND memory_limit_mb <= <trần-nền-tảng>`.
- Thêm `UNIQUE (problem_id, language)` vào `starter_codes`.
- Thêm các partial index tập trung kèm `... WHERE "deleted_at" IS NULL` cho các truy vấn liệt
  kê/lọc phổ biến: `(publish_status, created_at DESC)`, `(publish_status, problem_type)`,
  `(publish_status, difficulty)`, và `(created_by)` cho các thao tác đọc ở phía quản lý. Index duy
  nhất trên `slug` hiện có và khoá chính phục vụ tra cứu chính xác theo slug/id. Việc tìm theo tiêu
  đề dựa vào bộ lọc ILIKE; không đưa vào công cụ tìm kiếm bên ngoài.

Tính tương thích: không cột hiện có nào bị xoá hay đổi tên; `test_cases`, `hidden_harness`, các bảng
course/assignment/progress và quan hệ của chúng đều không đổi. Các bổ sung schema duy nhất là hai cột
`type_config` và `deleted_at`, thay đổi giá trị enum `publish_status`, các ràng buộc CHECK/UNIQUE, và
các partial index đã nêu.

## Migration

- Một migration TypeORM mới tại
  `apps/learning-service/src/database/migrations/<timestamp>-Lrn001ProblemManagement.ts`, viết tay
  (hoặc qua `pnpm migration:generate:learning`) và được review, với `synchronize: false`. Phần up
  thêm `type_config` và `deleted_at`, tạo lại enum `publish_status` (thêm `ON_HOLD`, chuyển các bản
  ghi `ARCHIVED` cũ, bỏ giá trị `ARCHIVED`), và thêm các ràng buộc CHECK/UNIQUE cùng các partial
  index.
- Phần revert (down) bỏ các ràng buộc đã thêm, hai cột `type_config` và `deleted_at`, các
  index/ràng buộc duy nhất đã thêm, và khôi phục các giá trị enum `publish_status`; không bảng nội
  dung nào bị xoá.
- Migration chỉ chạy trên `bkpractice_learning`. Nó được kiểm chứng bằng
  `pnpm migration:run:learning` / `pnpm migration:revert:learning` trong lúc triển khai và không
  được tạo hay thay đổi schema của bất kỳ service nào khác.

## API

Gateway đã định tuyến `/api/problems*` tới Learning; tiền tố công khai `/api` được ngầm hiểu theo
quy ước hiện có. Các endpoint ở mức khái niệm (cách đặt tên chính xác theo quy ước REST của
repository):

| Thao tác                                            | Xác thực/chính sách                                                  | Thao tác application    | Phản hồi/hành vi                                                                                                                         |
| --------------------------------------------------- | -------------------------------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/problems`                                | Bearer + `problem:create`                                            | `CreateProblem`         | `201` kèm ID ổn định, `DRAFT`, metadata quản lý an toàn + mức độ sẵn sàng                                                                |
| `PATCH /api/problems/:id`                           | Bearer + `problem:update` + quyền sở hữu + trạng thái chỉnh sửa được | `UpdateProblem`         | `200` biểu diễn quản lý an toàn đã làm mới                                                                                               |
| `POST /api/problems/:id/publish`                    | Bearer + `problem:publish` + quyền sở hữu                            | `PublishProblem`        | `200` với trạng thái `PUBLISHED`; nếu không đủ điều kiện thì `400` + tập điều kiện, state giữ nguyên                                     |
| `POST /api/problems/:id/hold`                       | Bearer + `problem:hold` + quyền sở hữu                               | `HoldProblem`           | `200` với trạng thái `ON_HOLD`; bị loại khỏi khám phá của người học                                                                      |
| `POST /api/problems/:id/republish`                  | Bearer + `problem:republish` + quyền sở hữu                          | `RepublishProblem`      | `200` với trạng thái `PUBLISHED` sau khi kiểm tra lại mức độ sẵn sàng; thất bại thì giữ `ON_HOLD`                                        |
| `DELETE /api/problems/:id`                          | Bearer + `problem:delete` + quyền sở hữu                             | `SoftDeleteProblem`     | `200`/`204` xoá mềm (đặt dấu xoá); `DRAFT` bị từ chối                                                                                    |
| `POST /api/problems/:id/restore`                    | Bearer + `problem:restore` + quyền sở hữu                            | `RestoreProblem`        | `200` với trạng thái đã khôi phục (`PUBLISHED` hoặc `ON_HOLD`)                                                                           |
| `GET /api/problems`                                 | Bearer (đã xác thực)                                                 | `ListPublishedProblems` | `200` các bản tóm tắt công khai có phân trang; rỗng là thành công                                                                        |
| `GET /api/problems/:idOrSlug`                       | Bearer (đã xác thực)                                                 | `GetPublishedProblem`   | `200` chi tiết công khai; bản nháp/tạm giữ/đã xoá mềm -> `404` mà không lộ state                                                         |
| `GET /api/problems/managed`                         | Bearer + phạm vi chủ sở hữu                                          | `ListManagedProblems`   | `200` các bản tóm tắt quản lý có phân trang, mức độ sẵn sàng; hỗ trợ `publishStatus`, `search` và `includeDeleted`                       |
| `GET /api/problems/managed/:id`                     | Bearer + phạm vi chủ sở hữu (+ `includeDeleted` với nội dung đã xoá) | `GetManagedProblem`     | `200` chi tiết quản lý gồm trạng thái/mức độ sẵn sàng/dấu xoá; không kèm đáp án Test Case ẩn                                             |
| `POST /api/problems/:id/preview`                    | Bearer + phạm vi chủ sở hữu                                          | `PreviewProblem`        | `200` phần thân theo hình dạng người học; không thay đổi state                                                                           |
| `GET internal/problems/:id/judge-package/:language` | `InternalServiceGuard` (mạng nội bộ + `INTERNAL_SERVICE_SECRET`)     | Giữ nguyên (REUSE)      | Contract dữ liệu judge được bảo vệ, không đổi; không thuộc phạm vi LRN-001                                                               |

- Ngữ nghĩa `PATCH`: trường bị bỏ qua thì giữ nguyên; `null` xoá một trường cho phép null; giá trị
  rỗng bị từ chối ở những chỗ có bất biến không-rỗng; DTO ghi rõ khác biệt cho từng trường.
- Thứ tự sắp xếp danh sách là một mặc định cố định (`created_at` mới nhất trước); đầu vào sắp xếp
  theo cột SQL tuỳ ý bị từ chối và LRN-001 không bổ sung trường sắp xếp do client điều khiển.
- Việc khôi phục được hiện thực bằng thao tác gỡ `deleted_at IS NULL` nguyên tử nêu trên; khôi phục
  một Problem chưa bị xoá là lỗi `409` về trạng thái không hợp lệ. Trong LRN-001, `DELETE` chỉ có
  nghĩa là xoá mềm.
- Bổ sung metadata Swagger cho các endpoint công khai/quản lý; route judge-package nội bộ vẫn giữ
  `@ApiExcludeEndpoint`. Các ví dụ Swagger không chứa Test Case ẩn, kết quả ẩn mong đợi, harness,
  lời giải nội bộ, thông tin xác thực hay lệnh runtime.

## DTO / Kiểm tra dữ liệu

### DTO request

- `CreateProblemRequestDto`, `UpdateProblemRequestDto` (dạng partial), các contract payload theo từng
  loại, và các DTO query cho bộ lọc. Bộ lọc danh sách quản lý bổ sung cờ boolean `includeDeleted`
  giới hạn trong phạm vi chủ sở hữu (mặc định `false`). Việc kiểm tra ở tầng transport bao gồm hình
  dạng/danh sách cho phép/thành viên enum và từ chối các trường không xác định thông qua
  `ValidationPipe` toàn cục (`whitelist`, `forbidNonWhitelisted`).
- Việc phân biệt theo `problem_type` nghĩa là request `FUNCTION`/`OOP` mang contract theo từng ngôn
  ngữ; request `STANDARD` mang `inputSpecification`/`outputSpecification`. Sai khớp (ví dụ truyền
  contract hàm cho `STANDARD`) là lỗi kiểm tra dữ liệu `400`.
- Không payload request nào có thể đặt `publishStatus`, `deletedAt`, `createdBy` hay các trường
  ẩn/nội bộ; các bước chuyển vòng đời và xoá mềm/khôi phục chỉ diễn ra qua hành động chuyên biệt.

### DTO response

- `ProblemSummaryResponseDto` (công khai), `ProblemDetailResponseDto` (công khai), và
  `ManagedProblemResponseDto` (quản lý; bổ sung `publishStatus`, `createdAt`/`updatedAt`, các lỗi về
  mức độ sẵn sàng xuất bản, và — chỉ trong luồng `includeDeleted` — dấu `deletedAt`). Tất cả đều là
  phép chiếu được ánh xạ tường minh; entity TypeORM không bao giờ được trả về trực tiếp
  (`LRN-001-SR-010`, `LRN-001-AC-020`).
- Phản hồi công khai không chứa Test Case ẩn, kết quả ẩn mong đợi, harness, lời giải nội bộ, lệnh
  biên dịch/Docker hay thông tin xác thực nội bộ. Phản hồi công khai cũng không bao giờ chứa
  `publishStatus`, `deletedAt`, hay nội dung `ON_HOLD`/đã xoá mềm. Starter code chỉ được phơi bày cho
  các ngôn ngữ đang bật.

### Chiến lược kiểm tra theo từng loại

- Một bộ kiểm tra nhỏ ở tầng application/domain cho mỗi loại (STANDARD/FUNCTION/OOP) kiểm tra
  contract phân biệt đối chiếu với tập ngôn ngữ đang bật, khi cập nhật và khi xuất bản. Controller
  không bao giờ chứa một chuỗi `if/else` nghiệp vụ; nó chỉ bind DTO và gọi một use case.
- Mức độ sẵn sàng xuất bản là logic nghiệp vụ: cùng một `PublishValidator` được dùng bởi thao tác
  xuất bản, phần hiển thị mức độ sẵn sàng ở phía quản lý, và xem trước. Chỉ riêng việc kiểm tra DTO
  không bao giờ đủ để cho phép xuất bản.

## Phân quyền

`User`, `Role`, `Permission`, `user_roles` và `role_permissions` của nền tảng Identity vẫn nằm trong
`bkpractice_identity` và được tái sử dụng; Learning không tự hiện thực một RBAC engine.

- Principal tin cậy được suy ra từ các header `x-auth-user-id`/`x-auth-roles` đã được Gateway làm
  sạch và đặt lại từ claim đã xác minh trong
  `apps/api-gateway/src/auth/gateway-auth.middleware.ts`. Các trường và header định danh/vai
  trò/quyền do client gửi không bao giờ được tin cậy.
- Learning thực thi khâu phân quyền, sở hữu, vòng đời và chính sách trường cuối cùng tại một ranh
  giới backend tin cậy (`LRN-001-SR-001`, `LRN-001-SR-002`).
- Cổng chặn thô theo vai trò: ảnh chụp vai trò tin cậy phải bao gồm `LECTURER` cho các thao tác quản
  lý; `STUDENT` chỉ được khám phá nội dung đã xuất bản ở chế độ chỉ đọc; người gọi chưa xác thực bị
  từ chối (`401`) vì danh mục chỉ dành cho người đã xác thực, theo quyết định đã phê duyệt 3.
- Thực thi quyền `problem:*`: đặc tả nêu `problem:read-managed`, `problem:update`, `problem:publish`,
  `problem:hold`, `problem:republish`, `problem:delete` và `problem:restore` (cộng với
  `problem:create`) theo quy ước `resource:action` của ID-003. Access token hiện chỉ mang tên vai
  trò, không mang mã quyền. Có hai cơ chế khả dĩ và chúng được liệt kê như một phụ thuộc (xem mục
  Phụ thuộc):
  1. **Khuyến nghị:** Identity mở rộng claim của access token ID-001/ID-003 với một ảnh chụp các mã
     quyền hiệu lực (ví dụ `permissions: [...]`) phát hành từ danh mục RBAC của Identity; hoặc
  2. **Phương án thay thế:** một endpoint REST nội bộ đã phê duyệt của Identity để tra cứu quyền.
     Cho tới khi thay đổi đã phê duyệt đó của Identity xuất hiện, `ProblemAuthorizationService` của
     Learning đánh giá tám quyền `problem:*` như các khả năng gắn với vai trò LECTURER, dựa trên ảnh
     chụp vai trò tin cậy (ánh xạ một vai trò, `problem:read-managed` được ngầm định cho chủ sở hữu).
     Ánh xạ tạm thời này phải được báo cáo trong lúc triển khai và được thay thế khi cơ chế truyền
     quyền sẵn sàng; nó không bao giờ được rơi về dữ liệu do client cung cấp.
- `ADMIN` không có thẩm quyền ngầm với Problem (quyết định đã phê duyệt 2) và chịu cùng các kiểm tra
  quyền và quyền sở hữu như mọi tác nhân khác.
- Quyền sở hữu: một Giảng viên chỉ quản lý các Problem do chính mình tạo (quyết định đã phê duyệt 1).
  `createdBy` luôn là principal tin cậy tại thời điểm tạo; quyền sở hữu được thực thi bằng cách so
  sánh `record.createdBy` với principal tin cậy ở tầng application/use case. Quyền sở hữu không bao
  giờ được nhận từ client.
- Gateway chỉ thực hiện xác thực ở biên và định tuyến thô; nó không bao giờ là ranh giới phân quyền
  Problem cuối cùng.

## Messaging / Sự kiện

N/A. LRN-001 không phát ra domain event bắt buộc nào ở phiên bản này. Nhu cầu event cho
Chapter/Assignment/Recommendation thuộc về các đặc tả được phê duyệt riêng của chúng. Consumer
`submission.accepted` hiện có trong module Progress không thuộc phạm vi LRN-001.

## Realtime

N/A. Quản lý Problem không có yêu cầu realtime qua Socket.IO hay Redis.

## Adapter hạ tầng

### Adapter Problem dùng TypeORM

`infrastructure/persistence/problem.repository.ts` hiện thực domain repository port
`ProblemRepository`; `TopicTagReader` có adapter riêng trong cùng thư mục. Cả hai chỉ dùng datasource
và entity của Learning. Nó sở hữu các query builder cho việc liệt
kê/tìm/lọc/phân trang nội dung đã xuất bản (luôn kèm `deleted_at IS NULL`), tra cứu theo slug/id,
kiểm tra sự tồn tại của Topic/Tag, chèn slug duy nhất (ánh xạ xung đột ràng buộc duy nhất của CSDL
thành lỗi nghiệp vụ `DuplicateSlug`), các truy vấn quản lý theo phạm vi chủ sở hữu với cờ
`includeDeleted`, các bước chuyển xoá mềm (đặt `deleted_at`) và khôi phục (gỡ `deleted_at` khi đang
được đặt) một cách nguyên tử, và việc lưu aggregate nguyên tử qua `TransactionRunner`.

### Adapter principal/quyền

`presentation/http/decorators/trusted-principal.decorator.ts` và
`presentation/http/guards/trusted-principal.guard.ts` đọc các header tin cậy do Gateway thiết lập
(`x-auth-user-id`, `x-auth-roles`, `x-auth-permissions`) và từ chối ngữ cảnh bị thiếu/không nhất
quán (phòng thủ nhiều lớp cho các lời gọi trực tiếp hoặc định tuyến sai). Chúng phải từ chối các
header định danh/vai trò giả mạo do client gửi và không bao giờ được chấp nhận một token của nhà
cung cấp Microsoft hay một refresh token như một principal của BKPractice. Ở tầng application,
`ProblemAuthorizationService` kiểm tra role `LECTURER`, quyền `problem:*` và quyền sở hữu trên
`Principal` do controller truyền vào; không còn `PrincipalProvider` out port.

### Adapter kiểm tra nội dung

Một bộ kiểm tra nhỏ ở backend từ chối payload HTML/script thô trong nội dung đề bài trước khi lưu.
Backend không cài đặt thư viện render/sanitize nào (frontend sở hữu việc render an toàn).

### Contract kỹ thuật dùng chung

LRN-001 không cần cấu trúc mới nào trong `libs/contracts` ngoài các `ProblemType`,
`SupportedLanguage` và các transport contract Judge/Submission hiện có. Không entity, repository hay
use case Problem nào được export từ `libs/`.

## Xử lý lỗi

Tái sử dụng các quy ước lỗi NestJS/Gateway hiện có; không đưa vào cấu trúc lỗi mới. Lỗi ở tầng
domain/application vẫn độc lập với framework và được tầng Presentation ánh xạ:

| Điều kiện                                                                                                                                                                                                              | Ánh xạ mong đợi                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Thiếu/sai access token                                                                                                                                                                                                 | `401` qua Gateway; không thay đổi state                                                             |
| Tác nhân đã xác thực thiếu quyền hoặc quyền sở hữu (gồm cả Student/Admin chưa được cấp)                                                                                                                                | Quy ước `403` hiện có                                                                               |
| Problem không tồn tại hoặc không hiển thị với người gọi                                                                                                                                                                | `404` hiện có, không lộ sự tồn tại của nội dung bản nháp/tạm giữ/đã xoá mềm                         |
| Loại/độ khó/ngôn ngữ/Topic/Tag không xác định                                                                                                                                                                          | Lỗi kiểm tra dữ liệu/nghiệp vụ `400`; không thay đổi state                                          |
| Slug trùng hoặc không hợp lệ                                                                                                                                                                                           | `409`/`400` (quy ước xung đột/kiểm tra dữ liệu hiện có); không tạo Problem trùng                    |
| Đầu vào phân trang/tìm kiếm/lọc sai định dạng                                                                                                                                                                          | Lỗi client `400`; không lộ dữ liệu ẩn                                                               |
| Xuất bản một Problem không phải `DRAFT` hoặc chưa đầy đủ                                                                                                                                                               | `409`/`400` (lỗi chuyển trạng thái/kiểm tra xuất bản); giữ nguyên trạng thái trước                  |
| Cập nhật nội dung `ON_HOLD`/đã xoá mềm, xuất bản nội dung không phải `DRAFT`, tạm giữ nội dung không phải `PUBLISHED`, xuất bản lại nội dung không phải `ON_HOLD`, xoá mềm một `DRAFT`, khôi phục nội dung chưa bị xoá | `409` lỗi nghiệp vụ về trạng thái không hợp lệ; không thay đổi state                                |
| Cung cấp các trường người tạo/trạng thái không được phép                                                                                                                                                               | Bị từ chối/bỏ qua bởi kiểm tra danh sách cho phép; không ảnh hưởng phân quyền/state                 |
| Starter code cho ngôn ngữ đang tắt/không được hỗ trợ                                                                                                                                                                   | `400`; không lưu trạng thái starter code không nhất quán                                            |
| Giới hạn thực thi không dương hoặc không an toàn                                                                                                                                                                       | `400`; state của Problem không đổi                                                                  |
| ID bản nháp/tạm giữ/đã xoá mềm qua API người học                                                                                                                                                                       | `404` mà không tiết lộ nội dung hay trạng thái chưa công khai                                       |
| Tài liệu ẩn/nội bộ hoặc dấu xoá qua API công khai                                                                                                                                                                      | Bị từ chối hoặc trường bị bỏ qua; không trả về tài liệu ẩn                                          |
| Xung đột cập nhật/chuyển trạng thái đồng thời (gồm cả đua xoá vs khôi phục)                                                                                                                                            | `409`; không lộ state dở dang; ràng buộc duy nhất + các bước chuyển dấu xoá nguyên tử được bảo toàn |
| Lỗi lưu trữ/phụ thuộc ngoài dự kiến                                                                                                                                                                                    | Lỗi server chuẩn hoá hiện có; không kèm nội dung ẩn, thông tin xác thực hay chi tiết xuyên service  |

Các bước chuyển vòng đời không hợp lệ và các lỗi về mức độ sẵn sàng xuất bản trả về lỗi nghiệp vụ có
cấu trúc (không phải `500` chung chung). Các thao tác thất bại lặp lại và các thao tác đọc lặp lại
đều để nguyên state của Problem (`LRN-001-FR-030`, `LRN-001-AC-025`).

## Bảo mật

| Yêu cầu        | Cách thực thi dự kiến                                                                                                                                                                                                                          |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LRN-001-SR-001 | Thực thi quyền/sở hữu/trường/vòng đời phía server trong tầng application/domain của Learning; khả năng hiển thị ở frontend không phải biện pháp bảo mật                                                                                        |
| LRN-001-SR-002 | Principal tin cậy chỉ đến từ các header đã được Gateway làm sạch; header định danh/vai trò/sở hữu/nội bộ giả mạo bị từ chối                                                                                                                    |
| LRN-001-SR-003 | Nội dung bản nháp/tạm giữ/đã xoá mềm bị loại khỏi liệt kê/tìm/lọc/chi tiết/lỗi/đếm công khai; truy vấn của người học chỉ giới hạn `PUBLISHED` + `deleted_at IS NULL`; bản ghi đã xoá chỉ xuất hiện trong luồng `includeDeleted` của chủ sở hữu |
| LRN-001-SR-004 | Test Case ẩn, kết quả mong đợi, harness, lời giải nội bộ và chi tiết thực thi không bao giờ có trong phản hồi công khai/quản lý, log, lỗi hay ví dụ Swagger; `hidden_harness` giữ `select: false`                                              |
| LRN-001-SR-005 | Route judge-package nội bộ được giữ nguyên sau `InternalServiceGuard` (mạng nội bộ + `INTERNAL_SERVICE_SECRET`), không có endpoint công khai tương đương                                                                                       |
| LRN-001-SR-006 | Danh sách trường cho phép tường minh khi tạo/cập nhật; không nhận trường người tạo/trạng thái/dấu xoá/mốc thời gian/dữ liệu ẩn/vai trò/quyền từ client                                                                                         |
| LRN-001-SR-007 | Markdown hạn chế: backend kiểm tra định dạng/độ dài và từ chối payload HTML/script thô; frontend làm sạch trước khi render; không nội dung không an toàn nào thực thi                                                                          |
| LRN-001-SR-008 | Đầu vào ngôn ngữ/giới hạn/starter code không bao giờ trở thành lệnh biên dịch/shell/tên file/Docker/mạng/sandbox; backend chỉ lưu dữ liệu                                                                                                      |
| LRN-001-SR-009 | Không truy vấn CSDL của Identity/Submission/Judge; `createdBy` là UUID ngoài không khoá ngoại; không service nào khác truy vấn trực tiếp `bkpractice_learning`                                                                                 |
| LRN-001-SR-010 | Phản hồi công khai được ánh xạ tường minh qua danh sách cho phép ở DTO; entity không bao giờ được tuần tự hoá trực tiếp; các trường bị ẩn khỏi select vẫn ẩn                                                                                   |
| LRN-001-SR-011 | Không ghi header Authorization, bí mật service, tài liệu judge ẩn, toàn bộ body nhạy cảm hay nội dung render không tin cậy vào log/lỗi                                                                                                         |
| LRN-001-SR-012 | Ngữ cảnh phân quyền hoặc hiển thị bị thiếu/lỗi thời/sai định dạng/mơ hồ sẽ thất bại theo hướng đóng và giữ nguyên state trước đó của Problem                                                                                                   |

Không đưa vào đường xác thực mới, không có lệnh runtime do client điều khiển, và không có truy cập
cơ sở dữ liệu xuyên service nào.

## Chiến lược kiểm thử

### Unit test (domain)

- Bất biến của aggregate Problem: ID ổn định và slug so với tiêu đề trong vai trò định danh
  (`AC-001`, `AC-004`).
- Kiểm tra từ vựng: loại nằm ngoài `STANDARD`/`FUNCTION`/`OOP` bị từ chối (`AC-010`); độ khó nằm
  ngoài các giá trị đã phê duyệt bị từ chối (`AC-011`); ngôn ngữ nằm ngoài danh mục dùng chung hoặc
  không có ngôn ngữ nào đang bật thì bị từ chối khi xuất bản (`AC-012`).
- Máy trạng thái vòng đời: tạo -> DRAFT; DRAFT -> PUBLISHED; PUBLISHED -> ON_HOLD;
  ON_HOLD -> PUBLISHED; xoá mềm từ PUBLISHED và ON_HOLD; khôi phục về đúng trạng thái đã bảo toàn
  trước đó; xoá mềm một DRAFT, xuất bản lại nội dung không phải ON_HOLD, và khôi phục nội dung chưa
  bị xoá đều bị từ chối mà không thay đổi state (`AC-008`, `AC-009`, `AC-025`, `AC-026`–`AC-031`).
- Mức độ sẵn sàng xuất bản: `STANDARD` không có contract input/output bị từ chối (`AC-013`);
  contract theo từng ngôn ngữ của FUNCTION/OOP được kiểm tra cho mọi ngôn ngữ đang bật (`AC-014`);
  giới hạn không dương/không an toàn bị từ chối (`AC-017`); starter code cho ngôn ngữ đang tắt/không
  được hỗ trợ bị từ chối (`AC-016`).
- Kiểm tra contract theo loại theo đúng cách biểu diễn per-language đã phê duyệt.

### Integration test (lưu trữ)

- Migration áp dụng được với `synchronize: false`; các ràng buộc CHECK/UNIQUE thực thi đúng từ vựng,
  giới hạn dương, slug duy nhất, và starter code duy nhất theo `(problem_id, language)`; JSONB
  `type_config` round-trip đúng; `deleted_at` và enum `publish_status` (thêm `ON_HOLD`, chuyển các
  bản ghi `ARCHIVED` cũ) migrate đúng.
- Tính đúng đắn của truy vấn liệt kê/lọc/tìm/phân trang nội dung đã xuất bản kèm
  `deleted_at IS NULL`; bộ lọc rỗng/kết quả rỗng vẫn hợp lệ (`FR-008`, `AC-002`, `AC-003`).
- Các bước chuyển xoá mềm/khôi phục là nguyên tử và bị ẩn khỏi truy vấn mặc định; một cuộc đua giữa
  xoá và khôi phục để lại đúng một kết quả nhất quán; tạo slug đồng thời: nhiều nhất một Problem sở
  hữu slug đó (`AC-018`).
- Không datasource, khoá ngoại hay thực thể nghiệp vụ dùng chung xuyên service nào được import lúc
  chạy.

### Test API/E2E (`apps/learning-service/test` + quy ước spec theo module)

- Tạo: Giảng viên có thẩm quyền tạo được `DRAFT` với ID ổn định và tham chiếu người tạo tin cậy
  (`AC-001`); Học viên bị từ chối (`AC-006`); nỗ lực giả mạo người tạo bị bỏ qua/từ chối (`AC-007`).
- Liệt kê/chi tiết: người học chỉ thấy nội dung `PUBLISHED` (chưa bị xoá); bản nháp, tạm giữ và đã
  xoá mềm bị ẩn, kể cả khi tra cứu chính xác theo id/slug (`AC-002`, `AC-003`, `AC-004`, `AC-031`);
  danh mục chỉ cho người đã xác thực.
- Cập nhật: chủ sở hữu có thẩm quyền cập nhật được các trường trong danh sách cho phép; Giảng viên
  không phải chủ sở hữu nhận `403`; loại/cấu hình không hợp lệ bị từ chối; các trường được bảo vệ
  (id, slug, loại, người tạo, trạng thái, dấu xoá, mốc thời gian, dữ liệu ẩn) không thể bị thay đổi
  (`AC-007`); cập nhật nội dung `ON_HOLD`/đã xoá mềm bị từ chối.
- Xuất bản: bản nháp hợp lệ được xuất bản và trở nên khám phá được (`AC-009`); bản nháp chưa đầy đủ
  bị từ chối một cách nguyên tử (`AC-008`); xuất bản nội dung không phải bản nháp bị từ chối.
- Tạm giữ/xuất bản lại: PUBLISHED -> ON_HOLD thì bị ẩn khỏi người học (`AC-026`); ON_HOLD ->
  PUBLISHED sau khi kiểm tra lại mức độ sẵn sàng (`AC-027`); người không phải chủ sở hữu nhận `403`
  (`AC-030`).
- Xoá mềm/khôi phục: nội dung bị xoá từ PUBLISHED/ON_HOLD bị loại khỏi mọi truy vấn, bản ghi và
  trạng thái trước đó được giữ lại, lịch sử không bị đụng tới (`AC-028`); khôi phục trả về đúng
  trạng thái trước đó (`AC-029`); khôi phục nội dung chưa bị xoá và xoá mềm một `DRAFT` đều bị từ
  chối; người không phải chủ sở hữu nhận `403` (`AC-030`); các mục đã xoá chỉ hiện qua
  `includeDeleted` (`AC-031`).
- Xem trước: xem trước bản nháp có thẩm quyền trả về hình dạng hướng người học mà không xuất
  bản/thực thi/khám phá được (`AC-019`).
- Bảo mật: kiểm tra phản hồi/lỗi/log/Swagger công khai không chứa tài liệu ẩn/thông tin xác
  thực/lệnh runtime (`AC-015`, `AC-020`); route judge nội bộ từ chối bí mật giả mạo (`AC-021`); lỗi
  phân quyền/kiểm tra dữ liệu/chuyển trạng thái không commit thay đổi dở dang nào (`AC-025`).

Ánh xạ các test tới các tiêu chí nghiệm thu đã Approved trong bảng truy vết bên dưới. Chạy đúng các
script thật của repository bằng pnpm trong lúc triển khai: `pnpm lint`, `pnpm typecheck`,
`pnpm test`, và `pnpm build`.

## Khả năng quan sát

- Bảo toàn correlation/request ID hiện có xuyên Gateway và Learning
  (`libs/common/src/http/request-id.middleware.ts`).
- Ghi log kết quả thô của các thao tác Problem (tạo, cập nhật, xuất bản, tạm giữ, xuất bản lại, xoá
  mềm, khôi phục, từ chối, thiếu mức độ sẵn sàng, cấp phát judge-package nội bộ) kèm request ID và,
  ở những chỗ chính sách ghi log an toàn cho phép, kèm ID người dùng nội bộ. Không bao giờ ghi header
  Authorization, JWT thô, bí mật service nội bộ, tài liệu judge ẩn, toàn bộ body request nhạy cảm,
  hay nội dung render không tin cậy.
- Không thêm metric, backend tracing, luồng event hay service audit mới.

## Truy vết yêu cầu

| Yêu cầu               | Đường triển khai                                                                                                                 | Cách kiểm chứng chính                               |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| LRN-001-FR-001        | State/policy của Problem vẫn ở Learning; Submission/Judge chỉ dùng ID ngoài                                                      | Test kiến trúc/lưu trữ; AC-022, AC-023              |
| LRN-001-FR-002        | ID UUID ổn định trên Problem; tiêu đề không bao giờ là định danh                                                                 | Test domain/API; AC-001, AC-004                     |
| LRN-001-FR-003        | `problem_type` phân biệt kèm CHECK/kiểm tra dữ liệu                                                                              | Test domain; AC-010                                 |
| LRN-001-FR-004        | Việc tạo luôn ra `DRAFT`; người tạo lấy từ principal tin cậy                                                                     | Test API; AC-001, AC-005, AC-006                    |
| LRN-001-FR-005        | Truy vấn người học giới hạn nội dung đã xuất bản/chưa xoá; bản nháp/ON_HOLD/đã xoá mềm bị loại khỏi liệt kê/tìm/lọc/chi tiết/đếm | Test API/liệt kê; AC-002, AC-003, AC-031            |
| LRN-001-FR-006        | Danh mục chỉ cho người đã xác thực; `GetPublishedProblem`/`ListPublishedProblems`                                                | Test API; AC-002, AC-004                            |
| LRN-001-FR-007        | Tìm tiêu đề bằng `ILIKE`; tra cứu chính xác theo id hoặc slug, giới hạn `PUBLISHED` + chưa xoá                                   | Test integration/API; AC-002, AC-003                |
| LRN-001-FR-008        | Phân trang + lọc theo loại/độ khó/topic/tag; rỗng là thành công                                                                  | Test integration/API; AC-002, AC-003                |
| LRN-001-FR-009        | Đọc ở phía quản lý gồm bản nháp/ON_HOLD/đã xoá mềm (qua `includeDeleted`) + mức độ sẵn sàng; không kèm đáp án Test Case ẩn       | Test API; phép chiếu DTO quản lý                    |
| LRN-001-FR-010        | Danh sách trường cho phép khi cập nhật; không thay đổi người tạo/trạng thái                                                      | Test API/bảo mật; AC-007                            |
| LRN-001-FR-011        | Bước chuyển xuất bản nguyên tử; thất bại thì giữ `DRAFT`                                                                         | Test API/domain; AC-008, AC-009, AC-025             |
| LRN-001-FR-012        | Kiểm tra xuất bản với từ vựng, slug, giới hạn, ngôn ngữ, contract theo loại                                                      | Test domain/API; AC-008–AC-014, AC-016, AC-017      |
| LRN-001-FR-013        | ON_HOLD và đã xoá mềm bị loại khỏi khám phá, trạng thái trước được giữ; khôi phục là cách đảo ngược duy nhất; không có xoá cứng  | Test API/domain; AC-026, AC-028, AC-029             |
| LRN-001-FR-014        | Đề bài + contract phù hợp loại; input/output bắt buộc với STANDARD khi xuất bản                                                  | Test domain/API; AC-013, AC-014                     |
| LRN-001-FR-015        | Chỉ ví dụ hiển thị; kết quả ẩn mong đợi/harness không bao giờ được trả về                                                        | API/bảo mật; AC-015                                 |
| LRN-001-FR-016        | Kiểm tra enum độ khó; chỉ là metadata                                                                                            | Test domain/API; AC-011                             |
| LRN-001-FR-017        | Tham chiếu Topic/Tag được kiểm tra, không bao giờ âm thầm tạo mới                                                                | Test integration/API                                |
| LRN-001-FR-018        | Ngôn ngữ đang bật là tập con của danh mục dùng chung; không nhận cấu hình biên dịch/runtime dưới danh nghĩa ngôn ngữ             | Test domain/API; AC-012                             |
| LRN-001-FR-019        | Starter code chỉ cho ngôn ngữ đang bật; harness ẩn không bao giờ được trả về                                                     | Test API/bảo mật; AC-016, AC-020                    |
| LRN-001-FR-020        | Giới hạn thời gian/bộ nhớ dương trong biên nền tảng; Judge thực thi các trần                                                     | Test domain; AC-017                                 |
| LRN-001-FR-021        | Slug duy nhất, hợp lệ, do giảng viên cung cấp, bất biến sau khi tạo                                                              | Test domain/API; AC-018                             |
| LRN-001-FR-022        | `createdBy` là UUID Identity bên ngoài, không khoá ngoại                                                                         | Test lưu trữ/kiến trúc                              |
| LRN-001-FR-023        | Trạng thái + mốc thời gian trong phép chiếu quản lý; danh sách metadata cho phép với người học                                   | Test API                                            |
| LRN-001-FR-024        | Xem trước trả về bản nháp theo hình dạng người học mà không xuất bản/thực thi/khám phá                                           | Test API; AC-019                                    |
| LRN-001-FR-025        | Danh sách cho phép công khai tường minh; không có dữ liệu ẩn/nội bộ trong phản hồi                                               | Bảo mật/API; AC-015, AC-020                         |
| LRN-001-FR-026        | Tài liệu ẩn chỉ qua route nội bộ được bảo vệ; truy cập giả mạo bị từ chối                                                        | Test bảo mật; AC-021                                |
| LRN-001-FR-027        | Assignment chỉ tham chiếu ID Problem ổn định; LRN-001 không sở hữu hành vi assignment nào                                        | Rà soát kiến trúc; AC-022                           |
| LRN-001-FR-028        | Không có hành vi biên dịch/chạy/nộp bài/kết quả trong Quản lý Problem                                                            | Rà soát phạm vi; test API                           |
| LRN-001-FR-029        | Markdown hạn chế; backend từ chối HTML/script; frontend làm sạch                                                                 | Test kiểm tra nội dung; AC-024                      |
| LRN-001-FR-030        | Kiểm tra dữ liệu/phân quyền/chuyển trạng thái thất bại thì để nguyên state                                                       | Test tính bất biến ở domain/API; AC-025             |
| LRN-001-FR-031        | Tạm giữ: PUBLISHED -> ON_HOLD bởi chủ sở hữu; bị loại khỏi khám phá của người học                                                | Test domain/API; AC-026, AC-030                     |
| LRN-001-FR-032        | Xuất bản lại: ON_HOLD -> PUBLISHED có kiểm tra lại mức độ sẵn sàng, nguyên tử                                                    | Test domain/API; AC-027, AC-030                     |
| LRN-001-FR-033        | Xoá mềm: đặt dấu xoá; giữ bản ghi/trạng thái/ID; ẩn khỏi mọi truy vấn                                                            | Test domain/integration/API; AC-028, AC-030, AC-031 |
| LRN-001-FR-034        | Khôi phục: gỡ dấu xoá, về đúng trạng thái trước đó, lịch sử không bị đụng                                                        | Test domain/integration/API; AC-029, AC-030         |
| LRN-001-SR-001–SR-012 | Xem mục Bảo mật                                                                                                                  | Test bảo mật/API/kiến trúc; AC-020–AC-031           |
| LRN-001-AC-001–AC-031 | Xem mục Chiến lược kiểm thử                                                                                                      | Bộ test unit/integration/API/bảo mật                |

Định nghĩa Hoàn thành (theo `specs/00-system/definition-of-done.md`) áp dụng cho phần triển khai
tương lai: migration đã kiểm chứng, test pass, `pnpm lint`, `pnpm typecheck`, `pnpm test` và
`pnpm build` pass, Swagger cập nhật khi contract API thay đổi, không thêm chức năng Ngoài phạm vi,
yêu cầu bảo mật đã được kiểm chứng, và mọi FR/SR/AC đều được truy vết.

## Các file dự kiến thay đổi

### REUSE

- `apps/learning-service/src/database/data-source.ts`
- `apps/learning-service/src/modules/learning.entities.ts`
- `apps/learning-service/src/modules/problems/entities/problem.entity.ts` (các định nghĩa
  Topic/Tag/TestCase/StarterCode/ProblemLanguage, `hidden_harness` với `select: false`)
- `apps/learning-service/src/modules/problems/internal-service.guard.ts` và hành vi của route nội bộ
  `GET internal/problems/:id/judge-package/:language`
- `libs/contracts/src/index.ts`, `libs/contracts/src/judge.contracts.ts` (danh mục `ProblemType`,
  `SupportedLanguage` dùng chung và các transport contract của Judge)
- `libs/common/src/bootstrap.ts` và `libs/common/src/http/request-id.middleware.ts`
- `libs/config/src/environment.ts` và `libs/config/src/database.config.ts`
- `apps/api-gateway/src/auth/gateway-auth.middleware.ts` (làm sạch header + định tuyến
  `/api/problems` đã có trong `apps/api-gateway/src/proxy/gateway-proxy.service.ts`)

### MODIFY

- `apps/learning-service/src/modules/problems/entities/problem.entity.ts`: thêm ánh xạ cột
  `type_config` dạng JSONB và cột dấu xoá mềm `deleted_at`.
- `apps/learning-service/src/modules/problems/problems.module.ts`: import các DTO/use case/port/
  adapter của tính năng và gắn composition root.
- `apps/learning-service/src/modules/problems/problems.controller.ts`: tái cấu trúc thành các
  controller công khai/quản lý chỉ lo transport (các route ở trên); giữ nguyên route judge-package
  nội bộ; bỏ việc tuần tự hoá entity thô khi liệt kê.
- `apps/learning-service/src/modules/learning.entities.ts`: dự kiến không đổi (không có entity mới);
  nếu cần một thay đổi nhỏ về đăng ký entity thì nó phải nằm hoàn toàn trong phạm vi Learning.

### CREATE

- `apps/learning-service/src/modules/problems/domain/` — aggregate Problem độc lập với framework,
  các value object, enum, máy trạng thái vòng đời, bộ kiểm tra xuất bản, các bộ kiểm tra contract
  theo loại (STANDARD/FUNCTION/OOP), và `domain/repositories/problem.repository.port.out.ts`.
- `apps/learning-service/src/modules/problems/application/ports/out/` — `TopicTagReader`,
  `TransactionRunner`.
- `apps/learning-service/src/modules/problems/application/use-cases/` —
  `create-problem`, `update-problem`, `publish-problem`, `hold-problem`, `republish-problem`,
  `soft-delete-problem`, `restore-problem`, `get-published-problem`, `list-published-problems`,
  `get-managed-problem`, `list-managed-problems`, `preview-problem`.
- `apps/learning-service/src/modules/problems/application/services/` — service phân quyền/sở hữu
  Problem.
- `apps/learning-service/src/modules/problems/application/results/` — output/result model của use
  case.
- `apps/learning-service/src/modules/problems/infrastructure/persistence/` — các adapter TypeORM
  `ProblemRepository`/`TopicTagReader` và phần hiện thực transaction.
- `apps/learning-service/src/modules/problems/presentation/http/decorators/` và
  `presentation/http/guards/` — decorator/guard đọc các header tin cậy do Gateway thiết lập và cung
  cấp `Principal` cho controller.
- `apps/learning-service/src/modules/problems/presentation/` — các controller công khai/quản lý, DTO
  request/response, response mapper và decorator Swagger.
- `apps/learning-service/src/database/migrations/<timestamp>-Lrn001ProblemManagement.ts`.
- Các test unit/integration/API/bảo mật tập trung, theo quy ước test của repository cho
  `apps/learning-service`.

### REMOVE

Không có.

## Thứ tự triển khai

1. Xác nhận lại phiên bản đặc tả đang review (1.1), kiến trúc Learning, các quy tắc phụ thuộc,
   contract ngữ cảnh Gateway, schema Learning hiện có, và nền tảng RBAC của Identity; báo cáo mọi
   xung đột trước khi thay đổi code.
2. Định nghĩa các kiểu domain, value object, enum, máy trạng thái vòng đời và bộ kiểm tra contract
   theo loại của Problem, độc lập với framework, không import NestJS/TypeORM.
3. Định nghĩa domain repository port `ProblemRepository`, các port/use case hẹp của tầng application
   và ranh giới phân quyền/sở hữu Problem; giải quyết phụ thuộc về cơ chế truyền quyền `problem:*`
   (claim quyền trong token hoặc REST nội bộ đã phê duyệt của Identity) và dừng lại nếu không thể
   thoả mãn qua một seam đã được phê duyệt.
4. Hiện thực và kiểm thử adapter lưu trữ TypeORM, hành vi slug duy nhất/starter code duy nhất, các
   truy vấn tìm/lọc/phân trang cho nội dung đã xuất bản và chưa bị xoá, các bước chuyển xoá
   mềm/khôi phục, và việc kiểm tra sự tồn tại của Topic/Tag trên schema `bkpractice_learning` hiện có.
5. Viết và kiểm chứng migration LRN-001 (`type_config`, `deleted_at`, enum `publish_status`, các ràng
   buộc CHECK/UNIQUE, partial index) với `synchronize: false`; kiểm chứng bằng
   `pnpm migration:run:learning` / revert.
6. Bổ sung composition root của module Problems, tích hợp decorator/guard principal tin cậy ở
   presentation, và service quyền ở application.
7. Hiện thực các use case và phần ánh xạ lỗi của chúng; giữ tầng Presentation chỉ lo transport.
8. Hiện thực DTO, controller, metadata Swagger, và các phép chiếu phản hồi công khai/quản lý.
9. Chạy các test unit, lưu trữ, đồng thời, API và bảo mật (bao gồm phép chiếu phản hồi, giả mạo người
   tạo, bảo mật nội dung bản nháp/tạm giữ/đã xoá mềm, sự vắng mặt của tài liệu ẩn, tính nguyên tử của
   xoá mềm/khôi phục, và các thất bại giữ nguyên state).
10. Chạy `pnpm lint`, `pnpm typecheck`, `pnpm test` và `pnpm build`; kiểm chứng mọi FR/SR/AC và các
    quy tắc phụ thuộc của Learning; đánh dấu `tasks.md` một cách trung thực (tạo ở giai đoạn sau).

## Phụ thuộc

- **ID-001 Authentication:** cung cấp định danh đã xác minh, trạng thái tài khoản, và access
  token/ngữ cảnh Gateway tin cậy mà LRN-001 đọc để lấy principal. Gateway đã loại bỏ các header giả
  mạo.
- **ID-003 RBAC:** cung cấp nền tảng vai trò/quyền (quy ước `resource:action`, mặc-định-từ-chối).
  LRN-001 tiêu thụ nó; nó không hiện thực lại một RBAC engine.
- **Danh mục quyền của Identity (điều kiện tiên quyết):** các mã quyền `problem:create`,
  `problem:read-managed`, `problem:update`, `problem:publish`, `problem:hold`, `problem:republish`,
  `problem:delete` và `problem:restore` phải được seed vào danh mục RBAC tĩnh của Identity và ánh xạ
  tới `LECTURER` (theo quy ước đã phê duyệt của ID-003; các đặc tả tính năng tự định nghĩa mã của
  mình). Cần một thay đổi đã phê duyệt của Identity để phơi bày các quyền hiệu lực cho bên tiêu thụ
  (claim trong token hoặc REST nội bộ) nhằm thực thi đầy đủ `problem:*`; cho tới khi điều đó xuất
  hiện, Learning ánh xạ các quyền này về ảnh chụp vai trò `LECTURER` tin cậy và báo cáo phần tạm thời
  như một hạng mục cần review.
- **API Gateway:** xác thực và chuyển tiếp `/api/problems*` kèm các header tin cậy đã làm sạch;
  không dự kiến thay đổi nghiệp vụ nào ở Gateway.
- **LRN-002 Quản lý Test Case (tương lai):** sở hữu CRUD Test Case, mức độ sẵn sàng, trọng số, kết
  quả ẩn mong đợi, harness, và mọi phụ thuộc xuất bản trong tương lai. LRN-001 không chặn việc xuất
  bản dựa trên sự tồn tại của Test Case.
- **Đặc tả Assignment trong tương lai:** chỉ tham chiếu các Problem PUBLISHED qua `problemId` ổn
  định; LRN-001 không sở hữu hành vi assignment nào.
- **Submission Service:** chỉ lưu ID Problem bên ngoài và lấy tài liệu judge qua route nội bộ được
  bảo vệ; không có khoá ngoại xuyên CSDL.
- **Judge Service:** tiêu thụ cấu hình Problem liên quan tới judge (`problemId`, loại, giới hạn, tham
  chiếu ngôn ngữ đã phê duyệt) qua luồng nội bộ đã phê duyệt; LRN-001 không định nghĩa hành vi Judge.
- **Tính năng danh mục Topic/Tag trong tương lai:** sở hữu việc quản trị Topic/Tag; LRN-001 chỉ liên
  kết tới các giá trị sẵn có.

## Rủi ro

- **Khoảng trống về cơ chế truyền quyền `problem:*`:** access token hiện chỉ mang tên vai trò. Việc
  thực thi đầy đủ theo mã quyền bị chặn cho tới khi có một seam đã phê duyệt từ Identity (claim hoặc
  REST nội bộ); ánh xạ tạm thời theo vai trò LECTURER phải được review, không bao giờ được âm thầm
  dựa vào.
- **Migration enum PostgreSQL:** việc tạo lại `publish_status` (thêm `ON_HOLD`, chuyển các bản ghi
  `ARCHIVED` cũ) phải nguyên tử và đảo ngược được; hiện thực bằng luồng enum tạm/`ADD VALUE` và kiểm
  chứng cả chiều up lẫn down trên `bkpractice_learning`.
- **Đua giữa xoá mềm và khôi phục, và rò rỉ ngoài ý muốn:** một lần xoá chạy đua với một lần khôi
  phục phải nguyên tử và idempotent (dùng điều kiện canh `deleted_at IS NULL`); quên bộ lọc
  `deleted_at IS NULL` sẽ làm rò rỉ hoặc làm sống lại nội dung, nên mọi truy vấn mặc định đều lọc dấu
  xoá và test phải khẳng định ranh giới `includeDeleted` trong phạm vi chủ sở hữu.
- **Chỉnh sửa tại chỗ nội dung đã xuất bản so với các bài nộp:** việc chấp nhận chỉnh sửa tại chỗ đơn
  giản (đã được phê duyệt) nghĩa là Submission có thể tham chiếu nội dung sẽ thay đổi về sau;
  versioning là Ngoài phạm vi. Hãy thực thi các trường bất biến đã phê duyệt (loại, slug) và ghi nhận
  rủi ro còn lại.
- **Tính cứng nhắc/nullable của type-config:** JSONB `type_config` có thể trôi về những hình dạng mơ
  hồ; giảm thiểu bằng việc phân biệt theo `problem_type`, kiểm tra contract theo từng ngôn ngữ, và
  kiểm tra mức độ sẵn sàng xuất bản.
- **Rò rỉ dữ liệu ẩn/nội bộ:** việc tuần tự hoá entity thô và phơi bày `hidden_harness`/Test Case
  phải được loại bỏ bằng các phép chiếu DTO tường minh và `select: false`; kiểm chứng qua các test
  soi phản hồi/log/Swagger.
- **Giả mạo người tạo / sai sót về quyền sở hữu:** quyền sở hữu chỉ suy ra từ principal tin cậy; test
  khẳng định các trường `createdBy` giả mạo bị bỏ qua và truy cập chéo chủ sở hữu nhận `403`.
- **Ràng buộc chéo service:** `createdBy` và các tham chiếu Submission/Assignment trong tương lai vẫn
  là ID ngoài thuần tuý, không có khoá ngoại xuyên CSDL; test kiến trúc đảm bảo không có datasource
  xuyên service.
- **Rò rỉ ranh giới Test Case:** LRN-001 không được tạo CRUD Test Case hay chặn việc xuất bản dựa
  trên mức độ sẵn sàng của Test Case; phụ thuộc vào LRN-002 đã được ghi nhận.
- **Thiết kế quá mức (versioning, CQRS, công cụ tìm kiếm, service Problem riêng):** tất cả đều là
  Ngoài phạm vi theo đặc tả đã Approved.
- **Trôi định danh ngôn ngữ:** chỉ chấp nhận các giá trị trong danh mục `SUPPORTED_LANGUAGES` dùng
  chung; không có danh mục trùng lặp riêng cho từng tính năng.
- **Trôi phân loại Topic/Tag:** việc quản trị danh mục thuộc về một tính năng sở hữu trong tương lai;
  LRN-001 kiểm tra các tham chiếu một cách phòng thủ.
- **Phụ thuộc vào việc làm sạch nội dung:** backend từ chối HTML/script thô nhưng việc render an toàn
  dựa vào bộ sanitizer của frontend; sự phân chia trách nhiệm này được ghi nhận và được kiểm thử ở
  phía backend.

## Tuân thủ kiến trúc

- **DDD + Hexagonal:** tầng Presentation là driving adapter, phân tích DTO và ánh xạ phản hồi; các
  use case ở tầng application điều phối transaction, port, quyền sở hữu và kiểm tra xuất bản; tầng
  domain sở hữu aggregate, các value object, các bước chuyển vòng đời, bất biến theo loại, quy tắc
  định dạng nội dung và domain repository port `ProblemRepository`; tầng infrastructure là driven
  adapter, hiện thực TypeORM; principal tin cậy được đọc ở presentation bằng decorator/guard, còn
  quyền được kiểm tra trong application service.
- **Phạm vi DDD:** chỉ dùng các khối tactical (aggregate root, value object, domain service,
  repository) trong một bounded context duy nhất. Không đưa vào context map, anti-corruption layer
  hay bounded context thứ hai.
- **Chiều phụ thuộc:** domain không import code NestJS/TypeORM/JWT/HTTP; application chỉ phụ thuộc
  các kiểu domain và các port; infrastructure được gắn tại composition root của module Problems.
- **Quyền sở hữu của Learning:** lớp lưu trữ và policy của Problem vẫn nằm trong
  `bkpractice_learning`, bên trong module `problems` của Learning; không có microservice Problem và
  không có entity Problem trong `libs/`.
- **Không truy cập xuyên service:** không truy vấn CSDL của Identity/Submission/Judge, không khoá
  ngoại xuyên service, và không quan hệ TypeORM tới bảng của service khác. `createdBy` là một UUID
  bên ngoài.
- **Ranh giới RBAC:** nền tảng vai trò/quyền của ID-003 được tiêu thụ qua ngữ cảnh Gateway tin cậy;
  Learning sở hữu các kiểm tra hành động/tài nguyên/quyền sở hữu cuối cùng ở phía mình và không bao
  giờ hiện thực lại một RBAC engine.
- **Ranh giới Test Case:** vòng đời/CRUD Test Case và việc chặn theo mức độ sẵn sàng vẫn thuộc về
  LRN-002 trong tương lai; LRN-001 giữ nguyên bảng `test_cases` và route judge-package nội bộ được
  bảo vệ mà không mở rộng phạm vi.
- **Ranh giới Submission/Judge:** LRN-001 không lưu dữ liệu nộp bài/mã nguồn/kết quả nào và không
  định nghĩa hành vi thực thi judge nào; cấu hình Problem liên quan tới judge chỉ được truyền qua
  luồng nội bộ đã phê duyệt.
- **Tách bạch công khai/nội bộ:** phản hồi công khai là các phép chiếu theo danh sách cho phép tường
  minh; tài liệu ẩn, lời giải nội bộ, thông tin xác thực và lệnh runtime không bao giờ xuất hiện
  trong phản hồi, log, lỗi hay ví dụ Swagger.
- **Kiểm soát phạm vi:** không thêm hệ thống versioning, soạn thảo cộng tác, quy trình duyệt, kiến
  trúc plugin CMS, import từ OJ bên ngoài, Elasticsearch, CQRS, event sourcing, hay base repository
  chung nào.

> `plan.md` mô tả NHƯ THẾ NÀO. Nó KHÔNG ĐƯỢC thêm hành vi, tác nhân hay tiêu chí nghiệm thu vượt
> ngoài `spec.md` đã Approved (phiên bản 1.1). Danh sách công việc dẫn xuất từ kế hoạch này nằm ở
> [`tasks.md`](./tasks.md).
