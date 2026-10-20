# AMORA Catalogue 3.4.1 — Bộ ảnh toàn khung

Bản nâng cấp dành cho module Catalogue 3.4 đã cài. Gói chứa file đầy đủ để thay thế, không phải đoạn diff.

## Cách cập nhật

1. Giải nén vào thư mục gốc repo (cùng cấp backend/, frontend/).
2. Thay các file đúng đường dẫn trong FILES-BO-ANH-3.4.1.md.
3. Deploy backend trước, sau đó frontend. Giữ nguyên biến môi trường hiện tại.
4. Backend health version 3.4.1. Không có migration mới, không chạy SQL; các thuộc tính mới được lưu vào JSON catalogue đã có.
5. Catalogue cũ vẫn giữ bố cục đang dùng. Không tự sửa các catalogue đã phát hành. Chỉnh bản nháp và phát hành lại khi muốn thay bản CTV đang xem.

## Dùng ngay tại vị trí trong ảnh bạn gửi

- Bấm Sửa mục của bộ ảnh → Bố cục → Bộ ảnh toàn khung.
- Chọn Số cột ảnh = 1 để một ảnh chiếm toàn chiều ngang khung catalogue.
- Cách hiển thị ảnh = Lấp đầy khung nếu muốn ảnh phủ kín; có thể cắt bớt cạnh ảnh nhưng không kéo méo.
- Nếu muốn giữ nguyên toàn bộ ảnh, chọn Tỷ lệ khung ảnh = Theo tỷ lệ ảnh gốc.
- Tỷ lệ cố định: 16:9, 4:3, 1:1, 3:4.
- Số cột: 1–4; Khoảng cách và Bo góc: 0–32px.
- Mỗi ảnh có thanh chỉnh trái/phải và trên/dưới riêng khi dùng cover và tỷ lệ cố định. Đổi thứ tự ảnh không làm mất vị trí cắt của ảnh đó.
- Bỏ trống Tiêu đề và Mô tả nếu chỉ muốn bộ ảnh: hệ thống không giữ lại cột chữ trống.
- + Bộ ảnh mới mặc định là toàn khung, 1 cột, tỷ lệ 16:9, cover.
- Bộ ảnh tối đa 12 ảnh; mục sản phẩm giữ tối đa 4 ảnh. Tải/chọn từng ảnh từ thư viện như trước.
- Bỏ ảnh khỏi mục cũng xóa cấu hình cắt của ảnh khỏi mục. Ảnh vẫn trong thư viện, không xóa R2.
- Xem điện thoại: tối đa 2 cột để ảnh dễ xem. Bản in vẫn theo số cột đã chọn.
- Lưu → Xem trước → In / Lưu PDF. Muốn CTV thấy bản mới, quản lý bấm Phát hành cho CTV.

## Bản in

Toàn khung nghĩa là toàn chiều ngang vùng catalogue, không phải in tràn mép vật lý A4. Bản in vẫn có lề A4 12mm để phù hợp máy in/trình duyệt.

Bộ ảnh full không còn bị giới hạn khung ảnh rộng 125mm như bố cục cũ. Ảnh gốc quá cao được giới hạn trong vùng in; bộ ảnh dài có thể qua nhiều trang, từng ảnh tránh ngắt giữa trang. Ảnh/nhóm quá cao hoặc nhiều cột cần kiểm tra Print Preview trước khi gửi.

## Kiểm tra

- Frontend build thành công.
- Backend build .NET 10 thành công, không warning/error.
- 21 ca validation gồm giới hạn 12 ảnh, số cột, khoảng cách, tỷ lệ, crop ngoài giới hạn và crop trỏ ảnh không tồn tại trong mục.
- Kiểm tra trình duyệt với API giả lập: xem báo cáo trong file test kèm theo; không kết nối database production.
- Chưa deploy, chưa kiểm tra R2/Neon thật. Nghiệm thu: lưu bộ ảnh → mở lại → nhân bản catalogue có crop → phát hành → đăng nhập CTV xem → xuất PDF.

## Lưu ý tương thích

Backend 3.4 chưa biết layout full và các trường mới, nên phải deploy backend mới trước frontend mới để lưu không bị từ chối/mất cấu hình. Khi rollback frontend cũ có thể bỏ mất các trường mới nếu sửa rồi lưu lại; nên tạm dừng chỉnh catalogue trong lúc rollback.
