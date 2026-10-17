# API AMORA Studio 3.0

Base `/api`, Bearer opaque token. Request camelCase; hàng database trả snake_case. 400 invalid, 401 hết phiên, 403 không quyền, 404 không có, 409 trùng/xung đột, 428 đổi mật khẩu, 429 giới hạn tần suất. `/health` nằm ngoài `/api`, không cần token.

## Danh mục và sản phẩm

- GET `/directories/{kind}`: kind product-categories/customer-groups/scents; CTV chỉ active.
- POST, PUT `/directories/{kind}[/{id}]`: quản lý. `{name,code,sortOrder,active,version}`; scents dùng thêm meaning/topNotes/middleNotes/baseNotes/ritual, không cần code.
- GET `/models?page=1&pageSize=25&search=&category=`: mẫu + nhóm và số SKU.
- POST/PUT `/models[/{id}]`: `{code,name,categoryId,description,active,version}`.
- GET `/products?page=1&pageSize=25&search=&category=&modelId=&status=`: `{products,prices,images,total,page,pageSize}`. category là mã nhóm; status active/inactive; includeIds tối đa 50 UUID để giữ dòng đang chọn.
- POST/PUT `/products[/{id}]`: `{sku,modelId,sizeLabel,scentId?,unit,description,active,version,leadDaysMin,leadDaysMax}`. sizeLabel bắt buộc. PUT cần version; SKU mới version=0.
- PUT `/products/{id}/prices`: `{channel,unitPrice,minQty,commissionRate,version}`; channel retail/wholesale/b2b. Giá mới version=0.
- POST `/products/{id}/images`: multipart file (PNG/JPEG/WebP, ≤5MB); GET/DELETE `/images/{id}`.
- GET `/scents`: danh sách mùi theo quyền.

## Khách, tài khoản và phân trang

- GET `/customers?page=1&search=&group=&ownerId=`: group là mã nhóm khách.
- POST/PUT `/customers[/{id}]`: `{name,phone,email,address,company,note,groupId,version}`. Owner khi tạo là người đăng nhập.
- GET `/customers/duplicates?phone=`: tối đa 10 hồ sơ có quyền xem, không lộ hồ sơ CTV khác.
- GET `/admin/users?page=1&search=&status=&role=`; status active/inactive, role ctv/manager.
- POST `/admin/users`: `{email,name,role,password}`; PUT `/{id}`: `{email,name,active,version}`; POST `/{id}/reset-password`: `{password}`.
- GET/PUT `/admin/account-limits`: `{managers,ctvs,version}`; GET có active_managers/active_ctvs.

Các danh sách customers/models/users/orders/quotes/commissions khi gửi page trả `{items,total,page,pageSize}`. Tối đa 100 dòng/trang. Không có page trả mảng trang đầu (mặc định 25), để tương thích client cũ; không dùng để export toàn bộ.

## Chứng từ

- GET `/orders` hoặc `/quotes`: page/search/status/ownerId.
- GET `/{type}/{id}`: `{record,lines,events,payments,orderId}`; orderId chỉ có ý nghĩa khi xem quote đã chuyển đơn.
- POST/PUT `/{type}[/{id}]`:

```json
{"customerId":"UUID","channel":"retail","shipping":0,"note":"","lines":[{"productId":"SKU_UUID","qty":2,"unitPrice":null}],"version":null,"ownerId":null,"validUntil":"2026-12-31","terms":null}
```

productId tham chiếu products (SKU), không phải mẫu. Quản lý chọn owner khi tạo và giá thỏa thuận; CTV chỉ giá retail. Server kiểm tra MOQ và tính tiền. PUT cần version và chỉ nháp/đơn pending chưa thu.

- POST `/quotes/{id}/status`: `{status,version}`.
- POST `/quotes/{id}/convert`: `{version}`; accepted/còn hạn, trả `{id,alreadyConverted}`. Lặp lại trả cùng đơn; không lấy giá mới.
- POST `/orders/{id}/status`: `{status,version,reason?}`.
- POST `/orders/{id}/payment`: `{paid,version,reference,occurredAt?}`. paid là tổng đã thu lũy kế, chênh lệch được thêm ledger.
- GET `/commissions`, `/commissions/summary`; POST `/commissions/{id}/status`: `{status,version,reference?}`.

## Tổng quan và hệ thống

- GET `/overview?from=YYYY-MM-DD&to=YYYY-MM-DD&ownerId=`: quotes/live/orders/commissions/recent/team/missingPrices/activeCtvs. Khoảng ≤366 ngày Việt Nam; CTV không có team.
- GET `/dashboard`: giữ endpoint tổng hợp v2 để tương thích, giao diện mới dùng overview.
- GET/PUT `/settings`: business; PUT cần version.
- GET `/admin/readiness`, POST `/admin/storage-check`, GET `/admin/audit`, GET `/admin/backup`.
- POST `/auth/login`, GET `/auth/me`, POST `/auth/password`, POST `/auth/logout`.

## Excel

Kinds: product-categories, customer-groups, scents, models, products, prices, customers, users.

- GET `/transfers/{kind}/template`: `.xlsx` tiêu đề tiếng Việt.
- GET `/transfers/{kind}/export`: `.xlsx`, tối đa 20.000 dòng; products hỗ trợ search/category/status, prices search/category, customers search/group, users search/status/role. models và danh mục xuất toàn bộ, chưa áp lọc.
- POST `/transfers/{kind}/preview`: multipart file + mode=create/update. Trả `{id,valid,rows,columns,expiresInMinutes}`. Dòng có row/key/action/error/warning; preview không có password.
- POST `/transfers/{kind}/{id}/commit`: trả `{count,temporaryAccounts}`. Chỉ actor đã tạo batch, chưa hết hạn/chưa committed. Nếu bất kỳ dòng lỗi, rollback toàn bộ.

CTV chỉ import customers; được export products/prices retail và customers thuộc quyền. Mọi import khác và templates tương ứng yêu cầu manager. Giới hạn và quy tắc ô trống/[XÓA] xem README.


## Xóa mẫu và SKU

DELETE `/products/{id}?version=N`: quản lý, chỉ SKU chưa có quote_lines/order_lines. Xóa metadata ảnh và giá trong cùng transaction, dọn object ảnh sau commit. Trả `{message,pendingImages}`. Có ảnh chưa dọn được thì ghi nhật ký và báo số còn lại.

DELETE `/models/{id}?version=N`: quản lý, chỉ mẫu không còn SKU, trả 204. Xung đột phiên bản hoặc có liên kết trả 409; không tìm thấy trả 404. Mọi thao tác có audit.
