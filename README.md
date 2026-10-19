# AMORA Mini 3.3 — Chính sách giá theo số lượng & dashboard CTV

Xem [phân tích CSDL, luồng CTV và triển khai](docs/PRICING-CTV-3.3.md). Danh sách file: CHANGED-FILES-3.3.txt. Deploy backend trước frontend; không reset database.

# AMORA Studio 3.2

Bản cập nhật: tick nhập giá hàng loạt, loading/phân trang, mẫu chứng từ có biến/import JSON, catalogue ảnh/PDF cho Quản lý và CTV, bảng giá bậc số lượng. Hướng dẫn và phân tích: [docs/DOCUMENTS-3.2.md](docs/DOCUMENTS-3.2.md).

# AMORA Studio 3.0 — CTV, sản phẩm nhiều size và báo giá

Full source React + TypeScript, ASP.NET Core .NET 10, PostgreSQL. Giao diện ưu tiên bảng, nền kem ấm và burgundy theo định hướng AMORA. Không có CRM hoặc lịch chăm sóc.

## Chạy local

Mở Docker Desktop. Tại thư mục có `docker-compose.yml`:

```bash
bash scripts/start-local.sh
```

Script tự tạo `.env` nếu chưa có, giữ nguyên file nếu đã có, kiểm tra Compose và build/khởi động ba dịch vụ. Hoặc chạy thủ công:

```bash
python3 scripts/init-env.py
docker compose up --build -d
docker compose ps
```

Mở **http://localhost:3000**.

- Email ban đầu: giá trị `BOOTSTRAP_EMAIL` trong `.env`, mặc định `admin@amora.local`.
- Mật khẩu ban đầu: `BOOTSTRAP_PASSWORD`, được tạo ngẫu nhiên. Mac mở bằng `open -e .env`.
- Đăng nhập lần đầu bắt buộc đổi mật khẩu; sau đó dùng mật khẩu đã đổi.
- `POSTGRES_PASSWORD` là mật khẩu database, không phải mật khẩu đăng nhập app.
- Nếu database đã có tài khoản, sửa bootstrap không đổi mật khẩu cũ.

Local lưu PostgreSQL và ảnh trong volume, không cần Neon, R2 hoặc Base64. Không đưa `.env` lên GitHub.

## Cài bản này khi đang có project cũ

Chép full source vào cùng thư mục project đang dùng, giữ `.env` và cấu hình volume. Chạy `docker compose up --build -d`; migration 003 tự bổ sung cấu trúc mới. Không xóa volume hoặc dùng `down -v` để sửa lỗi đăng nhập.

Bản 3 hỗ trợ đường schema 001 → 002_ctv_workspace → 003_catalogue_workspace. Nếu trước đây bạn dùng nhánh thử nghiệm có file `002_crm_integrity.sql`, không trộn hai nhánh; đọc docs/INSTALL-3.md. Không có yêu cầu tự động xóa database.

## Những phần đã làm

| Mục | Chức năng |
|---|---|
| Tổng quan | Bộ lọc ngày/CTV, báo giá trong kỳ, chờ phản hồi hiện tại, tiền hàng hoàn tất, hoa hồng chưa chi; bảng báo giá và kết quả CTV |
| Sản phẩm | Mẫu riêng, mỗi SKU là một phiên bản mùi/size; bảng, tìm kiếm, phân trang, ảnh theo SKU |
| Bảng giá | Lẻ/sỉ/B2B theo SKU; MOQ, hoa hồng, kiểm tra phiên bản khi sửa |
| Danh mục dùng chung | Nhóm sản phẩm, nhóm khách và mùi; tạo/sửa/ngừng sử dụng |
| Khách hàng | Liên hệ, nhóm, ghi chú ngắn; cảnh báo trùng số thuộc quyền xem; không có CRM |
| Báo giá | Lập theo SKU, theo dõi trạng thái, PDF tiếng Việt, chuyển báo giá đã chấp nhận thành một đơn duy nhất |
| Đơn hàng | Trạng thái, tổng thu lũy kế và sổ thu/điều chỉnh bất biến |
| CTV | Cấp/khóa/reset, chỉ số từng người, giới hạn tài khoản chỉnh được |
| Hoa hồng | Phát sinh khi đơn hoàn tất và thu đủ; duyệt rồi ghi nhận đã chi |
| Excel | Tải mẫu, nhập xem trước, lỗi từng dòng, cập nhật theo phiên bản, xuất toàn bộ kết quả lọc có giới hạn |

