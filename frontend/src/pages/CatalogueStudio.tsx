import React, { useEffect, useRef, useState } from "react";
import { Common } from "../types";
import { api, request, Row } from "../api";
import {
  Modal,
  Field,
  ErrorBox,
  Loading,
  ProductImage,
} from "../components/UI";
import { Photo, StudioPreview, printStudio } from "../components/StudioPreview";
import {
  Content,
  Section,
  StudioDocument,
  newSection,
  uploadStudioImage,
} from "../catalogueStudio";
import "../studio.css";

export function CatalogueStudio({ user, tell }: Common) {
  const manager = user.role === "manager";
  const [items, setItems] = useState<Row[]>([]),
    [total, setTotal] = useState(0),
    [page, setPage] = useState(1),
    [search, setSearch] = useState(""),
    [refresh, setRefresh] = useState(0);
  const [doc, setDoc] = useState<StudioDocument | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [dirty, setDirty] = useState(false);
  const [selected, setSelected] = useState(""),
    [preview, setPreview] = useState(false),
    [phone, setPhone] = useState(false),
    [publishedView, setPublishedView] = useState(false);
  const [picker, setPicker] = useState(false),
    [assetTarget, setAssetTarget] = useState<string | null>(null);
  const previewRef = useRef<HTMLDivElement>(null),
    dirtyRef = useRef(false);
  dirtyRef.current = dirty;
  useEffect(() => {
    const unload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    const navigation = (e: Event) => {
      if (
        dirtyRef.current &&
        !window.confirm("Catalogue chưa lưu. Rời màn hình và bỏ thay đổi?")
      )
        e.preventDefault();
    };
    window.addEventListener("beforeunload", unload);
    window.addEventListener("amora-studio-leave", navigation);
    return () => {
      window.removeEventListener("beforeunload", unload);
      window.removeEventListener("amora-studio-leave", navigation);
      document.getElementById("cs-print-frame")?.remove();
    };
  }, []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    const timer = setTimeout(() => {
      api(`/studio?page=${page}&search=${encodeURIComponent(search)}`)
        .then((d) => {
          if (active) {
            setItems(d.items);
            setTotal(d.total);
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [page, search, refresh]);
  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function open(id: string, published = false) {
    await run(async () => {
      const d = await api(`/studio/${id}${published ? "?published=true" : ""}`);
      setDoc(d);
      setDirty(false);
      setSelected("");
      setPublishedView(published || !d.editable);
      setPreview(published || !d.editable);
    });
  }
  function change(patch: Partial<Content>) {
    setDoc((d) => (d ? { ...d, content: { ...d.content, ...patch } } : d));
    setDirty(true);
  }
  function section(patch: Partial<Section>) {
    if (!doc) return;
    change({
      sections: doc.content.sections.map((s) =>
        s.id === selected ? { ...s, ...patch } : s,
      ),
    });
  }
  async function save(): Promise<number> {
    if (!doc) throw new Error("Chưa mở catalogue.");
    const result = await api(`/studio/${doc.id}`, "PUT", {
      name: doc.name,
      version: doc.version,
      content: doc.content,
    });
    setDoc((d) => (d ? { ...d, version: result.version } : d));
    setDirty(false);
    setRefresh((x) => x + 1);
    return result.version;
  }
  function leave() {
    if (dirty && !window.confirm("Bỏ thay đổi chưa lưu?")) return;
    setDoc(null);
    setDirty(false);
    setError("");
    setRefresh((x) => x + 1);
  }
  async function create() {
    const name = window.prompt("Tên catalogue mới", "Bộ sưu tập AMORA");
    if (!name?.trim()) return;
    await run(async () => {
      const d = await api("/studio", "POST", { name: name.trim() });
      const full = await api("/studio/" + d.id);
      setDoc(full);
      setDirty(false);
      setPreview(false);
      setPublishedView(false);
      setSelected("");
    });
  }
  function add(kind: Section["kind"]) {
    if (!doc) return;
    if (doc.content.sections.length >= 100) {
      setError("Tối đa 100 mục nội dung.");
      return;
    }
    const s = newSection(kind);
    change({ sections: [...doc.content.sections, s] });
    setSelected(s.id);
  }
  async function pickProduct(product: Row, imageId?: string) {
    if (!doc) return;
    await run(async () => {
      const d = await api("/catalogue/export-data", "POST", {
        ids: [product.id],
        channel: "retail",
      });
      const p = d.products[0];
      const target = doc.content.sections.find(
        (s) => s.id === selected && s.kind === "product",
      );
      if (!target && doc.content.sections.length >= 100)
        throw new Error("Tối đa 100 mục nội dung.");
      const s: Section = {
        ...(target || newSection("product")),
        title: p.model_name || p.name,
        description: p.description || p.model_description || "",
        sku: p.sku,
        productId: p.id,
        spec: [p.scent_name, p.size_label, p.color_label, p.unit]
          .filter(Boolean)
          .join(" · "),
        price: manager ? (d.prices[0]?.unit_price ?? null) : null,
        imageIds: [],
      };
      if (imageId || p.image_id) {
        const response = await request("/images/" + (imageId || p.image_id));
        s.imageIds = [
          await uploadStudioImage(doc.id, await response!.blob(), p.sku),
        ];
      }
      change({
        sections: target
          ? doc.content.sections.map((x) => (x.id === target.id ? s : x))
          : [...doc.content.sections, s],
      });
      setSelected(s.id);
      setPicker(false);
      tell("Đã chèn bản sao sản phẩm. Sửa ở đây không thay đổi SKU gốc.");
    });
  }
  async function assignImage(id: string) {
    if (!doc || !assetTarget) return;
    if (assetTarget === "cover") change({ coverId: id });
    else {
      const s = doc.content.sections.find((x) => x.id === assetTarget);
      if (!s) return;
      if (s.imageIds.includes(id)) return;
      if (s.imageIds.length >= 4) {
        setError("Một mục tối đa 4 ảnh. Bỏ ảnh cũ trước khi thêm.");
        return;
      }
      change({
        sections: doc.content.sections.map((x) =>
          x.id === s.id ? { ...x, imageIds: [...x.imageIds, id] } : x,
        ),
      });
    }
    setAssetTarget(null);
  }
  const current = doc?.content.sections.find((s) => s.id === selected);
  const editable = !!doc?.editable && !publishedView;
  return (
    <div className="cs-workspace">
      <ErrorBox error={error} />
      {!doc ? (
        <>
          <div className="toolbar">
            <input
              aria-label="Tìm catalogue"
              placeholder="Tìm catalogue…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
            <button onClick={() => void create()} disabled={busy}>
              + Tạo catalogue
            </button>
          </div>
          <p className="muted">
            Catalogue riêng với sản phẩm và báo giá. CTV tạo bản giới thiệu;
            quản lý phát hành bản chung.
          </p>
          {loading ? (
            <Loading label="Đang tải catalogue…" />
          ) : (
            <div className="cs-library">
              {items.map((item) => (
                <article key={item.id}>
                  <p className="cs-eyebrow">
                    {item.published_at ? "ĐÃ PHÁT HÀNH" : "BẢN NHÁP"}
                  </p>
                  <h3>{item.name}</h3>
                  <p>{new Date(item.updated_at).toLocaleDateString("vi-VN")}</p>
                  <button disabled={busy} onClick={() => void open(item.id)}>
                    {item.editable ? "Mở / chỉnh sửa" : "Xem catalogue"}
                  </button>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const r = await api(`/studio/${item.id}/copy`, "POST");
                        const d = await api(`/studio/${r.id}`);
                        setDoc(d);
                        setDirty(false);
                        setPreview(false);
                        setPublishedView(false);
                        setSelected("");
                      })
                    }
                  >
                    Nhân bản
                  </button>
                  {item.editable && item.published_at && (
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() => void open(item.id, true)}
                    >
                      Xem bản phát hành
                    </button>
                  )}
                </article>
              ))}
            </div>
          )}
          {!loading && !items.length && (
            <p>Chưa có catalogue phù hợp. Bấm “Tạo catalogue” để bắt đầu.</p>
          )}
          <div className="cs-pagination">
            <span>
              {total} catalogue · Trang {page}/
              {Math.max(1, Math.ceil(total / 12))}
            </span>
            <button
              disabled={page === 1 || loading}
              onClick={() => setPage((x) => x - 1)}
            >
              ← Trước
            </button>
            <button
              disabled={page * 12 >= total || loading}
              onClick={() => setPage((x) => x + 1)}
            >
              Sau →
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="cs-toolbar">
            <button className="secondary" disabled={busy} onClick={leave}>
              ← Danh sách
            </button>
            <strong>{doc.name}</strong>
            <span>
              {dirty ? "Chưa lưu" : publishedView ? "Bản phát hành" : "Đã lưu"}
            </span>
            {editable && (
              <button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await save();
                    tell("Đã lưu catalogue.");
                  })
                }
              >
                Lưu
              </button>
            )}
            {editable && manager && (
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const version = dirty ? await save() : doc.version;
                    const r = await api(`/studio/${doc.id}/publish`, "POST", {
                      version,
                    });
                    setDoc((d) =>
                      d ? { ...d, version: r.version, published: true } : d,
                    );
                    tell("Đã phát hành cho CTV xem trong app.");
                  })
                }
              >
                Phát hành cho CTV
              </button>
            )}
            {doc.editable && (
              <button
                className="secondary"
                disabled={busy}
                onClick={() => {
                  if (publishedView) {
                    void open(doc.id);
                  } else setPreview((x) => !x);
                }}
              >
                {publishedView
                  ? "Về bản nháp"
                  : preview
                    ? "Chỉnh sửa"
                    : "Xem trước"}
              </button>
            )}
            <button className="secondary" onClick={() => setPhone((x) => !x)}>
              {phone ? "Khổ rộng" : "Xem điện thoại"}
            </button>
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  if (!previewRef.current) return;
                  await printStudio(previewRef.current!, doc.name);
                })
              }
            >
              In / Lưu PDF
            </button>
          </div>
          <p className="muted">
            {publishedView
              ? "Bản đã phát hành. Thay đổi bản nháp không tự đổi bản này."
              : "Bấm “Sửa mục” trong trang để chỉnh ảnh/chữ. Lưu trước khi rời màn hình."}{" "}
            In PDF: chọn A4, bật đồ họa nền, tắt đầu/chân trang trình duyệt.
          </p>
          {busy && <Loading label="Đang xử lý catalogue…" />}
          <div
            className={
              "cs-editor " + (preview || !editable ? "cs-preview-only" : "")
            }
          >
            {editable && !preview && (
              <aside className="cs-inspector">
                <fieldset disabled={busy}>
                  <details open>
                    <summary>Thông tin & giao diện</summary>
                    <Field label="Tên lưu trong app">
                      <input
                        maxLength={180}
                        value={doc.name}
                        onChange={(e) => {
                          setDoc({ ...doc, name: e.target.value });
                          setDirty(true);
                        }}
                      />
                    </Field>
                    <Field label="Tiêu đề trên bìa">
                      <input
                        maxLength={180}
                        value={doc.content.title}
                        onChange={(e) => change({ title: e.target.value })}
                      />
                    </Field>
                    <Field label="Thông điệp">
                      <input
                        maxLength={300}
                        value={doc.content.subtitle}
                        onChange={(e) => change({ subtitle: e.target.value })}
                      />
                    </Field>
                    <Field label="Giới thiệu">
                      <textarea
                        maxLength={3000}
                        value={doc.content.intro}
                        onChange={(e) => change({ intro: e.target.value })}
                      />
                    </Field>
                    <Field label="Nền">
                      <select
                        value={doc.content.theme}
                        onChange={(e) =>
                          change({ theme: e.target.value as Content["theme"] })
                        }
                      >
                        <option value="cream">Kem AMORA</option>
                        <option value="white">Trắng</option>
                        <option value="dark">Charcoal</option>
                      </select>
                    </Field>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={doc.content.motion}
                        onChange={(e) => change({ motion: e.target.checked })}
                      />
                      Animation nhẹ
                    </label>
                    {manager ? (
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={doc.content.showPrices}
                          onChange={(e) =>
                            change({ showPrices: e.target.checked })
                          }
                        />
                        Hiện giá lẻ tham khảo
                      </label>
                    ) : (
                      <p className="muted">
                        Catalogue CTV giới thiệu sản phẩm, không nhập giá. Tạo
                        báo giá tại mục Báo giá.
                      </p>
                    )}
                    <button
                      className="secondary"
                      onClick={() => setAssetTarget("cover")}
                    >
                      Chọn / tải ảnh bìa
                    </button>
                    {doc.content.coverId && (
                      <button
                        className="ghost"
                        onClick={() => change({ coverId: null })}
                      >
                        Bỏ ảnh bìa
                      </button>
                    )}
                    <Field label="Thông tin liên hệ">
                      <textarea
                        maxLength={1200}
                        value={doc.content.contact}
                        onChange={(e) => change({ contact: e.target.value })}
                      />
                    </Field>
                    <Field label="Điều kiện / ghi chú">
                      <textarea
                        maxLength={3000}
                        value={doc.content.note}
                        onChange={(e) => change({ note: e.target.value })}
                      />
                    </Field>
                  </details>
                  <div className="cs-add">
                    <button
                      onClick={() => {
                        setSelected("");
                        setPicker(true);
                      }}
                    >
                      + Chọn sản phẩm
                    </button>
                    <button className="secondary" onClick={() => add("text")}>
                      + Văn bản
                    </button>
                    <button
                      className="secondary"
                      onClick={() => add("gallery")}
                    >
                      + Bộ ảnh
                    </button>
                    <button className="secondary" onClick={() => add("table")}>
                      + Bảng
                    </button>
                  </div>
                  {current && (
                    <details open key={current.id}>
                      <summary>Chỉnh mục đang chọn</summary>
                      <Field label="Tiêu đề">
                        <input
                          maxLength={180}
                          value={current.title}
                          onChange={(e) => section({ title: e.target.value })}
                        />
                      </Field>
                      <Field label="Mô tả">
                        <textarea
                          rows={6}
                          maxLength={5000}
                          value={current.description}
                          onChange={(e) =>
                            section({ description: e.target.value })
                          }
                        />
                      </Field>
                      {current.kind === "product" && (
                        <>
                          <button
                            className="secondary"
                            onClick={() => setPicker(true)}
                          >
                            Đổi / lấy lại dữ liệu sản phẩm
                          </button>
                          <p className="muted">
                            Thao tác này thay tên, mô tả, quy cách, giá và ảnh
                            chính của mục.
                          </p>
                          <Field label="SKU">
                            <input
                              maxLength={80}
                              value={current.sku}
                              onChange={(e) => section({ sku: e.target.value })}
                            />
                          </Field>
                          <Field label="Quy cách">
                            <input
                              maxLength={300}
                              value={current.spec}
                              onChange={(e) =>
                                section({ spec: e.target.value })
                              }
                            />
                          </Field>
                          {manager && (
                            <Field label="Giá lẻ tham khảo (đ)">
                              <input
                                type="number"
                                min={1}
                                max={1000000000}
                                value={current.price ?? ""}
                                onChange={(e) =>
                                  section({
                                    price:
                                      e.target.value === ""
                                        ? null
                                        : Number(e.target.value),
                                  })
                                }
                              />
                            </Field>
                          )}
                        </>
                      )}
                      {(current.kind === "product" ||
                        current.kind === "gallery") && (
                        <>
                          <Field label="Bố cục">
                            <select
                              value={current.layout}
                              onChange={(e) =>
                                section({
                                  layout: e.target.value as Section["layout"],
                                })
                              }
                            >
                              <option value="split">
                                Ảnh trái · nội dung phải
                              </option>
                              <option value="gallery">
                                Ảnh lớn · nội dung bên dưới
                              </option>
                              <option value="compact">Thẻ gọn</option>
                            </select>
                          </Field>
                          <Field label="Cách hiển thị ảnh">
                            <select
                              value={current.fit}
                              onChange={(e) =>
                                section({
                                  fit: e.target.value as Section["fit"],
                                })
                              }
                            >
                              <option value="contain">
                                Hiện trọn sản phẩm
                              </option>
                              <option value="cover">Lấp đầy khung</option>
                            </select>
                          </Field>
                          {current.fit === "cover" && (
                            <Field label="Vị trí ảnh trên / dưới">
                              <input
                                type="range"
                                min={0}
                                max={100}
                                value={current.position}
                                onChange={(e) =>
                                  section({ position: Number(e.target.value) })
                                }
                              />
                            </Field>
                          )}
                          <button
                            className="secondary"
                            onClick={() => setAssetTarget(current.id)}
                          >
                            + Ảnh từ thư viện / tải lên
                          </button>
                          {current.imageIds.map((id, index) => (
                            <div key={id} className="cs-image-row">
                              <span>Ảnh {index + 1}</span>
                              <button
                                className="ghost"
                                disabled={index === 0}
                                onClick={() => {
                                  const ids = [...current.imageIds];
                                  [ids[index - 1], ids[index]] = [
                                    ids[index],
                                    ids[index - 1],
                                  ];
                                  section({ imageIds: ids });
                                }}
                              >
                                Lên
                              </button>
                              <button
                                className="ghost"
                                onClick={() =>
                                  section({
                                    imageIds: current.imageIds.filter(
                                      (x) => x !== id,
                                    ),
                                  })
                                }
                              >
                                Bỏ khỏi mục
                              </button>
                            </div>
                          ))}
                        </>
                      )}
                      {current.kind === "table" && (
                        <>
                          <p className="muted">
                            Tối đa 6 cột, 40 hàng. Bảng tự nhập là nội dung giới
                            thiệu, không thay chính sách giá.
                          </p>
                          {current.columns.map((col, j) => (
                            <div className="cs-image-row" key={j}>
                              <input
                                aria-label={"Tên cột " + (j + 1)}
                                maxLength={100}
                                value={col}
                                onChange={(e) =>
                                  section({
                                    columns: current.columns.map((x, k) =>
                                      j === k ? e.target.value : x,
                                    ),
                                  })
                                }
                              />
                              <button
                                className="ghost"
                                onClick={() =>
                                  section({
                                    columns: current.columns.filter(
                                      (_, k) => k !== j,
                                    ),
                                    rows: current.rows.map((row) =>
                                      row.filter((_, k) => k !== j),
                                    ),
                                  })
                                }
                              >
                                ×
                              </button>
                            </div>
                          ))}
                          <button
                            className="secondary"
                            disabled={current.columns.length >= 6}
                            onClick={() =>
                              section({
                                columns: [...current.columns, "Cột mới"],
                                rows: current.rows.map((row) => [...row, ""]),
                              })
                            }
                          >
                            + Cột
                          </button>
                          {current.rows.map((row, i) => (
                            <div key={i} className="cs-table-edit">
                              <strong>Hàng {i + 1}</strong>
                              {row.map((cell, j) => (
                                <Field key={j} label={current.columns[j]}>
                                  <textarea
                                    rows={2}
                                    maxLength={500}
                                    value={cell}
                                    onChange={(e) =>
                                      section({
                                        rows: current.rows.map((r, k) =>
                                          k === i
                                            ? r.map((x, l) =>
                                                l === j ? e.target.value : x,
                                              )
                                            : r,
                                        ),
                                      })
                                    }
                                  />
                                </Field>
                              ))}
                              <button
                                className="ghost"
                                onClick={() =>
                                  section({
                                    rows: current.rows.filter(
                                      (_, j) => i !== j,
                                    ),
                                  })
                                }
                              >
                                Xóa hàng
                              </button>
                            </div>
                          ))}
                          <button
                            className="secondary"
                            disabled={
                              !current.columns.length ||
                              current.rows.length >= 40
                            }
                            onClick={() =>
                              section({
                                rows: [
                                  ...current.rows,
                                  current.columns.map(() => ""),
                                ],
                              })
                            }
                          >
                            + Hàng
                          </button>
                          <button
                            className="secondary"
                            onClick={() => {
                              const rows = doc.content.sections
                                .filter((s) => s.kind === "product")
                                .map((s) => [s.title, s.spec, s.sku]);
                              if (rows.length > 40) {
                                setError("Bảng tối đa 40 hàng.");
                                return;
                              }
                              if (
                                current.rows.some((r) => r.some(Boolean)) &&
                                !confirm(
                                  "Thay bảng hiện tại bằng danh sách sản phẩm đã chọn?",
                                )
                              )
                                return;
                              section({
                                columns: ["Sản phẩm", "Quy cách", "SKU"],
                                rows,
                              });
                            }}
                          >
                            Điền từ sản phẩm đã chọn
                          </button>
                        </>
                      )}
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={current.pageBreak}
                          onChange={(e) =>
                            section({ pageBreak: e.target.checked })
                          }
                        />
                        Bắt đầu trang PDF mới
                      </label>
                      <div className="cs-add">
                        {[-1, 1].map((delta) => (
                          <button
                            key={delta}
                            className="secondary"
                            disabled={
                              doc.content.sections.findIndex(
                                (s) => s.id === selected,
                              ) +
                                delta <
                                0 ||
                              doc.content.sections.findIndex(
                                (s) => s.id === selected,
                              ) +
                                delta >=
                                doc.content.sections.length
                            }
                            onClick={() => {
                              const rows = [...doc.content.sections];
                              const i = rows.findIndex(
                                (s) => s.id === selected,
                              );
                              [rows[i], rows[i + delta]] = [
                                rows[i + delta],
                                rows[i],
                              ];
                              change({ sections: rows });
                            }}
                          >
                            {delta === -1 ? "↑ Lên" : "↓ Xuống"}
                          </button>
                        ))}
                        <button
                          className="secondary"
                          disabled={doc.content.sections.length >= 100}
                          onClick={() => {
                            const copy = {
                              ...structuredClone(current),
                              id: crypto.randomUUID(),
                            };
                            change({
                              sections: [...doc.content.sections, copy],
                            });
                            setSelected(copy.id);
                          }}
                        >
                          Nhân bản mục
                        </button>
                        <button
                          className="ghost"
                          onClick={() => {
                            if (!confirm("Xóa mục này khỏi catalogue?")) return;
                            change({
                              sections: doc.content.sections.filter(
                                (s) => s.id !== selected,
                              ),
                            });
                            setSelected("");
                          }}
                        >
                          Xóa mục
                        </button>
                      </div>
                    </details>
                  )}
                  {manager && doc.published && (
                    <button
                      className="ghost"
                      onClick={() =>
                        void run(async () => {
                          if (!confirm("Thu hồi bản chung khỏi danh sách CTV?"))
                            return;
                          const r = await api(
                            `/studio/${doc.id}/unpublish`,
                            "POST",
                            { version: doc.version },
                          );
                          setDoc({
                            ...doc,
                            version: r.version,
                            published: false,
                          });
                          tell("Đã thu hồi bản phát hành.");
                        })
                      }
                    >
                      Thu hồi bản phát hành
                    </button>
                  )}
                  <button
                    className="ghost"
                    onClick={() =>
                      void run(async () => {
                        if (!confirm("Lưu trữ catalogue và ẩn khỏi danh sách?"))
                          return;
                        await api(`/studio/${doc.id}/archive`, "POST", {
                          version: doc.version,
                        });
                        setDoc(null);
                        setDirty(false);
                        setRefresh((x) => x + 1);
                      })
                    }
                  >
                    Lưu trữ catalogue
                  </button>
                </fieldset>
              </aside>
            )}
            <div className={"cs-canvas " + (phone ? "cs-phone" : "")}>
              <StudioPreview
                documentId={doc.id}
                content={doc.content}
                printRef={previewRef}
                selected={selected}
                select={editable && !preview ? setSelected : undefined}
                onCover={
                  editable && !preview
                    ? () => setAssetTarget("cover")
                    : undefined
                }
              />
            </div>
          </div>
        </>
      )}
      {picker && doc && (
        <ProductPicker
          parentError={error}
          close={() => setPicker(false)}
          busy={busy}
          choose={(p, imageId) => void pickProduct(p, imageId)}
        />
      )}
      {assetTarget && doc && (
        <AssetPicker
          documentId={doc.id}
          close={() => setAssetTarget(null)}
          choose={(id) => void assignImage(id)}
        />
      )}
    </div>
  );
}

