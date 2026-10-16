# Thiết kế kỹ thuật và quyết định nghiệp vụ

## Kiến trúc

Frontend React là một SPA tĩnh. Backend ASP.NET Core là nơi duy nhất xác thực, phân quyền, tính giá, thay trạng thái và duyệt hoa hồng. PostgreSQL lưu dữ liệu kinh doanh, R2 lưu binary ảnh. Không có kết nối PostgreSQL trực tiếp từ trình duyệt.

| Thành phần | Trách nhiệm |
|---|---|
| React + TypeScript | Form, tìm kiếm, lọc, dashboard, catalogue, PDF |
| .NET 10 Minimal APIs | Xác thực phiên, kiểm tra quyền và quy tắc, transaction |
| Npgsql + Dapper | Kết nối PostgreSQL, SQL tham số hóa rõ ràng |
| SQL migrations | Baseline schema, ràng buộc, index, lịch sử migration |
| R2 Signature V4 | Kho ảnh private, quyền bucket chỉ ở backend |
| Docker Compose | Chạy local bằng ba container; volume DB và ảnh |

Dùng Minimal API nhóm theo nghiệp vụ thay vì nhiều lớp Controller/Repository rỗng cho từng bảng. `Db` quản lý kết nối, audit và migrations; nghiệp vụ chính ở `Endpoints/Sales.cs`; xác thực và storage ở `Services/`.

## Bảng dữ liệu

Có **15 bảng lõi**, cộng bảng kỹ thuật `schema_migrations`.

| Bảng | Nội dung / ràng buộc chính |
|---|---|
| users | Email unique, 2 role cố định manager/ctv, password hash, khóa và yêu cầu đổi mật khẩu |
| sessions | Hash token unique, hết hạn sau 8 giờ, FK tới user |
| scents | Bốn mùi thật, tầng hương, ý nghĩa và vai trò ritual |
| products | SKU unique, tên, đơn vị, mùi, mô tả, active |
| product_images | Object key unique; không chứa Base64 hoặc binary |
| prices | Unique product + channel; giá >0, MOQ >0, % từ 0–100 |
| customers | Chủ sở hữu, liên hệ, địa chỉ, công ty |
| orders | Chủ đơn, khách và snapshot, tổng tiền, đã thu, hoa hồng, trạng thái, version |
| order_lines | Snapshot tên/SKU/đơn vị/giá/%/thành tiền/hoa hồng |
| quotes | Báo giá, hiệu lực, điều kiện, snapshot khách và người bán, version |
| quote_lines | Dòng báo giá, snapshot tên/SKU/đơn vị/giá |
| commissions | Unique order; người hưởng, số tiền, duyệt/chi, tham chiếu, version |
| audit_logs | Người thực hiện, hành động, entity và dữ liệu đối soát |
| settings | Một bản JSON business; không lưu secrets |
| order_events | Timeline đơn: tạo/sửa/trạng thái/thanh toán, actor và nội dung |

Vai trò lưu trực tiếp trên users vì chỉ có hai loại, chưa cần bảng roles/permissions riêng. Không thêm bảng mạng lưới CTV hoặc quyền động vì không nằm trong phạm vi.

## Tính tiền và trạng thái

`SaleRequest` không nhận total hoặc commission để ghi trực tiếp. Server tra sản phẩm active, bảng giá đúng kênh, kiểm tra MOQ, lấy commission rate hiện hành và tính bằng `decimal`. Dòng hàng trùng bị chặn. Tiền lưu `numeric(15,0)`, tỷ lệ `numeric(5,2)`.

Quản lý được nhập đơn giá riêng khi tạo/sửa, CTV chỉ dùng giá lẻ hiện hành. Lưu snapshot giúp giá mới không làm đổi chứng từ cũ. Chỉnh sửa chứng từ nháp/chờ là hành động tính lại có chủ đích; server không ghi đè chứng từ đã xác nhận.

Khóa hàng PostgreSQL `FOR UPDATE` và kiểm tra version được dùng khi chỉnh đơn, ghi thanh toán hoặc thay trạng thái. Hai request cùng version không thể cùng ghi thành công. Khi phát sinh hoa hồng, database bảo vệ unique order; không dựa vào việc nút UI bị vô hiệu hóa.

