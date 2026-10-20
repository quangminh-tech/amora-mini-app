# AMORA Mini App 3.4 — Catalogue riêng trên menu

Bản bổ sung dựa trên ZIP amora-mini-app-main do bạn gửi (health backend trước sửa 3.3.2).
Các tệp trong patch là TOÀN BỘ nội dung file, không phải những đoạn phải tự ghép.

## Cài đặt

1. Tạo branch/backup source trước khi ghi đè. Thử trên Neon branch dành cho kiểm tra nếu có.
2. Giải nén patch vào THƯ MỤC GỐC repo: nơi có backend/, frontend/, database/ và amora-mini-app.sln. Không giải nén bên trong frontend/src.
3. Copy các file mới và thay các file cùng đường dẫn. Không thay/xóa migrations 001–006.
4. Kiểm tra frontend:

   cd frontend
   npm ci
   npm run build

5. Ở thư mục gốc repo, kiểm tra backend:

   dotnet build backend/Amora.Api.csproj
   dotnet run --project tests/Studio.Checks

6. Push lên GitHub và deploy backend trước. Hệ thống Db.Migrate hiện có tự đọc migration 007 khi startup, sử dụng ConnectionStrings__Migrations (Neon direct). Không cần chạy SQL thêm bằng tay.
7. Sau khi backend khởi động thành công và /health trả version 3.4.0, deploy frontend. Giữ nguyên các biến Neon/R2/AllowedOrigins/VITE_API_URL đang hoạt động.
8. Đăng nhập lại và mở menu Catalogue nằm ngay dưới Danh mục sản phẩm.

Nếu migration lỗi: giữ frontend cũ, xem log backend. Không xóa database hoặc sửa checksum migration cũ. Rollback code về bản cũ có thể giữ lại hai bảng catalogue mới.

## Sử dụng

- Catalogue → Tạo catalogue → nhập tên.
- Sửa tiêu đề bìa, lời giới thiệu, liên hệ, ghi chú và chọn nền kem/trắng/charcoal.
- + Chọn sản phẩm: tìm SKU, bấm ảnh muốn dùng hoặc Chọn sản phẩm. Tên, mô tả, SKU, quy cách, giá lẻ tham khảo (quản lý) được điền một lần.
- Thông tin và ảnh là bản sao: sửa catalogue không sửa sản phẩm gốc. Bấm Đổi / lấy lại dữ liệu sản phẩm nếu muốn lấy lại nguồn mới; thao tác này thay nội dung của mục đang chọn.
- + Văn bản / + Bộ ảnh / + Bảng để thêm nội dung độc lập với SKU.
- Bấm Sửa mục trên bản xem trước để mở công cụ chỉnh mục tương ứng.
- Mỗi mục sản phẩm/bộ ảnh có tối đa 4 ảnh. Bấm + Ảnh để chọn lại từ thư viện hoặc upload. Chọn Hiện trọn sản phẩm hoặc Lấp đầy khung, chỉnh vị trí dọc, đổi thứ tự ảnh.
- Bố cục: ảnh trái/chữ phải, ảnh lớn/chữ dưới, thẻ gọn. Không tự gom hay đổi SKU.
- Bảng: sửa tên cột/ô, thêm xóa hàng/cột hoặc Điền từ sản phẩm đã chọn. Tối đa 6 cột, 40 hàng.
- Mục có thể lên/xuống, nhân bản, xóa hoặc bắt đầu trang PDF mới.
- Nút Nhân bản ở danh sách tạo một catalogue mới, dùng lại ảnh bất biến trong R2, không upload lặp byte ảnh.
- Lưu là thủ công. Có nhắc khi đóng tab hoặc đổi menu mà chưa lưu. Nên lưu thường xuyên.

## Quản lý và CTV

