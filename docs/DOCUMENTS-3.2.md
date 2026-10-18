# AMORA Studio 3.2 — phân tích và hướng dẫn cập nhật

## 1. Phạm vi đã thực hiện

### Tick nhập giá hàng loạt

Bảng giá có checkbox theo dòng và checkbox đầu bảng. Checkbox đầu bảng chọn đúng trang hiện tại; lựa chọn được giữ khi chuyển trang hoặc đổi bộ lọc, tối đa 50 SKU. Thanh hành động có nút nhập giá lẻ, sỉ, doanh nghiệp. Bảng chỉnh sửa hiển thị giá/MOQ/hoa hồng hiện tại để sửa từng dòng, hoặc dùng giá trị dòng đầu cho tất cả. Lưu một lần vào transaction; một dòng sai, trùng hoặc có version cũ thì toàn bộ đợt chưa được ghi. Không tự gửi lại POST khi mạng lỗi.

### Loading và phân trang

Hook useLoad trả data/error/loading, bỏ kết quả cũ khi đổi URL hoặc revision và hủy fetch không còn dùng. Những truy vấn chỉ phục vụ form được bật khi cần, thay vì tải mọi danh sách ngay khi mở trang. Bảng sản phẩm, giá, khách, danh mục, báo giá/đơn, CTV, hoa hồng và dashboard có trạng thái tải. Nút phân trang khóa trong lúc tải để tránh bấm liên tiếp. Không hiển thị thông báo danh sách trống khi thực tế đang chờ dữ liệu.

### Mẫu báo giá có biến

Menu mới “Mẫu chứng từ”, chỉ Quản lý chỉnh sửa. Có sẵn mẫu thông thường và mẫu quà tặng doanh nghiệp, theo các phần trong tài liệu tham khảo: thông tin công ty, tiêu đề, khách hàng/người liên hệ, lời mở đầu, bảng hàng, ghi chú và điều kiện. Logo được lấy từ chính PDF được cung cấp; không tạo logo giả. Thông tin công ty lấy từ Thiết lập đang có, không ghi đè cấu hình bằng dữ liệu mẫu.

Mỗi mẫu có mã, tên, tiêu đề, lời mở đầu, tiêu đề điều kiện, nội dung điều kiện, số ngày hiệu lực mặc định, danh sách biến (tối đa16). Biến hệ thống: {{customer_name}}, {{company_name}}, {{seller_name}}, {{quote_code}}, {{quote_date}}, {{valid_until}}. Biến tùy chỉnh có nhãn và giá trị mặc định; ví dụ người liên hệ, đóng gói, thuế/vận chuyển, thời gian sản xuất, điều khoản thanh toán. Khi tạo báo giá, chọn mẫu rồi điền các biến này; có thêm ô điều kiện riêng. Server kiểm tra biến có trong mẫu, không chạy JavaScript, HTML hay biểu thức tính toán.

Quản lý có thể nhân bản, sửa, xóa mẫu; xuất toàn bộ bộ mẫu JSON; import JSON để xem trước và chỉnh, rồi bấm Lưu mẫu chung. Server có optimistic version để không ghi đè thay đổi của người khác. Import giới hạn500KB, tối đa12 mẫu. Đây là import cấu hình JSON có cấu trúc, không phải chuyển mọi PDF/DOCX thành mẫu sửa được.

Báo giá có chọn mẫu lưu snapshot của mẫu + biến ngay khi tạo/sửa bản nháp. Sau này đổi hoặc xóa mẫu chung, PDF báo giá cũ vẫn dùng snapshot đã lưu. Chứng từ cũ trước nâng cấp vẫn xuất bằng bố cục cơ bản. Chuyển mẫu về cơ bản trong form sẽ xóa snapshot theo yêu cầu rõ ràng; API client cũ không gửi trường mới không tự làm mất snapshot.

### Catalogue PDF kèm ảnh cho Quản lý và CTV

Trong Danh mục sản phẩm, tick tối đa50 SKU qua nhiều trang rồi bấm “Catalogue / PDF”. Có xem trước, tiêu đề, người/đơn vị nhận, ngày lập, người liên hệ, hiệu lực, ghi chú; có bật/tắt giá và MOQ. Dùng ảnh thật đầu tiên của từng SKU. Thiếu ảnh hoặc tải lỗi thì PDF hiện “Chưa có ảnh”, và UI báo số sản phẩm thiếu ảnh. Không dùng ảnh giả để thay thế.