Đối với duyệt hoa hồng, thứ tự khóa luôn là **đơn trước, khoản hoa hồng sau**, giống luồng trả hàng/thanh toán để hạn chế deadlock.

## Doanh thu và dòng tiền

- **Doanh thu đơn hoàn tất:** tổng tiền hàng + vận chuyển của đơn completed trong tháng theo `completed_at`, múi giờ Việt Nam. Không phải báo cáo doanh thu kế toán.
- **Đơn trong tháng:** theo ngày tạo đơn. Chờ xác nhận là tập con của các đơn tạo tháng này.
- **Tiền đã thu:** số tiền lũy kế hiện tại trên các đơn tạo trong tháng, loại đơn hủy/trả; không phải sổ thu tiền theo ngày giao dịch.
- **Biểu đồ 7 ngày:** theo ngày hoàn tất, loại đơn đã chuyển returned.
- **Hoa hồng cần thanh toán:** lũy kế pending + approved, không chỉ tháng hiện tại.

Các định nghĩa được thể hiện trên giao diện để quản lý không nhầm giữa giá trị đơn, tiền thực thu và chi phí hoa hồng. Nếu cần thu tiền theo từng giao dịch/tháng hoặc hoàn tiền một phần, nên thêm payment ledger trong phiên bản sau.

## Xác thực và phân quyền

Token 32 byte ngẫu nhiên, chỉ trả một lần cho client. Database giữ SHA256 token, user FK và expiry. Session được kiểm tra với trạng thái active và role mới nhất của user ở mỗi request. Sau truy vấn xác thực, connection được trả lại pool trước khi vào endpoint nghiệp vụ.

Quyền được kiểm tra ở cả danh sách và từng bản ghi. CTV không thể dùng UUID của CTV khác để đọc/sửa khách, đơn, báo giá hoặc hoa hồng. Catalogue của CTV chỉ trả sản phẩm active, giá retail và metadata ảnh của sản phẩm active. Route ảnh kiểm tra lại quyền hiện trạng.

Không dùng cookie xác thực nên không cần chia sẻ cookie giữa Pages/Render, và request thay đổi phải có Bearer token. CORS chỉ cho origin khai báo. Token trong sessionStorage vẫn cần bảo vệ khỏi XSS: React escape dữ liệu, không dùng HTML nội dung khách, CSP giới hạn script cùng origin. Đây là phương án nhỏ, không thay thế SSO/MFA khi quy mô tăng.

## Migration và khôi phục

Startup chạy SQL migration chưa áp dụng trong một transaction, có advisory lock để tránh hai instance cùng chạy. Seed cũng có khóa, chỉ tạo bốn sản phẩm khi chưa có scents và chỉ tạo Bootstrap user khi users đang trống.

JSON export đọc dữ liệu dưới Repeatable Read. Script restore yêu cầu schema đúng và bảng chưa có dữ liệu; phục hồi theo thứ tự khóa ngoại. Không phục hồi sessions. Cloud secrets và ảnh không nằm trong JSON. Full pg_dump là lựa chọn bổ sung để giữ toàn bộ database/schema.

## Các giới hạn nên mở rộng khi cần

1. Thêm phân trang server và filter ngày khi số chứng từ vượt vài trăm.
2. Thêm idempotency key cho tạo đơn/thanh toán nếu tích hợp webhook hoặc mạng không ổn định; hiện version chỉ bảo vệ cập nhật, không chống lặp POST tạo mới sau khi client mất phản hồi.
3. Thêm ledger thanh toán/hoàn tiền và cơ chế thu hồi hoa hồng đã chi nếu nghiệp vụ bắt đầu có trả một phần.
4. Thêm MFA/SSO và rate limiter phân tán khi tăng instance hoặc yêu cầu bảo mật cao hơn.
5. Thêm kiểm tra/resize ảnh ở server và quét file khi mở rộng quyền upload ngoài hai quản lý.
6. Khi cần tăng tài khoản, điều chỉnh giới hạn có test thay vì bỏ kiểm tra quyền theo owner.

Không cần microservices để thực hiện các bước trên.
