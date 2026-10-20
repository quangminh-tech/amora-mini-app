# AMORA Mini App 3.5 — Landing page, tầng hương và bảng giá dễ hiểu

Bản source đầy đủ được cập nhật trên nền 3.4.1. Có migration mới 008; không đổi mã SKU, dung lượng, giá, giá vốn hoặc chính sách đang lưu.

## A. Chọn đúng bảng giá

Danh mục sản phẩm hiển thị **giá lẻ**. “MOQ lẻ / HH lẻ” là số lượng tối thiểu và hoa hồng cho giá lẻ, không phải chính sách doanh nghiệp.

Vào **Bảng giá → Sỉ & doanh nghiệp · Theo số lượng**:
1. Chọn nhóm, ví dụ “Nến thơm”. Khi chưa chọn nhóm, màn hình có hướng dẫn 4 bước.
2. Chọn kênh “Bán sỉ” hoặc “Doanh nghiệp”.
3. Điền bậc số lượng và hoa hồng, sau đó nhập giá theo đúng SKU ở mỗi bậc.
4. Bật “Kích hoạt chính sách”, bật “Cho CTV báo giá theo chính sách” nếu áp dụng cho CTV, rồi lưu toàn bộ.

Ngưỡng 10/30 sỉ, 20/50 doanh nghiệp và hoa hồng 5%/3% ở form mới là **gợi ý bản nháp**, không phải chính sách đã kích hoạt. Chủ shop phải kiểm tra và lưu. Giá để trống tại bậc nghĩa là SKU chưa được báo tại bậc đó; không tự lấy bậc thấp hơn hoặc giá lẻ thay thế.

Ví dụ: chính sách doanh nghiệp có ngưỡng 20, tổng 10 White Tea + 10 Sandalwood **cùng nhóm** đạt 20. Đơn chỉ có 5 hũ chưa đạt. Nến và phụ kiện thuộc hai nhóm khác nhau không cộng chung. Mỗi SKU có đơn giá riêng dù cùng đạt một bậc.

Bậc có ngưỡng cao nhất mà tổng số lượng đạt được sẽ áp dụng. Mỗi bậc lưu giá theo `pricing_tiers + pricing_tier_prices`; giá lẻ vẫn ở `prices`, không nhân đôi hoặc tự sửa dữ liệu lẻ.

Trong **Tạo báo giá**:
- “Bảng giá áp dụng” nói rõ đang dùng kênh nào; hiển thị thêm SKU và giá lẻ tham khảo.
- Thiếu chính sách/thiếu giá doanh nghiệp sẽ có thông báo đúng kênh, không còn nhãn mặc định “Bán lẻ”.
- Có thể chủ động bấm “Dùng bảng giá bán lẻ cho báo giá này”: giữ khách, sản phẩm, số lượng, tính lại giá/hoa hồng theo lẻ. Đây là chuyển bảng giá có chủ đích, không âm thầm áp giá lẻ vào kênh doanh nghiệp.
- Khi đã dùng chính sách số lượng, CTV không sửa đơn giá hay vượt MOQ, quyền hoặc ngưỡng lợi nhuận.
- Báo giá/đơn cũ dùng snapshot đã chốt, không tự thay đổi khi chỉnh bảng giá.

Nếu vẫn có giá lẻ trong danh mục nhưng API retail báo thiếu, chạy **docs/kiem-tra-gia.sql** (chỉ SELECT) trong SQL Editor đúng branch/database. Đối chiếu product_id, payload channel và hai chuỗi connection trên Render. Bộ source này không truy cập hoặc cập nhật database production.

## B. Catalogue → Link landing page

1. Mở Catalogue, tạo/chỉnh nội dung, chọn sản phẩm, tải ảnh hoặc thêm bộ ảnh tùy bố cục.
2. Quản lý bấm **Phát hành & tạo link**. Bản chưa lưu sẽ được lưu trước khi phát hành.
3. Sao chép link dạng `https://ten-mien-app/?catalogue=<ma-ngau-nhien>` và gửi khách. Khách không cần tài khoản.
4. Khách xem ảnh, nội dung, tầng hương nếu đã bật, phóng to ảnh và **In / Lưu PDF**.
5. Sửa nháp không thay nội dung công khai. Phát hành lại để cập nhật khách.
6. **Đổi link / vô hiệu link cũ** tạo link mới. **Thu hồi** hủy link hiện tại; phát hành lại tạo link mới. Lưu trữ cũng chặn truy cập công khai.

