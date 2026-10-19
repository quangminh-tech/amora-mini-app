import { CtvPolicy } from "../components/CtvPolicy";
import { Loading } from "../components/UI";
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
  Pagination,
  useDebounced,
} from "../components/UI";
import { Common } from "../types";
export function SalesPage({
  user,
  revision,
  refresh,
  tell,
  type,
  recordId,
  launch,
}: Common & { type: "orders" | "quotes" }) {
  const quote = type === "quotes",
    manager = user.role === "manager";
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(""),
    [filter, setFilter] = useState("");
  const term = useDebounced(search);
  const {
    data: result,
    error,
    loading,
  } = useLoad<Row>(
    `/${type}?page=${page}&search=${encodeURIComponent(term)}&status=${filter}`,
    revision,
  );
  const rows: Row[] | undefined = result?.items;

  const { data: documentTemplates } = useLoad<Row>(
    "/document-templates",
    revision,
  );
  const [customerSearch, setCustomerSearch] = useState("");
  const customerTerm = useDebounced(customerSearch);
  const { data: customerResult } = useLoad<Row>(
    `/customers?page=1&pageSize=30&search=${encodeURIComponent(customerTerm)}`,
    revision,
  );
  const customers: Row[] | undefined = customerResult?.items;
  const { data: settings } = useLoad<Row>("/settings", revision);
  const [userSearch, setUserSearch] = useState("");
  const userTerm = useDebounced(userSearch);
  const { data: users } = useLoad<Row[]>(
    manager
      ? "/admin/users?pageSize=30&search=" + encodeURIComponent(userTerm)
      : "/scents",
    revision,
  );
  const [form, setForm] = useState<Row | null>(null),
    [detail, setDetail] = useState<Row | null>(null),
    [err, setErr] = useState(""),
    [busy, setBusy] = useState(false),
    [action, setAction] = useState<Row | null>(null);
  const { data: policies } = useLoad<Row>("/pricing/policies", revision);
  const [pricingState, setPricingState] = useState<Row | null>(null);
  const pricingKey = form
    ? JSON.stringify({
        channel: form.channel,
        lines: form.lines.map((l: Row) => ({
          productId: l.productId,
          qty: Number(l.qty),
          unitPrice:
            manager && form.channel === "retail" && l.unitPrice !== ""
              ? Number(l.unitPrice)
              : null,
        })),
      })
    : "";
  const pricingReady =
    !!form &&
    form.lines.length > 0 &&
    form.lines.every(
      (l: Row) =>
        l.productId && Number.isInteger(Number(l.qty)) && Number(l.qty) > 0,
    );
  useEffect(() => {
    if (!pricingReady) return;
    const abort = new AbortController();
    const timer = setTimeout(() => {
      api("/pricing/preview", "POST", JSON.parse(pricingKey), {
        signal: abort.signal,
      })
        .then((result) => {
          if (!abort.signal.aborted)
            setPricingState({ key: pricingKey, result });
        })
        .catch((e) => {
          if (!abort.signal.aborted)
            setPricingState({ key: pricingKey, error: (e as Error).message });
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [pricingKey, pricingReady, revision]);
  const pricing = pricingState?.key === pricingKey ? pricingState.result : null;
  const pricingError =
    pricingState?.key === pricingKey ? pricingState.error : "";
  const [productSearch, setProductSearch] = useState("");
  const productTerm = useDebounced(productSearch);
  const selectedProductIds = (form?.lines || [])
    .map((l: Row) => l.productId)
    .filter(Boolean)
    .join(",");
  const { data: catalogue } = useLoad<Row>(
    `/products?page=1&pageSize=30&search=${encodeURIComponent(productTerm)}&includeIds=${selectedProductIds}`,
    revision,
  );
  const [newContact, setNewContact] = useState<Row | null>(null);
  async function saveContact() {
    setBusy(true);
    setErr("");
    try {
      const saved = await api("/customers", "POST", newContact);
      setForm((f) => (f ? { ...f, customerId: saved.id } : f));
      setNewContact(null);
      refresh();
      tell("Đã lưu thông tin người nhận.");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function open(id: string) {
    setErr("");
    setBusy(true);
    try {
      setDetail(await api("/" + type + "/" + id));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (recordId === "new") newForm();
    else if (recordId) void open(recordId);
  }, [recordId]);
  const newForm = () => {
    setErr("");
    setForm({
      customerId: "",
      ownerId: user.id,
      channel: "retail",
      shipping: 0,
      note: "",
      validUntil: new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10),
      terms:
        quote && documentTemplates?.templates?.length
          ? ""
          : settings?.quoteTerms || "",
      document:
        quote && documentTemplates?.templates?.length
          ? {
              templateId: documentTemplates.templates[0].id,
              values: Object.fromEntries(
                documentTemplates.templates[0].fields.map((f: Row) => [
                  f.key,
                  f.defaultValue,
                ]),
              ),
            }
          : null,
      lines: [{ productId: "", qty: 1, unitPrice: "" }],
    });
  };
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setBusy(true);
    setErr("");
    try {
      const body = {
        ...form,
        pricingToken: pricing?.token,
        clearDocument: quote && form.document === null,
        shipping: Number(form.shipping),
        lines: form.lines.map((l: Row) => ({
          productId: l.productId,
          qty: Number(l.qty),
          unitPrice:
            manager && form.channel === "retail" && l.unitPrice !== ""
              ? Number(l.unitPrice)
              : null,
        })),
        version: form.version ?? null,
        ownerId: form.ownerId || null,
      };
      const saved = await api(
        "/" + type + (form.id ? "/" + form.id : ""),
        form.id ? "PUT" : "POST",
        body,
      );
      setForm(null);
      refresh();
      tell(quote ? "Đã lưu báo giá." : "Đã lưu đơn hàng.");
      await open(saved.id);
    } catch (e) {
      setErr((e as Error).message);
      refresh();
    } finally {
      setBusy(false);
    }
  }
  function editDetail() {
    if (!detail) return;
    const r = detail.record;
    setForm({
      id: r.id,
      version: r.version,
      customerId: r.customer_id,
      ownerId: r.owner_id,
      channel: r.channel,
      shipping: r.shipping,
      note: r.note,
      validUntil: r.valid_until?.slice(0, 10),
      terms: r.terms,
      document: parse(r.document_snapshot || {}).template
        ? {
            templateId: parse(r.document_snapshot || {}).template.id,
            values: parse(r.document_snapshot || {}).values || {},
          }
        : null,
      lines: detail.lines.map((l: Row) => ({
        productId: l.product_id,
        qty: l.qty,
        unitPrice: manager ? l.unit_price : "",
      })),
    });
    setDetail(null);
    setErr("");
  }
  async function doAction(e: FormEvent) {
    e.preventDefault();
    if (!action || !detail) return;
    setBusy(true);
    setErr("");
    try {
      await api(
        "/" + type + "/" + detail.record.id + "/" + action.kind,
        "POST",
        action.kind === "payment"
          ? {
              paid: Number(action.paid),
              reference: action.reference,
              version: detail.record.version,
            }
          : {
              status: action.status,
              reason: action.reason,
              version: detail.record.version,
            },
      );
      setAction(null);
      refresh();
      await open(detail.record.id);
      tell("Đã cập nhật.");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const statusOptions = quote
    ? ["draft", "sent", "accepted", "rejected"]
    : [
        "pending",
        "confirmed",
        "shipping",
        "completed",
        "cancelled",
        "returned",
      ];
  const available = (_channel: string) =>
    catalogue?.products.filter((p: Row) => p.active) || [];
  const price = (id: string, ch: string) =>
    catalogue?.prices.find((r: Row) => r.product_id === id && r.channel === ch);
  const total = pricing?.subtotal ?? 0;
  return (
    <>
      <div className="toolbar">
        <CtvPolicy revision={revision} />
        <div className="search">
          <span>⌕</span>
          <input
            aria-label="Tìm đơn hoặc báo giá"
            placeholder="Tìm mã, khách hàng, CTV…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <select
          aria-label="Lọc trạng thái"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Tất cả trạng thái</option>
          {statusOptions.map((s) => (
            <option key={s} value={s}>
              {labels[s]}
            </option>
          ))}
        </select>
        {(!quote || manager || settings?.ctvQuotes) && (
          <button className="primary" onClick={newForm}>
            + Tạo {quote ? "báo giá" : "đơn hàng"}
          </button>
        )}
      </div>
      <ErrorBox error={error || err} />
      {quote && !manager && !settings?.ctvQuotes && (
        <div className="notice">
          Quản lý đang tắt quyền tạo báo giá cho CTV. Bạn vẫn có thể xem báo giá
          của mình.
        </div>
      )}
      <section className="panel table-wrap" aria-busy={loading}>
        {loading && <Loading />}
        {rows?.length ? (
          <table>
            <thead>
              <tr>
                <th>Mã {quote ? "báo giá" : "đơn"}</th>
                <th>Khách hàng</th>
                {manager && <th>Phụ trách</th>}
                <th>Ngày tạo</th>
                <th>Tổng giá trị</th>
                <th>Trạng thái</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="code">{r.code}</td>
                  <td>{r.customer_name}</td>
                  {manager && <td>{r.owner_name}</td>}
                  <td>{date(r.created_at)}</td>
                  <td>{money(Number(r.subtotal) + Number(r.shipping))}</td>
                  <td>
                    <Badge value={r.status} />
                  </td>
                  <td>
                    <button
                      className="ghost"
                      disabled={busy}
                      onClick={() => open(r.id)}
                    >
                      Xem →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : loading ? null : (
          <Empty text={"Chưa có " + (quote ? "báo giá" : "đơn hàng") + "."} />
        )}
      </section>
      <Pagination
        loading={loading}
        data={result}
        page={page}
        setPage={setPage}
      />
      {form && (
        <Modal
          title={
            (form.id ? "Chỉnh sửa " : "Tạo ") + (quote ? "báo giá" : "đơn hàng")
          }
          close={() => setForm(null)}
        >
          <form onSubmit={save}>
            <CtvPolicy revision={revision} />
            {quote && documentTemplates && (
              <section>
                <Field label="Mẫu chứng từ">
                  <select
                    value={form.document?.templateId || ""}
                    onChange={(e) => {
                      const t = documentTemplates.templates.find(
                        (x: Row) => x.id === e.target.value,
                      );
                      setForm({
                        ...form,
                        document: t
                          ? {
                              templateId: t.id,
                              values: Object.fromEntries(
                                t.fields.map((f: Row) => [
                                  f.key,
                                  f.defaultValue,
                                ]),
                              ),
                            }
                          : null,
                        validUntil: t
                          ? new Date(Date.now() + t.validDays * 864e5)
                              .toISOString()
                              .slice(0, 10)
                          : form.validUntil,
                      });
                    }}
                  >
                    <option value="">Báo giá cơ bản</option>
                    {documentTemplates.templates.map((t: Row) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="template-fields">
                  {documentTemplates.templates
                    .find((t: Row) => t.id === form.document?.templateId)
                    ?.fields.map((f: Row) => (
                      <Field key={f.key} label={f.label}>
                        <textarea
                          maxLength={1000}
                          value={form.document.values[f.key] ?? f.defaultValue}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              document: {
                                ...form.document,
                                values: {
                                  ...form.document.values,
                                  [f.key]: e.target.value,
                                },
                              },
                            })
                          }
                        />
                      </Field>
                    ))}
                </div>
              </section>
            )}
            <div className="contact-inline">
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  setNewContact(
                    newContact
                      ? null
                      : {
                          name: "",
                          phone: "",
                          email: "",
                          company: "",
                          address: "",
                        },
                  )
                }
              >
                {newContact
                  ? "Bỏ qua thêm người nhận"
                  : "+ Thêm thông tin người nhận mới"}
              </button>
              {newContact && (
                <div className="inline-action">
                  <h3>Thông tin người nhận</h3>
                  <div className="form-grid">
                    {[
                      ["name", "Tên người nhận"],
                      ["phone", "Điện thoại"],
                      ["email", "Email"],
                      ["company", "Công ty"],
                      ["address", "Địa chỉ"],
                    ].map(([k, label]) => (
                      <Field key={k} label={label}>
                        <input
                          maxLength={
                            k === "address"
                              ? 1000
                              : k === "phone"
                                ? 40
                                : k === "name"
                                  ? 180
                                  : 200
                          }
                          value={newContact[k]}
                          onChange={(e) =>
                            setNewContact({
                              ...newContact,
                              [k]: e.target.value,
                            })
                          }
                        />
                      </Field>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="primary"
                    disabled={busy || !newContact.name.trim()}
                    onClick={() => void saveContact()}
                  >
                    Lưu và chọn người nhận
                  </button>
                </div>
              )}
            </div>
            <div className="form-grid">
              <Field label="Tìm người nhận báo giá">
                <input
                  value={customerSearch}
                  placeholder="Tên / điện thoại / email…"
                  onChange={(e) => setCustomerSearch(e.target.value)}
                />
                <small className="muted">
                  Hiển thị tối đa 30 kết quả mỗi lần tìm.
                </small>
              </Field>
              <Field label="Khách hàng">
                <select
                  required
                  value={form.customerId}
                  onChange={(e) =>
                    setForm({ ...form, customerId: e.target.value })
                  }
                >
                  <option value="">Chọn khách hàng</option>
                  {form.customerId &&
                    !customers?.some((c) => c.id === form.customerId) && (
                      <option value={form.customerId}>
                        Khách hàng đã chọn trên chứng từ
                      </option>
                    )}
                  {customers?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.phone && "· " + c.phone}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Nhu cầu khách hàng">
                <select
                  value={form.channel}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      channel: e.target.value,
                      lines: form.lines.map((l: Row) => ({
                        ...l,
                        unitPrice: "",
                      })),
                    })
                  }
                >
                  {(manager
                    ? ["retail", "wholesale", "b2b"]
                    : [
                        "retail",
                        ...["wholesale", "b2b"].filter((ch) =>
                          policies?.policies.some((p: Row) => p.channel === ch),
                        ),
                      ]
                  ).map((ch) => (
                    <option key={ch} value={ch}>
                      {
                        {
                          retail: "Mua lẻ",
                          wholesale: "Nhập bán lại",
                          b2b: "Quà tặng doanh nghiệp",
                        }[ch]
                      }
                    </option>
                  ))}
                </select>
              </Field>
              {manager && !form.id && (
                <Field label="Người phụ trách / hưởng hoa hồng">
                  <input
                    aria-label="Tìm người phụ trách"
                    placeholder="Tìm tên hoặc email CTV…"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                  />

                  <select
                    value={form.ownerId}
                    onChange={(e) =>
                      setForm({ ...form, ownerId: e.target.value })
                    }
                  >
                    {form.ownerId &&
                      !users?.some((u) => u.id === form.ownerId) && (
                        <option value={form.ownerId}>
                          Người phụ trách đã chọn
                        </option>
                      )}
                    {users
                      ?.filter((u) => u.active)
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} · {labels[u.role]}
                        </option>
                      ))}
                  </select>
                </Field>
              )}
              {quote && (
                <Field label="Hiệu lực đến">
                  <input
                    type="date"
                    required
                    value={form.validUntil}
                    onChange={(e) =>
                      setForm({ ...form, validUntil: e.target.value })
                    }
                  />
                </Field>
              )}
            </div>
            {!customers?.length && (
              <div className="notice">
                Chưa có thông tin phù hợp. Thêm người nhận mới ở trên hoặc đổi
                từ khóa tìm.
              </div>
            )}
            {!available(form.channel).length && (
              <div className="notice">
                Chưa có sản phẩm với giá cho kênh này. Quản lý cần thiết lập
                Bảng giá.
              </div>
            )}
            <h3>Sản phẩm</h3>
            <Field label="Tìm sản phẩm trong danh mục">
              <input
                placeholder="Tên sản phẩm hoặc mã SKU…"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
              />
              <small className="muted">
                30 kết quả phù hợp cùng các sản phẩm đã chọn.
              </small>
            </Field>
            <div className="sale-lines">
              {form.lines.map((l: Row, i: number) => (
                <div className="sale-line" key={i}>
                  <Field label="Sản phẩm">
                    <select
                      required
                      value={l.productId}
                      onChange={(e) => {
                        const lines = [...form.lines];
                        const p = price(e.target.value, form.channel);
                        lines[i] = {
                          productId: e.target.value,
                          qty: 1,
                          unitPrice:
                            manager && form.channel === "retail"
                              ? p?.unit_price || ""
                              : "",
                        };
                        setForm({ ...form, lines });
                      }}
                    >
                      <option value="">Chọn sản phẩm</option>
                      {available(form.channel).map((p: Row) => (
                        <option value={p.id} key={p.id}>
                          {p.name} · {p.sku}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Số lượng">
                    <input
                      type="number"
                      required
                      min={1}
                      max="100000"
                      step="1"
                      value={l.qty}
                      onChange={(e) => {
                        const lines = [...form.lines];
                        lines[i] = { ...l, qty: e.target.value };
                        setForm({ ...form, lines });
                      }}
                    />
                  </Field>
                  <Field label="Đơn giá">
                    <input
                      type="number"
                      required
                      min="1"
                      step="1"
                      max="1000000000"
                      readOnly={!manager || form.channel !== "retail"}
                      value={
                        manager && form.channel === "retail"
                          ? l.unitPrice
                          : pricing?.lines.find(
                              (x: Row) => x.productId === l.productId,
                            )?.unitPrice || ""
                      }
                      onChange={(e) => {
                        const lines = [...form.lines];
                        lines[i] = { ...l, unitPrice: e.target.value };
                        setForm({ ...form, lines });
                      }}
                    />
                  </Field>
                  <button
                    type="button"
                    className="danger ghost remove-line"
                    aria-label="Xóa dòng"
                    disabled={form.lines.length === 1}
                    onClick={() =>
                      setForm({
                        ...form,
                        lines: form.lines.filter(
                          (_: Row, j: number) => i !== j,
                        ),
                      })
                    }
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="ghost"
              disabled={form.lines.length >= 50}
              onClick={() =>
                setForm({
                  ...form,
                  lines: [
                    ...form.lines,
                    { productId: "", qty: 1, unitPrice: "" },
                  ],
                })
              }
            >
              + Thêm dòng sản phẩm
            </button>
            <section className="pricing-explanation" aria-live="polite">
              <h3>Giá và hoa hồng của đơn này</h3>
              {!pricingReady ? (
                <p>Chọn sản phẩm và nhập số lượng để tính giá.</p>
              ) : !pricing && !pricingError ? (
                <Loading label="Đang tính bậc giá…" />
              ) : null}
              <ErrorBox error={pricingError} />
              {pricing?.lines.map((l: Row) => (
                <div className="pricing-line-result" key={l.productId}>
                  <strong>{l.productName}</strong>
                  <small className="block">
                    {l.group}: {l.groupQty} sản phẩm · {l.policy}
                  </small>
                  {l.error ? (
                    <p className="danger">{l.error}</p>
                  ) : (
                    <p>
                      {l.qty} × {money(l.unitPrice)} ={" "}
                      <strong>{money(l.amount)}</strong>
                      <span className="block muted">
                        Hoa hồng dự kiến {l.commissionRate}% ·{" "}
                        {money(l.commission)}
                      </span>
                    </p>
                  )}
                </div>
              ))}
              {pricing?.valid && (
                <p className="notice">
                  Hoa hồng dự kiến toàn đơn:{" "}
                  <strong>{money(pricing.commission)}</strong>. Không tính vận
                  chuyển; được ghi nhận khi đơn đủ điều kiện.
                </p>
              )}
            </section>
            <div className="form-grid">
              <Field label="Vận chuyển (VND)">
                <input
                  type="number"
                  min="0"
                  max="100000000"
                  step="1"
                  required
                  value={form.shipping}
                  onChange={(e) =>
                    setForm({ ...form, shipping: e.target.value })
                  }
                />
              </Field>
              <div className="form-total">
                <small>Tổng dự kiến</small>
                <strong>{money(total + Number(form.shipping))}</strong>
              </div>
            </div>
            <Field label="Ghi chú">
              <textarea
                rows={2}
                maxLength={3000}
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
              />
            </Field>
            {quote && (
              <Field
                label={
                  form.document
                    ? "Điều kiện bổ sung cho báo giá này"
                    : "Điều kiện báo giá"
                }
              >
                <textarea
                  rows={4}
                  maxLength={5000}
                  value={form.terms}
                  onChange={(e) => setForm({ ...form, terms: e.target.value })}
                />
              </Field>
            )}
            <ErrorBox error={err} />
            <div className="form-actions">
              <button
                type="button"
                className="ghost"
                onClick={() => setForm(null)}
              >
                Hủy
              </button>
              <button className="primary" disabled={busy || !pricing?.valid}>
                Lưu {quote ? "báo giá" : "đơn hàng"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {detail && (
        <Modal
          title={detail.record.code}
          close={() => {
            setDetail(null);
            setAction(null);
          }}
        >
          <div className="detail-heading">
            <Badge value={detail.record.status} />
            <span className="muted">
              {labels[detail.record.channel]} · {date(detail.record.created_at)}
            </span>
          </div>
          <div className="customer-detail">
            <strong>{parse(detail.record.customer_snapshot).name}</strong>
            <p>
              {[
                parse(detail.record.customer_snapshot).company,
                parse(detail.record.customer_snapshot).phone,
                parse(detail.record.customer_snapshot).address,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Sản phẩm</th>
                  <th>SL</th>
                  <th>Đơn giá</th>
                  <th>Thành tiền</th>
                </tr>
              </thead>
              <tbody>
                {detail.lines.map((l: Row) => (
                  <tr key={l.id}>
                    <td>
                      {l.product_name}
                      <small className="muted block">{l.sku}</small>
                      {l.lead_days_min != null && (
                        <small className="muted block">
                          Chuẩn bị: {l.lead_days_min}–{l.lead_days_max} ngày
                        </small>
                      )}
                    </td>
                    <td>{l.qty}</td>
                    <td>{money(l.unit_price)}</td>
                    <td>{money(l.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="totals">
            <p>
              Tiền hàng <strong>{money(detail.record.subtotal)}</strong>
            </p>
            <p>
              Vận chuyển <strong>{money(detail.record.shipping)}</strong>
            </p>
            <p className="grand">
              Tổng cộng{" "}
              <strong>
                {money(
                  Number(detail.record.subtotal) +
                    Number(detail.record.shipping),
                )}
              </strong>
            </p>
            {!quote && (
              <>
                <p>
                  Đã thu <strong>{money(detail.record.paid)}</strong>
                </p>
                <p>
                  Hoa hồng dự kiến{" "}
                  <strong>{money(detail.record.commission_total)}</strong>
                </p>
              </>
            )}
          </div>
          {detail.record.note && (
            <p className="pre-line">{detail.record.note}</p>
          )}
          {quote && (
            <>
              <p className="muted">
                Hiệu lực đến {date(detail.record.valid_until)}
              </p>
              <p className="pre-line">{detail.record.terms}</p>
            </>
          )}
          <div className="detail-actions">
            {quote &&
              detail.record.status === "accepted" &&
              (manager || settings?.ctvQuotes) && (
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setErr("");
                    try {
                      const result = await api(
                        "/quotes/" + detail.record.id + "/convert",
                        "POST",
                        { version: detail.record.version },
                      );
                      setDetail(null);
                      refresh();
                      tell(
                        "Đã mở đơn từ báo giá; giá và size đã chốt được giữ nguyên.",
                      );
                      launch?.("orders", result.id);
                    } catch (e) {
                      setErr((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {detail.orderId ? "Mở đơn đã tạo" : "Chuyển thành đơn"}
                </button>
              )}
            {detail.record.status === (quote ? "draft" : "pending") &&
              (!quote || manager || settings?.ctvQuotes) && (
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={editDetail}
                >
                  Chỉnh sửa
                </button>
              )}
            {quote && (
              <button
                className="primary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await (
                      await import("../pdf")
                    ).exportQuote(detail.record, detail.lines);
                    tell("Đã xuất PDF.");
                  } catch (e) {
                    setErr((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Tải báo giá PDF ↓
              </button>
            )}
            {!quote &&
              manager &&
              !["cancelled", "returned"].includes(detail.record.status) && (
                <button
                  className="secondary"
                  onClick={() =>
                    setAction({
                      kind: "payment",
                      paid: detail.record.paid,
                      reference: "",
                    })
                  }
                >
                  Ghi nhận thanh toán
                </button>
              )}
            {(quote
              ? manager || settings?.ctvQuotes
                ? (
                    {
                      draft: ["sent"],
                      sent: ["draft", "accepted", "rejected"],
                    } as Record<string, string[]>
                  )[detail.record.status] || []
                : []
              : manager
                ? (
                    {
                      pending: ["confirmed", "cancelled"],
                      confirmed: ["shipping", "cancelled"],
                      shipping: ["completed", "returned"],
                      completed: ["returned"],
                    } as Record<string, string[]>
                  )[detail.record.status] || []
                : detail.record.status === "pending"
                  ? ["cancelled"]
                  : []
            ).map((s) => (
              <button
                className={
                  ["cancelled", "returned", "rejected"].includes(s)
                    ? "ghost danger"
                    : "secondary"
                }
                disabled={busy}
                key={s}
                onClick={() => {
                  setErr("");
                  setAction({ kind: "status", status: s, reason: "" });
                }}
              >
                {labels[s]}
              </button>
            ))}
          </div>
          {action && (
            <form onSubmit={doAction} className="inline-action">
              <h3>
                {action.kind === "payment"
                  ? "Cập nhật tổng tiền đã thu"
                  : labels[action.status]}
              </h3>
              {action.kind === "payment" ? (
                <>
                  <Field label="Tổng số tiền đã thu lũy kế (không phải tiền thu thêm)">
                    <input
                      type="number"
                      required
                      min="0"
                      max={
                        Number(detail.record.subtotal) +
                        Number(detail.record.shipping)
                      }
                      step="1"
                      value={action.paid}
                      onChange={(e) =>
                        setAction({ ...action, paid: e.target.value })
                      }
                    />
                  </Field>
                  <p className="notice">
                    Chênh lệch so với số đã thu hiện tại được lưu thành một dòng
                    thu hoặc điều chỉnh. Lịch sử luôn được giữ lại.
                  </p>
                  <Field label="Nội dung / mã giao dịch">
                    <input
                      required
                      maxLength={300}
                      value={action.reference}
                      onChange={(e) =>
                        setAction({ ...action, reference: e.target.value })
                      }
                    />
                  </Field>
                </>
              ) : (
                <Field label="Lý do / ghi chú">
                  <input
                    required={["cancelled", "returned"].includes(action.status)}
                    maxLength={1000}
                    value={action.reason}
                    onChange={(e) =>
                      setAction({ ...action, reason: e.target.value })
                    }
                  />
                </Field>
              )}
              <div className="form-actions">
                <button
                  type="button"
                  className="ghost"
                  onClick={() => setAction(null)}
                >
                  Bỏ qua
                </button>
                <button className="primary" disabled={busy}>
                  Xác nhận
                </button>
              </div>
            </form>
          )}
          <ErrorBox error={err} />
          {!quote && (
            <section className="table-wrap">
              <h3>Lịch sử thu và điều chỉnh</h3>
              <table>
                <thead>
                  <tr>
                    <th>Ngày thu</th>
                    <th>Số tiền</th>
                    <th>Tham chiếu</th>
                    <th>Người ghi</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.payments?.map((p: Row) => (
                    <tr key={p.id}>
                      <td>
                        {p.opening_balance
                          ? "Số dư trước nâng cấp"
                          : date(p.occurred_at)}
                      </td>
                      <td>{money(p.amount)}</td>
                      <td>{p.reference}</td>
                      <td>{p.actor_name || "Hệ thống"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
          {!quote && (
            <div className="timeline">
              <h3>Lịch sử đơn hàng</h3>
              {detail.events.map((e: Row) => {
                const d = parse(e.detail);
                return (
                  <div key={e.id}>
                    <span className="timeline-dot" />
                    <p>
                      <strong>
                        {e.kind === "status"
                          ? `${labels[d.from]} → ${labels[d.to]}`
                          : e.kind === "payment"
                            ? `Cập nhật đã thu: ${money(d.after)}`
                            : e.kind === "created"
                              ? "Tạo đơn hàng"
                              : "Chỉnh sửa đơn hàng"}
                      </strong>
                      <small>
                        {e.actor_name} ·{" "}
                        {new Date(e.created_at).toLocaleString("vi-VN", {
                          timeZone: "Asia/Ho_Chi_Minh",
                        })}
                      </small>
                      {(d.reason || d.reference) && (
                        <span>{d.reason || d.reference}</span>
                      )}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
