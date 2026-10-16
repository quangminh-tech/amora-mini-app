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
export function Products({ user, revision, refresh, tell }: Common) {
  const { data: d, error } = useLoad<Row>("/products", revision);
  const { data: scents } = useLoad<Row[]>("/scents");
  const [search, setSearch] = useState(""),
    [edit, setEdit] = useState<Row | null>(null),
    [detail, setDetail] = useState<Row | null>(null),
    [err, setErr] = useState(""),
    [busy, setBusy] = useState(false);
  const manager = user.role === "manager";
  const blank = {
    sku: "",
    name: "",
    scent_id: "",
    description: "",
    unit: "lọ",
    active: true,
  };
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!edit) return;
    setBusy(true);
    setErr("");
    try {
      await api(
        "/products" + (edit.id ? "/" + edit.id : ""),
        edit.id ? "PUT" : "POST",
        {
          sku: edit.sku,
          name: edit.name,
          scentId: edit.scent_id || null,
          description: edit.description,
          unit: edit.unit,
          active: edit.active,
        },
      );
      setEdit(null);
      refresh();
      tell("Đã lưu sản phẩm.");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const images = (id: string) =>
    d?.images.filter((i: Row) => i.product_id === id) || [];
  return (
    <>
      <div className="toolbar">
        <div className="search">
          <span>⌕</span>
          <input
            aria-label="Tìm sản phẩm"
            placeholder="Tìm tên sản phẩm, mã SKU…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <span className="muted">{d?.products.length || 0} sản phẩm</span>
        {manager && (
          <button
            className="primary"
            onClick={() => {
              setErr("");
              setEdit(blank);
            }}
          >
            + Thêm sản phẩm
          </button>
        )}
      </div>
      <ErrorBox error={error || err} />
      <div className="product-grid">
        {d?.products
          .filter((p: Row) =>
            (p.name + " " + p.sku).toLowerCase().includes(search.toLowerCase()),
          )
          .map((p: Row) => {
            const price = d.prices.find(
              (r: Row) => r.product_id === p.id && r.channel === "retail",
            );
            return (
              <article className="product-card" key={p.id}>
                <button className="product-image" onClick={() => setDetail(p)}>
                  <ProductImage id={images(p.id)[0]?.id} />
                  {!p.active && <span className="hidden-label">Đang ẩn</span>}
                </button>
                <div className="product-content">
                  <span className="eyebrow">
                    {p.ritual || "AMORA COLLECTION"}
                  </span>
                  <h2>{p.name}</h2>
                  <p>{p.scent_name || p.sku}</p>
                  <div className="product-price">
                    {price ? (
                      money(price.unit_price)
                    ) : (
                      <span className="muted">Chưa thiết lập giá</span>
                    )}
                    <small> / {p.unit}</small>
                  </div>
                  <div className="card-actions">
                    <button className="ghost" onClick={() => setDetail(p)}>
                      Chi tiết →
                    </button>
                    {manager && (
                      <button
                        className="ghost"
                        onClick={() => {
                          setErr("");
                          setEdit({ ...p });
                        }}
                      >
                        Chỉnh sửa
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
      </div>
      {d && !d.products.length && <Empty />}
      {edit && (
        <Modal
          title={edit.id ? "Chỉnh sửa sản phẩm" : "Thêm sản phẩm"}
          close={() => setEdit(null)}
        >
          <form onSubmit={save}>
            <div className="form-grid">
              <Field label="Mã SKU">
                <input
                  required
                  maxLength={50}
                  value={edit.sku}
                  onChange={(e) => setEdit({ ...edit, sku: e.target.value })}
                />
              </Field>
              <Field label="Tên sản phẩm">
                <input
                  required
                  maxLength={180}
                  value={edit.name}
                  onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                />
              </Field>
              <Field label="Mùi hương">
                <select
                  value={edit.scent_id || ""}
                  onChange={(e) =>
                    setEdit({ ...edit, scent_id: e.target.value })
                  }
                >
                  <option value="">Không gắn mùi hương</option>
                  {scents?.map((s) => (
                    <option value={s.id} key={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Đơn vị">
                <input
                  required
                  maxLength={30}
                  value={edit.unit}
                  onChange={(e) => setEdit({ ...edit, unit: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Mô tả / quy cách">
              <textarea
                maxLength={5000}
                rows={4}
                value={edit.description}
                onChange={(e) =>
                  setEdit({ ...edit, description: e.target.value })
                }
              />
            </Field>
            <label className="check">
              <input
                type="checkbox"
                checked={edit.active}
                onChange={(e) => setEdit({ ...edit, active: e.target.checked })}
              />
              Hiển thị cho CTV
            </label>
            <ErrorBox error={err} />
            <div className="form-actions">
              <button
                className="ghost"
                type="button"
                onClick={() => setEdit(null)}
              >
                Hủy
              </button>
              <button className="primary" disabled={busy}>
                Lưu sản phẩm
              </button>
            </div>
          </form>
        </Modal>
      )}
      {detail && (
        <Modal title={detail.name} close={() => setDetail(null)}>
          <p className="eyebrow">
            {detail.sku} · {detail.ritual}
          </p>
          <p>{detail.description}</p>
          <div className="scent-notes">
            {[
              ["Hương đầu", detail.top_notes],
              ["Hương giữa", detail.middle_notes],
              ["Hương cuối", detail.base_notes],
            ].map(([label, note]) => (
              <div key={label}>
                <small>{label}</small>
                <p>{note || "Chưa có thông tin"}</p>
              </div>
            ))}
          </div>
          <div className="image-grid">
            {images(detail.id).map((i: Row) => (
              <div key={i.id}>
                <ProductImage id={i.id} />
                {manager && (
                  <button
                    className="danger ghost"
                    onClick={async () => {
                      if (!confirm("Xóa ảnh sản phẩm này?")) return;
                      try {
                        await api("/images/" + i.id, "DELETE");
                        refresh();
                        tell("Đã xóa ảnh.");
                      } catch (e) {
                        setErr((e as Error).message);
                      }
                    }}
                  >
                    Xóa ảnh
                  </button>
                )}
              </div>
            ))}
          </div>
          {manager && (
            <Field label="Tải ảnh AMORA thật (PNG/JPG/WebP, tối đa 5 MB)">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={busy}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setBusy(true);
                  setErr("");
                  try {
                    const form = new FormData();
                    form.append("file", file);
                    await request("/products/" + detail.id + "/images", {
                      method: "POST",
                      body: form,
                    });
                    refresh();
                    tell("Đã tải ảnh sản phẩm.");
                  } catch (e) {
                    setErr((e as Error).message);
                  } finally {
                    setBusy(false);
                    e.target.value = "";
                  }
                }}
              />
            </Field>
          )}
          <ErrorBox error={err} />
          <small className="muted">
            Vai trò ritual mô tả bối cảnh trải nghiệm; không phải cam kết về
            công dụng tập trung hoặc sức khỏe.
          </small>
        </Modal>
      )}
    </>
  );
}

export function Prices({ revision, refresh, tell }: Common) {
  const { data: d, error } = useLoad<Row>("/products", revision);
  const [edit, setEdit] = useState<Row | null>(null),
    [err, setErr] = useState(""),
    [busy, setBusy] = useState(false);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!edit) return;
    setBusy(true);
    try {
      await api("/products/" + edit.product_id + "/prices", "PUT", {
        channel: edit.channel,
        unitPrice: Number(edit.unit_price),
        commissionRate: Number(edit.commission_rate),
        minQty: Number(edit.min_qty),
      });
      setEdit(null);
      refresh();
      tell("Đã cập nhật bảng giá. Đơn cũ giữ nguyên giá.");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="notice">
        Giá và tỷ lệ hoa hồng áp dụng cho chứng từ tạo hoặc chỉnh sửa sau thời
        điểm lưu. CTV chỉ nhìn thấy giá bán lẻ.
      </div>
      <ErrorBox error={error} />
      <section className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>Sản phẩm</th>
              <th>Bán lẻ</th>
              <th>Bán sỉ</th>
              <th>Doanh nghiệp</th>
            </tr>
          </thead>
          <tbody>
            {d?.products.map((p: Row) => (
              <tr key={p.id}>
                <td>
                  <strong>{p.name}</strong>
                  <small className="muted block">{p.sku}</small>
                </td>
                {["retail", "wholesale", "b2b"].map((ch) => {
                  const r = d.prices.find(
                    (r: Row) => r.product_id === p.id && r.channel === ch,
                  );
                  return (
                    <td key={ch}>
                      <button
                        className="price-cell"
                        onClick={() => {
                          setErr("");
                          setEdit(
                            r
                              ? { ...r }
                              : {
                                  product_id: p.id,
                                  channel: ch,
                                  unit_price: "",
                                  commission_rate: 0,
                                  min_qty: ch === "b2b" ? 20 : 1,
                                },
                          );
                        }}
                      >
                        {r ? (
                          <>
                            <strong>{money(r.unit_price)}</strong>
                            <small>
                              Từ {r.min_qty} · Hoa hồng {r.commission_rate}%
                            </small>
                          </>
                        ) : (
                          <span>+ Thiết lập giá</span>
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {edit && (
        <Modal
          title={"Thiết lập giá · " + labels[edit.channel]}
          close={() => setEdit(null)}
        >
          <form onSubmit={save}>
            <Field label="Đơn giá (VND)">
              <input
                type="number"
                required
                min="1"
                max="1000000000"
                step="1"
                value={edit.unit_price}
                onChange={(e) =>
                  setEdit({ ...edit, unit_price: e.target.value })
                }
              />
            </Field>
            <div className="form-grid">
              <Field label="Hoa hồng CTV (%)">
                <input
                  type="number"
                  required
                  min="0"
                  max="100"
                  step="0.01"
                  value={edit.commission_rate}
                  onChange={(e) =>
                    setEdit({ ...edit, commission_rate: e.target.value })
                  }
                />
              </Field>
              <Field label="Số lượng tối thiểu">
                <input
                  type="number"
                  required
                  min="1"
                  max="100000"
                  step="1"
                  value={edit.min_qty}
                  onChange={(e) =>
                    setEdit({ ...edit, min_qty: e.target.value })
                  }
                />
              </Field>
            </div>
            <p className="muted">
              Gợi ý nghiệp vụ: cốc nến B2B từ 20 lọ; sáp mini quà tặng từ 40
              mẫu. Đặt riêng mức tối thiểu cho từng sản phẩm.
            </p>
            <ErrorBox error={err} />
            <div className="form-actions">
              <button className="primary" disabled={busy}>
                Lưu bảng giá
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
