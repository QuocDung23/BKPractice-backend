# 2026-11-07 — Lập review plan KNN + semantic Recommendation

- Author: Codex, theo yêu cầu chủ dự án.
- Scope: Documentation only; viết bản review chi tiết cho triển khai sau, chưa triển khai Recommendation.

## Spec and plan

- Spec: [LRN-007 hiện hành](../../../specs/02-learning/recommendation/spec.md), được điều chỉnh phạm vi tự học bởi [LRN-008](../../../specs/02-learning/self-study/spec.md).
- Plan hiện hành: [Recommendation plan](../../../specs/02-learning/recommendation/plan.md).
- Tasks hiện hành: [Recommendation tasks](../../../specs/02-learning/recommendation/tasks.md); không sửa hoặc đánh dấu hoàn tất.
- Bản review mới: [LRN-007 KNN + semantic](../../../../review/LRN-007-knn-semantic-recommendation-plan.md).
- Spec status at start: Approved cho hướng theo luật, không ML. Review mới là Proposed, chưa thay thế spec Approved.
- Lý do chỉ viết tài liệu: chủ dự án yêu cầu lập plan chi tiết và nói rõ chưa code. Không chuyển sang giai đoạn triển khai SDD hoặc sửa ngầm các yêu cầu Approved.

## Questions clarified

| Question                                           | Conclusion                                                                                   | Source                                                        |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Dùng luật hay semantic?                            | Chủ dự án chọn KNN trên vector nội dung và semantic làm nguồn chính.                         | Câu trả lời trong phiên lập plan                              |
| Dùng KNN người dùng không?                         | Không; chỉ dùng vector nội dung và tiến độ của chính người gọi.                              | Lựa chọn KNN trên nội dung của chủ dự án                      |
| Model đặt ở đâu?                                   | Local CPU, ưu tiên nhẹ; đề xuất q8 và index theo đợt, không nạp model ở HTTP.                | Yêu cầu máy hạn chế tài nguyên; thiết kế đề xuất trong review |
| Viết ở đâu?                                        | `review/` theo yêu cầu; đây là thư mục đã tồn tại và đang bị ignore. Không sửa `.gitignore`. | Yêu cầu chủ dự án và `.gitignore`                             |
| Có sửa spec hoặc bắt đầu code không?               | Không; ghi rõ phần cần duyệt lại trước triển khai.                                           | Yêu cầu chưa code; working agreement                          |
| Các thông số K/model/schema đã được Approved chưa? | Là mặc định Proposed của review, chưa phải thay đổi spec.                                    | Trạng thái tài liệu review                                    |

## What was done

Tạo tài liệu review chi tiết tại `review/LRN-007-knn-semantic-recommendation-plan.md`. Nội dung bao gồm mục tiêu người học, hiện trạng repo, bảng chênh lệch với spec hiện hành, sơ đồ kiến trúc, vai trò từng tầng, bố trí file/port/use case, model CPU q8, canonicalization và hash, schema embedding dẫn xuất, luồng CLI incremental và exact KNN, API/response minh hoạ, xử lý lỗi/nhất quán dữ liệu, kiểm thử, benchmark và rollout/rollback tương lai.

Tài liệu phân biệt quyết định của chủ dự án với mặc định kỹ thuật mới đề xuất. Ví dụ cosine/response/CLI summary đều được ghi rõ là minh hoạ, không phải kết quả chạy thực tế.

## Why these choices

Chọn hướng nội dung theo yêu cầu chủ dự án; tách việc tạo vector khỏi HTTP để giảm tài nguyên thường trú. PostgreSQL `real[]` và exact KNN được đề xuất cho bản đầu để tận dụng hạ tầng có sẵn, chưa cần extension hoặc service mới. Độ khó và Course fallback giúp gợi ý không chỉ dựa vào sự gần nghĩa của câu chữ.

Giữ Recommendation trong Learning theo ADR 0002 và kiến trúc hiện hành. Không thay spec đang Approved, vì nó vẫn cấm ML; bảng đối chiếu trong review chỉ rõ việc cần duyệt lại trước khi triển khai.

## How the feature works

Đây là công việc tài liệu, chưa có feature runtime mới:

1. Đọc working agreement, tài liệu Recommendation/Learning và pattern review sẵn có.
2. Dùng CodeGraph kiểm tra các điểm nền Problems, Progress và Gateway; kiểm tra alias/runtime manifest mà không đọc file môi trường bí mật.
3. Ghi kế hoạch Proposed ở vị trí chủ dự án yêu cầu, mô tả hai luồng tương lai: CLI tạo/lưu embedding và GET đọc vector để xếp hạng.
4. Ghi riêng các gate cần làm sau: duyệt spec mới, spike model nhẹ, triển khai, kiểm thử và đánh giá.
5. Người đọc có tài liệu để review, chưa có endpoint, bảng hoặc model được cài/chạy thêm.

## Configuration

No configuration change.

Tên env/script/schema trong review là đề xuất tương lai; chưa thêm vào source, package.json, migration hoặc template cấu hình. Không sửa spec/plan/tasks Approved, dependency, lockfile hoặc Docker.

## Verification

- Đọc lại tài liệu, kiểm tra link local, JSON minh hoạ và bố cục Markdown.
- Đã chạy Prettier riêng cho hai file Markdown; kiểm tra lại bằng `prettier --check`, không format source hay toàn repo.
- Kiểm tra diff/whitespace và xác nhận chỉ tạo tài liệu review cùng worked entry này.
- Xác nhận `review/` bị ignore; review được lưu local và không tự vào commit.
- Không chạy lint/typecheck/test/build, migration, inference hoặc benchmark: không có thay đổi code/configuration và các kết quả đó không được tuyên bố đã chạy.
- Không chạy CodeGraph sync/index: không có source change.

## Remaining

- Chưa sửa hoặc duyệt lại spec cho hướng ML; chưa triển khai bất kỳ bước source/migration/configuration nào của review.
- Chưa khoá artifact/runtime revision, download model hoặc đo RAM/latency/chất lượng thực tế.
- Chưa commit/push; chủ dự án chưa yêu cầu ở lượt này.
- Review nằm trong directory bị ignore. Muốn chia sẻ bằng Git sau này cần quyết định riêng về cách đưa tài liệu vào version control; không tự thay đổi trong công việc này.
