import React, { useEffect, useState, FormEvent, ReactNode } from "react";
import {
  api,
  request,
  token,
  User,
  Row,
  money,
  date,
  labels,
  parse,
  downloadBlob,
} from "../api";
import {
  Icon,
  Badge,
  Empty,
  Field,
  Modal,
  ErrorBox,
  ProductImage,
  useLoad,
} from "../components/UI";
import { Common } from "../types";
export function Settings({ revision, refresh, tell }: Common) {
  const { data, error } = useLoad<Row>("/settings", revision);
  const { data: logs } = useLoad<Row[]>("/admin/audit", revision);
  const [form, setForm] = useState<Row | null>(null),
    [err, setErr] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (data) setForm(data);
  }, [data]);
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/settings", "PUT", form);
      refresh();
      tell("Đã lưu thông tin AMORA.");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <ErrorBox error={error || err} />
      <div className="settings-grid">
        <section className="panel">
          <h2>Thông tin trên báo giá</h2>
          {form && (
            <form onSubmit={save}>
              <div className="form-grid">
                {[
                  ["name", "Tên thương hiệu"],
                  ["tagline", "Thông điệp"],
                  ["phone", "Điện thoại"],
                  ["email", "Email"],
                  ["taxCode", "Mã số thuế"],
                ].map(([k, label]) => (
                  <Field key={k} label={label}>
                    <input
                      required={k === "name"}
                      maxLength={
                        k === "taxCode" ? 50 : k === "phone" ? 40 : 180
                      }
                      value={form[k]}
                      onChange={(e) =>
                        setForm({ ...form, [k]: e.target.value })
                      }
                    />
                  </Field>
                ))}
              </div>
              <Field label="Địa chỉ">
                <textarea
                  maxLength={1000}
                  value={form.address}
                  onChange={(e) =>
                    setForm({ ...form, address: e.target.value })
                  }
                />
              </Field>
              <Field label="Thông tin thanh toán">
                <textarea
                  maxLength={1000}
                  value={form.bank}
                  onChange={(e) => setForm({ ...form, bank: e.target.value })}
                />
              </Field>
              <Field label="Điều kiện báo giá mặc định">
                <textarea
                  rows={4}
                  maxLength={5000}
                  value={form.quoteTerms}
                  onChange={(e) =>
                    setForm({ ...form, quoteTerms: e.target.value })
                  }
                />
              </Field>
              <label className="check">
                <input
                  type="checkbox"
                  checked={form.ctvQuotes}
                  onChange={(e) =>
                    setForm({ ...form, ctvQuotes: e.target.checked })
                  }
                />
                Cho phép CTV tạo và chỉnh báo giá của mình
              </label>
              <div className="form-actions">
                <button className="primary" disabled={busy}>
                  Lưu thiết lập
                </button>
              </div>
            </form>
          )}
        </section>
        <section className="panel">
          <h2>Sao lưu dữ liệu</h2>
          <p className="muted">
            Tải bản sao dữ liệu hệ thống dạng JSON. Chứa thông tin khách hàng
            và mật khẩu đã băm; chỉ giữ tại nơi quản lý tin cậy. Ảnh R2 cần sao
            lưu riêng.
          </p>
          <button
            className="secondary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await request("/admin/backup");
                downloadBlob(
                  await r!.blob(),
                  "amora-backup-" +
                    new Date().toISOString().slice(0, 10) +
                    ".json",
                );
                tell("Đã tải bản sao dữ liệu.");
              } catch (e) {
                setErr((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Tải bản sao lưu ↓
          </button>
          <p className="muted">
            Khôi phục cần hỗ trợ kỹ thuật và một cơ sở dữ liệu trống để giữ an
            toàn cho dữ liệu đang sử dụng.
          </p>
          <hr />
          <h3>Nguyên tắc vận hành</h3>
          <p>
            CTV xem dữ liệu riêng. Giá và hoa hồng được lưu theo từng chứng từ.
            Quản lý kiểm tra trước khi duyệt chi.
          </p>
        </section>
      </div>
      <section className="panel">
        <div className="section-title">
          <h2>Nhật ký hệ thống</h2>
          <span className="muted">200 thao tác gần nhất</span>
        </div>
        <div className="audit-scroll table-wrap">
          <table>
            <thead>
              <tr>
                <th>Thời gian</th>
                <th>Người thực hiện</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {logs?.map((l) => (
                <tr key={l.id}>
                  <td>
                    {new Date(l.created_at).toLocaleString("vi-VN", {
                      timeZone: "Asia/Ho_Chi_Minh",
                    })}
                  </td>
                  <td>{l.actor_name || "Hệ thống"}</td>
                  <td>{actionName(l.action)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

export function actionName(v: string) {
  const map: Record<string, string> = {
    login: "Đăng nhập",
    password_changed: "Đổi mật khẩu",
    product_created: "Thêm sản phẩm",
    product_updated: "Cập nhật sản phẩm",
    price_updated: "Cập nhật bảng giá",
    image_uploaded: "Tải ảnh sản phẩm",
    image_deleted: "Xóa ảnh sản phẩm",
    customer_created: "Thêm khách hàng",
    customer_updated: "Cập nhật khách hàng",
    orders_created: "Tạo đơn hàng",
    orders_edited: "Sửa đơn hàng",
    quotes_created: "Tạo báo giá",
    quotes_edited: "Sửa báo giá",
    order_status: "Đổi trạng thái đơn hàng",
    quote_status: "Đổi trạng thái báo giá",
    payment_recorded: "Ghi nhận thanh toán",
    commission_approved: "Duyệt hoa hồng",
    commission_paid: "Chi hoa hồng",
    business_updated: "Cập nhật thiết lập",
    user_created: "Cấp tài khoản",
    user_updated: "Cập nhật tài khoản",
    password_reset: "Đặt lại mật khẩu",
    backup_exported: "Tải bản sao lưu",
  };
  return map[v] || "Thao tác hệ thống";
}
