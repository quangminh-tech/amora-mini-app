# Triển khai AMORA Mini

## 1. Chuẩn bị mã nguồn

Giải nén thư mục `amora-mini`. Tạo repository GitHub private, push **nội dung thư mục này vào gốc repository**, để `render.yaml`, `backend/` và `frontend/` ở cùng cấp.

```bash
git init
git add .
git commit -m "Initial AMORA Mini"
git branch -M main
git remote add origin YOUR_PRIVATE_REPOSITORY_URL
git push -u origin main
```

Kiểm tra không có `.env`, file backup, khóa R2 hay dữ liệu khách thật trong commit. `.gitignore` đã có quy tắc loại trừ. GitHub Actions sẽ build frontend/backend và chạy kiểm thử API trên PostgreSQL 17.

## 2. Neon: PostgreSQL

1. Tạo project trên https://neon.com, chọn Free và khu vực gần người dùng/Render nếu có.
2. Lấy host, database, username, password từ màn hình kết nối. Không đưa mật khẩu vào repo.
3. Dùng **chuỗi Npgsql dạng key=value**, không dán nguyên `postgresql://...` vào biến .NET:

```text
Host=YOUR_NEON_POOLER_HOST;Port=5432;Database=neondb;Username=YOUR_NEON_USER;Password=YOUR_NEON_PASSWORD;SSL Mode=VerifyFull;Trust Server Certificate=false;Maximum Pool Size=5;Timeout=30;Command Timeout=30
```

Nếu mật khẩu có dấu `;`, quote giá trị theo cú pháp Npgsql connection string. Có thể tự đặt password URL-safe khi tạo database user để giảm nhầm lẫn. `VerifyFull` yêu cầu chứng chỉ hợp lệ; không tắt kiểm tra chứng chỉ để sửa lỗi kết nối.

Host có `-pooler` là endpoint pool. Phù hợp lưu lượng nhỏ; app dùng 5 connection tối đa. Lần chạy đầu API áp dụng SQL migration và tạo quản lý đầu tiên. Dùng một API instance trong phạm vi MVP.

**Quota đã kiểm tra ngày 16/10/2026:** Neon Free 1 GB/project, tối đa 20 GB tổng các project, 100 CU-hours/project/tháng và 5 GB public network transfer/project/tháng. Free không phải SLA; theo dõi trang Usage của tài khoản.

## 3. Cloudflare R2: ảnh private

1. Bật R2 và tạo bucket Standard, ví dụ `amora-mini-products`.
2. Giữ **public access tắt**. Backend sẽ đọc ảnh và trả qua API có xác thực.
3. Tạo API token R2 với quyền đọc/ghi object chỉ cho bucket này. Giữ Access Key ID và Secret Access Key riêng.
4. Endpoint dạng `https://ACCOUNT_ID.r2.cloudflarestorage.com`.
5. Đặt bốn biến R2 phía backend theo bảng ở phần 4. Không đặt các khóa này vào Pages.

Mã nguồn ký request S3 Signature V4 và dùng PUT/GET/DELETE. Do trình duyệt gọi backend thay vì bucket, **không cần mở CORS R2 cho trình duyệt**. Không sử dụng ổ đĩa Render để giữ ảnh vì ổ đĩa Free là tạm thời.

R2 Standard có quota miễn phí 10 GB-month, 1 triệu Class A requests/tháng và 10 triệu Class B requests/tháng. Vượt quota có thể tính phí; đặt cảnh báo theo Usage/Billing của tài khoản. Ảnh nên là JPG/WebP đã nén, khoảng 100–500 KB thay vì tải tệp gốc nhiều MB.

## 4. Render: backend .NET

1. Vào https://render.com → tạo **Blueprint** từ repository, dùng `render.yaml`; hoặc tạo Web Service thủ công.
2. Nếu thủ công: runtime **Docker**, Dockerfile `backend/Dockerfile`, build context gốc repo `.`, plan **Free**.
3. Health check path `/health`. Docker listen cổng 8080.
4. Điền biến môi trường bên dưới. Lần đầu chưa có Pages URL có thể tạo Pages trước theo phần 5, rồi quay lại điền origin thật.

