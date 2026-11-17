# JDG-002 Kế hoạch Language Runners

## Trạng thái và đặc tả

**Reviewed.** [JDG-002 spec v1.0](./spec.md) đã `Approved` ngày 2026-10-07 theo
[`REVIEW.md`](../REVIEW.md); toolchain, entrypoint và limits đã chốt (D-08), plan này là căn cứ
triển khai.

## Service và kiến trúc bắt buộc

Judge — **Hexagonal Architecture (Ports & Adapters) + Pipeline** theo [ADR 0002](../../../adr/0002-revised-service-internal-architectures.md). `LanguageRunner` hiện là driven port có bốn adapter; giữ quy tắc command/image/filename chỉ do adapter tin cậy quyết định. Không thêm domain/repository/database.

## Mã hiện có và thay đổi dự kiến

- Giữ `LanguageRunner`, `RunnerRegistry`, `CRunner`, `CppRunner`, `JavaRunner`, `PythonRunner` làm ranh giới adapter; kiểm tra đủ bốn language key, không fallback ngôn ngữ lạ.
- Đối chiếu `docker/judge/{c,cpp,java,python}/Dockerfile` với runtime/compile contract được duyệt; ghi rõ version/flags trong tài liệu vận hành khi được chốt.
- Không đẩy compiler command/image ra shared `JudgeRequest`; `libs/contracts` chỉ mang language enum và dữ liệu transport.
- `JudgeEngine` dùng runner được chọn để cung cấp trusted filename/command cho Sandbox port của JDG-005. JDG-002 không tự sửa thuật toán so sánh/verdict của JDG-001.
- Chẩn đoán compiler được giới hạn byte và lọc host path/source/harness trước khi đi vào `JudgeResult` theo chính sách JDG-001.

## Core, adapter và validation

| Nhóm     | Kế hoạch sau phê duyệt                                                                             |
| -------- | -------------------------------------------------------------------------------------------------- |
| Registry | Bảng một-một language → runner; giá trị lạ bị từ chối trước workspace/container                    |
| C/C++    | Giữ compiler flags/entrypoint đã được chốt; compile một lần/request, artifact cho testcase         |
| Java     | Giữ một entrypoint/naming convention đã duyệt; không nhận JVM options/classpath từ request         |
| Python   | Kiểm tra syntax trước execute nếu được duyệt; execute ở isolated mode `-I` hoặc cơ chế tương đương |
| Images   | Do deployment quản lý, không pull/install dependency qua mạng khi chấm                             |

## Lưu trữ, migration, API, phân quyền, realtime

N/A — JDG-002 không tạo database/migration, repository, API, Swagger hoặc realtime. Runner nhận request đã qua consumer; quyền người dùng do Gateway/Submission xử lý. Không cho payload chọn command/image dù message là nội bộ.

## Messaging, lỗi và bảo mật

Topology giữ theo JDG-001; runner không publish/ACK. Compile error do source map `COMPILE_ERROR`; image/toolchain/adapter failure map `INTERNAL_ERROR` qua core. Không log source/harness/diagnostics thô. Trường hợp FUNCTION/OOP compile error do harness phụ thuộc quyết định JDG-003/004, không gán tự động cho người học.

## Kiểm chứng và truy vết

| Yêu cầu                              | Kiểm chứng chính                                                                |
| ------------------------------------ | ------------------------------------------------------------------------------- |
| FR-001/002/004, AC-001/002           | Danh mục language, ánh xạ adapter và từ chối language không hỗ trợ              |
| FR-003/007, AC-003/005               | Source/stdin không điều khiển filename/command/image; request không cấp command |
| FR-005/006/010..014, AC-004/006..010 | Compile mode, diagnostics và C/C++/Java/Python behavior cụ thể                  |
| FR-008/015, AC-006..009              | Thay catalog/toolchain có compatibility review với Learning/Submission          |

Không thêm language mới hoặc package manager trong plan này. Script kiểm chứng khi triển khai: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` theo definition of done.

## Thứ tự thực hiện, rủi ro và tuân thủ kiến trúc

1. Chốt câu hỏi mở của JDG-002 và phê duyệt spec; kiểm tra tương thích với LRN-001/SUB-001/SUB-002.
2. Cập nhật runner/image/diagnostics theo contract được duyệt.
3. Kiểm chứng từng ngôn ngữ và tích hợp Sandbox JDG-005.
4. Đối chiếu mọi FR/AC và cập nhật tasks/worked entry.

Thay toolchain có thể đổi kết quả biên dịch, nên phải ghi rõ version và ảnh hưởng tương thích trước rollout. Runner adapter giữ command/file bên ngoài core; không tạo abstraction rỗng hay import service khác.

## Lát cắt triển khai và điểm chạm dự kiến

| Lát cắt                 | Điểm chạm dự kiến                                                                                   | Đầu ra review được                                                                | Điều kiện bắt đầu                                        |
| ----------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 1. Contract/catalog     | `libs/contracts/src/judge.contracts.ts`, `runners/runner.registry.ts`, `runners/language-runner.ts` | Language catalog đồng nhất; unknown language bị reject trước Sandbox              | D-08, LRN/SUB compatibility đã chốt                      |
| 2. Runner command plans | `runners/c.runner.ts`, `cpp.runner.ts`, `java.runner.ts`, `python.runner.ts`                        | Trusted filenames, images, argv, artifact và diagnostic policy từng language      | Toolchain/entrypoint/limits được ghi trong Approved spec |
| 3. Runtime images       | `docker/judge/{c,cpp,java,python}/Dockerfile`                                                       | Image versions và binaries khớp command plans, không cần network install khi chấm | Image/version policy Approved                            |
| 4. Sandbox integration  | `judge.engine.ts`, `sandbox/docker-sandbox.executor.ts` hoặc port/adapter sau JDG-005               | Compile/execute outcome tương thích Sandbox boundary                              | JDG-005 port/outcome contract ổn định                    |
| 5. Verification         | runner unit/integration tests và image checks                                                       | Bốn language có evidence compile/run/error/injection                              | Các lát cắt 1–4 hoàn tất                                 |

Giữ thay đổi tập trung ở runner adapters và image definitions. Không thêm language, package manager, request-selected compiler options hoặc comparator behavior; các nội dung đó không thuộc JDG-002 hiện tại.
