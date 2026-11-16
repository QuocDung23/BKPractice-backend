# Quiz và ngân hàng câu hỏi — backend MVP

Nguồn sản phẩm: [LRN-009 1.5 Approved](../../../../specs/02-learning/quizzes/spec.md).
Theo dõi triển khai: [tasks](../../../../specs/02-learning/quizzes/tasks.md).

## Luồng soạn nội dung

1. `POST /api/question-bank/questions` lưu câu hỏi vào ngân hàng, trả `id` và `revision.id`.
2. `POST /api/quizzes` tạo Quiz nháp, có thể chưa có câu hỏi.
3. `PUT /api/quizzes/:id/draft/questions` nhận toàn bộ danh sách có thứ tự:
   `{ "items": [{ "questionId": "<uuid>", "revisionId": "<uuid>" }] }`.
4. `POST /api/quizzes/:id/preview` trả nội dung được phép xem, `readiness` và `questionUpdates`.
   Mỗi update cho biết phiên bản đã chọn, phiên bản hiện tại và nguồn còn dùng được hay không.
5. `POST /api/quizzes/:id/publish` cố định draft thành published revision. Không có draft trả 409.
   Sửa title/description qua `PATCH /api/quizzes/:id/draft` hoặc thay danh sách câu sẽ tạo draft tiếp theo.
6. [Courses](../courses/quizzes.md) gắn Quiz đã publish vào một hoặc nhiều Chapter.

Tạo ngay trong bộ chọn là hai thao tác riêng. Nếu bước tạo câu thành công nhưng bước chọn lỗi,
client giữ ID đã nhận và thử chọn lại; không xoá bù hoặc tạo câu lần nữa. Replace danh sách là
nguyên tử: một item sai khiến toàn bộ danh sách không được thay.

Tạo/clone câu và Quiz nhận UUID qua header `Idempotency-Key`; body chỉ chứa dữ liệu nghiệp vụ.
Retry cùng key/payload trả lại cùng resource; đổi payload với cùng key trả 409. Hash lưu payload tạo
ban đầu, không đổi theo lần sửa nội dung. Key/hash lưu trên root Question/Quiz hiện có, không cần
bảng idempotency riêng.
Option ID có thể được cung cấp dưới dạng UUID; nếu bỏ qua server tạo ID mới cho revision đó.

## Quyền sử dụng và chia sẻ

LECTURER cần permission tương ứng và chỉ sửa nội dung mình tạo; ADMIN có permission sửa mọi nội dung.
Câu hỏi mới dùng chung cho LECTURER theo mặc định. Request có thể đặt `isPrivate: true` để giữ
riêng tư; câu private chỉ owner/ADMIN và các lecturer được cấp mới xem/dùng được. Câu hỏi chung
không cấp quyền sửa gốc; lecturer khác clone thành bản private để chỉnh sửa. Quiz mới vẫn riêng tư.
Owner hoặc ADMIN có thể đổi trạng thái bằng `PUT /api/question-bank/questions/:id/visibility`
với body `{ "isPrivate": true }` hoặc `false`.
`PUT /api/question-bank/questions/:id/shares` và
`PUT /api/quizzes/:id/shares` nhận `{ "userId": "<lecturer-uuid>", "enabled": true }`;
`false` thu hồi. Xác minh người nhận qua [Identity](../../identity/users/quiz-share-recipient.md).
Response quản lý có `sharedWith` cho owner/ADMIN; người nhận không thấy danh sách các người nhận khác.

Grant câu hỏi áp dụng cho câu private; grant cho phép dùng/clone, không sửa gốc. Publish Quiz không
tự chia sẻ cho mọi lecturer. Recipient chỉ
nhìn phiên bản Quiz đã publish, không thấy draft của chủ sở hữu. Thu hồi chặn chọn/clone mới và
publish draft dùng nguồn đó, giữ Quiz đã publish, bản clone và lịch sử. Preview draft sau thu hồi
không trả nội dung/đáp án nguồn bị thu hồi; `readiness` chỉ rõ `QUESTION_UNAVAILABLE:<id>`.

`POST .../:id/clone` nhận `Idempotency-Key` trong header, trả bản câu mới riêng tư của người thực hiện. Clone Quiz
sao chép sâu các phiên bản câu được chọn thành câu riêng; sửa bản sao không tác động bản gốc.

## Ngân hàng, tìm kiếm và giới hạn

- `GET /api/question-bank/questions`: `q`, `difficulty`, `topicId`, `tagId`, `page`, `limit`.
- `GET /api/question-bank/questions/:id`: phiên bản hiện tại trong scope.
- `POST /api/question-bank/questions/:id/revisions`: tạo phiên bản mới; không sửa phiên bản cũ.
- `GET /api/question-bank/questions/:id/usage`: metadata Quiz nằm trong phạm vi được đọc.
- `DELETE .../:id`, `POST .../:id/restore`: xoá mềm/khôi phục câu hoặc Quiz.
- `GET /api/quizzes/managed` hỗ trợ tìm title qua `q` và phân trang; `GET .../managed/:id` trả draft/published.
- `POST /api/quizzes/:id/hold`, `POST .../:id/republish`: ẩn/hiện lại bản đã phát hành.

Một câu có 2–6 options, đúng một đáp án; tối đa 50 câu/Quiz và 50 Quiz/Chapter. Title 200 ký tự,
content/explanation/description 20.000, option 5.000. Topic/Tag dùng danh mục Learning hiện có;
độ khó EASY/MEDIUM/HARD. Page/limit mặc định 1/20, limit tối đa 100. Lọc quyền trước count/phân trang,
tải revisions/grants/answers theo lô. Markdown chỉ là text, không chạy code; mobile phải render bằng
renderer an toàn theo contract nội dung hiện hành.

