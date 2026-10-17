# Cài và cập nhật bản 3.0

Người dùng xác nhận chưa có dữ liệu nghiệp vụ: có thể bắt đầu với bộ danh mục sạch. Project không tự xóa database đang có.

## Cài mới

1. Giải nén; mở Docker Desktop.
2. Mở Terminal tại thư mục có docker-compose.yml.
3. Chạy `bash scripts/start-local.sh`.
4. Mở http://localhost:3000; xem email/password bootstrap trong `.env`, đổi mật khẩu lần đầu.
5. Vào Danh mục dùng chung → Sản phẩm/Mẫu → SKU → Bảng giá → CTV/Khách → Báo giá.

Nếu cổng 3000/8080/5432 đang bị project cũ dùng, dừng project cũ từ đúng thư mục cũ bằng `docker compose stop`; không cần xóa volume.

## Đang chạy bản CTV 2.0

1. Nếu đã nhập dữ liệu cần giữ, chạy `bash scripts/backup.sh`, sao lưu ảnh.
2. `docker compose stop backend frontend`.
3. Chép source mới vào cùng thư mục, giữ `.env` và cấu hình volume.
4. `docker compose up --build -d`.
5. `docker compose logs --tail=100 backend` và kiểm tra login/danh mục/bảng giá.

003 sẽ nâng schema; không chạy reset, không cần đổi mật khẩu hay tạo database lại. Bản cũ có SKU chưa xác nhận size sẽ hiển thị để quản lý sửa, không được dùng để lập chứng từ mới khi chưa bổ sung.

## Nếu đã chạy nhánh CRM thử nghiệm

Nhánh có migration `002_crm_integrity.sql` là một schema khác, không trộn với bộ 002_ctv_workspace. Giữ project/database đó để đối soát nếu cần. Với trường hợp thật sự chưa có dữ liệu cần giữ, có thể cài bản này bằng một Compose project riêng và volume riêng thay vì xóa volume cũ:

```bash
python3 scripts/init-env.py
docker compose -p amora-studio-v3 up --build -d
```

Dừng container project cũ trước để giải phóng cổng. Các lần quản lý bản cài riêng dùng cùng `-p amora-studio-v3`, ví dụ `docker compose -p amora-studio-v3 ps`. Không dùng biến password mới với database volume cũ.

## Login

- Nếu nâng đúng database hiện có: dùng tài khoản và mật khẩu đã đổi trước đó.
- Nếu database mới: BOOTSTRAP_EMAIL và BOOTSTRAP_PASSWORD trong `.env`.
- Thay bootstrap không reset tài khoản đã tồn tại.
- Không chạy `down -v` chỉ vì không đăng nhập được.

## GitHub và cloud

Push nội dung thư mục amora-mini vào gốc repo; giữ `.dockerignore`, `.gitignore`, `.gitattributes` và migrations. Không push `.env`/uploads/backup.

Backend Render Dockerfile `backend/Dockerfile`, context gốc repo, Root Directory trống. Frontend Pages build thư mục frontend, đặt VITE_API_URL theo backend thật. Xem DEPLOY.md và CLOUD-REVIEW.md. Bản source này chưa tự deploy hoặc dùng Neon/R2 thật của bạn.