Các catalogue đã phát hành ở phiên bản cũ **chưa tự trở thành công khai**. Quản lý mở và phát hành lại để tạo link.

Link là công khai cho bất kỳ ai có link, có thể được người nhận chuyển tiếp. Noindex giúp hạn chế lập chỉ mục, không phải mật khẩu. Nội dung/ảnh/PDF đã tải không thể thu hồi từ máy người nhận. Kiểm tra phần liên hệ/văn bản trước khi phát hành.

Chỉ gửi snapshot đã phát hành và ảnh đang được snapshot đó tham chiếu. Không gửi giá vốn, hoa hồng, thông tin tài khoản, draft hoặc product_id nguồn. SKU, giá tham khảo được quản lý chủ động bật và văn bản tự nhập là nội dung công khai. Chỉ quản lý phát hành/đổi/thu hồi; CTV vẫn có thể xem và chia sẻ bản được phát hành.

Frontend public không gọi `/auth/me`, không đính kèm token nội bộ. Backend công khai chỉ đọc `/api/public/catalogues/...`; API ghi và API nội bộ tiếp tục cần đăng nhập. Kho R2 không cần đổi thành public bucket.

## C. Hiểu mùi hương cho CTV

Menu mới **Hiểu mùi hương**:
- Chọn mùi; xem 3 thẻ Hương đầu / Hương giữa / Hương cuối.
- Sơ đồ ba tầng có sẵn; quản lý có thể tải ảnh riêng cho từng tầng. Ảnh được nén JPEG trước khi gửi, tối đa 2MB sau nén.
- Chỉnh nội dung tại **Danh mục dùng chung → Mùi hương**. CTV chỉ đọc; mùi ngừng sử dụng không hiện cho CTV.
- Dùng mô tả thật đã xác nhận. Sơ đồ giải thích cách đọc hương, không đưa lịch tỏa hương theo phút hay tự nhận là thành phần nguyên liệu.

Catalogue lấy bản sao tầng hương khi chọn sản phẩm. Với mục cũ, chọn mục → **Cập nhật riêng tầng hương** → Lưu → Phát hành lại. Có ô bật/tắt hiện tầng hương. Ảnh nguyên liệu ở thư viện CTV chưa tự chèn vào catalogue; có thể thêm bộ ảnh riêng vào catalogue. Snapshot công khai dùng sơ đồ ba tầng và văn bản đã lưu, nên không bị đổi ngoài ý muốn khi chỉnh thư viện.

## D. Triển khai

1. Sao lưu DB hiện tại và bảo vệ bản sao ảnh R2.
2. Dùng nguyên source đầy đủ này hoặc chép các file theo FILES-3.5.md nếu dự án đang đúng nền 3.4.1. Không ghi đè `.env`/cấu hình bí mật.
3. Triển khai backend trước. Startup chạy migration **008_public_catalogue_and_scent_images.sql** qua connection migrations hiện có. Không chỉnh migration 001–007 đã chạy.
4. Chờ `/health` trả phiên bản 3.5.0, sau đó build/deploy frontend với cùng `VITE_API_URL` đang dùng. Không cần thêm dịch vụ.
5. Mở app, chọn nhóm và lưu chính sách thực tế; thử báo giá ở dưới/ngang/trên ngưỡng. Thử link ở cửa sổ ẩn danh, rồi thu hồi và xác nhận link cũ không mở được.

Lệnh frontend phải chạy trong thư mục `frontend`: `npm ci`, `npm run build`. Backend: `dotnet build backend/Amora.Api.csproj` (.NET 10).

Backup quản lý nay xuất schema 008 với 26 bảng dữ liệu, gồm catalogue và ảnh tầng hương. File JSON lưu metadata/khóa object, không chứa file ảnh; R2 phải sao lưu riêng. Công cụ scripts/restore.py hỗ trợ schema 001–008, mặc định chỉ kiểm tra, không ghi đè DB có dữ liệu.

## E. Kiểm chứng và giới hạn

Xem BAO-CAO-RA-SOAT-3.5.md. Chưa triển khai Render/Cloudflare, chưa truy vấn DB production. Kiểm tra trình duyệt sử dụng API giả lập; kiểm tra SQL dùng PGlite (PostgreSQL WASM), không thay cho diễn tập phục hồi hoặc test API thật với Neon/R2.
