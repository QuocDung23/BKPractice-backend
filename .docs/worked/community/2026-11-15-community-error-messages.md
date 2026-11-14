# 2026-11-15 — Thông báo lỗi rõ ràng cho Community

- Author: Claude (theo yêu cầu của chủ repo)
- Scope: `apps/community-service/src/modules/posts`. Không đổi status HTTP hay logic nghiệp vụ.

## Spec and plan

- Spec: `.docs/specs/00-system/error-responses/spec.md` (ERR-001), FR-001, FR-003, FR-009
- Plan: `.docs/specs/00-system/error-responses/plan.md`, bước 5 (phần Community)
- Tasks: `.docs/specs/00-system/error-responses/tasks.md`
- Spec status at start: Approved (2026-11-14)

## Questions clarified

| Question                                               | Conclusion                                    | Source                      |
| ------------------------------------------------------ | --------------------------------------------- | --------------------------- |
| Có đổi status HTTP không?                              | Không, giữ nguyên 404 và 422                  | ERR-001 Quy tắc nghiệp vụ   |
| Có thêm kiểm tra `x-auth-user-id` hay `ParseUUIDPipe`? | Không; đó là đổi hành vi, ghi ở mục Remaining | Phạm vi "chỉ sửa thông báo" |

## What was done

- Thêm `posts/post-errors.ts`: bảng `POST_ERRORS` và `createPostError` (trả `AppHttpException`).
- `posts.service.ts` thay 4 chỗ ném lỗi Nest mặc định:
  - `POST_NOT_FOUND` (404), dùng khi bình luận hoặc thích một bài viết không tồn tại hay đã bị ẩn.
  - `COMMENT_PARENT_NOT_FOUND` (404), khi bình luận cha không tồn tại hoặc thuộc bài khác.
  - `COMMENT_REPLY_DEPTH_EXCEEDED` (422), khi trả lời một câu trả lời.
- Thêm `post-errors.spec.ts` (status, `code`, mã không trùng) và `posts.service.spec.ts` (4 nhánh lỗi).

## Why these choices

- `PostsService` hiện đã ném exception của Nest trực tiếp (trạng thái chuyển tiếp ghi trong CLAUDE.md), nên chỉ thay loại exception, không tách lớp mới.
- Message của `POST_NOT_FOUND` dùng chung cho "không tồn tại" và "đã ẩn" để không cho người ngoài phân biệt hai trường hợp.
- Mã có tiền tố `POST_` và `COMMENT_` theo module như quy ước ERR-001.

## How the feature works

1. Gateway chuyển `POST /posts/:id/comments` hoặc `/reactions/like` tới Community.
2. `PostsService` kiểm tra bài viết và bình luận cha.
3. Khi vi phạm, nó ném `AppHttpException` có `code` và message tiếng Việt.
4. `AllExceptionsFilter` toàn cục trả body chuẩn kèm `requestId`.

## Configuration

No configuration change.

## Verification

- Commands run and their results:
  - `pnpm typecheck`, `pnpm exec eslint` (file đã sửa): passed.
  - `pnpm exec jest apps/submission-service apps/community-service --runInBand`: passed (31 suites, 162 tests).
  - `codegraph sync .`: done.
- Not verified:
  - Chưa chạy với DB thật hoặc qua Gateway.

## Remaining

- Not done:
  - `x-auth-user-id` thiếu: controller đọc header không kiểm tra, `userId` undefined sẽ gây lỗi DB và thành `500`. Cần quyết định có thêm kiểm tra (đổi status 500 thành 401) hay không.
  - Tham số `:id` sai UUID cũng gây lỗi Postgres `22P02` thành `500`; nên thêm `ParseUUIDPipe` (đổi 500 thành 400).
  - `GET /posts` và `POST /posts` không có lỗi nghiệp vụ nào cần đặt tên.
- Risks:
  - Frontend đọc message tiếng Anh cũ ("Post not found") sẽ thấy câu mới; nên rẽ nhánh theo `code`.