## Luồng mobile

| Request                                                   | Kết quả                                                                    |
| --------------------------------------------------------- | -------------------------------------------------------------------------- |
| `GET /api/quizzes/:id`                                    | Giới thiệu Quiz khi có liên kết Course PUBLISHED chưa xoá; không có đáp án |
| `POST /api/quizzes/:id/attempts`                          | Bắt đầu hoặc trả lại lượt IN_PROGRESS hiện có                              |
| `GET /api/quiz-attempts/:id`                              | Tiếp tục chính lượt của người gọi; feedback chỉ cho câu đã trả lời         |
| `PUT /api/quiz-attempts/:id/answers/:questionId`          | `{selectedOptionId}` → đúng/sai, đáp án đúng, giải thích câu đó            |
| `POST /api/quiz-attempts/:id/finish`                      | Chỉ khi đã trả lời đủ; trả tổng kết                                        |
| `GET /api/quiz-attempts/:id/result`                       | Review lượt FINISHED của chính người gọi                                   |
| `GET /api/quiz-attempts/me?quizId=<uuid>&page=1&limit=20` | Lịch sử cá nhân                                                            |
| `GET /api/quizzes/:id/completion/me`                      | Đã hoàn thành, điểm tốt nhất, revision đạt đầu tiên                        |

Start/finish không nhận điểm hay userId; body không có trường nghiệp vụ. Answer nhận duy nhất
option ID. Câu chưa trả lời không có `isCorrect`, đáp án đúng hay giải thích. Lựa chọn đầu tiên
bị khoá; cùng lựa chọn retry được cả sau finish, lựa chọn khác trả 409. Finish lặp trả kết quả cũ.
Chấm và lưu cùng transaction, phản hồi thành công sau commit; lỗi lưu không trả đáp án thành công.

Tổng kết có số đúng/sai/tổng, tỷ lệ, ngưỡng 90%, passed, thời điểm bắt đầu/kết thúc. Không suy ra
thời gian hoạt động thực từ thời gian mở app. Không giới hạn lượt/thời gian; một lượt đang làm
cho mỗi user/Quiz. Đạt bằng `correctCount * 100 >= totalQuestions * 90`, không làm tròn để xét đạt.

Attempt pin QuizRevision và QuestionRevision bất biến. Sửa/ẩn/xoá nguồn hoặc gỡ Chapter không đổi
đề/lịch sử cũ. Hide/delete chặn lượt mới, lượt đang làm vẫn tiếp tục được. Đạt một lần được công
nhận theo user + Quiz ở mọi Chapter/Course và giữ sau lần publish mới. % Progress Course vẫn chỉ
đếm Problem. ADMIN cũng không có quyền đọc attempt của người khác qua các API này.

## Triển khai và rollback

Learning thêm migration `1700000011000-Lrn009QuizQuestionBank`: 10 bảng gồm roots/revisions,
Quiz items, hai bảng grant, chapter links, attempts/answers. `synchronize=false`. Composite FK giữ
revision đúng root; unique một draft và một active attempt; root lock/unique answer bảo vệ cạnh tranh.
Public traffic phải qua Gateway; Learning giữ trong mạng nội bộ theo trusted-principal contract hiện có. Không có FK sang Identity. Không thêm event, Redis cache đáp án hoặc dịch vụ chấm riêng.

1. Backup database của môi trường đích; review hai migration mới của Identity và Learning.
2. Chạy migration Identity theo [hướng dẫn RBAC](../../identity/rbac/learning-quizzes.md), rồi Learning
   bằng quy trình deployment được cấp quyền (`pnpm migration:run:learning` là script của repo).
3. Cấu hình `IDENTITY_SERVICE_URL` cho Learning và cùng `INTERNAL_SERVICE_SECRET` cho hai service.
   Docker Compose đặt URL nội bộ Learning → Identity. Template `.env.example` đã có các key này.
4. Rollout Identity, Learning và Gateway; refresh/đăng nhập lại để nhận permission mới.
5. Smoke test lecturer A tạo/chia sẻ → B dùng/clone nhưng không sửa → publish/gắn Course → học/finish
   → thu hồi/hide → kiểm lịch sử và thử start mới. Swagger nằm theo cấu hình hiện hành của service.

Chưa chạy migration trên database thật. Down Learning xoá toàn bộ dữ liệu Quiz mới; không dùng để
rollback ứng dụng trên môi trường có lịch sử cần giữ. Ưu tiên rollback code, giữ schema; nếu buộc down
phải backup và chấp nhận phạm vi mất dữ liệu rõ ràng. Down Identity giữ catalog/pre-existing grants,
chỉ gỡ assignments do chính migration thêm; tránh chạy seed catalog mới sau khi rollback code cũ.

## Kiểm thử

Test tích hợp mới dùng `TEST_DATABASE_URL` trỏ database có tên kết thúc `_test`, không dùng URL dev.
`pnpm test --runTestsByPath apps/learning-service/src/modules/quizzes/quiz.integration.spec.ts` bao phủ
HTTP + PostgreSQL, pool một connection, contention bằng root lock ở pool hai connections, rollback,
retry, privacy, revision, chia sẻ/clone, Course links, phân trang và Swagger. Xem worked entry và
checklist để biết kết quả toàn repo và các gate baseline còn lỗi.

Frontend mobile, import/AI, XP/leaderboard, offline và màn ôn câu sai riêng ngoài phạm vi backend MVP.