| Biến | Giá trị | Bí mật? |
|---|---|---|
| `ASPNETCORE_ENVIRONMENT` | `Production` | Không |
| `ConnectionStrings__Default` | Chuỗi kết nối Npgsql Neon, xem trên | Có |
| `Bootstrap__Email` | Email của quản lý đầu tiên | Riêng tư |
| `Bootstrap__Password` | Mật khẩu ban đầu riêng, ≥12 ký tự | Có |
| `AllowedOrigins` | `https://YOUR_PROJECT.pages.dev` | Không |
| `R2__Endpoint` | `https://ACCOUNT_ID.r2.cloudflarestorage.com` | Riêng tư |
| `R2__Bucket` | `amora-mini-products` | Không |
| `R2__AccessKeyId` | R2 Access Key ID | Có |
| `R2__SecretAccessKey` | R2 Secret Access Key | Có |

`AllowedOrigins` không có dấu `/` ở cuối. Nhiều origin cách bằng dấu phẩy; chỉ điền domain bạn kiểm soát. Nếu dùng domain riêng, thêm origin chính xác vào đây. Backend không dùng cookie cross-site; xác thực qua Authorization Bearer.

Deploy, chờ build/publish hoàn tất và mở `https://YOUR_SERVICE.onrender.com/health`. Kết quả mong đợi `{"status":"ok"}`. Nếu 500 hoặc crash: đọc log, kiểm tra connection string, mạng Neon, Bootstrap và migration. Không paste log chứa bí mật lên nơi công khai.

Sau lần tạo quản lý đầu tiên, đăng nhập và đổi mật khẩu. Có thể xóa Bootstrap password khỏi env; ứng dụng không cần nó nếu đã có user. Khi tạo database mới hoàn toàn, cần cung cấp Bootstrap lại. Không có cách đặt lại mật khẩu bằng thay Bootstrap cho database đang có dữ liệu.

Render Free ngủ sau 15 phút không có request, mất khoảng một phút khởi động. Client timeout 90 giây, thông báo lỗi kết nối nếu chưa sẵn sàng; người dùng có thể thử lại. Không có job giữ sống. Một Render Free workspace có giới hạn tài nguyên/giờ sử dụng; đọc quota tài khoản hiện tại.

## 5. Cloudflare Pages: React

1. Vào Workers & Pages → Pages → Connect to Git.
2. Chọn repository, branch `main`.
3. Root directory: `frontend`.
4. Build command: `npm ci && npm run build`.
5. Build output directory: `dist`.
6. Node version: `24` nếu cần đặt biến `NODE_VERSION`.
7. Biến môi trường build production:

```text
VITE_API_URL=https://YOUR_SERVICE.onrender.com
```

8. Deploy, lấy URL Pages thật và cập nhật `AllowedOrigins` tại Render.
9. Sau khi thay `VITE_API_URL`, cần **rebuild** Pages vì Vite đóng biến vào bundle lúc build. Chỉ sửa runtime env không làm bundle đã build đổi URL.
10. `_headers` và `_redirects` đã có sẵn. Các secrets không được đặt tên `VITE_*`; mọi biến Vite đều có thể xuất hiện trong JavaScript gửi xuống trình duyệt.

Không dùng Sites/Cloudflare Worker để chạy backend này; .NET backend cần container Render. Cloudflare Pages chỉ phục vụ frontend tĩnh.

## 6. Kiểm tra trước khi dùng thật

- Đăng nhập quản lý đầu tiên, bắt buộc đổi mật khẩu và đăng nhập lại.
- Tạo thêm quản lý và 5 CTV; xác nhận không tạo được tài khoản thứ 8.
- Nhập giá đã duyệt, % hoa hồng, số lượng tối thiểu từng sản phẩm/kênh.
- Nhập thông tin liên hệ/ngân hàng/điều kiện báo giá chính thức.
- Tải ảnh AMORA thật; đăng xuất/đăng nhập lại để xác nhận ảnh vẫn còn sau khi backend deploy lại.
- Đăng nhập CTV A/B ở hai cửa sổ riêng: mỗi người chỉ thấy khách, đơn, báo giá và hoa hồng của mình.
- Tạo đơn CTV → xác nhận → đang giao → hoàn tất → thu đủ tiền → duyệt hoa hồng → ghi nhận chi.
- Tạo báo giá dài và tải PDF: kiểm tra tên khách, giá, điều kiện và tiếng Việt.
- Kiểm tra ở điện thoại/iPad/desktop với trình duyệt thật.
- Tải JSON backup và khôi phục thử vào database trống riêng; sao lưu ảnh R2 riêng.

## 7. Backup và khôi phục

### Backup qua giao diện

