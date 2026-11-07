# JDG-002 Language Runners

## Trạng thái

Approved — phiên bản 1.0, ngày 2026-10-07.

## Mục tiêu

Định nghĩa hành vi quan sát được và giới hạn tin cậy của các runner ngôn ngữ mà Judge hỗ trợ.

## Tác nhân và bối cảnh

Submission gửi mã nguồn và mã ngôn ngữ trong JudgeRequest; Judge chọn một runner đã được nền tảng
đăng ký. Runner dùng image/toolchain được quản trị tin cậy để biên dịch/thực thi trong sandbox.
Danh mục hiện có là C, C++, Java và Python. Bảng dưới là contract toolchain đã duyệt kèm phiên bản
image nền; thay đổi cờ, entrypoint hoặc image là thay đổi contract phải qua duyệt tương thích.

| Key      | Nguồn                                            | Image nền (đã ghim)      | Compile                    | Execute              |
| -------- | ------------------------------------------------ | ------------------------ | -------------------------- | -------------------- |
| `c`      | `docker/judge/c/Dockerfile`, `CRunner`           | `alpine:3.22` (gcc)      | `gcc -std=c17 -O2 -pipe`   | `./main`             |
| `cpp`    | `docker/judge/cpp/Dockerfile`, `CppRunner`       | `alpine:3.22` (g++)      | `g++ -std=c++20 -O2 -pipe` | `./main`             |
| `java`   | `docker/judge/java/Dockerfile`, `JavaRunner`     | `eclipse-temurin:21-jdk` | `javac -encoding UTF-8`    | `java -Xss16m Main`  |
| `python` | `docker/judge/python/Dockerfile`, `PythonRunner` | `python:3.13-alpine`     | `python3 -m py_compile`    | `python3 -I main.py` |

Image runtime mang tag `:latest` do pipeline build cục bộ; phiên bản nền là hai đại sayı bên trái và
chỉ đổi qua quy trình thay đổi được duyệt. Request không cung cấp image, compiler version hay flags.

## Yêu cầu chức năng

**JDG-002-FR-001:** Judge MUST chỉ chấp nhận giá trị language nằm trong danh mục đã phê duyệt dùng
chung; hiện contract liệt kê `c`, `cpp`, `java`, `python`.

- **JDG-002-FR-002:** Mỗi ngôn ngữ MUST ánh xạ duy nhất tới adapter tin cậy có quy tắc file nguồn,
  compiler và command runtime do nền tảng kiểm soát.
- **JDG-002-FR-003:** Không giá trị nào trong sourceCode/stdin được nối vào executable, filename,
  shell command, compiler flag hoặc image name.
- **JDG-002-FR-004:** Language không được hỗ trợ MUST bị từ chối trước khi tạo/running container.
- **JDG-002-FR-005:** Runner MUST xác định riêng compile-needed hay interpreted execution; Python
  MUST chạy `py_compile` làm bước kiểm tra cú pháp trước khi thực thi và lỗi cú pháp MUST được phân
  loại `COMPILE_ERROR`, không phải lỗi runtime.
- **JDG-002-FR-006:** Compiler stdout/stderr MUST được thu thập có giới hạn; lỗi biên dịch được phân
  loại riêng với lỗi khi chạy chương trình.
- **JDG-002-FR-007:** Image/toolchain MUST do môi trường tin cậy cung cấp; request MUST NOT chọn image,
  compiler version hay flags.
- **JDG-002-FR-008:** Thêm, bỏ hoặc đổi ngôn ngữ là thay đổi contract phải tương thích với danh mục
  Learning, Submission và Judge.
- **JDG-002-FR-009:** Runner MUST hỗ trợ semantics chuẩn hóa của JDG-001 và nhận giới hạn từ request
  đã được kiểm tra, chịu trần nền tảng.
- **JDG-002-FR-010:** Mỗi runner MUST xác định encoding source và tên file theo contract language;
  đầu vào được ghi UTF-8 trừ khi contract language quy định rõ khác.
- **JDG-002-FR-011:** C/C++ compile diagnostics, Java diagnostics và Python syntax diagnostics MUST
  được thu nhận theo giới hạn output của JDG-005; dữ liệu đường dẫn host nội bộ phải được lọc.
- **JDG-002-FR-012:** Java execution MUST dùng entrypoint `Main` với file nguồn `Main.java`; các lớp
  bổ sung chỉ được phép nằm trong chính `Main.java`. Request không thể chọn tên class, package, JVM
  options, stack size hay classpath.
- **JDG-002-FR-013:** Python execution MUST dùng chế độ isolated hiện được chọn (`-I`) hoặc policy
  bảo vệ tương đương; không nạp cấu hình người dùng từ host.
- **JDG-002-FR-014:** Runner MUST không cài package/dependency từ mạng ở thời điểm compile/run.
- **JDG-002-FR-015:** Thay đổi compiler flags, entrypoint hoặc image có thể làm thay đổi đáp án và
  MUST được kiểm soát như thay đổi tương thích runner.