Quản lý chọn giá lẻ/sỉ/doanh nghiệp. CTV chỉ xuất giá lẻ; API kiểm tra lại quyền, SKU phải đang hiển thị và mẫu/nhóm/mùi cũng đang dùng. Endpoint xuất không trả commission_rate, dữ liệu chủ sở hữu, mật khẩu hoặc object_key R2. Nếu SKU đã bị ẩn/xóa giữa lúc chọn và xuất, toàn bộ yêu cầu bị từ chối để người dùng chọn lại, không âm thầm bỏ sản phẩm.

Ảnh tải qua API bảo vệ hiện có; trình duyệt nén xuống tối đa640px trước khi nhúng PDF. PDF được dựng tại máy người dùng với font tiếng Việt, thư viện chỉ tải khi xuất. Không gọi dịch vụ PDF ngoài và không lưu thêm bản PDF lên backend. Mô tả dài có phần tiếp theo, không cắt mất toàn bộ phần vượt thẻ. Bố cục A4, lặp đầu/trang và số trang.

### Bảng giá bậc số lượng theo tài liệu tham khảo

PDF tham khảo có bốn mức <12, >=12, >=50, >=100; chúng không đồng nghĩa với retail/wholesale/b2b. Vì vậy trong cửa sổ xuất của Quản lý có loại tài liệu “Bảng giá bậc số lượng”. Bốn nhãn cột chỉnh được; nhập giá của từng SKU cho tài liệu này, trống sẽ xuất “Liên hệ”. Có ngày lập, hiệu lực, người liên hệ và ghi chú. Xuất A4 ngang. Có thể lưu bản nháp JSON theo khách, import lại để sửa; chỉ chấp nhận SKU nằm trong danh sách hiện đang tick và giá nguyên hợp lệ. Bản nháp này là file người dùng giữ, không thêm bảng lưu dữ liệu khách trùng lặp.

Bảng giá bậc là tài liệu chào giá riêng, không ghi đè bảng giá bán, không tự tạo đơn hoặc tổng tiền dựa trên bậc. Báo giá có số lượng cụ thể trong mục Báo giá vẫn tính theo giá đã chọn và snapshot trên server. Thuế/phí vận chuyển không tự suy ra từ PDF cũ hay tự cộng theo phần chữ ghi chú.

## 2. Thiết kế dữ liệu và hạ tầng nhẹ

| Thay đổi | Cách lưu | Lý do |
|---|---|---|
| Bộ mẫu chung | Một khóa document_templates trong settings.value JSONB; dùng version có sẵn | Không thêm bảng/dịch vụ cho cấu hình nhỏ |
| Mẫu đã dùng trong báo giá | quotes.document_snapshot JSONB | Giữ nguyên chứng từ lịch sử |
| Giá hàng loạt | Bảng prices hiện có, transaction + version từng dòng | Không tạo bản sao giá hoặc bảng trung gian |
| Catalogue | Truy vấn theo danh sách tối đa50 ID, chỉ dữ liệu được phép | Không quét/tải toàn bộ danh mục |
| Ảnh | product_images + R2/API hiện có | Không thêm hệ lưu trữ |
| PDF và ảnh nén | Trình duyệt | Không cần Chromium/LibreOffice/worker/Redis trên Render |
| Bản nháp giá bậc | Download/import JSON tại máy người dùng | Không tăng bảng nghiệp vụ hoặc hàng đợi |

Migration005 chỉ thêm một cột JSONB, không thêm bảng hoặc index không cần thiết. Tổng số bảng nghiệp vụ của backup vẫn19 (không tính sessions, schema_migrations). Cấu hình mẫu mặc định được trả từ code cho tới khi quản lý lưu, không sinh dữ liệu mẫu vào database lúc khởi động. Không thêm package production: vẫn dùng pdf-lib và fontkit đã có. Bundle chính khoảng91KB gzip ở lần build kiểm tra; phần font/PDF nạp theo yêu cầu. Đây là số đo kích thước build, không phải cam kết tốc độ mạng thực tế.

## 3. Cài đặt

