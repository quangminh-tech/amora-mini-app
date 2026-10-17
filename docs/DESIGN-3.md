# Thiết kế AMORA Studio 3.0

## Phạm vi

Một thương hiệu AMORA, quản lý CTV, catalogue, báo giá, đơn và hoa hồng. Khách hàng có nhóm, liên hệ và ghi chú ngắn. Không CRM, tồn kho/BOM, nhiều tầng CTV, cổng thanh toán hoặc nhiều doanh nghiệp dùng chung database.

## Mẫu và SKU

- product_categories: danh mục phẳng, mỗi mẫu một nhóm chính; mã/tên unique không phân biệt hoa thường và khoảng trắng ngoài.
- product_models: mã mẫu unique, tên, mô tả, nhóm FK, trạng thái, version.
- products: là **SKU bán cụ thể**, FK model_id, mùi tùy chọn, size_label bắt buộc khi tạo mới, đơn vị, chuẩn bị min/max, trạng thái, version.
- scents: tên chuẩn hóa unique, các tầng hương, ý nghĩa/ritual, active/version.
- prices: unique SKU + kênh; mỗi dòng có giá nguyên đồng, MOQ và % hoa hồng.
- product_images: ảnh theo SKU trong kho ảnh private. Chưa có ảnh ở cấp mẫu.

Không biến size thành cột 100g/220g cố định. size_label là quy cách hiển thị linh hoạt như trọng lượng, dung tích hoặc set. Mỗi tổ hợp mẫu + mùi (bao gồm không mùi) + size sau chuẩn hóa là duy nhất. Chưa có bộ thuộc tính biến thể tùy ý nhiều chiều/màu/chất liệu.

Tên hiển thị SKU được ghép từ mẫu, mùi và size, bỏ phần trùng. Chứng từ dùng tên hiện hành khi tạo/sửa nháp; snapshot đã phát hành không tự thay đổi. Đổi mẫu có thể làm các SKU tăng version để ngăn người khác lưu form SKU cũ.

CTV chỉ thấy SKU khi SKU, mẫu, nhóm và mùi liên quan đang dùng. Đọc ảnh kiểm tra lại các trạng thái này. Quản lý được xem cả hàng ẩn. Kênh giá CTV là retail, quản lý dùng cả retail/wholesale/b2b.

## Khách hàng

customer_groups quản lý danh sách nhóm; customers có group_id, owner_id, tên, điện thoại, email, công ty, địa chỉ, note và version. Nhóm mặc định UNCLASSIFIED luôn hoạt động. Nhóm khách không tự áp giá B2B.

Số điện thoại chuẩn hóa để tìm/cảnh báo trùng, không unique cứng vì số doanh nghiệp có thể dùng chung. Endpoint cảnh báo chỉ trả hồ sơ thuộc quyền xem. Khi import, cảnh báo trùng trong danh sách do chính người nhập sở hữu. Không có cơ chế gộp/chuyển giao CRM.

owner_id khách do người tạo sở hữu; chủ đơn/báo giá là người phụ trách và hưởng hoa hồng trên chứng từ. Người tạo ghi trong nhật ký; quản lý chỉ gán chủ chứng từ lúc tạo. Không đổi người hưởng đơn cũ bằng cách sửa danh bạ.

## Báo giá, đơn và thu tiền

quotes/quote_lines giữ snapshot khách/người bán/điều kiện, SKU/tên có mùi-size, đơn vị, giá, tỷ lệ hoa hồng và chuẩn bị min/max. orders/order_lines lưu tương tự cho đơn. MOQ kiểm tra theo từng SKU, không cộng gộp.

API tính tiền bằng decimal, không nhận total hoặc commission do client tự tính để ghi thẳng. PostgreSQL kiểm tra công thức dòng, unique SKU trên chứng từ, tổng chi tiết bằng subtotal tại COMMIT. Ghi cha và chi tiết trong cùng transaction.

Báo giá draft → sent → accepted/rejected; sent có thể về draft. Chỉ accepted và còn hiệu lực được chuyển thành đơn. source_quote_id trên orders unique và FK. Endpoint khóa quote, tìm đơn đã tạo rồi trả lại chính ID cũ khi người dùng bấm lặp; không sinh đơn thứ hai. Giá/hoa hồng/thời gian chuẩn bị lấy từ quote_lines, không lấy lại prices mới.

Quote cũ từ bản 2 chưa có commission_rate snapshot sẽ bị chặn chuyển đơn, yêu cầu lập lại báo giá để không suy đoán chính sách hoa hồng cũ. Dòng cũ không có chuẩn bị min/max để NULL, không gán thông tin giả.

payments là sổ thu/điều chỉnh signed amount: bất biến sau khi ghi, tổng phải bằng orders.paid tại COMMIT. Giao diện hiện nhập tổng đã thu lũy kế; server khóa đơn và thêm dòng chênh lệch. version chặn gửi lại request cũ. Số dư lịch sử từ schema 001 được giữ bằng opening_balance, không có ngày thu giả.

