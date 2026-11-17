# JDG-002 Tasks Language Runners

**Trạng thái:** Chưa thực hiện. Phụ thuộc [spec Approved v1.0](./spec.md), [plan reviewed](./plan.md) và Sandbox JDG-005.

## Cổng trước triển khai

- [x] Chốt toolchain/version policy, Java entrypoint, Python syntax check và source/diagnostic limits — xong 2026-10-07 theo [REVIEW.md](../REVIEW.md) D-08; ghi vào bảng toolchain và FR-005/012/016 của spec.
- [ ] Xác nhận spec Approved, plan được review, kiến trúc Judge và trạng thái worktree.

## Runner và contract

- [ ] Giữ danh mục `c`, `cpp`, `java`, `python` đồng bộ với `libs/contracts`, Learning và Submission (FR-001/008).
- [ ] Kiểm tra registry ánh xạ mỗi language đúng một adapter; language lạ không tạo container (FR-002/004).
- [ ] Cố định trusted filename/image/compile/execute command; source/stdin không thể thay argument/path (FR-003/007/010/012/013).
- [ ] Cập nhật C/C++/Java/Python adapters và Dockerfiles đúng version/flags đã duyệt; không cài dependency qua mạng khi chạy (FR-005/014/015).
- [ ] Giới hạn và lọc compiler diagnostics, phân biệt lỗi source với lỗi image/toolchain (FR-006/011).

## Kiểm chứng và tài liệu

- [ ] Kiểm chứng AC-001..010 với bốn language, syntax/compile/runtime error, language lạ và payload injection.
- [ ] Đối chiếu image/toolchain policy với Learning/Submission contracts; không sửa comparator JDG-001.
- [ ] Đối chiếu mọi FR/AC, kiểm tra chiều phụ thuộc và không có out-of-scope behavior.
- [ ] Chạy `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` khi triển khai; cập nhật tasks/worked entry.

## N/A theo phạm vi

- [x] N/A — Database/migration/repository: runner là adapter stateless.
- [x] N/A — API/Swagger/realtime: JDG-002 chỉ dùng message nội bộ.

## Checklist triển khai chi tiết

Các task dưới đây là phân rã thực thi của FR/AC trong spec. Chỉ đánh dấu hoàn tất khi có test hoặc review evidence; mọi thông số còn mở tiếp tục bị chặn ở phần Cổng trước triển khai.

### A. Contract, registry và cấu hình tin cậy

- [x] **JDG002-T01 — Chốt toolchain:** quyết định phiên bản compiler/runtime, image tags, flags, Java entrypoint và Python syntax-check; ghi nguồn quyết định vào spec/vận hành.
      Đã chốt tại spec v1.0, D-08.1…D-08.3.
- [x] **JDG002-T02 — Chốt giới hạn đầu vào/diagnostic:** thống nhất source size và diagnostic byte limit với JDG-001/SUB-002; không đặt số tùy ý.
      Đã chốt tại D-08.5 (1 MiB; trần output của JDG-005).
- [x] **JDG002-T03 — Đối chiếu catalog:** xác nhận `c`, `cpp`, `java`, `python` đồng nhất giữa contract, Submission/Learning, registry và Docker images.
      `SUPPORTED_LANGUAGES` trong `libs/contracts` là nguồn chung; `runner.registry.spec.ts` duyệt đúng danh mục này; `docker/judge/` có đủ bốn thư mục (2026-11-16).
- [x] **JDG002-T04 — Registry whitelist:** bảo đảm mỗi language map đúng adapter; unknown/unsupported language trả lỗi đã chốt trước khi gọi Sandbox.
      `runner.registry.spec.ts`; `UnsupportedLanguageError` (2026-11-16).
- [x] **JDG002-T05 — Trusted execution plan:** adapter tự cấp filename, image, compile/execute argv, working directory và artifact path; không ghép dữ liệu người dùng vào shell command/flags/path.
      `judge.engine.spec.ts` › runner trust boundary (2026-11-16).

### B. Adapter theo ngôn ngữ

- [x] **JDG002-T06 — C adapter:** triển khai/đối chiếu source filename, compile flags, artifact và execute argv theo contract đã duyệt; compile một lần cho request khi có thể.
      `runner.registry.spec.ts` đối chiếu bảng contract.
