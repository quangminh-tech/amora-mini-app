import React, { useEffect, useState } from "react";
import { Common } from "../types";
import { api, request, Row } from "../api";
import { compressCatalogueImage } from "../catalogueStudio";
import { ErrorBox, Loading } from "../components/UI";
import { LayerIllustration, noteLayers } from "../components/ScentNotes";
import "../scentNotes.css";
function NotePhoto({
  id,
  layer,
  hasImage,
  revision,
}: {
  id: string;
  layer: string;
  hasImage: boolean;
  revision: number;
}) {
  const [url, setUrl] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true,
      src = "";
    const controller = new AbortController();
    setUrl("");
    setError("");
    if (hasImage)
      request(`/scent-learning/${id}/images/${layer}`, {
        signal: controller.signal,
      })
        .then((r) => r!.blob())
        .then((blob) => {
          if (active) {
            src = URL.createObjectURL(blob);
            setUrl(src);
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
      controller.abort();
      if (src) URL.revokeObjectURL(src);
    };
  }, [id, layer, hasImage, revision]);
  return (
    <div className="sn-note-photo">
      {url ? (
        <img src={url} alt="Ảnh minh họa tầng hương do AMORA cung cấp" />
      ) : (
        <>
          <LayerIllustration layer={layer} />
          <small>
            {error ||
              (hasImage
                ? "Đang tải ảnh…"
                : "Sơ đồ minh họa · chưa có ảnh nguyên liệu")}
          </small>
        </>
      )}
    </div>
  );
}
export function ScentLearning({ user, tell, launch }: Common) {
  const [scents, setScents] = useState<Row[]>([]),
    [selected, setSelected] = useState(""),
    [search, setSearch] = useState(""),
    [revision, setRevision] = useState(0),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setError("");
    setLoading(true);
    api("/scent-learning")
      .then((d) => {
        if (active) {
          setScents(d);
          setSelected((id) => id || d[0]?.id || "");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [revision]);
  const list = scents.filter((s) =>
    (
      s.name +
      " " +
      s.meaning +
      " " +
      s.top_notes +
      " " +
      s.middle_notes +
      " " +
      s.base_notes
    )
      .toLocaleLowerCase("vi")
      .includes(search.toLocaleLowerCase("vi")),
  );
  const current = scents.find((s) => s.id === selected),
    manager = user.role === "manager";
  async function upload(layer: string, file: File) {
    if (!current) return;
    setBusy(true);
    setError("");
    try {
      const jpeg = await compressCatalogueImage(file);
      const form = new FormData();
      form.append("file", jpeg, "note.jpg");
      await request(`/scent-learning/${current.id}/images/${layer}`, {
        method: "POST",
        body: form,
      });
      setRevision((x) => x + 1);
      tell("Đã cập nhật ảnh minh họa tầng hương.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="sn-learning">
      <ErrorBox error={error} />
      <header className="sn-welcome">
        <p className="sn-kicker">AMORA · HIỂU ĐỂ TƯ VẤN</p>
        <h2>Đọc mùi hương bằng ba tầng.</h2>
        <p>
          Hương đầu là ấn tượng mở đầu. Hương giữa diễn tả nét chính. Hương cuối
          là phần nền và dư âm của tổng thể.
        </p>
        <p className="muted">
          Đây là cách đọc mô tả mùi, không phải công thức nguyên liệu hay lịch
          tỏa hương theo phút khi đốt nến.
        </p>
      </header>
      <input
        aria-label="Tìm mùi hương"
        placeholder="Tìm tên mùi hoặc nốt hương…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {loading ? (
        <Loading label="Đang tải thư viện mùi hương…" />
      ) : (
        <div className="sn-layout">
          <nav aria-label="Danh sách mùi hương">
            {list.map((s) => (
              <button
                disabled={busy}
                className={s.id === selected ? "active" : ""}
                key={s.id}
                onClick={() => setSelected(s.id)}
              >
                {s.name}
                {!s.active && <small> · Đã ẩn</small>}
              </button>
            ))}
            {!list.length && <p>Không tìm thấy mùi phù hợp.</p>}
          </nav>
          {current ? (
            <section className="sn-detail">
              <h2>{current.name}</h2>
              {current.meaning && <p>{current.meaning}</p>}
              <div className="sn-note-grid">
                {noteLayers.map((layer) => (
                  <article key={layer.key}>
                    <NotePhoto
                      id={current.id}
                      layer={layer.key}
                      hasImage={!!current["has_" + layer.key + "_image"]}
                      revision={revision}
                    />
                    <small>{layer.english}</small>
                    <h3>{layer.label}</h3>
                    <p className="sn-layer-description">{layer.description}</p>
                    <p>
                      {current[layer.field] ||
                        "Chưa có dữ liệu. Nhờ quản lý xác nhận trước khi tư vấn."}
                    </p>
                    {manager && (
                      <label className="sn-upload">
                        Thêm / thay ảnh minh họa
                        <input
                          disabled={busy}
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) void upload(layer.key, f);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    )}
                  </article>
                ))}
              </div>
              <div className="sn-advice">
                <h3>Cách nói với khách</h3>
                <p>
                  “{current.name} được mô tả qua các nốt hương dưới đây. Bạn
                  thích phần hương nào nổi bật hơn?”
                </p>
                <p>
                  Dùng đúng mô tả shop cung cấp; hỏi sở thích của khách và gợi ý
                  trải nghiệm mùi thực tế. Không cam kết tác dụng y khoa hay
                  hiệu quả tập trung.
                </p>
                {current.ritual && (
                  <p>Gợi ý / thông tin AMORA: {current.ritual}</p>
                )}
              </div>
              {manager && (
                <p>
                  <button
                    className="secondary"
                    onClick={() => launch?.("directories")}
                  >
                    Chỉnh mô tả tại Danh mục dùng chung → Mùi hương
                  </button>
                  <small className="muted block">
                    Ảnh là minh họa cảm giác mùi, không chứng minh thành phần
                    hay tỷ lệ nguyên liệu. Chọn ảnh đúng nội dung đã xác nhận.
                  </small>
                </p>
              )}
            </section>
          ) : (
            <p>Chưa có mùi hương. Quản lý thêm tại Danh mục dùng chung.</p>
          )}
        </div>
      )}
      {busy && <Loading label="Đang nén và tải ảnh minh họa…" />}
    </div>
  );
}
