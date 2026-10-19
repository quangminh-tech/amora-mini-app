import React, { useEffect, useState } from "react";
import { Common } from "../types";
import { api, Row, money, labels } from "../api";
import { useLoad, Loading, ErrorBox, Field, Modal } from "../components/UI";
export function PricingPolicies({ revision, refresh, tell }: Common) {
  const [category, setCategory] = useState(""),
    [channel, setChannel] = useState("wholesale"),
    [draft, setDraft] = useState<Row | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState(""),
    [paste, setPaste] = useState<string | null>(null),
    [pasteError, setPasteError] = useState("");
  const { data: groups } = useLoad<Row[]>(
    "/directories/product-categories",
    revision,
  );
  const {
    data,
    loading,
    error: loadError,
  } = useLoad<Row>(
    category
      ? `/pricing/editor?categoryId=${category}&channel=${channel}`
      : null,
    revision,
  );
  useEffect(() => {
    setError("");
    if (!data) {
      setDraft(null);
      return;
    }
    setDraft({
      name:
        data.policy?.name ||
        `${labels[channel]} · ${groups?.find((g) => g.id === category)?.name || ""}`,
      active: data.policy?.active ?? false,
      ctvAllowed: data.policy?.ctv_allowed ?? false,
      minMargin: data.policy?.min_margin ?? 0,
      version: data.policy?.version ?? 0,
      products: data.products.map((p: Row) => ({
        ...p,
        cost: p.unit_cost ?? "",
      })),
      tiers: data.tiers.length
        ? data.tiers.map((t: Row) => ({
            minQty: t.min_qty,
            commissionRate: t.commission_rate,
            prices: Object.fromEntries(
              data.prices
                .filter((v: Row) => v.tier_id === t.id)
                .map((v: Row) => [v.product_id, v.unit_price]),
            ),
          }))
        : [
            {
              minQty: channel === "wholesale" ? 10 : 20,
              commissionRate: channel === "wholesale" ? 5 : 3,
              prices: {},
            },
            {
              minQty: channel === "wholesale" ? 30 : 50,
              commissionRate: channel === "wholesale" ? 5 : 3,
              prices: {},
            },
          ],
    });
  }, [data]);
  function selectGroup(value: string) {
    if (
      draft &&
      !window.confirm("Chuyển nhóm sẽ bỏ phần chỉnh chưa lưu. Tiếp tục?")
    )
      return;
    setCategory(value);
  }
  function selectChannel(value: string) {
    if (
      draft &&
      !window.confirm("Chuyển kênh sẽ bỏ phần chỉnh chưa lưu. Tiếp tục?")
    )
      return;
    setChannel(value);
  }
  function tier(i: number, key: string, value: unknown) {
    setDraft((d) => ({
      ...d!,
      tiers: d!.tiers.map((t: Row, j: number) =>
        j === i ? { ...t, [key]: value } : t,
      ),
    }));
  }
  async function save() {
    if (!draft) return;
    setBusy(true);
    setError("");
    try {
      await api("/pricing/policy", "PUT", {
        categoryId: category,
        channel,
        name: draft.name,
        active: draft.active,
        ctvAllowed: draft.ctvAllowed,
        minMargin: Number(draft.minMargin),
        version: draft.version,
        costs: draft.products
          .filter((p: Row) => p.cost !== "")
          .map((p: Row) => ({
            productId: p.id,
            unitCost: Number(p.cost),
            version: p.cost_version,
          })),
        tiers: draft.tiers.map((t: Row) => ({
          minQty: Number(t.minQty),
          commissionRate: Number(t.commissionRate),
          prices: Object.entries(t.prices)
            .filter(([, v]) => v !== "" && v !== null)
            .map(([productId, unitPrice]) => ({
              productId,
              unitPrice: Number(unitPrice),
            })),
        })),
      });
      tell("Đã lưu chính sách. Báo giá cũ giữ nguyên.");
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function applyPaste() {
    if (!draft || paste === null) return;
    try {
      const rows = paste.trim().split(/\r?\n/).filter(Boolean);
      if (!rows.length || rows.length > 501)
        throw new Error("Dán tối đa 500 dòng SKU.");
      if (rows[0].split("\t")[0].trim().toUpperCase() === "SKU") rows.shift();
      const seen = new Set<string>();
      const tiers = draft.tiers.map((t: Row) => ({
        ...t,
        prices: { ...t.prices },
      }));
      const order = [...tiers]
        .map((t: Row, i: number) => ({ i, min: Number(t.minQty) }))
        .sort((a, b) => a.min - b.min);
      rows.forEach((line, n) => {
        const cells = line.split("\t"),
          sku = cells[0].trim(),
          p = draft.products.find((p: Row) => p.sku === sku);
        if (!p) throw new Error(`Dòng ${n + 1}: SKU ${sku} không thuộc nhóm.`);
        if (seen.has(sku)) throw new Error(`SKU ${sku} bị lặp.`);
        seen.add(sku);
        if (cells.length > tiers.length + 1)
          throw new Error(`Dòng ${n + 1}: thừa cột giá.`);
        order.forEach((col, j) => {
          const val = (cells[j + 1] ?? "").trim();
          if (val === "") return;
          if (val === "-") {
            tiers[col.i].prices[p.id] = "";
            return;
          }
          if (!/^\d+$/.test(val) || Number(val) < 1 || Number(val) > 1000000000)
            throw new Error(
              `Dòng ${n + 1}: nhập số nguyên, không dấu phân cách.`,
            );
          tiers[col.i].prices[p.id] = Number(val);
        });
      });
      setDraft({ ...draft, tiers });
      setPaste(null);
      tell(
        `Đã đưa ${rows.length} SKU vào bản nháp. Kiểm tra rồi bấm Lưu toàn bộ.`,
      );
    } catch (e) {
      setPasteError((e as Error).message);
    }
  }
  const ordered: Row[] = draft
    ? [...draft.tiers]
        .map((t: Row, i: number) => ({ ...t, index: i }))
        .sort((a: Row, b: Row) => Number(a.minQty) - Number(b.minQty))
    : [];
  return (
    <>
      <div className="notice">
        Số lượng cộng chung theo nhóm sản phẩm. Nhập ngưỡng và hoa hồng một lần
        cho từng bậc, sau đó điền giá theo SKU. Ô giá trống nghĩa là chưa được
        phép báo ở bậc đó.
      </div>
      <div className="toolbar">
        <select
          aria-label="Nhóm chính sách"
          value={category}
          onChange={(e) => selectGroup(e.target.value)}
        >
          <option value="">Chọn nhóm sản phẩm</option>
          {groups?.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Kênh chính sách"
          value={channel}
          onChange={(e) => selectChannel(e.target.value)}
        >
          <option value="wholesale">Bán sỉ</option>
          <option value="b2b">Doanh nghiệp</option>
        </select>
      </div>
      <ErrorBox error={error || loadError} />
      {loading && <Loading />}
      {draft && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <fieldset disabled={busy || loading} className="policy-fieldset">
            <div className="form-grid">
              <Field label="Tên chính sách">
                <input
                  required
                  maxLength={180}
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </Field>
              <Field label="Lợi nhuận tối thiểu sau hoa hồng (%)">
                <input
                  type="number"
                  required
                  min={0}
                  max={99.99}
                  step="0.01"
                  value={draft.minMargin}
                  onChange={(e) =>
                    setDraft({ ...draft, minMargin: e.target.value })
                  }
                />
              </Field>
            </div>
            <div className="toolbar">
              <label>
                <input
                  type="checkbox"
                  checked={draft.active}
                  onChange={(e) =>
                    setDraft({ ...draft, active: e.target.checked })
                  }
                />{" "}
                Kích hoạt chính sách
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={draft.ctvAllowed}
                  onChange={(e) =>
                    setDraft({ ...draft, ctvAllowed: e.target.checked })
                  }
                />{" "}
                Cho CTV báo giá theo chính sách
              </label>
            </div>
            <small className="muted">
              Lợi nhuận ước tính = (giá bán − giá vốn − hoa hồng) / giá bán.
              Chưa trừ thuế và chi phí chung. Ngưỡng 0% tắt kiểm soát này; thiếu
              vốn không được coi là có lời.
            </small>
            <div className="tier-settings">
              {draft.tiers.map((t: Row, i: number) => (
                <div className="tier-setting" key={i}>
                  <strong>Bậc {i + 1}</strong>
                  <Field label="Từ số lượng">
                    <input
                      type="number"
                      required
                      min={1}
                      max={100000}
                      step={1}
                      value={t.minQty}
                      onChange={(e) => tier(i, "minQty", e.target.value)}
                    />
                  </Field>
                  <Field label="Hoa hồng CTV (%)">
                    <input
                      type="number"
                      required
                      min={0}
                      max={100}
                      step="0.01"
                      value={t.commissionRate}
                      onChange={(e) =>
                        tier(i, "commissionRate", e.target.value)
                      }
                    />
                  </Field>
                  <button
                    type="button"
                    className="ghost danger"
                    disabled={draft.tiers.length === 1}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        tiers: draft.tiers.filter(
                          (_: Row, j: number) => j !== i,
                        ),
                      })
                    }
                  >
                    Bỏ bậc
                  </button>
                </div>
              ))}
            </div>
            <div className="toolbar">
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setPaste("");
                  setPasteError("");
                }}
              >
                Dán giá từ Excel
              </button>
              <button
                type="button"
                className="secondary"
                disabled={draft.tiers.length >= 6}
                onClick={() =>
                  setDraft({
                    ...draft,
                    tiers: [
                      ...draft.tiers,
                      {
                        minQty:
                          Math.max(
                            ...draft.tiers.map((t: Row) => Number(t.minQty)),
                          ) + 10,
                        commissionRate: 0,
                        prices: {},
                      },
                    ],
                  })
                }
              >
                + Thêm bậc
              </button>
              <input
                aria-label="Lọc SKU chính sách"
                placeholder="Tìm SKU, tên, size, màu…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <p className="muted">
              {draft.products.length} SKU trong nhóm · Lưu toàn bộ nhóm, kể cả
              các dòng đang ẩn bởi ô tìm kiếm.
            </p>
            <div className="panel table-wrap policy-price-grid">
              <table>
                <thead>
                  <tr>
                    <th>Sản phẩm / quy cách</th>
                    <th>Giá vốn nội bộ</th>
                    <th>Giá lẻ</th>
                    {ordered.map((t: Row, i: number) => (
                      <th key={t.index}>
                        Từ {t.minQty}
                        {ordered[i + 1]
                          ? ` đến ${Number(ordered[i + 1].minQty) - 1}`
                          : ""}
                        <small className="block">HH {t.commissionRate}%</small>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {draft.products
                    .filter((p: Row) =>
                      [p.sku, p.name, p.scent_name, p.size_label, p.color_label]
                        .join(" ")
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                    )
                    .map((p: Row) => (
                      <tr key={p.id}>
                        <td>
                          <strong>{p.name}</strong>
                          <small className="block">
                            {[p.scent_name, p.size_label, p.color_label]
                              .filter(Boolean)
                              .join(" · ")}
                          </small>
                          <small className="muted">
                            {p.sku}
                            {!p.active ? " · Đang ẩn" : ""}
                          </small>
                        </td>
                        <td>
                          <input
                            aria-label={`${p.sku} giá vốn`}
                            type="number"
                            min={0}
                            max={1000000000}
                            step={1}
                            value={p.cost}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                products: draft.products.map((x: Row) =>
                                  x.id === p.id
                                    ? { ...x, cost: e.target.value }
                                    : x,
                                ),
                              })
                            }
                          />
                        </td>
                        <td>
                          {p.retail_price ? money(p.retail_price) : "Chưa có"}
                        </td>
                        {ordered.map((t: Row) => {
                          const val = t.prices[p.id] ?? "";
                          const margin =
                            val !== "" && Number(val) > 0 && p.cost !== ""
                              ? ((Number(val) -
                                  Number(p.cost) -
                                  (Number(val) * Number(t.commissionRate)) /
                                    100) /
                                  Number(val)) *
                                100
                              : null;
                          return (
                            <td key={t.index}>
                              <input
                                aria-label={`${p.sku} từ ${t.minQty}`}
                                type="number"
                                min={1}
                                max={1000000000}
                                step={1}
                                placeholder="Chưa có giá"
                                value={val}
                                onChange={(e) =>
                                  tier(t.index, "prices", {
                                    ...t.prices,
                                    [p.id]: e.target.value,
                                  })
                                }
                              />
                              <small
                                className={
                                  margin !== null &&
                                  margin < Number(draft.minMargin)
                                    ? "danger"
                                    : "muted"
                                }
                              >
                                {margin === null
                                  ? "Chưa đủ dữ liệu lợi nhuận"
                                  : `Sau HH: ${margin.toFixed(1)}%`}
                              </small>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <div className="form-actions sticky-save">
              {busy && <Loading label="Đang lưu chính sách…" />}
              <button className="primary">Lưu toàn bộ chính sách</button>
            </div>
          </fieldset>
        </form>
      )}
      {paste !== null && draft && (
        <Modal title="Dán bảng giá từ Excel" close={() => setPaste(null)}>
          <p>
            Mỗi dòng: SKU, rồi giá cho các bậc theo thứ tự từ thấp đến cao. Các
            cột cách nhau bằng Tab khi copy từ Excel.
          </p>
          <p className="notice">
            {["SKU", ...ordered.map((t: Row) => "Từ " + t.minQty)].join(" | ")}
            <br />Ô trống: giữ giá hiện tại. Dấu -: xóa giá ở bậc đó. Dùng số
            nguyên như 179000.
          </p>
          <textarea
            aria-label="Dữ liệu giá từ Excel"
            rows={12}
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
          />
          <ErrorBox error={pasteError} />
          <div className="form-actions">
            <button className="primary" onClick={applyPaste}>
              Đưa vào bản nháp
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
