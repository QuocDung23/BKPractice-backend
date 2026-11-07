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

- `pnpm exec jest apps/judge-service --runInBand`: 31 unit test pass, 11 integration skip mặc định.
- `pnpm build:judge`: thành công. `pnpm exec eslint apps/judge-service`: sạch.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`: chỉ lỗi ở `test/account-import.integration.spec.ts`
  (`officialName`), có sẵn trên `origin/main`, ngoài phạm vi Judge.
- Docker Desktop 29.8.2: `pnpm judge:images:build` rồi
  `JUDGE_DOCKER_IT=1 pnpm exec jest docker-sandbox.adapter.integration --runInBand` → 11/11 pass;
  sau khi chạy `docker ps -aq --filter label=bkpractice.judge.sandbox=1` rỗng.
- Not verified: compose với `USER node` + `group_add` trên host Linux; hành vi trên Linux host
  thật (Docker Desktop chạy trong VM, quyền bind mount khác Linux).

## Security review (T20)

| SR/AC                          | Bằng chứng                                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------------------- |
| SR-001, AC-001/008             | `--network none`; IT "no network access"; không có `--privileged` (unit)                          |
| SR-002/014, AC-002             | `--cpus 1`, `--memory`=`--memory-swap`; trần không lấy từ request ngoài memory (unit)             |
| SR-003                         | `--pids-limit 64`; IT fork bomb dừng dưới 64                                                      |
| SR-004/010, AC-013             | `runBoundedProcess` gộp byte, cắt đúng trần và kill (unit + IT output flood)                      |
| SR-005                         | `--user 1000:1000`, `--cap-drop ALL`, `no-new-privileges` (unit); IT xác nhận UID 1000            |
| SR-006/015, AC-009             | `--read-only`, tmpfs `/tmp` 64 MiB `noexec,nosuid`; IT ghi `/etc` bị từ chối, đầy tmpfs → ENOSPC  |
| SR-007, AC-006                 | argv không qua shell; image/command từ runner; unit "never passes stdin or source through argv"   |
| SR-008, AC-004                 | `mkdtemp` riêng mỗi request; IT hai workspace song song                                           |
| SR-009/011/020, AC-003/005/011 | `kill` khi timeout/flood, `rm --force` trong `finally`; IT không còn container                    |
| SR-012, AC-007                 | create/inspect/binary lỗi → `SandboxUnavailableError` → `INTERNAL_ERROR` (unit adapter + engine)  |
| SR-013                         | Workspace xoá sau request; không lưu gì khác                                                      |
| SR-016                         | Thư mục `0700`, file `0600`; worker UID 1000 (unit, kiểm tra mode trên non-Windows)               |
| SR-017, AC-010                 | Tên file whitelist; IT `..`/symlink không đọc được file host cạnh workspace                       |
| SR-019, AC-012                 | Tên container có `randomUUID()` (unit)                                                            |
| SR-021                         | Port không phụ thuộc RabbitMQ/ACK; adapter chỉ trả outcome kỹ thuật                               |
| SR-022, AC-015                 | `inspect .State.OOMKilled`; IT OOM thật và exit 137 tự nguyện                                     |
| AC-014                         | Compile `max(3×TL, 10s)` → TLE khi quá hạn (unit engine)                                          |
| Log                            | Log chỉ có `executionId`, stage, tên lỗi, stderr Docker ≤500 byte; không log source/stdin/harness |

N/A theo D-11.5: quota disk workspace, FD limit, seccomp/apparmor — không thêm trong bản này.

Rủi ro mới do bỏ `--rm`: worker chết giữa `create` và `rm` để lại container. Container được gắn label
`bkpractice.judge.sandbox=1`; README ghi lệnh dọn thủ công. Không tự quét khi khởi động vì nhiều
worker có thể chạy song song và sẽ xoá container của nhau.

## Remaining

- Chạy thử compose `USER node` + `group_add` trên host Linux trước khi deploy.
- JDG-001 sửa các deviation còn lại: `score || 100`, stage validate payload, poison message/ACK.
- Xác nhận cách hiểu D-07.1 với chủ sở hữu repo.