**Thiết lập → Tải bản sao lưu**. Bản JSON chụp các bảng trong một transaction Repeatable Read, có version định dạng, dữ liệu khách/đơn/báo giá/hoa hồng/ảnh dạng object key, tài khoản với password hash và nhật ký. Không chứa session đang hoạt động, không chứa binary ảnh, không chứa cấu hình secret cloud.

Khuyến nghị tải cuối mỗi ngày có đơn hoặc trước khi sửa dữ liệu quan trọng; giữ nhiều phiên bản tại nơi quản lý tin cậy. Đây là thao tác quản lý thực hiện, chưa có scheduler tự động.

### Full backup PostgreSQL

Local Docker:

```bash
bash scripts/backup.sh
```

Neon: cài PostgreSQL client tương thích database, đặt `DATABASE_URL` libpq URI trong session riêng, rồi dùng `pg_dump`. Không lưu URI vào source code hoặc chụp màn hình có password.

```bash
pg_dump "$DATABASE_URL" -Fc -f amora-2026-10-16.dump
# Chỉ phục hồi vào một database mới, trống:
pg_restore --no-owner --no-privileges --dbname="$RESTORE_DATABASE_URL" amora-2026-10-16.dump
```

Schema và dữ liệu được giữ trong `.dump`; cần sao lưu bucket riêng. Với snapshot/restore do nhà cung cấp hỗ trợ, kiểm tra thời hạn của đúng gói đang sử dụng.

### Khôi phục JSON

1. Tạo database **mới và trống**. Dừng API khi thực hiện; không cho app tự seed trước khi restore.
2. Áp dụng schema đầu tiên bằng `psql`. Lệnh tạo một dòng settings mặc định, script restore cho phép đúng trường hợp này.
3. Validate backup trước; không ghi database nếu thiếu `--execute`.
4. Thực hiện restore. Nếu đích đã có tài khoản/đơn hay dữ liệu khác, script từ chối; không truncate hoặc xóa dữ liệu đang có.

```bash
python3 -m pip install 'psycopg[binary]'
psql "$RESTORE_DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrations/001_initial.sql
python3 scripts/restore.py path/to/amora-backup.json
DATABASE_URL="$RESTORE_DATABASE_URL" python3 scripts/restore.py path/to/amora-backup.json --execute
```

Script chỉ nhận 14 bảng dữ liệu đã biết, kiểm tra format/schema, chèn theo thứ tự khóa ngoại trong một transaction, ghi nhận migration 001 và để sessions trống. Không bao giờ đưa backup chưa tin cậy vào môi trường thật. Mật khẩu hiện tại trong bản backup tiếp tục dùng được sau restore, nhưng mọi người phải đăng nhập lại.

Ảnh: dùng công cụ S3 tương thích, ví dụ `rclone`, sao chép bucket R2 sang nơi backup riêng. Giữ nguyên object key khi khôi phục. Không bật public access. Thiết lập lại secrets/env vì chúng không nằm trong JSON.

## 8. Cập nhật phiên bản

- Backup database và ảnh trước khi cập nhật có thay schema.
- Chạy CI trên branch/PR và thử trên database test.
- SQL mới thêm file `002_*.sql`, không sửa migration đã áp dụng vào database thật. Migrations có transaction và advisory lock, chỉ chạy một lần.
- Không chỉ rollback container khi schema đã đổi; chuẩn bị migration tương thích hoặc restore sang database riêng.
- Với nhu cầu vượt MVP: thêm phân trang server trước; rồi tăng quota/plan và kiểm tra pool kết nối. Không cần tách microservices chỉ vì tăng từ 7 lên vài chục người.

## 9. Mốc miễn phí và nguồn chính thức

Thông tin kiểm tra ngày **16/10/2026**, có thể thay đổi theo chính sách nhà cung cấp. Chọn gói và theo dõi Usage/Billing ngay trong tài khoản.

- Render Free: https://render.com/docs/free
- Neon plans: https://neon.com/docs/introduction/plans
- Cloudflare R2 pricing: https://developers.cloudflare.com/r2/pricing/
- Cloudflare Pages limits: https://developers.cloudflare.com/pages/platform/limits/

Không dùng Render PostgreSQL Free cho dữ liệu lâu dài: database Free của Render có thời hạn 30 ngày. Mục tiêu 0đ chưa bao gồm tên miền riêng, vượt quota, thuế hoặc các gói trả phí tùy chọn. GitHub private repo không tương đương backup dữ liệu khách hàng.