## Thiết lập theo thứ tự

1. **Thiết lập:** thông tin AMORA, ngân hàng, điều kiện báo giá và quyền CTV tạo báo giá.
2. **Danh mục dùng chung:** kiểm tra nhóm sản phẩm, nhóm khách, thông tin mùi.
3. **Sản phẩm → Mẫu sản phẩm:** sửa hoặc tạo mẫu, chọn nhóm chính.
4. **Sản phẩm → Phiên bản/SKU:** thêm SKU duy nhất, mùi tùy chọn, size/quy cách, đơn vị và thời gian chuẩn bị.
5. **Bảng giá:** nhập giá thật, MOQ và hoa hồng từng SKU/kênh.
6. **Cộng tác viên:** cấp tài khoản, giao riêng mật khẩu tạm. Tài khoản phải đổi mật khẩu lần đầu.
7. Thêm/nhập khách rồi lập báo giá, xuất PDF. Người nhận mới có thể thêm ngay trong biểu mẫu báo giá.
8. Báo giá đã chấp nhận → Chuyển thành đơn. Giá và tỷ lệ hoa hồng đã chốt được giữ, dù bảng giá mới đã đổi.

Seed chỉ có tên bốn mẫu/mùi từ dữ liệu gốc AMORA và nhóm mặc định. **Không seed SKU, size, đơn giá hay dung tích chưa được xác nhận.** Đây là lý do danh sách SKU mới cài sẽ trống. Mẫu và mùi có thể chỉnh trong giao diện. Ảnh/logo thương hiệu gốc không được tự dựng hoặc tự thêm khi chưa có tệp.

Mỗi mẫu có một nhóm chính, nhiều SKU theo size/mùi. Mỗi SKU có thể có ảnh riêng. Chưa có ảnh dùng chung ở cấp mẫu hoặc set quà tự trừ thành phần kho. Các quy cách như “Set 2 lọ” là phiên bản bán thông thường, không phải BOM/kho.

## Nhập/xuất Excel

Nút Nhập Excel / Xuất Excel ở từng danh sách. Hỗ trợ `.xlsx` và CSV UTF-8 đầu vào; xuất `.xlsx`.

Thứ tự nhập: nhóm → mẫu → SKU → giá; khách và CTV dùng file riêng. Mã tham chiếu và mùi phải tồn tại, đang sử dụng.

- Tối đa 1.000 dòng, 40 cột, file 5 MB; CTV/tài khoản tối đa 100 dòng mỗi đợt.
- File mẫu chỉ có tiêu đề; ô số điện thoại/SKU nên giữ dạng văn bản để không mất số 0.
- Excel nhập từ worksheet `sheet1`, theo cấu trúc file mẫu. Không nhập công thức, macro hoặc liên kết ngoài.
- Chọn **Thêm mới** hoặc **Cập nhật**. Không tự chuyển từ thêm mới thành ghi đè.
- Cập nhật dùng ID và Phiên bản trong file xuất; bảng giá dùng SKU + kênh + Phiên bản.
- Ô trống giữ giá trị cũ; `[XÓA]` chỉ dùng cho trường được để trống như điện thoại/email/ghi chú/mô tả/mùi tùy chọn.
- Xem trước không ghi dữ liệu nghiệp vụ. Chỉ đợt toàn bộ hợp lệ mới có nút xác nhận; xác nhận kiểm tra lại trong transaction.
- Kết quả xem trước hết hạn sau 30 phút. Khi dữ liệu đã thay đổi hoặc đợt đã nhập, phải kiểm tra lại; không nhập lặp.
- Xuất tối đa 20.000 dòng theo bộ lọc đang hỗ trợ. Thu hẹp bộ lọc khi vượt giới hạn. File sản phẩm chứa từng SKU; file giá có từng dòng SKU+kênh.
- Import tài khoản tạo mật khẩu tạm ngẫu nhiên, chỉ hiển thị ở kết quả xác nhận; file xuất thành viên không có mật khẩu.

