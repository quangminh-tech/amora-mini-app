# Rà soát AMORA Mini App 3.5 — 20/10/2026

## Kết luận từ source và các ảnh

| Vấn đề | Kết luận | Xử lý |
|---|---|---|
| Danh mục có giá lẻ nhưng báo giá doanh nghiệp trống | Các kênh lưu riêng. `prices(channel=retail)` không tự biến thành giá B2B. Phải kiểm tra policy/bậc/giá từng SKU và số lượng | Thông báo rõ kênh, hiện SKU + giá lẻ tham khảo; nút chuyển toàn báo giá sang bảng lẻ có chủ đích |
| Preview ghi “Bán lẻ” dù đang thiếu giá doanh nghiệp | Lỗi đã xác nhận: nhãn mặc định Bán lẻ ở nhánh không có policy/giá riêng | Backend lấy nhãn đúng từ channel ngay cả khi chưa có giá |
| Màn hình chính sách trống trong ảnh | Chưa chọn nhóm sản phẩm; API editor chỉ gọi khi đã chọn nhóm | Hướng dẫn 4 bước và trạng thái kích hoạt/quyền CTV |
| Hướng dẫn MOQ trong danh mục gây hiểu nhầm | Đang mô tả mọi giá theo SKU, trong khi chính sách bậc tính cùng nhóm | Đổi thành MOQ lẻ / HH lẻ, giải thích bảng sỉ/DN riêng |
| Catalogue không có link khách xem | Trước đây chỉ có bản nội bộ/print | Snapshot công khai theo link ngẫu nhiên; đổi/thu hồi/lưu trữ chặn link |
| CTV thiếu tài liệu hiểu tầng hương có hình | Trường top/middle/base đã tồn tại trong DB | Module Hiểu mùi hương dùng dữ liệu hiện có, sơ đồ và ảnh quản lý tải lên |
| Backup không bao gồm Catalogue Studio | Export chỉ đến schema 006 và công cụ restore chưa hỗ trợ 007/008 | Export 26 bảng/schema 008; restore nhận schema 001–008 |

Chưa có quyền/query kết quả DB production để khẳng định policy B2B hiện có bao nhiêu bậc hoặc giá. Bộ source không tự điền mức giá thương mại, không chỉnh SKU, dung lượng hoặc giá vốn. Dùng docs/kiem-tra-gia.sql để đối chiếu đúng product_id và branch nếu lỗi còn xuất hiện sau triển khai đồng bộ.

## Luồng tính giá đã kiểm tra trong code

- `Catalogue.cs`: GET products trả bảng giá theo product_id; CTV chỉ nhận giá retail ở danh mục.
- `QuantityPricing.cs`: tính số lượng theo category_id, chọn bậc cao nhất đủ ngưỡng cho channel yêu cầu. Thiếu giá ở bậc được chọn bị chặn, không rơi xuống bậc thấp/giá lẻ.
- Chính sách active nhưng ctv_allowed=false vẫn chặn CTV; không mở quyền chỉ vì có giá lẻ.
- Giá vốn chỉ đọc nội bộ để tính margin, không gửi trong preview CTV hoặc landing.
- `Sales.cs`: tính lại phía server khi lưu, kiểm tra preview token, lưu pricing_snapshot và giá/hoa hồng theo dòng. Sửa bảng giá không cập nhật snapshot chứng từ cũ.
- SKU/mẫu/nhóm/mùi ngừng sử dụng bị loại khỏi luồng bán cho CTV. Ví dụ Dolce bị “Đang ẩn” trong ảnh không nên tự bật để làm cho bảng giá có hàng.

## Phân quyền và dữ liệu công khai

