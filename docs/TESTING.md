# Kiểm tra bản 3.0 — 17/10/2026

## Đã chạy

| Kiểm tra | Kết quả |
|---|---|
| Backend .NET 10 | Build Release thành công, 0 lỗi / 0 cảnh báo |
| Frontend TypeScript/Vite | Build production thành công |
| API | **294 kiểm tra đạt**: đăng nhập, phân quyền CTV, danh mục/mẫu/SKU, MOQ/giá, snapshot, trạng thái, thu tiền, hoa hồng, quote→order, Excel và backup |
| Nâng cấp / ràng buộc SQL | **17 kiểm tra đạt** trên PGlite trực tiếp: giữ snapshot/số dư cũ, FK, normalized email, immutable payments, tổng chứng từ, gắn mẫu/nhóm khi nâng |
| Backup JSON v3 | Khôi phục đủ **19 bảng**, đối chiếu số dòng, không sessions, đủ migration ledger; lần restore tiếp theo bị từ chối |
| Cấu hình cloud | 12 kiểm tra backend + 9 kiểm tra frontend đạt |
| Client API | Mất mạng/cold-start HTML không xóa phiên, không tự replay POST; 401 logout |
| React render | Login + 8 màn hình nghiệp vụ và cả hai vai trò dashboard đạt, có dữ liệu mẫu/size/nhóm/table/import |
| PDF tiếng Việt | Xuất được 60 dòng bằng hàm frontend; snapshot chuẩn bị được thêm khi dòng có dữ liệu |
| Excel độc lập | File export mở được bằng openpyxl, tiêu đề tiếng Việt, size và SKU văn bản, không có ô công thức |
| CORS / liveness | Origin cho phép/chặn đúng; `/health` vẫn phản hồi khi database test dừng |

Các tình huống v3 đã kiểm tra: một mẫu có nhiều size; tổ hợp mẫu+mùi+size trùng bị chặn; nhóm khách lọc được; parent group ngừng dùng thì CTV không thấy SKU; đổi giá sau báo giá không đổi giá/hoa hồng/size/chuẩn bị khi chuyển đơn; bấm convert lặp trả cùng đơn; CTV không lấy được team hoặc export users/import products.

Excel: từ chối công thức, xem trước không ghi dữ liệu nghiệp vụ, file có dòng lỗi không cấp batch commit, commit chỉ đúng người tạo, commit lặp bị chặn, ô trống giữ dữ liệu, `[XÓA]` xóa được trường cho phép, cập nhật đã cũ rollback, nhập được nhóm→mẫu→SKU→giá, mật khẩu tài khoản chỉ sinh khi commit và phải đổi lần đầu.

## Giới hạn xác minh

SQL local dùng PostgreSQL dạng WASM (PGlite), API .NET truy cập pglite-socket qua Npgsql. Kiểm tra ràng buộc/nâng schema chạy trực tiếp trên PGlite; tests/database-upgrade.py kèm kiểm tra tương đương cho PostgreSQL native trong CI. Chưa chạy workflow GitHub Actions trên repository người dùng.

Chưa có Docker/PostgreSQL native trong môi trường này; chưa chạy toàn bộ container hoặc thao tác trình duyệt/điện thoại. Chưa dùng Neon/R2 thật, chưa deploy Render/Pages, chưa benchmark tải đồng thời.

Vite cảnh báo chunk PDF khoảng 1,15 MB trước gzip; phần PDF được tải động khi xuất, không nằm trong JS chính (~274 KB trước gzip). Chưa đo trải nghiệm trên mạng di động chậm.

## Chạy lại build và kiểm tra frontend

```bash
dotnet build backend -c Release
dotnet run --project tests/Amora.Checks
cd frontend
npm ci
npm run build
cd ..
node tests/ui-smoke.mjs
node tests/workspace-smoke.mjs
node tests/api-client.mjs
node tests/cloud-config.mjs
node tests/pdf-smoke.mjs
```

## API / restore / upgrade

Dùng database **trống chuyên test**, không dùng dữ liệu vận hành. Khởi động API với bootstrap admin@test.amora / Initial-ci-only-password. Test tạo tài khoản, SKU/giá giả lập và đổi mật khẩu.

```bash
TEST_API_URL=http://127.0.0.1:8080 TEST_BACKUP_PATH=/tmp/amora-test-backup.json python3 tests/integration.py
```

Restore và upgrade cần psycopg[binary] và hai database trống riêng khác nhau:

```bash
TEST_BACKUP_PATH=/tmp/amora-test-backup.json TEST_RESTORE_DATABASE_URL=postgresql://TEST_USER:TEST_PASSWORD@localhost/EMPTY_RESTORE_DB python3 tests/restore-smoke.py
TEST_BACKUP_PATH=/tmp/amora-test-backup.json TEST_UPGRADE_DATABASE_URL=postgresql://TEST_USER:TEST_PASSWORD@localhost/EMPTY_UPGRADE_DB python3 tests/database-upgrade.py
```

Workflow `.github/workflows/ci.yml` cấu hình PostgreSQL 17 và các bước trên. Mật khẩu fixture/container CI không dùng làm mật khẩu thật.

## Nghiệm thu trước vận hành

- Trên máy thật: build Docker, login/đổi mật khẩu, menu/scroll/modal trên desktop và điện thoại.
- Tạo nhóm/mẫu/SKU/giá thực, nhập file mẫu tự chuẩn bị, xuất lại và đối chiếu.
- Đăng nhập hai CTV, kiểm tra phạm vi dữ liệu và thao tác nhập/xuất.
- Tạo báo giá đủ mùi/size, PDF, chuyển đơn, ghi thu và duyệt/chi hoa hồng.
- Cloud: Neon/R2 thật, CORS/CSP, ảnh sau redeploy, phục hồi backup dữ liệu và ảnh ở môi trường riêng.


Bổ sung xóa sản phẩm: kiểm tra quản lý/CTV, version cũ, mẫu có SKU, xóa SKU chưa dùng có giá/ảnh, 404 sau xóa và giữ nguyên sản phẩm/đơn lịch sử khi xóa bị chặn. Backend/frontend build và React render đã chạy lại; restore 19 bảng vẫn đạt.