1. Chép đúng các thư mục trong patch vào thư mục gốc repository amora-mini-app. Patch chứa toàn bộ nội dung các file thay đổi, không phải đoạn code chèn tay. Đã gồm thay đổi mã mẫu, size, màu và SKU của các patch trước.
2. Commit/push GitHub. Deploy backend amora-mini-app trước. Giữ Dockerfile Path ./backend/Dockerfile, Build Context ., Root Directory trống như hệ thống đang chạy.
3. Backend tự chạy migration004 (nếu chưa có) và005. Không sửa migration001–003 đã áp dụng, không xóa/reset database. Nếu báo checksum migration thay đổi, dừng và đối chiếu file cũ; không xóa ledger để bỏ qua.
4. Chờ Live. /health phải trả version3.2.0. Sau đó deploy Static Site frontend amora-ctv-mini-app, rồi tải lại trình duyệt.
5. VITE_API_URL và AllowedOrigins đang hoạt động giữ nguyên. Không cần biến môi trường, bucket hay service mới.
6. Mở Thiết lập xác nhận thông tin công ty; vào Mẫu chứng từ để điều chỉnh điều kiện kinh doanh thực tế. Thử PDF bằng một SKU có ảnh và giá trước khi gửi khách.
7. Backup mới có schema005_document_templates.sql; dùng scripts/restore.py mới khi phục hồi. Ảnh R2 vẫn cần sao lưu/khôi phục riêng như trước.

Nếu repository đã có các sửa ngoài các patch đã gửi trong cùng file, phải ghép các sửa đó trước khi push; archive này không truy cập được các thay đổi riêng trên GitHub của bạn.

## 4. Rà dữ liệu trước khi xuất

Ảnh bảng giá bạn gửi có một số mã White Tea chứa số120/220 không khớp size ở cột bên cạnh. Hệ thống không suy ngược size từ chuỗi SKU, cũng không tự đổi các mã đã được dùng. Xác nhận size/mùi/màu thực tế trong từng SKU trước khi xuất catalogue. Đổi giá/mẫu hiện tại không cập nhật chứng từ đã chốt. Mẫu sản phẩm nên là loại cốc/dòng sản phẩm; mùi, size và màu nằm ở SKU để tránh lặp thông tin.

## 5. API mới

- GET /api/document-templates: lấy bộ mẫu chung; đăng nhập bắt buộc.
- PUT /api/document-templates: {version,templates}, Quản lý; kiểm tra biến và optimistic version.
- POST /api/prices/batch: {items:[{productId,price:{channel,unitPrice,minQty,commissionRate,version}}]}, Quản lý; tối đa150 mức giá, transaction toàn bộ.
- POST /api/catalogue/export-data: {ids:[...],channel}, tối đa50 SKU; CTV chỉ retail; trả projection sản phẩm/giá/ảnh an toàn và thông tin công ty công khai.
- SaleRequest thêm document:{templateId,values} và clearDocument, đều tùy chọn để tương thích client cũ.

## 6. Kiểm tra đã chạy và giới hạn xác nhận

- Backend .NET Release: 0 lỗi, 0 cảnh báo. Frontend TypeScript + Vite production build thành công.
- 294 ca API hồi quy có sẵn; ca màu/SKU/import/export; ca mới kiểm tra mẫu/biến không hợp lệ, version mẫu, snapshot bất biến, chuyển về mẫu cơ bản, lưu giá hàng loạt, rollback khi stale, quyền CTV, chặn SKU ẩn và loại bỏ trường riêng tư khỏi export.
- Khôi phục backup vào database test trống: đủ19 bảng, snapshot mẫu được giữ, ledger5 migrations, không khôi phục phiên đăng nhập và từ chối ghi đè database đã có dữ liệu.
- API client: giữ phiên khi offline/cold start, không tự phát lại POST, đăng xuất khi401.
- React server rendering: 8 màn hình với dữ liệu giả; quyền quản lý/CTV, checkbox chọn; loading thực tế trên6 màn hình, không báo danh sách rỗng khi tải, khóa hai nút phân trang.
- Xuất và render PDF kiểm tra: catalogue có ảnh, ô thiếu ảnh, mô tả dài; bảng giá bậc nhiều trang; báo giá60 dòng với biến người liên hệ và đóng gói. Đã xem ảnh render đầu/cuối, kiểm tra chữ Việt và phân trang.
- Các API test chạy trên PGlite qua PostgreSQL socket, không phải Neon production. CI được cập nhật để chạy suite trên PostgreSQL17. Chưa thực hiện thao tác thật trong trình duyệt/điện thoại hoặc deploy trực tiếp Render/R2/Neon của bạn.
- Không hỗ trợ import PDF/DOCX để giữ mọi bố cục tùy ý. Mẫu JSON và các phần văn bản/chọn trường đã nêu là cơ chế chỉnh sửa trong bản này. Không có trình thiết kế kéo-thả hay tính giá bậc tự động trong engine bán hàng.

## 7. File thay đổi

Xem CHANGED-FILES-3.2.txt ở gốc patch. Các file tests/docs không bắt buộc cho runtime nhưng được kèm để người duy trì có thể kiểm tra lại. Thư mục node_modules, bin, obj, dist, file .env, backup, log và dữ liệu test sinh ra không nằm trong patch.
