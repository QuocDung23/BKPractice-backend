# 2026-11-07 — JDG-005 Sandbox port và Docker adapter

- Author: Claude Code; chủ sở hữu repo duyệt thiết kế trong hội thoại.
- Scope: Judge service (`apps/judge-service`), cấu hình chạy worker (`docker/judge/Dockerfile.worker`,
  `docker-compose.yml`, `.env.example`, `README.md`). Không đổi contract, không có migration.
- Nhánh: `feat/judge-service` tạo từ `origin/main` (`f0f225c`).

## Spec and plan

- Spec: [JDG-005 Sandbox](../../../specs/04-judge/sandbox/spec.md) v1.0 Approved 2026-10-07.
- Plan: [plan](../../../specs/04-judge/sandbox/plan.md) Reviewed; tasks: [tasks](../../../specs/04-judge/sandbox/tasks.md).
- Spec status at start: bản Approved chỉ có ở nhánh `docs/approve-judge-srs` (đường dẫn cũ `specs/`);
  đã port vào `.docs/` ở commit `2744155` trước khi sửa code.

## Questions clarified

| Question                                                              | Conclusion                                                                                     | Source                       |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------- |
| SR-016: bỏ `0777` thì container UID 1000 ghi workspace bằng cách nào? | Worker chạy cùng UID 1000; thư mục `0700`, file `0600`; trên Linux sai UID thì không khởi động | Người dùng chọn, 2026-11-07  |
| SR-022: `--rm` xoá container trước khi đọc được `OOMKilled`           | Bỏ `--rm`; vòng đời `create` → `start -ai` → `inspect` → `rm -f` trong `finally`               | Người dùng chọn, 2026-11-07  |
| Kiểm chứng cần Docker thật?                                           | Viết integration test opt-in (`JUDGE_DOCKER_IT=1`); người dùng sẽ bật Docker Desktop để chạy   | Người dùng chọn, 2026-11-07  |
| D-07.1 "không giữ result" khác JDG-001-FR-017 "không làm mất result"  | Hiểu là Judge không lưu result; result vẫn publish theo FR-017                                 | Đối chiếu spec, chờ xác nhận |

## What was done

- Thêm outbound port `SandboxPort` (`application/ports/out/sandbox.port.ts`, token `SANDBOX_PORT`)
  với `createWorkspace` / `execute` / `disposeWorkspace`; core không còn biết host path hay Docker.
- Thêm `SandboxUnavailableError` cho lỗi hạ tầng, message chung không lộ chi tiết host.
- `DockerSandboxAdapter` thay `DockerSandboxExecutor`: tạo workspace `0700`/`0600` (chặn tên file
  không an toàn, `wx`), chạy container theo `create/start/inspect/rm`, đọc `State.OOMKilled`, kill
  container khi timeout hoặc vượt output, luôn `rm --force`, log cleanup lỗi chỉ với
  `executionId`/stage.
- `runBoundedProcess`: spawn không qua shell, gộp byte stdout+stderr, cắt đúng trần và kill.
- `buildDockerCreateArgs`/`createContainerName`: giữ nguyên toàn bộ control D-11; tên container có
  `randomUUID()` nên không trùng/không điều khiển chéo.
- `JudgeEngine` phụ thuộc `SANDBOX_PORT`; MLE chỉ khi `oomKilled`, exit 137 đơn lẻ → `RUNTIME_ERROR`;
  compile timeout luôn → `TIME_LIMIT_EXCEEDED`; workspace luôn được dispose.
- Worker image chạy `USER node` (UID 1000), compose thêm `group_add: DOCKER_GID` để truy cập
  `docker.sock`.

## Why these choices

Tách port theo ADR 0002/kiến trúc Judge để test engine không cần Docker và để thay backend sau này.
`create/inspect` là cách duy nhất có tín hiệu OOM từ runtime và phân biệt lỗi daemon/image (create
thất bại) với exit code của bài làm — exit 125/127 của `docker run` cũ không phân biệt được. Chạy
worker cùng UID tránh cần root/chown và tránh quyền world-writable.

## How the feature works

Engine gọi `createWorkspace(executionId, [source])` → adapter tạo `JUDGE_WORKSPACE_ROOT/<id>-XXXX`
quyền owner-only. Mỗi stage (`compile`, `test-N`) gọi `execute`: `docker create` với các trần cố
định, `docker start --attach --interactive` truyền stdin và thu output có trần, khi timeout/vượt
output thì `docker kill`, sau đó `docker inspect` lấy `ExitCode`/`OOMKilled`, cuối cùng
`docker rm --force`. Lỗi create/inspect/binary → `SandboxUnavailableError` → engine trả
`INTERNAL_ERROR`. `finally` của engine gọi `disposeWorkspace`; lỗi dọn chỉ ghi log.

## Configuration

- Không thêm key cho app. `.env.example` thêm `DOCKER_GID` (chỉ dùng cho compose).
- Trên Linux worker phải chạy UID 1000 và `.judge-workspaces` phải thuộc UID 1000 (README).

## Verification

- `pnpm exec jest apps/judge-service --runInBand`: 5 suite pass, 31 test pass, 1 suite integration skip.
- `pnpm build:judge`: thành công.
- `pnpm exec eslint apps/judge-service`: sạch.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`: chỉ lỗi ở `test/account-import.integration.spec.ts`
  (`officialName`), có sẵn trên `origin/main`, ngoài phạm vi Judge.
- Not verified: integration test Docker thật (network, UID/fs, timeout, output flood, OOM, exit 137,
  workspace song song) — Docker daemon đang tắt; chạy bằng
  `pnpm judge:images:build` rồi `JUDGE_DOCKER_IT=1 pnpm exec jest docker-sandbox.adapter.integration --runInBand`.
  Compose với `USER node` + `group_add` chưa chạy thử.

## Remaining

- Chạy integration test với Docker (T16–T19), bổ sung thử symlink/path, disk fill tmpfs, PID flood (T10/T16/T17).
- T20 security review và T21 hoàn tất sau khi có evidence Docker.
- JDG-001 sửa các deviation còn lại: `score || 100`, stage validate payload, poison message/ACK.
- Xác nhận cách hiểu D-07.1 với chủ sở hữu repo.
