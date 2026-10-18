import React, { useState } from "react";
import { Common } from "../types";
import { api, Row, money, labels } from "../api";
import {
  useLoad,
  useDebounced,
  Pagination,
  Field,
  Modal,
  ErrorBox,
  Empty,
  Loading,
} from "../components/UI";
import { TransferBar } from "../components/Transfer";
import { SelectAll, useSelection } from "../components/Selection";
export function Prices({ revision, refresh, tell }: Common) {
  const [page, setPage] = useState(1),
    [search, setSearch] = useState(""),
    [category, setCategory] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [draft, setDraft] = useState<Row[] | null>(null),
    [channel, setChannel] = useState("retail");
  const selected = useSelection(),
    term = useDebounced(search);
  const {
    data: d,
    error: loadError,
    loading,
  } = useLoad<Row>(
    `/products?page=${page}&pageSize=25&search=${encodeURIComponent(term)}&category=${encodeURIComponent(category)}`,
    revision,
  );
  const { data: groups } = useLoad<Row[]>(
    "/directories/product-categories",
    revision,
  );
  const ids = (d?.products || []).map((p: Row) => p.id);
  async function openBatch(ch: string, onlyId?: string) {
    setBusy(true);
    setError("");
    try {
      const result = await api(
        "/products?page=1&pageSize=1&modelId=00000000-0000-0000-0000-000000000000&includeIds=" +
          (onlyId || selected.ids.join(",")),
      );
      const target = onlyId ? [onlyId] : selected.ids;
      if (result.products.length !== target.length)
        throw new Error("Có SKU không còn tồn tại. Tải lại danh sách.");
      setChannel(ch);
      setDraft(
        result.products.map((p: Row) => {
          const price = result.prices.find(
            (x: Row) => x.product_id === p.id && x.channel === ch,
          );
          return {
            id: p.id,
            name: p.name,
            sku: p.sku,
            unit_price: price?.unit_price ?? "",
            min_qty: price?.min_qty ?? 1,
            commission_rate: price?.commission_rate ?? 0,
            version: price?.version ?? 0,
          };
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function change(i: number, key: string, value: string) {
    setDraft((old) =>
      old!.map((x, j) => (i === j ? { ...x, [key]: value } : x)),
    );
  }
  function fill(key: string) {
    if (!draft?.length) return;
    const value = draft[0][key];
    setDraft(draft.map((x) => ({ ...x, [key]: value })));
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      await api("/prices/batch", "POST", {
        items: draft!.map((x) => ({
          productId: x.id,
          price: {
            channel,
            unitPrice: Number(x.unit_price),
            minQty: Number(x.min_qty),
            commissionRate: Number(x.commission_rate),
            version: x.version,
          },
        })),
      });
      setDraft(null);
      selected.clear();
      refresh();
      tell("Đã lưu toàn bộ bảng giá. Chứng từ cũ giữ nguyên.");
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
      <p className="muted">
        Tick SKU để nhập giá hàng loạt. Chọn tối đa 50 SKU qua nhiều trang; nút
        tick đầu bảng chỉ chọn trang hiện tại.
      </p>
      {!!selected.ids.length && (
        <div className="selection-bar">
          <strong>Đã chọn {selected.ids.length}/50 SKU</strong>
          {["retail", "wholesale", "b2b"].map((ch) => (
            <button
              key={ch}
              className="secondary"
              disabled={busy}
              onClick={() => void openBatch(ch)}
            >
              Nhập giá {labels[ch]}
            </button>
          ))}
          <button className="ghost" disabled={busy} onClick={selected.clear}>
            Bỏ chọn
          </button>
        </div>
      )}
      <ErrorBox error={loadError || (!draft ? error : "")} />
      <section className="panel table-wrap" aria-busy={loading}>
        {loading ? (
          <Loading />
        ) : d?.products.length ? (
          <table>
            <thead>
              <tr>
                <th className="check-cell">
                  <SelectAll
                    checked={
                      ids.length > 0 &&
                      ids.every((id: string) => selected.ids.includes(id))
                    }
                    mixed={
                      ids.some((id: string) => selected.ids.includes(id)) &&
                      !ids.every((id: string) => selected.ids.includes(id))
                    }
                    onChange={() => selected.page(ids)}
                  />
                </th>
                <th>SKU / Mẫu</th>
                <th>Mùi / Size / Màu</th>
                {["retail", "wholesale", "b2b"].map((ch) => (
                  <th key={ch}>{labels[ch]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.products.map((p: Row) => (
                <tr key={p.id}>
                  <td className="check-cell">
                    <input
                      type="checkbox"
                      aria-label={"Chọn " + p.sku}
                      checked={selected.ids.includes(p.id)}
                      disabled={
                        !selected.ids.includes(p.id) &&
                        selected.ids.length >= 50
                      }
                      onChange={() => selected.toggle(p.id)}
                    />
                  </td>
                  <td>
                    <strong>{p.sku}</strong>
                    <small className="muted block">{p.model_name}</small>
                  </td>
                  <td>
                    {p.scent_name || "Không gắn mùi"}
                    <small className="muted block">
                      {[p.size_label, p.color_label]
                        .filter(Boolean)
                        .join(" · ")}
                    </small>
                  </td>
                  {["retail", "wholesale", "b2b"].map((ch) => {
                    const price = d.prices.find(
                      (x: Row) => x.product_id === p.id && x.channel === ch,
                    );
                    return (
                      <td key={ch}>
                        <button
                          className="price-cell"
                          disabled={busy}
                          onClick={() => void openBatch(ch, p.id)}
                        >
                          {price ? (
                            <>
                              <strong>{money(price.unit_price)}</strong>
                              <small>
                                MOQ {price.min_qty} · HH {price.commission_rate}
                                %
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
        ) : (
          !loadError && <Empty text="Thêm SKU trước khi nhập bảng giá." />
        )}
      </section>
      <Pagination data={d} loading={loading} page={page} setPage={setPage} />
      {draft && (
        <Modal
          title={"Nhập giá " + labels[channel] + " · " + draft.length + " SKU"}
          close={() => {
            if (!busy) setDraft(null);
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <p className="notice">
              Điền từng dòng, hoặc dùng giá trị dòng đầu cho tất cả. Lưu một
              lần; nếu có dòng lỗi hoặc dữ liệu cũ thì toàn bộ đợt chưa được
              ghi.
            </p>
            <fieldset
              disabled={busy}
              style={{ border: 0, padding: 0, minWidth: 0 }}
            >
              <div className="toolbar">
                {[
                  ["unit_price", "Áp dụng giá dòng đầu"],
                  ["min_qty", "Áp dụng MOQ dòng đầu"],
                  ["commission_rate", "Áp dụng % dòng đầu"],
                ].map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    className="secondary"
                    onClick={() => fill(k)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="table-wrap bulk-table">
                <table>
                  <thead>
                    <tr>
                      <th>SKU / sản phẩm</th>
                      <th>Đơn giá (đ)</th>
                      <th>MOQ</th>
                      <th>Hoa hồng %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {draft.map((x, i) => (
                      <tr key={x.id}>
                        <td>
                          {x.sku}
                          <small className="muted block">{x.name}</small>
                        </td>
                        {[
                          ["unit_price", 1, 1000000000, 1],
                          ["min_qty", 1, 100000, 1],
                          ["commission_rate", 0, 100, 0.01],
                        ].map(([key, min, max, step]) => (
                          <td key={key}>
                            <input
                              aria-label={x.sku + " " + key}
                              required
                              type="number"
                              value={x[key]}
                              min={Number(min)}
                              max={Number(max)}
                              step={Number(step)}
                              onChange={(e) =>
                                change(i, String(key), e.target.value)
                              }
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ErrorBox error={error} />
              {busy && <Loading label="Đang lưu bảng giá…" />}
              <div className="form-actions">
                <button className="primary">Lưu toàn bộ</button>
              </div>
            </fieldset>
          </form>
        </Modal>
      )}
    </>
  );
}