Hoa hồng sinh khi completed và thu đủ; unique order_id, duyệt rồi chi. Không gồm vận chuyển. Sau khi đã chi, không cho tự động trả hàng hoặc sửa thu tiền; đối soát riêng là giới hạn hiện tại.

## Nhập và xuất

Workbook là OpenXML `.xlsx` giá trị tĩnh; reader xử lý inline/shared strings và CSV UTF-8. Không thực thi công thức, macro, DTD hay liên kết ngoài. Giới hạn file 5 MB, 1.000 dòng, 40 cột, 20 MB sau giải nén và 200 zip entries; tài khoản tối đa 100 dòng. Chỉ đọc worksheet sheet1 từ file mẫu.

Preview chạy các thao tác trong transaction rồi rollback dữ liệu nghiệp vụ, trả kết quả từng dòng. Đợt hoàn toàn hợp lệ lưu payload và actor trong import_batches, hết hạn 30 phút. Commit khóa batch, kiểm tra actor/kind, chạy lại kiểm tra/quyền/version và chỉ commit nếu tất cả dòng thành công. Payload được xóa sau commit. Đợt đã commit không chạy lại.

Bản ghi cập nhật yêu cầu ID + version trong file xuất; giá dùng SKU+kênh+version. Ô trống giữ dữ liệu trước, `[XÓA]` cho trường được phép rỗng. Không tự tạo danh mục khi tên/mã bị sai. CTV chỉ nhập customers.

Import users kiểm tra giới hạn tài khoản trong cùng advisory lock với tạo/kích hoạt thông thường. Password ngẫu nhiên sinh ở bước commit, lưu hash, trả plaintext một lần trong kết quả; không đưa vào preview, export, nhật ký hoặc payload.

Export theo bộ lọc đã hỗ trợ, tối đa 20.000 dòng và kiểm tra quyền. Mọi ô xuất dạng text để giữ mã/số điện thoại và tránh công thức bị thực thi. Chưa có chọn dòng, nhiều sheet nhập liên thông hoặc background import/export.

## Dashboard

/overview dùng transaction đọc RepeatableRead. Ngày from/to là ngày Việt Nam, chuyển sang UTC, to inclusive bằng mốc đầu ngày tiếp theo. Khoảng tối đa 366 ngày.

- Báo giá tạo trong kỳ theo created_at.
- Báo giá chờ phản hồi hiện tại là sent còn hạn; quá hạn tính riêng.
- Tiền hàng hoàn tất theo completed_at, chỉ status completed, không vận chuyển.
- Hoa hồng chưa chi là số dư pending+approved hiện tại, không phải tổng phát sinh trong kỳ.
- Team tối đa 10 CTV theo tiền hàng hoàn tất; chỉ quản lý nhận dữ liệu team.

Bộ lọc chỉ gắn với màn hình overview; bấm sang Báo giá/Đơn/Hoa hồng mở danh sách chung có quyền xem, chưa tự mang theo tất cả bộ lọc dashboard. Mở mã báo giá cụ thể đi đúng bản ghi.

## Schema và nâng cấp

Giữ migration 001 và 002 nguyên byte; 003 bổ sung danh mục, mẫu/size, nhóm khách, import và snapshot chuẩn bị. SKU cũ giữ ID, gắn một mẫu tương ứng; không đoán size. Khi lập mới, SKU chưa có quy cách bị chặn để quản lý xác nhận.

Có 20 bảng ứng dụng, cộng schema_migrations. Db.Migrate dùng transaction và advisory lock; checksum SHA-256 bảo vệ file đã áp dụng. Không sửa migration đã chạy, dùng 004 cho nâng cấp tiếp theo.

Backup JSON xuất 19 bảng, bỏ sessions, gồm các danh mục/mẫu và metadata import. Restore theo thứ tự FK, một transaction, chỉ trên schema trống với danh mục mặc định nguyên trạng. Không ghi đè dữ liệu đã seed hoặc đã chỉnh. Ảnh backup riêng. Với dữ liệu lớn, ưu tiên pg_dump và thử phục hồi.

## Mở rộng tiếp

Tìm/phân trang server cho SKU/mẫu/khách/CTV/chứng từ. Hiện dùng OFFSET và ILIKE: đủ để loại tải toàn bộ, nhưng trang rất sâu và tìm chứa từ vẫn cần đo EXPLAIN và bổ sung cursor/pg_trgm khi có bằng chứng chậm. Danh mục dùng chung được tải như danh sách nhỏ, chưa phân trang.

Pool database, rate limiter trong bộ nhớ từng instance và export trong RAM là giới hạn phải xem lại trước khi tăng tải hoặc chạy nhiều replica. Chưa benchmark số người truy cập đồng thời. Không cần chuyển microservices chỉ để tăng số CTV.