- **JDG-002-FR-016 — Trần thực thi:** `sourceCode` tối đa 1 MiB theo JDG-001. Thời hạn biên dịch là
  `max(3 × timeLimitMs, 10.000)` ms; biên dịch quá hạn phân loại `TIME_LIMIT_EXCEEDED` theo
  JDG-001. Diagnostics biên dịch bị giới hạn bởi trần output của JDG-005.

## Quy tắc nghiệp vụ và đầu vào/đầu ra

Input là `language`, `sourceCode`, mode/problem type, stdin/test cases và execution limits. Output là
compile diagnostics hoặc execution result để pipeline phân loại. Tên file và command là chi tiết
đáng tin của runner, không phải dữ liệu request. Contract cam kết bốn ngôn ngữ và bảng toolchain đã
ghim ở trên; thêm ngôn ngữ là thay đổi contract do Learning sở hữu danh mục, phải duyệt đồng bộ
Learning/Submission/Judge.

## Lỗi và tình huống biên

Language lạ; source rỗng/quá lớn; lỗi syntax/compile; runtime thiếu artifact; image không tồn tại;
UTF-8; filename/class name Java; version toolchain lệch giữa môi trường; compiler hết giờ; resource
limit bị chạm. Lỗi image/toolchain là `INTERNAL_ERROR`, lỗi source compile là `COMPILE_ERROR`.

## Tiêu chí nghiệm thu

- **JDG-002-AC-001:** Mỗi language đã phê duyệt được chọn đúng adapter.
- **JDG-002-AC-002:** Language không biết không khởi chạy sandbox.
- **JDG-002-AC-003:** Dữ liệu source/stdin không thể thay đổi command hay filename của runner.
- **JDG-002-AC-004:** Compile error và lỗi hạ tầng image được phân biệt.
- **JDG-002-AC-005:** Không runner nào nhận compiler/runtime command từ payload.
- **JDG-002-AC-006:** `c` compile với C17 flags do adapter quy định và chạy artifact đã build; request
  không thể thay flags hoặc binary path.
- **JDG-002-AC-007:** `cpp` compile với C++20 flags do adapter quy định và chạy artifact đã build;
  request không thể thay flags hoặc binary path.
- **JDG-002-AC-008:** `java` dùng entrypoint đã quy định; lỗi `javac` được phân loại compile error và
  runtime dùng JVM options cố định.
- **JDG-002-AC-009:** `python` syntax/compile check xảy ra trước execute theo policy được duyệt; execute
  dùng isolated mode và không đọc user site config từ host.
- **JDG-002-AC-010:** Diagnostics bị giới hạn theo byte và không tiết lộ đường dẫn host ngoài vùng
  làm việc được cho phép.

## Ngoài phạm vi

Quy tắc verdict/output chung (JDG-001), FUNCTION/OOP (JDG-003/004), isolation chi tiết (JDG-005),
IDE/editor, package manager hay thư viện tùy ý do người dùng cài.

## Phụ thuộc

[JDG-001](../standard-judge/spec.md), [JDG-005](../sandbox/spec.md), LRN-001, transport contract
`JudgeRequest`, [Judge security](../../00-system/judge-security.md).

## Quyết định khi duyệt

Phiên bản này được duyệt ngày 2026-10-07 theo phiếu [`.docs/specs/04-judge/REVIEW.md`](../REVIEW.md):

| Quyết định | Nội dung chốt                                                                                                                                                            |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D-08.1     | Ghim toolchain theo bảng trên: alpine 3.22 (C/C++), temurin 21 (Java), python 3.13 (Python); image `:latest` build cục bộ; nâng cấp image là contract change phải duyệt. |
| D-08.2     | Java bắt buộc file `Main.java`, entrypoint `Main`; các lớp bổ sung nằm trong cùng file. Không hỗ trợ multi-file.                                                         |
| D-08.3     | Python `py_compile` là yêu cầu sản phẩm: lỗi cú pháp → `COMPILE_ERROR`.                                                                                                  |
| D-08.4     | Không thêm ngôn ngữ trong bản này; Learning sở hữu danh mục chuẩn; thêm/bỏ ngôn ngữ phải duyệt đồng bộ ba service.                                                       |
| D-08.5     | `sourceCode` ≤ 1 MiB; compile timeout `max(3 × timeLimitMs, 10s)` → `TIME_LIMIT_EXCEEDED`; diagnostics theo trần output của JDG-005.                                     |

## Lịch sử sửa đổi

| Ngày       | Phiên bản | Tác giả/Người review    | Tóm tắt                                                                                     |
| ---------- | --------- | ----------------------- | ------------------------------------------------------------------------------------------- |
| 2026-09-30 | 0.1       | Codex / chờ review      | SRS đề xuất                                                                                 |
| 2026-09-30 | 0.2       | Codex / chờ review      | Thêm baseline runner hiện tại và compatibility requirements                                 |
| 2026-10-07 | 1.0       | Codex / Chủ sở hữu repo | Duyệt: ghim toolchain, Java Main, Python compile check, source/compile/output limits (D-08) |