function ProductPicker({
  close,
  choose,
  busy,
  parentError,
}: {
  parentError: string;
  close: () => void;
  choose: (p: Row, imageId?: string) => void;
  busy: boolean;
}) {
  const [term, setTerm] = useState(""),
    [page, setPage] = useState(1),
    [data, setData] = useState<Row | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true);
    const timer = setTimeout(() => {
      api(
        `/products?page=${page}&pageSize=12&status=active&search=${encodeURIComponent(term)}`,
      )
        .then((d) => {
          if (active) setData(d);
        })
        .catch((e) => {
          if (active) setError(e.message);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [term, page]);
  return (
    <Modal
      title="Chọn sản phẩm để tự điền"
      close={() => {
        if (!busy) close();
      }}
    >
      <ErrorBox error={error || parentError} />
      <input
        aria-label="Tìm sản phẩm catalogue"
        placeholder="Tìm tên hoặc SKU…"
        value={term}
        disabled={busy}
        onChange={(e) => {
          setTerm(e.target.value);
          setPage(1);
        }}
      />
      {loading ? (
        <Loading label="Đang tìm sản phẩm…" />
      ) : (
        data?.products.map((p: Row) => (
          <article className="cs-product-option" key={p.id}>
            <strong>{p.name}</strong>
            <small>
              {p.sku} · {p.size_label} · {p.color_label}
            </small>
            <div className="cs-product-images">
              {data.images
                .filter((im: Row) => im.product_id === p.id)
                .map((im: Row) => (
                  <button
                    disabled={busy}
                    className="secondary"
                    key={im.id}
                    onClick={() => choose(p, im.id)}
                    title="Chọn sản phẩm với ảnh này"
                  >
                    <ProductImage id={im.id} />
                  </button>
                ))}
            </div>
            <button disabled={busy} onClick={() => choose(p)}>
              Chọn sản phẩm
            </button>
          </article>
        ))
      )}
      {busy && <Loading label="Đang chèn sản phẩm và sao chép ảnh…" />}
      <div className="cs-pagination">
        <button
          disabled={page === 1 || loading || busy}
          onClick={() => setPage((x) => x - 1)}
        >
          ← Trước
        </button>
        <span>Trang {page}</span>
        <button
          disabled={loading || busy || !data || page * 12 >= data.total}
          onClick={() => setPage((x) => x + 1)}
        >
          Sau →
        </button>
      </div>
    </Modal>
  );
}
function AssetPicker({
  documentId,
  close,
  choose,
}: {
  documentId: string;
  close: () => void;
  choose: (id: string) => void;
}) {
  const [assets, setAssets] = useState<Row[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [page, setPage] = useState(1);
  useEffect(() => {
    let active = true;
    api(`/studio/${documentId}/assets`)
      .then((d) => {
        if (active) setAssets(d);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [documentId]);
  async function upload(file: File) {
    setBusy(true);
    setError("");
    try {
      const id = await uploadStudioImage(documentId, file, file.name);
      choose(id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Ảnh catalogue · thư viện riêng"
      close={() => {
        if (!busy) close();
      }}
    >
      <ErrorBox error={error} />
      <Field label="Upload ảnh riêng (PNG, JPEG, WebP)">
        <input
          disabled={busy}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = "";
          }}
        />
      </Field>
      <p className="muted">
        Ảnh được nén trước khi lưu. Tối đa 120 ảnh/catalogue; ảnh đã tải có thể
        dùng lại nhiều lần.
      </p>
      {busy && <Loading label="Đang nén và tải ảnh…" />}
      <div className="cs-assets">
        {assets.slice((page - 1) * 12, page * 12).map((a) => (
          <button
            className="secondary"
            disabled={busy}
            key={a.id}
            onClick={() => choose(a.id)}
          >
            <Photo documentId={documentId} id={a.id} />
            <small>{a.caption || "Ảnh catalogue"}</small>
          </button>
        ))}
      </div>
      <div className="cs-pagination">
        <button disabled={page === 1} onClick={() => setPage((x) => x - 1)}>
          ← Trước
        </button>
        <span>{assets.length} ảnh</span>
        <button
          disabled={page * 12 >= assets.length}
          onClick={() => setPage((x) => x + 1)}
        >
          Sau →
        </button>
      </div>
    </Modal>
  );
}
