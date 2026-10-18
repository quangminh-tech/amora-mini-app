import React, { useEffect, useState } from "react";
import { api, request, Row, downloadBlob, money } from "../api";
import { Modal, Field, ErrorBox, Loading, ProductImage } from "./UI";
export function CatalogueExport({
  ids,
  manager,
  close,
  tell,
}: {
  ids: string[];
  manager: boolean;
  close: () => void;
  tell: (message: string) => void;
}) {
  const [data, setData] = useState<Row | null>(null),
    [channel, setChannel] = useState("retail"),
    [mode, setMode] = useState("catalogue"),
    [title, setTitle] = useState("DANH MỤC SẢN PHẨM AMORA"),
    [recipient, setRecipient] = useState(""),
    [note, setNote] = useState(
      "Giá và thời gian giao hàng xác nhận khi đặt hàng. Thuế, phí vận chuyển theo thỏa thuận.",
    ),
    [showPrices, setShowPrices] = useState(true),
    [bands, setBands] = useState([
      { label: "SL < 12" },
      { label: "SL ≥ 12" },
      { label: "SL ≥ 50" },
      { label: "SL ≥ 100" },
    ]),
    [priceMap, setPriceMap] = useState<Record<string, string[]>>({}),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState("");
  const [issueDate, setIssueDate] = useState(
    new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10),
  );
  const [validDays, setValidDays] = useState(7),
    [contact, setContact] = useState("");
  useEffect(() => {
    let current = true;
    setData(null);
    setError("");
    api("/catalogue/export-data", "POST", { ids, channel })
      .then((d) => {
        if (current)
          setData({
            ...d,
            products: ids.map((id) => d.products.find((p: Row) => p.id === id)),
          });
      })
      .catch((e) => {
        if (current) setError(e.message);
      });
    return () => {
      current = false;
    };
  }, [channel, ids.join(",")]);
  async function images() {
    const result: Record<string, Uint8Array> = {};
    let missing = 0;
    for (let i = 0; i < data!.products.length; i++) {
      const product = data!.products[i];
      setProgress(`Đang chuẩn bị ảnh ${i + 1}/${data!.products.length}…`);
      if (!product.image_id) {
        missing++;
        continue;
      }
      try {
        const response = await request("/images/" + product.image_id);
        const blob = await response!.blob();
        const bitmap = await createImageBitmap(blob);
        const scale = Math.min(1, 640 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Không xử lý được ảnh.");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();
        const jpg = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (b) =>
              b ? resolve(b) : reject(new Error("Không xử lý được ảnh.")),
            "image/jpeg",
            0.82,
          ),
        );
        result[product.id] = new Uint8Array(await jpg.arrayBuffer());
        canvas.width = 1;
        canvas.height = 1;
      } catch (e) {
        if ((e as any).status === 401 || (e as any).status === 403) throw e;
        missing++;
      }
    }
    return { result, missing };
  }
  async function exportPdf() {
    if (!data) return;
    setBusy(true);
    setError("");
    setProgress("Đang chuẩn bị PDF…");
    try {
      if (
        mode === "tiers" &&
        Object.values(priceMap)
          .flat()
          .some(
            (x) =>
              x !== "" &&
              (!/^\d+$/.test(x) || Number(x) < 1 || Number(x) > 1000000000),
          )
      )
        throw new Error(
          "Giá bậc phải là số nguyên từ 1 đến 1.000.000.000 đồng.",
        );
      const { result, missing } =
        mode === "catalogue" ? await images() : { result: {}, missing: 0 };
      const module = await import("../cataloguePdf");
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(issueDate) ||
        !Number.isInteger(validDays) ||
        validDays < 1 ||
        validDays > 365
      )
        throw new Error("Kiểm tra ngày lập và hiệu lực 1-365 ngày.");
      const opts = {
        issueDate,
        validDays,
        contact,
        title,
        recipient,
        note,
        showPrices,
        images: result,
        bands,
        bandPrices: priceMap,
      };
      const bytes = await (mode === "catalogue"
        ? module.createCataloguePdf(data, opts)
        : module.createTierPricePdf(data, opts));
      downloadBlob(
        new Blob([new Uint8Array(bytes)], { type: "application/pdf" }),
        `AMORA-${mode}-${new Date().toISOString().slice(0, 10)}.pdf`,
      );
      const message = missing
        ? `Đã xuất PDF; ${missing} sản phẩm thiếu hoặc không tải được ảnh, hiển thị ô “Chưa có ảnh”.`
        : "Đã xuất PDF.";
      tell(message);
      if (missing) setError(message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setProgress("");
    }
  }
  async function importDraft(file: File) {
    try {
      if (file.size > 256000) throw new Error("File tối đa 250 KB.");
      const v = JSON.parse(await file.text());
      if (
        v.format !== "amora-tier-sheet-v1" ||
        !Array.isArray(v.bands) ||
        v.bands.length < 1 ||
        v.bands.length > 4 ||
        v.bands.some(
          (b: Row) => !b || typeof b.label !== "string" || b.label.length > 80,
        ) ||
        typeof v.priceMap !== "object" ||
        v.priceMap === null
      )
        throw new Error("File bảng giá bậc không hợp lệ.");
      const out: Record<string, string[]> = {};
      for (const [id, values] of Object.entries(v.priceMap)) {
        if (
          !ids.includes(id) ||
          !Array.isArray(values) ||
          values.length !== v.bands.length ||
          values.some(
            (x) =>
              typeof x !== "string" ||
              (x !== "" &&
                (!/^\d+$/.test(x) || Number(x) < 1 || Number(x) > 1000000000)),
          )
        )
          throw new Error(
            "SKU trong file phải nằm trong danh sách đã tick, giá phải là số nguyên hợp lệ.",
          );
        out[id] = values;
      }
      if (
        typeof v.issueDate === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(v.issueDate)
      )
        setIssueDate(v.issueDate);
      if (
        Number.isInteger(v.validDays) &&
        v.validDays >= 1 &&
        v.validDays <= 365
      )
        setValidDays(v.validDays);
      if (typeof v.contact === "string") setContact(v.contact.slice(0, 200));
      setBands(v.bands);
      setPriceMap(out);
      if (typeof v.title === "string") setTitle(v.title.slice(0, 180));
      if (typeof v.recipient === "string")
        setRecipient(v.recipient.slice(0, 200));
      if (typeof v.note === "string") setNote(v.note.slice(0, 5000));
      setMode("tiers");
      setError("");
      tell("Đã nạp bản nháp; kiểm tra rồi xuất PDF.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <Modal
      title={"Xuất catalogue / chứng từ · " + ids.length + " SKU"}
      close={() => {
        if (!busy) close();
      }}
    >
      <ErrorBox error={error} />
      {!data && !error && <Loading />}
      {data && (
        <>
          <fieldset
            disabled={busy}
            style={{ border: 0, padding: 0, minWidth: 0 }}
          >
            <div className="form-grid">
              <Field label="Ngày lập">
                <input
                  type="date"
                  required
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                />
              </Field>
              <Field label="Hiệu lực (ngày)">
                <input
                  type="number"
                  required
                  min={1}
                  max={365}
                  value={validDays}
                  onChange={(e) => setValidDays(Number(e.target.value))}
                />
              </Field>
              <Field label="Người liên hệ">
                <input
                  maxLength={200}
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                />
              </Field>
              <Field label="Loại tài liệu">
                <select
                  value={mode}
                  onChange={(e) => {
                    setMode(e.target.value);
                    setTitle(
                      e.target.value === "tiers"
                        ? "BẢNG BÁO GIÁ QUÀ TẶNG DOANH NGHIỆP"
                        : "DANH MỤC SẢN PHẨM AMORA",
                    );
                  }}
                >
                  <option value="catalogue">Catalogue kèm ảnh</option>
                  {manager && (
                    <option value="tiers">Bảng giá bậc số lượng</option>
                  )}
                </select>
              </Field>
              <Field label="Kênh giá">
                <select
                  value={channel}
                  onChange={(e) => setChannel(e.target.value)}
                >
                  {(manager ? ["retail", "wholesale", "b2b"] : ["retail"]).map(
                    (ch) => (
                      <option key={ch} value={ch}>
                        {
                          (
                            {
                              retail: "Bán lẻ",
                              wholesale: "Bán sỉ",
                              b2b: "Doanh nghiệp",
                            } as Row
                          )[ch]
                        }
                      </option>
                    ),
                  )}
                </select>
              </Field>
              <Field label="Tiêu đề tài liệu">
                <input
                  required
                  maxLength={180}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </Field>
              <Field label="Người / đơn vị nhận">
                <input
                  maxLength={200}
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                />
              </Field>
            </div>
            {mode === "catalogue" ? (
              <>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={showPrices}
                    onChange={(e) => setShowPrices(e.target.checked)}
                  />
                  Hiện giá và MOQ
                </label>
                <p className="muted">
                  Xuất ảnh thật đã tải lên SKU. Không có ảnh sẽ hiện ô trống có
                  nhãn. Không xuất tỷ lệ hoa hồng hoặc dữ liệu nội bộ.
                </p>
                <div className="catalogue-preview">
                  {data.products.map((p: Row) => (
                    <article key={p.id} className="catalogue-card">
                      <ProductImage id={p.image_id} />
                      <strong>{p.name}</strong>
                      <small className="muted block">{p.sku}</small>
                      {showPrices && (
                        <p>
                          {data.prices.find((x: Row) => x.product_id === p.id)
                            ? money(
                                data.prices.find(
                                  (x: Row) => x.product_id === p.id,
                                ).unit_price,
                              )
                            : "Liên hệ báo giá"}
                        </p>
                      )}
                    </article>
                  ))}
                </div>
              </>
            ) : (
              <>
                <p className="notice">
                  Nhập giá bậc theo từng SKU cho tài liệu này. Giá không tự tính
                  từ kênh giá, không ghi đè Bảng giá và không tạo đơn hàng. Ô
                  trống xuất “Liên hệ”.
                </p>
                <div className="form-grid">
                  {bands.map((b, i) => (
                    <Field key={i} label={"Nhãn cột giá " + (i + 1)}>
                      <input
                        maxLength={80}
                        value={b.label}
                        onChange={(e) =>
                          setBands(
                            bands.map((x, j) =>
                              j === i ? { label: e.target.value } : x,
                            ),
                          )
                        }
                      />
                    </Field>
                  ))}
                </div>
                <div className="table-wrap bulk-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Sản phẩm / SKU</th>
                        {bands.map((b, i) => (
                          <th key={i}>{b.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.products.map((p: Row) => (
                        <tr key={p.id}>
                          <td>
                            {p.name}
                            <small className="muted block">{p.sku}</small>
                          </td>
                          {bands.map((_, i) => (
                            <td key={i}>
                              <input
                                aria-label={p.sku + " bậc " + (i + 1)}
                                type="number"
                                min={1}
                                max={1000000000}
                                step={1}
                                value={priceMap[p.id]?.[i] || ""}
                                onChange={(e) =>
                                  setPriceMap({
                                    ...priceMap,
                                    [p.id]: bands.map((_, j) =>
                                      i === j
                                        ? e.target.value
                                        : priceMap[p.id]?.[j] || "",
                                    ),
                                  })
                                }
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="toolbar">
                  <button
                    className="secondary"
                    onClick={() =>
                      downloadBlob(
                        new Blob(
                          [
                            JSON.stringify(
                              {
                                format: "amora-tier-sheet-v1",
                                issueDate,
                                validDays,
                                contact,
                                title,
                                recipient,
                                note,
                                bands,
                                priceMap,
                              },
                              null,
                              2,
                            ),
                          ],
                          { type: "application/json" },
                        ),
                        "amora-bang-gia-bac-nhap.json",
                      )
                    }
                  >
                    Lưu bản nháp JSON
                  </button>
                  <Field label="Import bản nháp để sửa">
                    <input
                      type="file"
                      accept=".json"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void importDraft(f);
                        e.target.value = "";
                      }}
                    />
                  </Field>
                </div>
              </>
            )}
            <Field label="Ghi chú / điều kiện">
              <textarea
                rows={4}
                maxLength={5000}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>
            <div className="form-actions">
              <button
                className="primary"
                disabled={!title.trim()}
                onClick={() => void exportPdf()}
              >
                Xuất PDF
              </button>
            </div>
          </fieldset>
          {busy && <Loading label={progress} />}
        </>
      )}
    </Modal>
  );
}
