import React, { useState, useEffect, FormEvent } from "react";
import { Common } from "../types";
import { api, request, Row, money, labels } from "../api";
import {
  useLoad,
  useDebounced,
  Pagination,
  Field,
  Modal,
  ErrorBox,
  Empty,
  ProductImage,
} from "../components/UI";
import { TransferBar } from "../components/Transfer";
export function Products({ user, revision, refresh, tell }: Common) {
  const manager = user.role === "manager";
  const [tab, setTab] = useState("variants"),
    [search, setSearch] = useState(""),
    [category, setCategory] = useState(""),
    [status, setStatus] = useState(""),
    [page, setPage] = useState(1),
    [edit, setEdit] = useState<Row | null>(null),
    [modelForm, setModelForm] = useState<Row | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [detail, setDetail] = useState<Row | null>(null),
    [modelSearch, setModelSearch] = useState(""),
    [deleteTarget, setDeleteTarget] = useState<Row | null>(null),
    [deleteText, setDeleteText] = useState("");
  const term = useDebounced(search),
    modelTerm = useDebounced(modelSearch);
  const { data: groups } = useLoad<Row[]>(
      "/directories/product-categories",
      revision
    ),
    { data: scents } = useLoad<Row[]>("/scents", revision);
  const { data: d, error: loadError } = useLoad<Row>(
    `/products?page=${page}&pageSize=25&search=${encodeURIComponent(
      term
    )}&category=${encodeURIComponent(category)}&status=${status}`,
    revision
  );
  const { data: models, error: modelError } = useLoad<Row>(
    `/models?page=${page}&search=${encodeURIComponent(
      term
    )}&category=${encodeURIComponent(category)}`,
    revision
  );
  const { data: modelOptions } = useLoad<Row>(
    `/models?page=1&pageSize=30&search=${encodeURIComponent(modelTerm)}`,
    revision
  );
  const [codePreview, setCodePreview] = useState(""),
    [codePreviewError, setCodePreviewError] = useState("");
  useEffect(() => {
    let current = true;
    setCodePreview("");
    setCodePreviewError("");
    if (modelForm && !modelForm.id && modelForm.category_id) {
      api(
        "/models/next-code?categoryId=" +
          encodeURIComponent(modelForm.category_id)
      )
        .then((r) => {
          if (current) setCodePreview(r.code);
        })
        .catch((e) => {
          if (current) setCodePreviewError(e.message);
        });
    }
    return () => {
      current = false;
    };
  }, [modelForm?.id, modelForm?.category_id]);
  async function save(e: FormEvent, model = false) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const form = model ? modelForm! : edit!;
      await api(
        (model ? "/models" : "/products") + (form.id ? "/" + form.id : ""),
        form.id ? "PUT" : "POST",
        model
          ? { ...form, categoryId: form.category_id }
          : {
              ...form,
              modelId: form.model_id,
              scentId: form.scent_id || null,
              sizeLabel: form.size_label,
              leadDaysMin: Number(form.lead_days_min),
              leadDaysMax: Number(form.lead_days_max),
            }
      );
      setEdit(null);
      setModelForm(null);
      refresh();
      tell(
        model
          ? "Đã lưu mẫu sản phẩm. Thêm SKU cho từng size/mùi."
          : "Đã lưu phiên bản sản phẩm."
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(e: FormEvent) {
    e.preventDefault();
    if (!deleteTarget || deleteText !== "XÓA") return;
    setBusy(true);
    setError("");
    try {
      const result = await api(
        (deleteTarget.kind === "model" ? "/models/" : "/products/") +
          deleteTarget.id +
          "?version=" +
          deleteTarget.version,
        "DELETE"
      );
      setDeleteTarget(null);
      setDeleteText("");
      if (page > 1) setPage(1);
      setDetail(null);
      refresh();
      tell(result?.message || "Đã xóa mẫu sản phẩm.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function askDelete(row: Row, kind: string) {
    setError("");
    setDeleteText("");
    setDeleteTarget({ ...row, kind });
  }
  function addVariant(model?: Row) {
    setError("");
    setEdit({
      sku: "",
      model_id: model?.id || "",
      model_label: model?.name || "",
      size_label: "",
      scent_id: "",
      unit: "lọ",
      description: "",
      active: true,
      lead_days_min: 7,
      lead_days_max: 10,
    });
  }
  const rows: Row[] =
    tab === "models" ? models?.items || [] : d?.products || [];
  return (
    <>
      {manager && (
        <div className="tabs">
          <button
            className={tab === "variants" ? "active" : ""}
            onClick={() => {
              setTab("variants");
              setPage(1);
            }}
          >
            Phiên bản / SKU
          </button>
          <button
            className={tab === "models" ? "active" : ""}
            onClick={() => {
              setTab("models");
              setPage(1);
            }}
          >
            Mẫu sản phẩm
          </button>
        </div>
      )}
      <div className="toolbar">
        <div className="search">
          <input
            aria-label="Tìm sản phẩm"
            placeholder="Tên mẫu, SKU, mùi, size…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <select
          aria-label="Nhóm sản phẩm"
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Mọi nhóm sản phẩm</option>
          {groups?.map((g) => (
            <option key={g.id} value={g.code}>
              {g.name}
              {!g.active ? " · Ngừng dùng" : ""}
            </option>
          ))}
        </select>
        {tab === "variants" && (
          <select
            aria-label="Hiển thị sản phẩm"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Mọi trạng thái</option>
            <option value="active">Đang bật</option>
            {manager && <option value="inactive">Đang ẩn</option>}
          </select>
        )}
        <TransferBar
          key={tab}
          kind={tab === "models" ? "models" : "products"}
          canImport={manager}
          filters={{ search: term, category, status }}
          refresh={refresh}
          tell={tell}
        />
        {manager && (
          <button
            className="primary"
            onClick={() => {
              setError("");
              if (tab === "models")
                setModelForm({
                  code: "",
                  name: "",
                  category_id: "",
                  description: "",
                  active: true,
                });
              else addVariant();
            }}
          >
            + {tab === "models" ? "Thêm mẫu" : "Thêm SKU"}
          </button>
        )}
      </div>
      <p className="muted">
        {tab === "models"
          ? "Một mẫu có nhiều SKU theo mùi và size. Tạo mẫu trước rồi thêm từng phiên bản."
          : "Mỗi dòng là một phiên bản bán riêng; giá, MOQ và hoa hồng áp dụng theo SKU."}
      </p>
      <ErrorBox
        error={
          loadError ||
          modelError ||
          (!edit && !modelForm && !deleteTarget ? error : "")
        }
      />
      <section className="panel table-wrap">
        {rows.length ? (
          <table>
            <thead>
              <tr>
                {tab === "models" ? (
                  <>
                    <th>Mã mẫu</th>
                    <th>Tên mẫu</th>
                    <th>Nhóm</th>
                    <th>Số SKU</th>
                    <th>Trạng thái</th>
                    <th />
                  </>
                ) : (
                  <>
                    <th>Ảnh</th>
                    <th>SKU</th>
                    <th>Mẫu / nhóm</th>
                    <th>Mùi</th>
                    <th>Size</th>
                    <th>Giá lẻ</th>
                    <th>MOQ / HH</th>
                    <th>Chuẩn bị</th>
                    <th>Hiển thị</th>
                    <th />
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const price = d?.prices.find(
                  (p: Row) => p.product_id === r.id && p.channel === "retail"
                );
                return (
                  <tr key={r.id}>
                    {tab === "models" ? (
                      <>
                        <td className="code">{r.code}</td>
                        <td>
                          <strong>{r.name}</strong>
                        </td>
                        <td>{r.category_name}</td>
                        <td>{r.variants_count}</td>
                        <td>{r.active ? "Đang dùng" : "Ngừng dùng"}</td>
                        <td>
                          <button
                            className="ghost"
                            onClick={() => {
                              setError("");
                              setModelForm({ ...r });
                            }}
                          >
                            Sửa
                          </button>
                          <button
                            className="secondary"
                            onClick={() => addVariant(r)}
                          >
                            + SKU
                          </button>
                          <button
                            className="ghost danger"
                            disabled={busy}
                            onClick={() => askDelete(r, "model")}
                          >
                            Xóa mẫu
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td>
                          <button
                            className="table-image"
                            aria-label={"Xem " + r.name}
                            onClick={() => setDetail(r)}
                          >
                            <ProductImage
                              id={
                                d?.images.find(
                                  (i: Row) => i.product_id === r.id
                                )?.id
                              }
                            />
                          </button>
                        </td>
                        <td className="code">{r.sku}</td>
                        <td>
                          <strong>{r.model_name}</strong>
                          <small className="muted block">
                            {r.category_name}
                          </small>
                        </td>
                        <td>{r.scent_name || "—"}</td>
                        <td>
                          <strong>{r.size_label || "Chưa xác nhận"}</strong>
                          <small className="muted block">{r.unit}</small>
                        </td>
                        <td>
                          {price ? money(price.unit_price) : "Chưa có giá"}
                        </td>
                        <td>
                          {price
                            ? `${price.min_qty} ${r.unit} / ${price.commission_rate}%`
                            : "—"}
                        </td>
                        <td>
                          {r.lead_days_min}–{r.lead_days_max} ngày
                        </td>
                        <td>
                          <span
                            className={
                              "badge " + (r.active ? "completed" : "cancelled")
                            }
                          >
                            {r.active ? "Đang bật" : "Đang ẩn"}
                          </span>
                        </td>
                        <td>
                          <button
                            className="ghost"
                            onClick={() => setDetail(r)}
                          >
                            Xem
                          </button>
                          {manager && (
                            <button
                              className="ghost"
                              onClick={() => {
                                setError("");
                                setEdit({ ...r, model_label: r.model_name });
                              }}
                            >
                              Sửa
                            </button>
                          )}
                          {manager && (
                            <button
                              className="ghost danger"
                              disabled={busy}
                              onClick={() => askDelete(r, "sku")}
                            >
                              Xóa
                            </button>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <Empty
            text={
              tab === "models"
                ? "Chưa có mẫu phù hợp."
                : "Chưa có SKU. Quản lý tạo mẫu và thêm size/mùi thực tế trước khi báo giá."
            }
          />
        )}
      </section>
      <Pagination
        data={tab === "models" ? models : d}
        page={page}
        setPage={setPage}
      />
      {deleteTarget && (
        <Modal
          title={
            deleteTarget.kind === "model"
              ? "Xóa mẫu sản phẩm"
              : "Xóa phiên bản / SKU"
          }
          close={() => {
            if (!busy) setDeleteTarget(null);
          }}
        >
          <form onSubmit={remove}>
            <p>
              <strong>{deleteTarget.sku || deleteTarget.code}</strong> ·{" "}
              {deleteTarget.name}
            </p>
            <p className="notice">
              {deleteTarget.kind === "model"
                ? "Chỉ xóa được mẫu chưa có SKU. Mẫu đang có phiên bản cần xóa từng SKU chưa sử dụng trước, hoặc ngừng sử dụng mẫu."
                : "Xóa SKU sẽ xóa bảng giá và ảnh của chính SKU này. SKU đã xuất hiện trong bất kỳ báo giá hoặc đơn hàng nào sẽ được giữ lại; hãy tắt hiển thị thay cho xóa."}
            </p>
            <Field label="Nhập XÓA để xác nhận">
              <input
                autoFocus
                value={deleteText}
                disabled={busy}
                onChange={(e) => setDeleteText(e.target.value)}
                autoComplete="off"
              />
            </Field>
            <ErrorBox error={error} />
            <div className="form-actions">
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => setDeleteTarget(null)}
              >
                Hủy
              </button>
              <button
                className="primary"
                disabled={busy || deleteText !== "XÓA"}
              >
                Xóa vĩnh viễn
              </button>
            </div>
          </form>
        </Modal>
      )}
      {modelForm && (
        <Modal
          title={modelForm.id ? "Chỉnh mẫu sản phẩm" : "Thêm mẫu sản phẩm"}
          close={() => setModelForm(null)}
        >
          <form onSubmit={(e) => void save(e, true)}>
            <div className="form-grid">
              <Field label={modelForm.id ? "Mã mẫu" : "Mã mẫu tự động"}>
                {modelForm.id ? (
                  <input
                    required
                    maxLength={40}
                    value={modelForm.code}
                    onChange={(e) =>
                      setModelForm({ ...modelForm, code: e.target.value })
                    }
                  />
                ) : (
                  <>
                    <input
                      readOnly
                      value={codePreview}
                      placeholder={
                        modelForm.category_id
                          ? "Đang tạo mã…"
                          : "Chọn nhóm để xem mã"
                      }
                      aria-label="Mã mẫu dự kiến"
                    />
                    <small className="muted">
                      Mã dự kiến; hệ thống cấp mã chính thức khi lưu.
                    </small>
                    {codePreviewError && <ErrorBox error={codePreviewError} />}
                  </>
                )}
              </Field>
              <Field label="Tên mẫu">
                <input
                  required
                  maxLength={180}
                  value={modelForm.name}
                  onChange={(e) =>
                    setModelForm({ ...modelForm, name: e.target.value })
                  }
                />
              </Field>
            </div>
            <Field label="Nhóm sản phẩm">
              <select
                required
                value={modelForm.category_id}
                onChange={(e) =>
                  setModelForm({ ...modelForm, category_id: e.target.value })
                }
              >
                <option value="">Chọn nhóm</option>
                {groups
                  ?.filter((g) => g.active || g.id === modelForm.category_id)
                  .map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Mô tả chung">
              <textarea
                maxLength={5000}
                value={modelForm.description}
                onChange={(e) =>
                  setModelForm({ ...modelForm, description: e.target.value })
                }
              />
            </Field>
            <label className="check">
              <input
                type="checkbox"
                checked={modelForm.active}
                onChange={(e) =>
                  setModelForm({ ...modelForm, active: e.target.checked })
                }
              />
              Đang sử dụng
            </label>
            <ErrorBox error={error} />
            <div className="form-actions">
              <button className="primary" disabled={busy}>
                Lưu mẫu
              </button>
            </div>
          </form>
        </Modal>
      )}
      {edit && (
        <Modal
          title={edit.id ? "Sửa phiên bản / SKU" : "Thêm phiên bản / SKU"}
          close={() => setEdit(null)}
        >
          <form onSubmit={(e) => void save(e)}>
            <Field label="Mẫu sản phẩm">
              <input
                aria-label="Tìm mẫu"
                placeholder="Tìm mã hoặc tên mẫu…"
                value={modelSearch}
                onChange={(e) => setModelSearch(e.target.value)}
              />
              <select
                required
                value={edit.model_id}
                onChange={(e) => setEdit({ ...edit, model_id: e.target.value })}
              >
                <option value="">Chọn mẫu đã tạo</option>
                {edit.model_id &&
                  !modelOptions?.items.some(
                    (m: Row) => m.id === edit.model_id
                  ) && (
                    <option value={edit.model_id}>
                      {edit.model_label || "Mẫu đã chọn"}
                    </option>
                  )}
                {modelOptions?.items
                  .filter((m: Row) => m.active)
                  .map((m: Row) => (
                    <option key={m.id} value={m.id}>
                      {m.code} · {m.name}
                    </option>
                  ))}
              </select>
            </Field>
            <div className="form-grid">
              <Field label="SKU duy nhất">
                <input
                  required
                  maxLength={50}
                  value={edit.sku}
                  onChange={(e) => setEdit({ ...edit, sku: e.target.value })}
                />
              </Field>
              <Field label="Size / quy cách">
                <input
                  required
                  maxLength={100}
                  placeholder="Ví dụ: 100g, 220g, Set 2 lọ…"
                  value={edit.size_label}
                  onChange={(e) =>
                    setEdit({ ...edit, size_label: e.target.value })
                  }
                />
              </Field>
              <Field label="Mùi hương">
                <select
                  value={edit.scent_id || ""}
                  onChange={(e) =>
                    setEdit({ ...edit, scent_id: e.target.value })
                  }
                >
                  <option value="">Không gắn mùi</option>
                  {scents
                    ?.filter((s) => s.active || s.id === edit.scent_id)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Đơn vị bán">
                <input
                  required
                  maxLength={30}
                  value={edit.unit}
                  onChange={(e) => setEdit({ ...edit, unit: e.target.value })}
                />
              </Field>
              <Field label="Chuẩn bị tối thiểu (ngày)">
                <input
                  required
                  type="number"
                  min={0}
                  max={365}
                  value={edit.lead_days_min}
                  onChange={(e) =>
                    setEdit({ ...edit, lead_days_min: e.target.value })
                  }
                />
              </Field>
              <Field label="Chuẩn bị tối đa (ngày)">
                <input
                  required
                  type="number"
                  min={edit.lead_days_min}
                  max={365}
                  value={edit.lead_days_max}
                  onChange={(e) =>
                    setEdit({ ...edit, lead_days_max: e.target.value })
                  }
                />
              </Field>
            </div>
            <Field label="Mô tả riêng của phiên bản">
              <textarea
                maxLength={5000}
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
              Bật phiên bản cho CTV (mẫu, nhóm và mùi cũng phải đang dùng)
            </label>
            <ErrorBox error={error} />
            <div className="form-actions">
              <button className="primary" disabled={busy}>
                Lưu SKU
              </button>
            </div>
          </form>
        </Modal>
      )}
      {detail && (
        <Modal title={detail.name} close={() => setDetail(null)}>
          <p>
            {detail.sku} · {detail.category_name} · {detail.size_label}
          </p>
          <p className="pre-line">{detail.description}</p>
          <div className="image-grid">
            {d?.images
              .filter((i: Row) => i.product_id === detail.id)
              .map((i: Row) => (
                <div key={i.id}>
                  <ProductImage id={i.id} />
                  {manager && (
                    <button
                      className="ghost danger"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        setError("");
                        try {
                          await api("/images/" + i.id, "DELETE");
                          refresh();
                          tell("Đã xóa ảnh.");
                        } catch (e) {
                          setError((e as Error).message);
                        } finally {
                          setBusy(false);
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
            <Field label="Thêm ảnh thật (PNG/JPG/WebP, tối đa 5 MB)">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={busy}
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setBusy(true);
                  setError("");
                  try {
                    const form = new FormData();
                    form.append("file", f);
                    await request("/products/" + detail.id + "/images", {
                      method: "POST",
                      body: form,
                    });
                    refresh();
                    tell("Đã tải ảnh.");
                  } catch (err) {
                    setError((err as Error).message);
                  } finally {
                    setBusy(false);
                    e.target.value = "";
                  }
                }}
              />
            </Field>
          )}
          <ErrorBox error={error} />
        </Modal>
      )}
    </>
  );
}
export function Prices({ revision, refresh, tell }: Common) {
  const [page, setPage] = useState(1),
    [search, setSearch] = useState(""),
    [category, setCategory] = useState(""),
    [edit, setEdit] = useState<Row | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const term = useDebounced(search);
  const { data: d, error: loadError } = useLoad<Row>(
      `/products?page=${page}&search=${encodeURIComponent(
        term
      )}&category=${category}`,
      revision
    ),
    { data: groups } = useLoad<Row[]>(
      "/directories/product-categories",
      revision
    );
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/products/" + edit!.product_id + "/prices", "PUT", {
        channel: edit!.channel,
        unitPrice: Number(edit!.unit_price),
        minQty: Number(edit!.min_qty),
        commissionRate: Number(edit!.commission_rate),
        version: edit!.version || 0,
      });
      setEdit(null);
      refresh();
      tell("Đã lưu giá. Chứng từ cũ giữ nguyên.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="toolbar">
        <div className="search">
          <input
            aria-label="Tìm bảng giá"
            placeholder="SKU, mẫu, size…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <select
          value={category}
          aria-label="Nhóm bảng giá"
          onChange={(e) => {
            setCategory(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Mọi nhóm</option>
          {groups?.map((g) => (
            <option key={g.id} value={g.code}>
              {g.name}
            </option>
          ))}
        </select>
        <TransferBar
          kind="prices"
          filters={{ search: term, category }}
          refresh={refresh}
          tell={tell}
        />
      </div>
      <p className="notice">
        Giá và MOQ theo từng SKU. Cốc B2B từ 20 lọ, sáp mini từ 40 mẫu là gợi ý
        cấu hình; không tự cộng gộp mùi hoặc size để đủ MOQ.
      </p>
      <ErrorBox error={loadError} />
      <section className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>SKU / Mẫu</th>
              <th>Mùi / Size</th>
              {["retail", "wholesale", "b2b"].map((ch) => (
                <th key={ch}>{labels[ch]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {d?.products.map((p: Row) => (
              <tr key={p.id}>
                <td>
                  <strong>{p.sku}</strong>
                  <small className="muted block">{p.model_name}</small>
                </td>
                <td>
                  {p.scent_name || "—"}
                  <small className="muted block">
                    {p.size_label || "Chưa xác nhận"}
                  </small>
                </td>
                {["retail", "wholesale", "b2b"].map((ch) => {
                  const r = d.prices.find(
                    (r: Row) => r.product_id === p.id && r.channel === ch
                  );
                  return (
                    <td key={ch}>
                      <button
                        className="price-cell"
                        onClick={() => {
                          setError("");
                          setEdit(
                            r
                              ? { ...r }
                              : {
                                  product_id: p.id,
                                  channel: ch,
                                  unit_price: "",
                                  min_qty: ch === "b2b" ? 20 : 1,
                                  commission_rate: 0,
                                }
                          );
                        }}
                      >
                        {r ? (
                          <>
                            <strong>{money(r.unit_price)}</strong>
                            <small>
                              MOQ {r.min_qty} · HH {r.commission_rate}%
                            </small>
                          </>
                        ) : (
                          "+ Thiết lập"
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {d?.total === 0 && <Empty text="Thêm SKU trước khi nhập bảng giá." />}
      </section>
      <Pagination data={d} page={page} setPage={setPage} />
      {edit && (
        <Modal
          title={"Giá " + labels[edit.channel]}
          close={() => setEdit(null)}
        >
          <form onSubmit={save}>
            <div className="form-grid">
              {[
                ["unit_price", "Đơn giá VND", 1, 1000000000, 1],
                ["min_qty", "MOQ theo SKU", 1, 100000, 1],
                ["commission_rate", "Hoa hồng %", 0, 100, 0.01],
              ].map(([k, v, min, max, step]) => (
                <Field key={k} label={String(v)}>
                  <input
                    required
                    type="number"
                    min={Number(min)}
                    max={Number(max)}
                    step={Number(step)}
                    value={edit[k]}
                    onChange={(e) => setEdit({ ...edit, [k]: e.target.value })}
                  />
                </Field>
              ))}
            </div>
            <ErrorBox error={error} />
            <div className="form-actions">
              <button className="primary" disabled={busy}>
                Lưu giá
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
