# API AMORA Mini

Base: `/api`. JSON camelCase cho request; dữ liệu hàng database trả `snake_case`. Actor đăng nhập trả camelCase. Authorization: `Bearer <opaque token>` cho mọi route trừ login và `/health`.

`400`: dữ liệu/quy tắc không hợp lệ; `401`: chưa đăng nhập/hết phiên; `403`: không có quyền; `404`: không tồn tại; `409`: xung đột phiên bản/trùng dữ liệu; `428`: cần đổi mật khẩu; `429`: quá tần suất.

| Method | Route | Quyền / nội dung |
|---|---|---|
| GET | `/health` | Kiểm tra SQL, không cần đăng nhập, nằm ngoài `/api` |
| POST | `/auth/login` | `{email,password}` → token, user |
| GET | `/auth/me` | Thông tin phiên hiện tại |
| POST | `/auth/logout` | Thu hồi phiên, 204 |
| POST | `/auth/password` | `{currentPassword,newPassword}`; thu hồi mọi phiên |
| GET | `/scents` | Bốn mùi hương chính thức |
| GET | `/products` | `{products,prices,images}`; CTV chỉ active + retail |
| POST | `/products` | Quản lý; `{sku,name,scentId?,description,unit,active}` |
| PUT | `/products/{id}` | Quản lý; giống POST |
| PUT | `/products/{id}/prices` | Quản lý; `{channel,unitPrice,commissionRate,minQty}` |
| POST | `/products/{id}/images` | Quản lý; multipart `file`, `caption` tùy chọn |
| GET | `/images/{id}` | Ảnh private sau kiểm tra đăng nhập và active |
| DELETE | `/images/{id}` | Quản lý, xóa object và bản ghi |
| GET | `/customers` | Quản lý toàn bộ; CTV theo owner |
| POST | `/customers` | `{name,phone,email,address,company}`; owner là người tạo |
| PUT | `/customers/{id}` | Chủ khách hoặc quản lý |
| GET | `/orders` | Tối đa 500 đơn mới nhất theo quyền |
| GET | `/orders/{id}` | `{record,lines,events}` theo quyền |
| POST | `/orders` | SaleRequest, server tự tính tiền/hoa hồng |
| PUT | `/orders/{id}` | Chỉ pending, chưa thu tiền; yêu cầu version |
| POST | `/orders/{id}/status` | `{status,version,reason?}`; CTV chỉ pending→cancelled |
| POST | `/orders/{id}/payment` | Quản lý; `{paid,version,reference}`; `paid` là tổng lũy kế |
| GET | `/quotes` | Tối đa 500 báo giá theo quyền |
| GET | `/quotes/{id}` | `{record,lines,events:[]}` |
| POST | `/quotes` | SaleRequest, CTV theo setting |
| PUT | `/quotes/{id}` | Chỉ draft, yêu cầu version, CTV theo setting |
| POST | `/quotes/{id}/status` | `{status,version}` |
| GET | `/dashboard` | Tổng hợp theo quyền, múi giờ Việt Nam |
| GET | `/commissions` | Tối đa 500 khoản theo quyền |
| POST | `/commissions/{id}/status` | Quản lý; `{status,version,reference?}` |
| GET | `/settings` | Thông tin doanh nghiệp, không có secret |
| PUT | `/settings` | Quản lý; BusinessRequest |
| GET | `/admin/users` | Quản lý; không trả password hash |
| POST | `/admin/users` | Quản lý; `{email,name,role,password}` |
| PUT | `/admin/users/{id}` | Quản lý; `{email,name,active}`; role cố định |
| POST | `/admin/users/{id}/reset-password` | Quản lý; `{password}`, không dùng cho chính mình |
| GET | `/admin/audit` | Quản lý; 200 thao tác mới nhất |
| GET | `/admin/backup` | Quản lý; JSON attachment chứa password hash, không sessions |

## SaleRequest

```json
{
  "customerId": "UUID",
  "channel": "retail",
  "shipping": 25000,
  "note": "Giao giờ hành chính",
  "lines": [{"productId":"UUID", "qty":2, "unitPrice":null}],
  "version": null,
  "ownerId": null,
  "validUntil": "2026-12-31",
  "terms": "Điều kiện báo giá..."
}
```

- `unitPrice=null`: lấy giá hiện hành. CTV không được gửi giá khác bảng retail. Quản lý có thể nhập đơn giá riêng, nhưng sản phẩm vẫn phải có giá cấu hình cho kênh và đáp ứng MOQ.
- `ownerId`: chỉ quản lý được gán khi tạo mới; mặc định là người tạo. Sửa đơn không đổi người hưởng hoa hồng.
- `version`: bắt buộc đúng bản hiện tại khi PUT. POST mới dùng null.
- `validUntil`, `terms`: dùng cho báo giá. Mặc định 14 ngày và điều kiện trong settings.
- Không nhận tiền hàng, tỷ lệ hoa hồng, trạng thái hoặc owner từ CTV để ghi trực tiếp.

## BusinessRequest

```json
{
 "name":"AMORA STUDIO", "tagline":"Simple Moments. Deep Calm.",
 "phone":"", "email":"", "address":"", "taxCode":"", "bank":"",
 "quoteTerms":"Thời gian dự kiến 7–10 ngày...", "ctvQuotes":true
}
```

## Dữ liệu trả về

UUID dạng string; số tiền là number nguyên đồng, giới hạn tổng chứng từ dưới 10^14 để còn trong vùng số nguyên an toàn JavaScript. Timestamp UTC ISO; giao diện hiển thị Asia/Ho_Chi_Minh. `customer_snapshot`, `seller_snapshot`, `detail` có thể là JSON string từ Npgsql/Dapper; frontend dùng `parse` để chuẩn hóa.

PDF được xuất trực tiếp từ dữ liệu báo giá đã lưu trên trình duyệt. Không có endpoint xuất PDF server hoặc dịch vụ bên ngoài.
