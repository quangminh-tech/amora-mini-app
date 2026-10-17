# Hạ tầng AMORA Studio 3.0

Giữ phương án React tĩnh trên Pages, API Docker .NET trên Render, PostgreSQL trên Neon và ảnh private R2. Local dùng Docker Compose với PostgreSQL và thư mục ảnh trong volume.

Đây là thiết kế triển khai, không xác nhận các tài khoản cloud của người dùng đã được kết nối hoặc deploy thành công. Giá, hạn mức và yêu cầu thanh toán của từng nền tảng cần kiểm tra lại khi chọn gói.

- Database runtime dùng connection string pooler; migration dùng kết nối direct cùng database.
- Cấu hình AllowedOrigins theo URL frontend thực tế; không dùng tên miền dự kiến làm bằng chứng đã có website.
- Production bắt buộc cấu hình R2 hợp lệ. Backend giữ key, frontend không nhận key.
- `/health` là liveness, không truy vấn database; `/api/admin/readiness` và storage-check để quản lý kiểm tra thực tế.
- Render phải build context ở gốc repo và Dockerfile `backend/Dockerfile` để có đủ migrations.
- Không dùng ổ tệp tạm của Render thay kho ảnh bền vững.
- Không dùng lại mật khẩu/khóa trong tài liệu mẫu. Secrets chỉ đặt tại Environment của dịch vụ.
- Giới hạn request hiện ở mỗi instance; xem DESIGN-3.md trước khi chạy nhiều replica.
- Trước khi dùng dữ liệu thật: kiểm tra login/đổi mật khẩu, ảnh R2, tạo báo giá/PDF, đơn mẫu/hoa hồng và phục hồi backup trên môi trường riêng.

Xem DEPLOY.md cho thao tác cài đặt và README cho nâng cấp schema.
