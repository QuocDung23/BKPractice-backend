# [OPS-001] Triển khai production tự động theo commit

## Trạng thái

Approved

## Mục tiêu

Mỗi commit được merge vào `main` và đã build/publish image thành công phải được triển khai tự động lên
VPS production BKPractice bằng đúng commit SHA, không cần người vận hành sửa tag image thủ công.

## Tác nhân

- GitHub Actions: build, publish image và yêu cầu triển khai.
- VPS production: pull image, thay container và kiểm tra health.
- Người vận hành: cấp SSH key chuyên dụng và quản lý GitHub Environment secrets.

## Bối cảnh

Workflow hiện tại chỉ publish image GHCR theo SHA. Compose production dùng tag image cố định, nên VPS
không tự cập nhật sau khi merge `main`.

## Yêu cầu chức năng

- **FR-001 — Điều kiện deploy:** Chỉ push vào `main` sau khi job `publish` thành công mới được triển khai.
- **FR-002 — Phiên bản chính xác:** Workflow MUST truyền `${{ github.sha }}` tới script production; không
  dùng tag `latest`.
- **FR-003 — Triển khai service:** Script production MUST pull và recreate Gateway, Identity, Learning,
  Submission và Judge với cùng SHA; Gateway được recreate sau các service phụ thuộc.
- **FR-004 — Kiểm tra sau deploy:** Script MUST chờ health check Compose và gọi `/health` của Gateway. Lỗi
  phải làm fail workflow.
- **FR-005 — Chống deploy đồng thời:** Chỉ một deployment production được chạy tại một thời điểm.
- **FR-006 — SSH tối thiểu:** GitHub Actions MUST kết nối bằng user deploy riêng, key riêng và host key đã
  được pin; user chỉ được sudo script deploy cố định.

## Quy tắc nghiệp vụ

- Image SHA đã publish là đơn vị phát hành; không build source trên VPS.
- Production secrets chỉ ở `/srv/bkpractice/production.env`; không được đưa vào repository, workflow log,
  hay GitHub Actions output.
- Migration không tự chạy trong OPS-001. Mỗi migration cần một quy trình phát hành được phê duyệt riêng.

## Đầu vào

- Commit SHA 40 ký tự từ GitHub Actions.
- GitHub Environment secrets: host, port, deploy username, private key và known-hosts entry.

## Đầu ra

- Workflow deploy thành công và Gateway `/health` trả thành công.
- Workflow fail rõ ràng nếu SSH, pull, Compose health check hoặc Gateway health check thất bại.

## Tình huống lỗi

- Secrets thiếu hoặc SSH host key không khớp: workflow fail trước khi chạy lệnh trên VPS.
- Image không pull được hoặc service không healthy: script exit khác 0, job deploy fail.
- Deploy khác đang chạy: script từ chối job mới, không chạy hai Compose update đồng thời.

## Tiêu chí nghiệm thu

- **AC-001:** Push `main` có image publish thành công tạo một deployment job với đúng SHA commit.
- **AC-002:** Workflow không thể chạy `latest` hoặc một tag khác SHA commit.
- **AC-003:** Deployment thành công chỉ khi cả Compose health check và Gateway `/health` thành công.
- **AC-004:** Một push mới không chạy chồng deployment production đang hoạt động.
- **AC-005:** Không secret SSH hoặc production nào xuất hiện trong repository hay workflow output.

## Ngoài phạm vi

- Tự chạy migration, rollback tự động, hay deploy frontend.
- Thay đổi endpoint, business service, schema database hoặc secret production.

## Phụ thuộc

- GitHub Actions workflow `build-images.yml` publish image GHCR theo commit SHA.
- VPS `/srv/bkpractice`, Docker Compose, `production.env` và root-owned deploy script.

## Câu hỏi mở

Không còn. Chủ sở hữu đã xác nhận dùng SSH key chuyên dụng, không dùng key SSH cá nhân.

## Lịch sử sửa đổi

| Ngày       | Phiên bản | Tác giả/Người review | Tóm tắt                                  |
| ---------- | --------- | -------------------- | ---------------------------------------- |
| 2026-11-15 | 1.0       | Chủ sở hữu / Codex   | Phê duyệt auto-deploy SHA image qua SSH. |
