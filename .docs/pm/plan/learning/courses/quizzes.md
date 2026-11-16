# Quiz trong Chapter

Theo [LRN-009 1.3](../../../../specs/02-learning/quizzes/spec.md), Course aggregate giữ `quizRefs`
riêng với `problemRefs`. Tối đa 50 Quiz/Chapter; cặp Chapter/Quiz duy nhất, cùng Quiz dùng được ở
nhiều Chapter/Course. Reorder phải gửi đúng tập ID hiện có.

- `POST /api/courses/:id/chapters/:chapterId/quizzes`: `{quizId, position?}`, trả 201 managed Course.
- `DELETE .../quizzes/:quizId`: 204, chỉ gỡ link.
- `PUT .../quizzes/order`: `{ids: [...]}`, trả 200 managed Course.

Cần `course:update` và quyền quản lý Course (LECTURER owner, ADMIN mọi Course). Attach kiểm Quiz
PUBLISHED chưa xoá và owner/ADMIN/grant sử dụng. Gỡ/sắp xếp link thuộc quyền Course; không xoá Quiz,
câu hoặc attempt. Course repository lưu links trong transaction của aggregate và bảo toàn links khi
sửa title, Chapter hoặc Problem. Không gọi write repository Quizzes.

CourseQuizCatalog đọc projection qua adapter; Quizzes không import ngược CoursesModule. Learner
Course chỉ trả summary `{id,title}` của Quiz published chưa xoá, không có đáp án. Managed summary
có thêm status. Course readiness chấp nhận ít nhất một Problem hoặc Quiz published chưa xoá và trả
`PUBLISHED_CONTENT_REQUIRED` nếu không còn nội dung khả dụng. Progress tính mỗi Problem/Quiz hiển thị
là một Learning Item. Xem [luồng Quiz](../quizzes/README.md) cho chính sách attempt/version/thu hồi.