- [x] **JDG002-T07 — C++ adapter:** tương tự C, với compiler standard và flags đã duyệt; kiểm tra filename/entrypoint cố định.
      `runner.registry.spec.ts` đối chiếu bảng contract.
- [x] **JDG002-T08 — Java adapter:** chốt public class/file naming, `javac` invocation, classpath và `java` entrypoint; không nhận JVM args/classpath từ payload.
      `runner.registry.spec.ts` đối chiếu bảng contract.
- [x] **JDG002-T09 — Python adapter:** chạy syntax check nếu được chốt, sau đó isolated interpreter mode; không tự cài package hoặc truy cập mạng.
      `runner.registry.spec.ts` + kiểm thử `py_compile` trước execute.
- [ ] **JDG002-T10 — Image parity:** đồng bộ Dockerfiles với adapter commands/toolchain; pin versions theo policy; build images offline-compatible và không cài dependency trong lúc chấm.
      CHƯA XONG: `docker/judge/java/Dockerfile` dùng `eclipse-temurin:21-jdk-alpine`, spec ghi `eclipse-temurin:21-jdk`; chờ chủ repo quyết định sửa bên nào.
- [ ] **JDG002-T11 — Diagnostics:** cắt theo byte limit, loại bỏ host path/source fragment/harness nội bộ, giữ classification đủ dùng; không log raw compiler output.
- [ ] **JDG002-T12 — Error provenance:** phân biệt compile lỗi source với compiler/image/configuration failure; cung cấp outcome kỹ thuật cho core thay vì tự publish verdict.
      Một phần: lỗi hạ tầng/language lạ có lỗi định kiểu, thông điệp lạ không lọt vào result; ca image thiếu chờ kiểm thử Docker (T16).

### C. Kiểm chứng và hoàn tất

- [x] **JDG002-T13 — Adapter unit tests:** mỗi runner kiểm chứng command plan, filename, artifact, stdin/stdout wiring và diagnostic filtering.
      `runner.registry.spec.ts`, `judge.engine.spec.ts` (2026-11-16).
- [x] **JDG002-T14 — Language integration tests:** cho từng ngôn ngữ kiểm tra chương trình hợp lệ, syntax/compile error, runtime error và input/output; chạy trong sandbox đã tích hợp.
      `language-runners.integration.spec.ts`: 12/12 pass với Docker 29.8.2 và `JUDGE_DOCKER_IT=1`
      (2026-11-16); mỗi ngôn ngữ: chương trình đúng, lỗi cú pháp, lỗi runtime.
- [x] **JDG002-T15 — Injection tests:** language lạ, source chứa shell metacharacters, filename/path payload và stdin độc hại không làm đổi command/image/host path.
      `judge.engine.spec.ts`: language lạ, source/stdin chứa metacharacter (2026-11-16).
- [ ] **JDG002-T16 — Image/toolchain tests:** xác nhận image có đúng binary/version, không phụ thuộc network/package manager runtime; kiểm tra lỗi image thiếu được phân loại là hạ tầng.
- [ ] **JDG002-T17 — Traceability:** lập bảng FR-001..015 và AC-001..010 → adapter/test/evidence; kiểm tra tương thích FUNCTION/OOP strategies.
- [ ] **JDG002-T18 — Hoàn tất:** chạy `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` theo DoD khi có code; cập nhật plan/tasks/worked entry.

### Ma trận kiểm chứng tối thiểu

| AC         | Bằng chứng                                                                          |
| ---------- | ----------------------------------------------------------------------------------- |
| AC-001     | Mỗi language được chọn đúng adapter                                                 |
| AC-002     | Language không biết không khởi chạy Sandbox                                         |
| AC-003/005 | Source/stdin không đổi command/filename; request không cấp compiler/runtime command |
| AC-004     | Compile error được phân biệt với lỗi image/hạ tầng                                  |
| AC-006/007 | C dùng C17 và C++ dùng C++20 theo flags cố định; request không đổi artifact/flags   |
| AC-008     | Java dùng entrypoint/JVM options cố định và phân loại javac error                   |
| AC-009     | Python syntax check trước execute; isolated mode không đọc user site config host    |
| AC-010     | Diagnostics bounded theo byte và không lộ host path ngoài vùng cho phép             |

FR-014 (không cài package từ mạng khi chấm) được kiểm tra riêng qua image review; đây không phải AC độc lập.
