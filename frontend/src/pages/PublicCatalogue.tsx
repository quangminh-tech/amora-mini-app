import React, { useEffect, useRef, useState } from "react";
import { publicCatalogueRequest } from "../api";
import { Content } from "../catalogueStudio";
import { StudioPreview, printStudio } from "../components/StudioPreview";
import "../studio.css";
import "../scentNotes.css";
export function PublicCatalogue({ slug }: { slug: string }) {
  const [content, setContent] = useState<Content | null>(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0),
    [printing, setPrinting] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setError("");
    setContent(null);
    const previous = document.title;
    const robots = document.createElement("meta");
    robots.name = "robots";
    robots.content = "noindex,nofollow,noarchive";
    document.head.append(robots);
    if (!/^[a-f0-9]{64}$/.test(slug)) {
      setError("Link catalogue không hợp lệ.");
      return () => {
        robots.remove();
      };
    }
    publicCatalogueRequest(slug, controller.signal)
      .then((r) => r.json())
      .then((d) => {
        if (active) {
          setContent(d.content);
          document.title = d.content.title + " · AMORA";
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
      controller.abort();
      robots.remove();
      document.title = previous;
      document.getElementById("cs-print-frame")?.remove();
    };
  }, [slug, retry]);
  return (
    <main className="cs-public-shell">
      <div className="cs-public-tools">
        <span>AMORA STUDIO · Catalogue</span>
        {content && (
          <button
            disabled={printing}
            onClick={async () => {
              setPrinting(true);
              try {
                await printStudio(ref.current!, content.title);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setPrinting(false);
              }
            }}
          >
            {printing ? "Đang chuẩn bị…" : "In / Lưu PDF"}
          </button>
        )}
      </div>
      {error && (
        <div className="cs-public-message" role="alert">
          <p>{error}</p>
          <button onClick={() => setRetry((x) => x + 1)}>Thử lại</button>
        </div>
      )}
      {!content && !error && (
        <p className="cs-public-message" role="status">
          Đang mở catalogue AMORA…
        </p>
      )}
      {content && (
        <StudioPreview
          documentId=""
          publicSlug={slug}
          content={content}
          printRef={ref}
        />
      )}
    </main>
  );
}