- Quản lý: xem/sửa mọi catalogue, nhập giá tham khảo, phát hành/thu hồi bản chung.
- CTV: tạo và sửa bản của mình; xem các bản chung quản lý đã phát hành; nhân bản mẫu chung thành bản riêng. Không mở bản nháp của người khác.
- CTV không nhập trường giá trong catalogue riêng; API cũng chặn showPrices/Price khi CTV lưu. CTV vẫn có thể xem giá trên bản chung đã được quản lý phát hành.
- Bảng/văn bản tự do chỉ là nội dung giới thiệu. Đơn giá giao dịch, MOQ, margin và hoa hồng phải xử lý tại Báo giá theo chính sách hiện có.
- Phát hành tạo bản chụp nội dung và tên tài liệu. Sửa bản nháp không làm bản CTV đang xem thay đổi. Phát hành lại để thay bản chung.
- Thu hồi ẩn bản chung trong app; không thu hồi được PDF người dùng đã tải.
- Lưu trữ ẩn catalogue khỏi danh sách; không xóa R2. Chưa có giao diện khôi phục trong bản này.

## Ảnh và giới hạn

- Ảnh nguồn PNG/JPEG/WebP tối đa 12 MB, dưới 40 megapixel trong UI.
- UI nén JPEG cạnh dài tối đa 1800px; file sau nén/API upload tối đa 2 MB.
- API kiểm tra chữ ký định dạng PNG/JPEG/WebP; không nhận HTML/SVG.
- 120 ảnh/catalogue, 100 mục/catalogue, 100 catalogue đang dùng/tài khoản, nội dung JSON tối đa 250 KB.
- Giới hạn này riêng với giới hạn tick 50 SKU của luồng Catalogue/PDF cũ. Không sửa luồng cũ.
- Ảnh từ sản phẩm được sao chép vào vùng catalogue để việc đổi/xóa ảnh SKU không làm đổi bản đã soạn.
- Bỏ ảnh khỏi mục chỉ bỏ liên kết hiển thị, ảnh vẫn ở thư viện để dùng lại và giữ bản đã phát hành. Chưa tự dọn file R2; cân nhắc dung lượng trước khi upload nhiều ảnh mới.
- Ảnh riêng không public; lấy qua API có kiểm tra quyền.

## Xem và xuất

- Xem trước / Xem điện thoại. Bấm ảnh mở lớn, Escape để đóng.
- Animation fade/slide nhẹ khi hiển thị; tôn trọng prefers-reduced-motion.
- In / Lưu PDF mở hộp thoại in trình duyệt, chọn Save as PDF. Đây không phải dịch vụ backend tạo PDF tự động.
- Khổ A4, tỉ lệ 100%, bật Background graphics, tắt Header/Footer trình duyệt; xem các trang trước khi lưu.
- Nội dung in trong iframe riêng, không kèm menu và công cụ chỉnh sửa. Chờ ảnh/phông trước khi in; ảnh đang tải/lỗi sẽ được báo.
- Bảng dài lặp header khi trình duyệt hỗ trợ, tránh tách hàng; mục văn bản dài có thể chạy sang trang tiếp theo. Bấm Bắt đầu trang PDF mới để chủ động bố cục.
- PDF không có animation. Catalogue web trong app có animation.
- Chưa có link công khai cho khách không đăng nhập, chưa có export HTML offline. Gửi PDF cho khách. Không thêm endpoint public bỏ qua middleware đăng nhập.

## Database

Migration 007 chỉ thêm:
- catalogue_documents: owner, tên, JSON nội dung, JSON phát hành, version, archived, timestamps.
- catalogue_assets: document_id, object_key, MIME, caption, byte_size.

Không sửa dữ liệu products/prices/product_costs/quotes/orders. Giá vốn và hoa hồng không có trong model Catalogue Studio.
Version được kiểm tra trong transaction cùng row lock, chống ghi đè bản sửa từ tab khác. Khi gặp 409, giữ nội dung đang sửa để đối chiếu, mở lại dữ liệu mới rồi chỉnh lại; không ép version.
Ảnh dùng lại khi nhân bản có thể chung object_key, nên không xóa vật lý chỉ theo một document_id.

## Kiểm thử

Xem KIEM-THU-CATALOGUE-3.4.md. Chạy thêm nghiệm thu trên Neon branch và R2 staging trước khi dùng thật.
