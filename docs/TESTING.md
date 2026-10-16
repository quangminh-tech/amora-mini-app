# Kiểm thử và nghiệm thu

Thực hiện ngày **16/10/2026**. Phân biệt các kết quả đã chạy với phần cần nghiệm thu trên hạ tầng của bạn.

## Kết quả đã thực hiện

| Kiểm tra | Kết quả | Môi trường / bằng chứng |
|---|---|---|
| Backend .NET | Build thành công, 0 cảnh báo, 0 lỗi | .NET SDK 10.0.100; Npgsql 10.0.0; Dapper 2.1.66 |
| Frontend | TypeScript và Vite build thành công | Node 24, React 19, TypeScript 5.9 |
| API nghiệp vụ | **145 kiểm tra đạt** | Chạy API .NET thật, truy cập SQL PostgreSQL dạng WASM bằng Npgsql qua TCP |
| PDF tiếng Việt | Xuất 60 dòng, **6 trang A4**, văn bản trích xuất đúng | Chạy chính hàm frontend; pdfinfo/pdftotext và xem ảnh render đầu/cuối/trang giữa |
| JSON restore | Khôi phục đủ **14 bảng**, số dòng đối chiếu đúng | Database trống khác; không phục hồi sessions; có migration ledger |
| Chống ghi đè restore | Đạt | Lần restore thứ hai bị từ chối vì đích có dữ liệu |
| Dependency runtime frontend | Không có lỗ hổng được npm audit báo tại lúc kiểm tra | `npm audit --omit=dev --audit-level=high` |
| React rendering | Smoke test render phía server | Không tương đương kiểm tra tương tác trong trình duyệt |

Trong môi trường làm việc này không có Docker/PostgreSQL native chạy sẵn, nên kiểm thử SQL dùng **PGlite + pglite-socket**, cùng protocol PostgreSQL và driver Npgsql thật. Giới hạn single-connection của WASM khác PostgreSQL server; không dùng kết quả này để khẳng định tải đồng thời trên cloud. **GitHub Actions kèm theo được cấu hình chạy lại test trên PostgreSQL 17 native**. Workflow chưa được chạy trên repository của bạn trong phiên này.

## 145 kiểm tra API bao gồm

- Chặn truy cập không token và bắt đổi mật khẩu tạm.
- Thu hồi token cũ sau đổi mật khẩu, logout, reset password hoặc khóa tài khoản.
- CTV không xem được tài khoản quản trị, backup hoặc sửa thiết lập/bảng giá.
- Tách khách hàng, đơn hàng, báo giá, hoa hồng của CTV A/B.
- Bốn sản phẩm và mùi thật được seed, không seed giá thương mại.
- Sản phẩm ẩn không lộ giá hoặc metadata ảnh cho CTV; API đọc ảnh cũng từ chối.
- CTV không dùng giá sỉ/B2B hoặc sửa đơn giá qua request giả mạo.
- Sản phẩm chưa có giá, số lượng không hợp lệ, dòng trùng và thiếu MOQ bị chặn.
- Server tự tính tiền hàng, vận chuyển, hoa hồng; đơn cũ giữ nguyên giá và tỷ lệ sau khi chính sách đổi.
- Chỉ sửa đơn đang chờ, chưa thu tiền; không cho CTV xác nhận đơn.
- Kiểm soát chuyển trạng thái và xung đột version 409.
- Hai request cùng version: một thành công, một xung đột; kiểm tra này còn cần chạy lại trên PG17 trong CI.
- Không nhận số tiền thu vượt tổng đơn; chưa đủ tiền không sinh hoa hồng.
- Không chi hoa hồng trước khi duyệt, không ghi nhận chi trùng.
- Trả đơn khi chưa chi làm hoa hồng vô hiệu; sau khi đã chi thì chặn trả tự động.
- CTV chỉ hủy đơn chờ, phải có lý do.
- Báo giá theo chính sách CTV; báo giá đã gửi không sửa trực tiếp; tách owner.
- Tải/đọc/xóa ảnh có xác thực; từ chối nội dung không phải PNG/JPEG/WebP theo signature.
- Giới hạn 2 quản lý và 5 CTV, không tự khóa tài khoản của mình.
- Dashboard trả dữ liệu, backup chứa đủ tài khoản và không chứa sessions.

## Chạy lại trong CI

Workflow `.github/workflows/ci.yml` sẽ:

1. Tạo PostgreSQL 17 chuyên dùng cho test.
2. Build .NET và frontend từ lockfile.
3. Kiểm tra PDF và React server render.
4. Khởi chạy API với database trống.
5. Chạy integration test, xuất backup fixture ra `/tmp`.
6. Tạo database test thứ hai, chạy script restore và đối chiếu số dòng.

Nếu test thất bại, log API được in trong job cuối. Các password trong workflow chỉ dùng trong container test tạm thời, không sử dụng cho local/cloud thật.

## Chạy thủ công

Khởi động API với database **mới, trống và chỉ dành cho test**, Bootstrap email `admin@test.amora`, password `Initial-ci-only-password`. Không dùng database đang có dữ liệu kinh doanh: bài test tạo dữ liệu, cấp đủ 7 tài khoản và đổi mật khẩu.

```bash
TEST_BACKUP_PATH=/tmp/amora-test-backup.json python3 tests/integration.py
node tests/pdf-smoke.mjs
node tests/ui-smoke.mjs
```

Backend khác cổng: đặt `TEST_API_URL`. Email/password Bootstrap khác: đặt `TEST_ADMIN_EMAIL`, `TEST_ADMIN_PASSWORD`. Không đưa secrets thật vào CI fixture.

Restore test cần một database PostgreSQL thứ hai **trống hoàn toàn**, `psycopg[binary]` và file backup fixture đã xuất từ bài test:

```bash
TEST_BACKUP_PATH=/tmp/amora-test-backup.json \
TEST_RESTORE_DATABASE_URL='postgresql://TEST_USER:TEST_PASSWORD@localhost/EMPTY_TEST_DATABASE' \
python3 tests/restore-smoke.py
```

## Cần nghiệm thu sau khi deploy thật

- Render: build Docker, `/health`, log startup, thời gian khởi động lại khi Free ngủ.
- Neon: SSL VerifyFull, pool 5, migration trên project của bạn và Usage.
- R2: khóa quyền bucket, thực hiện PUT/GET/DELETE thật, kiểm tra ảnh còn sau redeploy. Kiểm thử hiện tại dùng local object storage trong Development; **chưa chạy request với tài khoản R2 thật**.
- Cloudflare Pages: build env API URL, CORS theo origin thật và CSP.
- Trình duyệt thật trên điện thoại/iPad/desktop: mở menu, nhập form, scroll lịch sử, tải ảnh, xuất/in PDF, ngắt kết nối và hết phiên.
- Ảnh/logo AMORA thật, giá bán, MOQ, thông tin liên hệ/ngân hàng và điều kiện báo giá do quản lý xác nhận.
- Backup ảnh R2 và thử restore dữ liệu trên database tách biệt trước khi đưa vào vận hành.

Không có URL production được xuất bản trong lần bàn giao này. Gói mã nguồn và hướng dẫn đã sẵn sàng để push và triển khai bằng tài khoản hạ tầng của bạn.
