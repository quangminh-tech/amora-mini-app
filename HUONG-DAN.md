# AMORA — Size, màu cốc và SKU tự động

## Cài bản sửa

1. Giải nén, chép đúng các thư mục backend, frontend, database, scripts, tests vào thư mục gốc repository amora-mini-app. Giữ nguyên các file khác.
2. Commit và push GitHub. Deploy lại backend amora-mini-app trước, đợi Live; sau đó deploy frontend amora-ctv-mini-app.
3. Backend tự áp dụng migration 004_product_colours.sql. Không sửa migration 001–003, không xóa database, không cần chạy SQL thủ công.
4. Kiểm tra backend build log có migration mới thành công, rồi tải lại frontend. Các biến môi trường đang chạy giữ nguyên.

Đây là bản sửa nối tiếp v3, đã bao gồm hai file của bản tự sinh mã mẫu trước đó. Nếu repository có thay đổi khác sau v3 trong các file trùng tên, cần ghép thay đổi thay vì ghi đè mù quáng.

## Sử dụng

- Mẫu: Nến cốc AMORA. Mùi: White Tea. Size: 110g. Màu: Đen.
- SKU tạo mới: NT-0001-WT-110-DEN. Frontend xem mã dự kiến; server cấp mã chính thức trong transaction.
- Bấm “+ Tạo nhiều size / màu”, chọn mẫu và mùi; nhập size “110g, 220g”, màu “Đen, Trắng”; bấm “Tạo bảng phiên bản”.
- Bảng hiện 4 tổ hợp và mã dự kiến. Nhập giá lẻ, MOQ, hoa hồng từng dòng rồi lưu cùng lúc. Bỏ dòng nếu tổ hợp đó không bán.
- Giá để trống: tạo SKU chưa có giá; sau đó vào Bảng giá để khai báo. Giá sỉ/B2B vẫn nhập tại Bảng giá.
- Màu có thể gõ tên tùy ý; gợi ý Đen/Trắng và màu đã có. Để trống nếu không phân màu. Size phải nhập kèm đơn vị, ví dụ 110g.
- SKU cũ không tự đổi khi sửa màu/size hoặc đổi tên mẫu. Tên hiển thị cập nhật màu; báo giá/đơn hàng đã tạo giữ nguyên snapshot.
- SKU cũ được thêm màu rỗng, không suy đoán màu. Cập nhật màu thực tế trong Sửa hoặc Excel.
- Import/export sản phẩm có cột “Màu cốc”. File cũ không có cột này vẫn dùng được. Update để trống giữ dữ liệu; [XÓA] xóa màu. Import create để SKU trống sẽ tự cấp mã.
- Một tổ hợp mẫu + mùi + size + màu chỉ được tạo một lần. Nếu có lỗi, toàn bộ đợt tạo bị hủy, không lưu dở.
- Hai mùi trùng chữ viết tắt hoặc hai cách viết size tạo cùng mã được cấp thêm hậu tố -2, -3... Không dùng SKU preview làm mã chính thức trước khi lưu.
- Mã mẫu tự động từ bản trước vẫn giữ. Mã được xóa khỏi danh mục có thể được cấp lại; chưa có bộ đếm lưu vĩnh viễn cho mã đã xóa.

## Kiểm tra đã chạy

- .NET Release build: 0 lỗi, 0 cảnh báo. TypeScript + Vite production build thành công.
- 294 ca API hồi quy hiện có qua trên PostgreSQL nhúng PGlite qua socket.
- Ca bổ sung: tạo 4 SKU đúng mã, preview không ghi dữ liệu, phân biệt màu, chặn tổ hợp trùng kể cả khác hoa/thường, hủy batch lỗi, màu tự nhập, hậu tố khi mã trùng, giữ mã sau sửa, đổi tên mẫu giữ màu, snapshot báo giá giữ màu, kiểm tra quyền CTV, Excel thêm/sửa/xóa màu, backup schema004.
- Restore backup sang database test trống: đủ 19 bảng, không phục hồi sessions, migration ledger 4, từ chối ghi đè database đã có dữ liệu.
- Chưa chạy trên Neon/Render thật hoặc kiểm thử trình duyệt trực tiếp; bộ hồi quy có thể chạy lại trên PostgreSQL17 trong CI.

## API bổ sung

- GET /api/products/variant-options: size/màu đã có (manager).
- POST /api/products/sku-preview: cùng ProductRequest, không ghi dữ liệu (manager).
- POST /api/products/batch: {items:[{product:ProductRequest,retail:PriceRequest|null}]}, tối đa100. Chỉ tạo mới; retail chỉ nhận channel retail.
- ProductRequest thêm colorLabel, mặc định rỗng để tương thích. sku rỗng khi tạo mới sẽ tự sinh; update yêu cầu SKU rõ ràng.
- Backup schema hiện tại 004_product_colours.sql; dùng scripts/restore.py mới khi phục hồi backup mới.

## File thay đổi

- `database/migrations/004_product_colours.sql`
- `backend/Services/VariantCodes.cs`
- `backend/Endpoints/Catalogue.cs`
- `backend/Endpoints/Directories.cs`
- `backend/Endpoints/Transfers.cs`
- `backend/Endpoints/Sales.cs`
- `backend/Endpoints/Admin.cs`
- `frontend/src/pages/Catalogue.tsx`
- `frontend/src/pages/VariantBuilder.tsx`
- `scripts/restore.py`
- `tests/colour-variants.py`
- `tests/restore-smoke.py`