- Đường đọc landing tách khỏi app đăng nhập. Không gọi auth/me, không đính kèm token nhân viên, không logout nhân viên khi public link lỗi.
- Slug ngẫu nhiên 32 byte; unique index, query chỉ snapshot được phát hành, chưa lưu trữ, public_enabled=true.
- Typed DTO lọc field ngoài schema và loại product_id nguồn. Tên SKU, văn bản và giá tham khảo chủ động bật là nội dung duyệt công khai.
- API ảnh kiểm tra ID ảnh nằm trong snapshot và document tương ứng. Không dùng ID ảnh để lấy ảnh của draft/document khác.
- Manager mới phát hành, đổi link, thu hồi. Public không có quyền ghi.
- HTTP no-store; noindex/nofollow; referrer-policy no-referrer. Người có link vẫn có thể chia sẻ/tải lại nội dung đã nhận.
- Mọi ảnh sản phẩm/crop/gallery cũ vẫn dùng asset độc lập. Thư viện ảnh tầng hương dùng bảng mới scent_note_images với khóa (scent_id, layer), chỉ ba giá trị top/middle/base, không đổi schema SKU.

## Hạ tầng và chi phí

Giữ .NET + PostgreSQL + R2 và frontend hiện có; không thêm server, Redis, queue, dịch vụ render hay thư viện frontend. Ảnh được nén trên trình duyệt. Bản in dùng iframe và chức năng Lưu PDF của trình duyệt. Fontkit cũ vẫn là chunk PDF lớn (~1,15 MB thô) được Vite tách; cảnh báo kích thước không phải lỗi build, phần mới không thêm fontkit.

## Kiểm chứng đã chạy

- Frontend: `npm ci` và `npm run build` thành công (TypeScript + Vite + hosting headers).
- Backend: build qua `dotnet run` hai project kiểm tra, TreatWarningsAsErrors=true.
- 37 kiểm tra Catalogue Studio/public DTO/slug/image references/phạm vi bypass auth/nhãn kênh giá.
- 12 kiểm tra cấu hình production; 9 kiểm tra origin frontend/cloud.
- API client: offline/HTML/cold-start, giữ phiên đúng, không tự replay POST và xử lý 401.
- Hai kịch bản Playwright với API giả lập: gallery/crop/fullwidth/print; landing không đăng nhập/không token, 404 thu hồi, link không hợp lệ, ảnh và tầng hương, mobile, iframe PDF, quản lý tải ảnh, CTV chỉ đọc, hướng dẫn policy, chuyển B2B sang giá lẻ có chủ đích.
- PGlite chạy đủ migration 001–008: mặc định không public, CHECK publication, đổi/thu hồi slug, khóa mùi và upsert ảnh, ràng buộc layer.
- Restore: Python compile và kiểm tra JSON schema 008 đủ 26 bảng ở chế độ validate-only.

## Giới hạn kiểm chứng cần đọc

Đây là rà soát source và kiểm tra local, không phải chứng nhận toàn hệ thống production. Chưa chạy API thật trên Neon, upload/xóa thật trên R2, migration trên DB đang dùng, phục hồi DB end-to-end, tải đồng thời hoặc triển khai Render/Cloudflare. Các suite Python cũ cần DB riêng và chain dữ liệu không được tuyên bố đã chạy. Browser mock kiểm tra giao diện, không chứng minh response từ backend production. Không có thay đổi giá/DB production được thực hiện.

Sau deploy cần smoke test bằng tài khoản quản lý + CTV thật trên dữ liệu kiểm thử: dưới/ngang/trên MOQ, SKU thiếu giá bậc, quyền CTV, lưu quote rồi đổi policy kiểm tra snapshot cũ, xuất PDF, mở link ẩn danh và thu hồi. Sao lưu ảnh R2 riêng vì JSON chỉ chứa metadata.

## Nguồn kỹ thuật đối chiếu

- PostgreSQL INSERT / ON CONFLICT: https://www.postgresql.org/docs/current/sql-insert.html
- OWASP HTTP Headers Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html

Nội dung mùi và hình ảnh sản phẩm trong app lấy từ dữ liệu AMORA do quản lý lưu; không lấy tầng hương suy đoán từ nguồn web.
