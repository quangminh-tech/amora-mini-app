# Kết quả kiểm tra Catalogue Studio 3.4

## Đã chạy

- `dotnet build backend/Amora.Api.csproj`: thành công, 0 warnings / 0 errors.
- `dotnet run --project tests/Studio.Checks`: 15 ca validation đạt (quyền nhập giá CTV, giới hạn nội dung, bảng sai số ô, ID trùng, bố cục/loại nội dung không hợp lệ).
- `npm ci` và `npm run build` trong frontend: thành công. Cảnh báo kích thước fontkit là thư viện PDF có sẵn; module không thêm dependency runtime mới.
- React SSR smoke hiện có: ui-smoke.mjs và workspace-smoke.mjs đạt, bao gồm 8 màn hình và cả hai vai trò dashboard.
- Chromium browser test với API MOCK: menu Catalogue, tạo mới, chọn SKU và điền snapshot, upload/nén/hiển thị ảnh, sửa mô tả, tạo bảng từ sản phẩm, lưu, phát hành snapshot, chặn rời menu khi còn thay đổi, preview điện thoại, kiểm tra giao diện CTV, iframe in.
- Browser test dùng CSP tương đương public/_headers hiện có. Không có lỗi JS runtime trong kịch bản đã chạy.
- Bản PDF QA qua Chromium: 2 trang cho fixture một sản phẩm + bảng, có ảnh và nội dung, không có menu app, footer/liên hệ giữ cùng trang. Đây là dữ liệu test, không phải catalogue thương mại.
- Tất cả 7 migrations chạy được trên database PGlite tạm; đã kiểm tra snapshot phát hành, tên phát hành riêng, version, rollback, ràng buộc JSON và loại ảnh.

## Giới hạn xác minh

- PGlite là PostgreSQL WASM dành cho kiểm tra SQL, không thay thế kiểm thử API trên Neon/PostgreSQL thật.
- Chưa chạy tích hợp HTTP end-to-end backend + PostgreSQL thật; thử nghiệm wire adapter PGlite không hoàn tất kết nối .NET. Không dùng kết quả này làm xác nhận API production.
- Chưa kết nối R2/Neon production, chưa push GitHub, chưa deploy lên Render/Pages.
- Browser test dùng API mock nên chưa xác nhận độ trễ, quyền database thực tế, multipart qua reverse proxy hoặc bù trừ lỗi R2 thực tế.
- PDF trên Safari/Firefox và trường hợp bảng rất dài cần nghiệm thu thêm; người dùng vẫn xem Print Preview trước khi lưu.

## Tự chạy

Từ thư mục gốc repo:

    dotnet build backend/Amora.Api.csproj
    dotnet run --project tests/Studio.Checks

Trong frontend:

    npm ci
    npm run build

Browser test tùy chọn (chỉ dữ liệu giả, không đụng database):

    npm install --prefix frontend --no-save --package-lock=false playwright@1.51.1
    node frontend/node_modules/playwright/cli.js install chromium --only-shell
    node tests/catalogue-studio-browser.mjs

Cần môi trường có thư viện hệ thống Chromium. Script mở HTTP server tạm trên cổng ngẫu nhiên và ghi PDF test vào thư mục tạm hệ điều hành.

## Nghiệm thu trước dùng thật

1. Deploy backend vào môi trường thử; xác nhận migration 007 có trong schema_migrations và /health trả 3.4.0.
2. Tạo catalogue bằng quản lý, upload ảnh riêng, lưu rồi tải lại: nội dung/ảnh phải còn.
3. Hai tab cùng mở một bản: tab lưu sau với version cũ phải nhận 409, không ghi đè.
4. CTV không mở được bản nháp/ảnh của tài khoản khác. CTV không gọi được API publish.
5. Phát hành, đăng nhập CTV khác và xem; sửa draft quản lý, CTV vẫn thấy bản cũ cho tới khi phát hành lại.
6. Nhân bản mẫu có ảnh, sau đó lưu trữ mẫu gốc: bản sao vẫn đọc được ảnh.
7. Chọn SKU có nhiều ảnh, đổi ảnh, thêm bảng 40 hàng và mô tả dài, in kiểm tra phân trang.
8. Thu hồi bản chung: CTV khác không còn mở được catalogue và ảnh qua API. Bản PDF đã tải vẫn tồn tại trên thiết bị người nhận.
9. Kiểm tra lại tạo báo giá, bảng giá và danh mục sản phẩm cũ sau deploy.
