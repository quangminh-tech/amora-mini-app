import { ScentNotes } from "./ScentNotes";
import "../scentNotes.css";
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { request, money, publicCatalogueRequest } from "../api";
import { Content, Section } from "../catalogueStudio";
import sheetCss from "../studio.css?raw";
import scentCss from "../scentNotes.css?raw";

export function Photo({
  documentId,
  publicSlug,
  id,
  fit = "contain",
  position = 50,
  horizontal = 50,
  onOpen,
}: {
  documentId: string;
  publicSlug?: string;
  id?: string | null;
  fit?: string;
  position?: number;
  horizontal?: number;
  onOpen?: (url: string) => void;
}) {
  const [url, setUrl] = useState(""),
    [error, setError] = useState(""),
    [decoded, setDecoded] = useState(false);
  useEffect(() => {
    setUrl("");
    setError("");
    setDecoded(false);
    if (!id) return;
    const controller = new AbortController();
    let objectUrl = "",
      active = true;
    (publicSlug
      ? publicCatalogueRequest(`${publicSlug}/images/${id}`, controller.signal)
      : request(`/studio/${documentId}/assets/${id}`, {
          signal: controller.signal,
        })
    )
      .then(async (res) => {
        const blob = await res!.blob();
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [documentId, id, publicSlug]);
  return (
    <div
      className="cs-photo"
      data-state={
        !id ? "empty" : error ? "error" : decoded ? "ready" : "loading"
      }
    >
      {url ? (
        <img
          src={url}
          alt="Ảnh catalogue"
          style={{
            objectFit: fit as "contain" | "cover",
            objectPosition: `${horizontal}% ${position}%`,
          }}
          onLoad={() => setDecoded(true)}
          onError={() => setError("Ảnh không đọc được")}
          onClick={() => onOpen?.(url)}
          tabIndex={onOpen ? 0 : undefined}
          onKeyDown={(e) => {
            if (onOpen && e.key === "Enter") onOpen(url);
          }}
        />
      ) : (
        <span>
          {!id
            ? "Chọn ảnh để hoàn thiện catalogue"
            : error
              ? "Không tải được ảnh"
              : "Đang tải ảnh…"}
        </span>
      )}
      {error && <small role="alert">{error}</small>}
    </div>
  );
}
export function StudioPreview({
  documentId,
  publicSlug,
  content,
  select,
  selected,
  onCover,
  printRef,
}: {
  documentId: string;
  publicSlug?: string;
  content: Content;
  select?: (id: string) => void;
  selected?: string;
  onCover?: () => void;
  printRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const [lightbox, setLightbox] = useState("");
  const localRef = useRef<HTMLDivElement>(null);
  const root = printRef || localRef;
  useEffect(() => {
    if (!lightbox) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox("");
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [lightbox]);
  function photos(s: Section) {
    return (
      <div
        className={
          "cs-photos cs-count-" +
          s.imageIds.length +
          (s.layout === "full"
            ? " cs-custom-grid cs-ratio-" + (s.imageRatio || "wide")
            : "")
        }
        style={
          s.layout === "full"
            ? ({
                "--cs-gallery-columns": s.galleryColumns ?? 1,
                "--cs-mobile-columns": Math.min(s.galleryColumns ?? 1, 2),
                "--cs-gallery-gap": `${s.imageGap ?? 12}px`,
                "--cs-gallery-radius": `${s.imageRadius ?? 0}px`,
                "--cs-photo-ratio": {
                  auto: "auto",
                  square: "1 / 1",
                  landscape: "4 / 3",
                  wide: "16 / 9",
                  portrait: "3 / 4",
                }[s.imageRatio || "wide"],
              } as React.CSSProperties)
            : undefined
        }
      >
        {s.imageIds.length ? (
          s.imageIds.map((id) => (
            <Photo
              key={id}
              documentId={documentId}
              publicSlug={publicSlug}
              id={id}
              fit={s.fit}
              position={s.imageCrops?.[id]?.y ?? s.position}
              horizontal={s.imageCrops?.[id]?.x ?? 50}
              onOpen={setLightbox}
            />
          ))
        ) : (
          <Photo documentId={documentId} publicSlug={publicSlug} />
        )}
      </div>
    );
  }
  return (
    <>
      <div
        ref={root}
        className={`cs-sheet cs-theme-${content.theme} ${content.motion ? "cs-motion" : ""}`}
      >
        <header className="cs-cover">
          {content.coverId && (
            <div className="cs-cover-photo">
              <Photo
                documentId={documentId}
                publicSlug={publicSlug}
                id={content.coverId}
                fit="cover"
                onOpen={setLightbox}
              />
            </div>
          )}
          <div className="cs-cover-copy">
            <img className="cs-logo" src="/brand/amora-logo.png" alt="AMORA" />
            <p className="cs-eyebrow">CATALOGUE · AMORA STUDIO</p>
            <h1>{content.title}</h1>
            <p>{content.subtitle}</p>
            {onCover && (
              <button className="cs-edit-only" onClick={onCover}>
                Đổi ảnh bìa
              </button>
            )}
          </div>
        </header>
        {content.intro && (
          <section className="cs-intro">{content.intro}</section>
        )}
        {content.sections.map((s, i) => (
          <section
            key={s.id}
            data-section={s.id}
            className={`cs-section cs-kind-${s.kind} cs-layout-${s.layout} ${s.pageBreak ? "cs-page-break" : ""} ${selected === s.id ? "cs-selected" : ""}`}
            style={{ animationDelay: `${Math.min(i, 6) * 60}ms` }}
          >
            {select && (
              <button
                className="cs-edit-only cs-select"
                onClick={() => select(s.id)}
              >
                Sửa mục {i + 1}
              </button>
            )}
            {(s.kind === "product" || s.kind === "gallery") && photos(s)}
            {(s.title ||
              s.description ||
              s.spec ||
              (s.kind === "product" && (s.sku || content.showPrices))) && (
              <div className="cs-copy">
                <p className="cs-eyebrow">
                  {s.kind === "product" ? s.sku : ""}
                </p>
                <h2>{s.title}</h2>
                {s.spec && <p className="cs-spec">{s.spec}</p>}
                <p className="cs-description">{s.description}</p>
                {s.kind === "product" && content.showPrices && (
                  <p className="cs-price">
                    {s.price ? money(s.price) : "Liên hệ báo giá"}
                  </p>
                )}
              </div>
            )}
            {s.kind === "product" && s.showNotes !== false && (
              <div className="cs-scent-block">
                <ScentNotes
                  name={s.scentName}
                  top={s.topNotes}
                  middle={s.middleNotes}
                  base={s.baseNotes}
                />
              </div>
            )}
            {s.kind === "table" && s.columns.length > 0 && (
              <div className="cs-table-scroll">
                <table>
                  <thead>
                    <tr>
                      {s.columns.map((x, j) => (
                        <th key={j}>{x}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {s.rows.map((cells, j) => (
                      <tr key={j}>
                        {cells.map((x, k) => (
                          <td key={k}>{x}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ))}
        {!content.sections.length && (
          <p className="cs-empty">
            Chọn sản phẩm hoặc thêm ảnh, nội dung để bắt đầu.
          </p>
        )}
        <footer className="cs-end">
          <h2>Cùng tạo một khoảng yên.</h2>
          <p>{content.note}</p>
          <p>{content.contact}</p>
        </footer>
      </div>
      {lightbox &&
        createPortal(
          <div
            className="cs-lightbox"
            role="dialog"
            aria-modal="true"
            aria-label="Xem ảnh lớn"
            onClick={() => setLightbox("")}
          >
            <button autoFocus onClick={() => setLightbox("")}>
              Đóng ×
            </button>
            <img src={lightbox} alt="Ảnh lớn" />
          </div>,
          document.body,
        )}
    </>
  );
}
export async function printStudio(
  root: HTMLDivElement,
  title: string,
): Promise<void> {
  const photos = Array.from(root.querySelectorAll<HTMLElement>(".cs-photo"));
  if (photos.some((p) => p.dataset.state === "loading"))
    throw new Error("Ảnh đang tải. Chờ tải xong rồi in.");
  if (photos.some((p) => p.dataset.state === "error"))
    throw new Error("Có ảnh tải lỗi. Tải lại catalogue trước khi in.");
  await Promise.all(
    Array.from(root.querySelectorAll("img")).map((img) => img.decode()),
  );
  const previous = document.getElementById("cs-print-frame");
  previous?.remove();
  const frame = document.createElement("iframe");
  frame.id = "cs-print-frame";
  frame.title = "In catalogue";
  frame.style.cssText =
    "position:fixed;left:-20000px;width:794px;height:1123px;border:0";
  const clone = root.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(".cs-edit-only").forEach((x) => x.remove());
  clone.classList.remove("cs-motion");
  const escaped = title.replace(
    /[&<>"']/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        ch
      ]!,
  );
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      frame.remove();
      reject(new Error("Bản in tải quá lâu. Thử lại."));
    }, 30000);
    frame.onload = () => {
      void (async () => {
        try {
          const doc = frame.contentDocument!;
          await doc.fonts.ready;
          await Promise.all(Array.from(doc.images).map((img) => img.decode()));
          clearTimeout(timer);
          frame.contentWindow!.focus();
          frame.contentWindow!.print();
          resolve();
        } catch {
          clearTimeout(timer);
          frame.remove();
          reject(new Error("Không tải đủ ảnh/phông cho bản in."));
        }
      })();
    };
    frame.srcdoc = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${escaped}</title><style>${sheetCss}\n${scentCss}</style></head><body>${clone.outerHTML}</body></html>`;
    document.body.append(frame);
  });
}
