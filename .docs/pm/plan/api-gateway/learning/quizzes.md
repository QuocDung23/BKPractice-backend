# Gateway cho Quiz Learning

Gateway mở allowlist method/path tường minh cho `/api/question-bank/questions`, `/api/quizzes`,
`/api/quiz-attempts` và các link `/api/courses/:id/chapters/:chapterId/quizzes`.
`PUT /api/question-bank/questions/:id/visibility` cập nhật visibility câu hỏi.
Các route cụ thể theo [Quiz API](../../learning/quizzes/README.md) và [Course links](../../learning/courses/quizzes.md).
Không thêm wildcard, không proxy `/internal/users/:id/roles`.

Giữ middleware xác minh session/principal, cookie/CSRF hiện có và loại header nội bộ của client.
Gateway không đọc DB/chấm Quiz/kiểm ownership. Query/body/status đi qua Learning; 400/401/403/404/409/503
không bị chuyển thành kết quả học thành công. Route lạ/method sai hoặc traversal bị chặn trước upstream.

`quiz-routes.spec.ts` kiểm method/path, query/body, upstream conflict, lọc cookie/internal credential,
route âm tính và traversal. Auth/session/CSRF tiếp tục được kiểm qua bộ regression middleware/proxy.
Không có cấu hình mới riêng cho Gateway; tiếp tục dùng `LEARNING_SERVICE_URL`.