Xuất hiện hỗ trợ toàn bộ kết quả lọc, chưa có tùy chọn xuất các dòng được tích chọn. Bảng chưa có sửa nhiều ô trực tiếp hoặc kéo thả sắp xếp cột.

## Quyền CTV

CTV chỉ có khách, báo giá, đơn và hoa hồng thuộc mình. Catalogue của CTV chỉ chứa SKU, mẫu, nhóm và mùi đang sử dụng; chỉ giá retail. CTV không được nhập sản phẩm/giá/tài khoản, chỉ được nhập khách của mình và xuất các dữ liệu được xem. Quản lý xem toàn bộ và quản lý cấu hình.

Giới hạn mặc định 2 quản lý, 50 CTV đang hoạt động; chỉnh tại Cộng tác viên. Tài khoản khóa giữ lịch sử và không chiếm chỗ hoạt động. Đây không phải cam kết số người truy cập đồng thời.

## Các nguyên tắc tiền và chứng từ

- Giá VND nguyên đồng; MOQ theo **từng SKU**, không cộng chung mùi/size.
- Cốc B2B từ 20 lọ, sáp mini từ 40 mẫu và 7–10 ngày là gợi ý nhập chính sách, không phải quy tắc ghi cứng cho mọi hàng.
- Nhóm khách không tự quyết định giá bán; chọn kênh giá khi tạo báo giá/đơn.
- CTV dùng giá lẻ đã cấp; giá thỏa thuận chỉ quản lý được nhập.
- Không tự thêm VAT hay giảm giá; phần thuế cần được xác nhận trong điều kiện báo giá. PDF không phải hóa đơn điện tử.
- Chứng từ giữ snapshot tên, mùi/size, đơn vị, giá và thông tin người nhận; thay danh mục không sửa chứng từ cũ.
- Báo giá phải accepted và còn hiệu lực mới chuyển đơn; một báo giá tối đa một đơn. Chưa hỗ trợ tách một báo giá thành nhiều đơn.
- Tiền thu nhập bằng tổng đã thu lũy kế; chênh lệch được ghi vào payments. Không sửa/xóa dòng thu đã ghi.
- Hoa hồng trên tiền hàng, không gồm vận chuyển. Duyệt/chi yêu cầu đơn hoàn tất và thu đủ; trả hàng sau khi chi hoa hồng bị chặn để đối soát riêng.

## CSDL, kiểm tra và triển khai

Đọc docs/DESIGN-3.md, docs/TESTING.md, docs/API.md và docs/DEPLOY.md. Database có 20 bảng ứng dụng, cộng schema_migrations; backup JSON có 19 bảng, không có sessions. Ảnh cần sao lưu riêng.

Giữ cấu trúc frontend/backend/database ở gốc repository. Docker/Render build context gốc, Dockerfile `backend/Dockerfile`; frontend hỗ trợ Pages. Production yêu cầu Neon/R2 cấu hình thật, không dùng khóa mẫu.

Chưa đo tải đồng thời hoặc kiểm tra tài khoản cloud thật trong bản bàn giao. Không có triển khai tự động vào tài khoản của người dùng.


## Xóa sản phẩm (bổ sung)

Quản lý có nút **Xóa** ở từng dòng Phiên bản/SKU và **Xóa mẫu** ở tab Mẫu sản phẩm. Nhập XÓA để xác nhận.

- SKU chưa xuất hiện trong báo giá/đơn nào: xóa được cùng bảng giá và ảnh riêng của SKU.
- SKU đã nằm trong bất kỳ chứng từ nào, kể cả nháp: không xóa; vào Sửa và tắt hiển thị cho CTV.
- Mẫu chỉ xóa khi không còn SKU. Không tự xóa hàng loạt các phiên bản trong mẫu.
- Thao tác kiểm tra version, ghi nhật ký và khóa bản ghi. CTV không có quyền xóa.
- Không thay schema hoặc yêu cầu xóa volume trong bản bổ sung này.
