# Tệp thay đổi bản 3.0 so với bản CTV 2.0

Migration 001/002 giữ nguyên byte. 003 bổ sung danh mục, mẫu/SKU/size, nhóm khách, đợt import và snapshot chứng từ.

## Chỉnh sửa

- `README.md`
- `backend/Data/Db.cs`
- `backend/Data/Seed.cs`
- `backend/Endpoints/Admin.cs`
- `backend/Endpoints/Catalogue.cs`
- `backend/Endpoints/Customers.cs`
- `backend/Endpoints/Sales.cs`
- `backend/Program.cs`
- `docs/API.md`
- `docs/CLOUD-REVIEW.md`
- `docs/DEPLOY.md`
- `docs/DESIGN.md`
- `docs/SCALE-AND-DATABASE.md`
- `docs/TESTING.md`
- `frontend/package-lock.json`
- `frontend/package.json`
- `frontend/src/App.tsx`
- `frontend/src/components/UI.tsx`
- `frontend/src/pages/Catalogue.tsx`
- `frontend/src/pages/Customers.tsx`
- `frontend/src/pages/Dashboard.tsx`
- `frontend/src/pages/Sales.tsx`
- `frontend/src/pages/Team.tsx`
- `frontend/src/pdf.ts`
- `frontend/src/style.css`
- `frontend/src/types.ts`
- `scripts/restore.py`
- `tests/database-upgrade.py`
- `tests/docker-publish.py`
- `tests/integration.py`
- `tests/restore-smoke.py`
- `tests/workspace-smoke.mjs`

## Thêm mới

- `backend/Endpoints/Directories.cs`
- `backend/Endpoints/Overview.cs`
- `backend/Endpoints/Transfers.cs`
- `backend/Services/Workbook.cs`
- `database/migrations/003_catalogue_workspace.sql`
- `docs/DESIGN-3.md`
- `docs/INSTALL-3.md`
- `frontend/src/components/Transfer.tsx`
- `frontend/src/pages/Directories.tsx`

## Bổ sung quyền xóa sản phẩm

- `backend/Endpoints/Catalogue.cs`: DELETE SKU có kiểm tra lịch sử, phiên bản và dọn giá/ảnh.
- `backend/Endpoints/Directories.cs`: DELETE mẫu trống.
- `frontend/src/pages/Catalogue.tsx`: nút xóa và hộp xác nhận XÓA.
- `tests/integration.py`, `tests/workspace-smoke.mjs`: kiểm tra phân quyền, dữ liệu liên kết, phiên bản, xóa và render nút theo vai trò.
- README/API/TESTING cập nhật hướng dẫn.
