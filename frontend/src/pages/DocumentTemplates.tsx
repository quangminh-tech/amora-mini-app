import React, { useEffect, useState } from "react";
import { Common } from "../types";
import { api, Row, downloadBlob } from "../api";
import { Field, ErrorBox, Loading, useLoad } from "../components/UI";
import { documentVariables, renderDocument } from "../documentTemplates";
export function DocumentTemplates({ revision, refresh, tell }: Common) {
  const {
    data,
    error: loadError,
    loading,
  } = useLoad<Row>("/document-templates", revision);
  const [draft, setDraft] = useState<Row[] | null>(null),
    [index, setIndex] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (data) {
      setDraft(data.templates);
      setIndex(0);
    }
  }, [data]);
  if (loading) return <Loading />;
  if (!draft) return <ErrorBox error={loadError} />;
  const t = draft[index];
  const update = (key: string, value: any) =>
    setDraft(draft.map((x, i) => (i === index ? { ...x, [key]: value } : x)));
  async function save() {
    setBusy(true);
    setError("");
    try {
      await api("/document-templates", "PUT", {
        version: data!.version,
        templates: draft,
      });
      refresh();
      tell("Đã lưu mẫu chứng từ chung. Báo giá đã tạo giữ mẫu cũ.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function readFile(file: File) {
    setError("");
    try {
      if (file.size > 512000) throw new Error("File mẫu tối đa 500 KB.");
      const value = JSON.parse(await file.text());
      if (
        value.format !== "amora-document-templates-v1" ||
        !Array.isArray(value.templates) ||
        value.templates.length < 1 ||
        value.templates.length > 12
      )
        throw new Error("Dùng file JSON xuất từ mục Mẫu chứng từ.");
      for (const item of value.templates) {
        if (
          !item ||
          typeof item.id !== "string" ||
          typeof item.name !== "string" ||
          typeof item.title !== "string" ||
          typeof item.intro !== "string" ||
          typeof item.terms !== "string" ||
          typeof item.termsTitle !== "string" ||
          !Array.isArray(item.fields) ||
          item.fields.length > 16 ||
          item.fields.some(
            (f: Row) =>
              !f ||
              typeof f.key !== "string" ||
              typeof f.label !== "string" ||
              typeof f.defaultValue !== "string",
          )
        )
          throw new Error("Cấu trúc mẫu không hợp lệ.");
      }
      setDraft(value.templates);
      setIndex(0);
      tell("Đã nạp bản xem trước; bấm Lưu mẫu chung để áp dụng.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const rendered = renderDocument(
    {
      template: t,
      values: Object.fromEntries(
        t.fields.map((f: Row) => [f.key, f.defaultValue]),
      ),
    },
    {
      code: "BG-XEM-TRUOC",
      created_at: "2026-10-18",
      valid_until: "2026-10-25",
      customer_snapshot: { name: "Tên khách hàng", company: "Đơn vị nhận" },
      seller_snapshot: { name: "AMORA STUDIO" },
    },
  );
  return (
    <>
      <p className="notice">
        Mẫu chung gồm tiêu đề, lời mở đầu, điều kiện và biến nhập. Import/export
        JSON để sửa và dùng lại; PDF tham khảo không được chuyển tự động thành
        mẫu hay bảng giá.
      </p>
      <ErrorBox error={error || loadError} />
      <div className="toolbar">
        <select
          value={index}
          onChange={(e) => setIndex(Number(e.target.value))}
        >
          {draft.map((x, i) => (
            <option key={i} value={i}>
              {x.name}
            </option>
          ))}
        </select>
        <button
          className="secondary"
          disabled={draft.length >= 12 || busy}
          onClick={() => {
            const id = "custom_" + Date.now();
            setDraft([
              ...draft,
              {
                ...t,
                id,
                name: "Mẫu mới",
                fields: t.fields.map((f: Row) => ({ ...f })),
              },
            ]);
            setIndex(draft.length);
          }}
        >
          + Nhân bản mẫu
        </button>
        <button
          className="secondary"
          onClick={() =>
            downloadBlob(
              new Blob(
                [
                  JSON.stringify(
                    { format: "amora-document-templates-v1", templates: draft },
                    null,
                    2,
                  ),
                ],
                { type: "application/json" },
              ),
              "amora-mau-chung-tu.json",
            )
          }
        >
          Xuất mẫu JSON
        </button>
        <Field label="Import mẫu JSON">
          <input
            type="file"
            accept=".json,application/json"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void readFile(f);
              e.target.value = "";
            }}
          />
        </Field>
      </div>
      <fieldset disabled={busy} style={{ border: 0, padding: 0, minWidth: 0 }}>
        <div className="form-grid">
          {[
            ["id", "Mã mẫu"],
            ["name", "Tên mẫu"],
            ["title", "Tiêu đề chứng từ"],
            ["termsTitle", "Tiêu đề điều kiện"],
          ].map(([k, label]) => (
            <Field key={k} label={label}>
              <input
                value={t[k]}
                maxLength={k === "id" ? 40 : 180}
                onChange={(e) => update(k, e.target.value)}
              />
            </Field>
          ))}
          <Field label="Hiệu lực mặc định (ngày)">
            <input
              type="number"
              min={1}
              max={365}
              value={t.validDays}
              onChange={(e) => update("validDays", Number(e.target.value))}
            />
          </Field>
        </div>
        <Field label="Lời mở đầu">
          <textarea
            maxLength={3000}
            rows={4}
            value={t.intro}
            onChange={(e) => update("intro", e.target.value)}
          />
        </Field>
        <Field label="Điều kiện / ghi chú mặc định">
          <textarea
            maxLength={5000}
            rows={5}
            value={t.terms}
            onChange={(e) => update("terms", e.target.value)}
          />
        </Field>
        <p className="muted">
          Biến tự điền:{" "}
          {documentVariables.map((key) => "{{" + key + "}}").join(", ")}. Các
          biến bên dưới sẽ cho nhập khi tạo báo giá.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Mã biến</th>
                <th>Nhãn nhập</th>
                <th>Giá trị mặc định</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {t.fields.map((f: Row, i: number) => (
                <tr key={i}>
                  {["key", "label", "defaultValue"].map((k) => (
                    <td key={k}>
                      <input
                        aria-label={k + " " + (i + 1)}
                        maxLength={k === "defaultValue" ? 1000 : 100}
                        value={f[k]}
                        onChange={(e) =>
                          update(
                            "fields",
                            t.fields.map((x: Row, j: number) =>
                              j === i ? { ...x, [k]: e.target.value } : x,
                            ),
                          )
                        }
                      />
                    </td>
                  ))}
                  <td>
                    <button
                      className="ghost danger"
                      onClick={() =>
                        update(
                          "fields",
                          t.fields.filter((_: Row, j: number) => j !== i),
                        )
                      }
                    >
                      Bỏ
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          className="secondary"
          disabled={t.fields.length >= 16}
          onClick={() =>
            update("fields", [
              ...t.fields,
              {
                key: "bien_" + (t.fields.length + 1),
                label: "Biến mới",
                defaultValue: "",
              },
            ])
          }
        >
          + Biến nhập
        </button>
        <h3>Xem trước phần văn bản</h3>
        <div className="document-preview">
          <strong>{rendered.title}</strong>
          <p>{rendered.intro}</p>
          <p>[Bảng sản phẩm và giá lấy từ báo giá thực tế]</p>
          <strong>{rendered.termsTitle}</strong>
          <p>{rendered.terms}</p>
        </div>
        <div className="form-actions">
          <button
            className="ghost danger"
            disabled={draft.length === 1}
            onClick={() => {
              setDraft(draft.filter((_, i) => i !== index));
              setIndex(0);
            }}
          >
            Xóa mẫu này
          </button>
          <button className="primary" onClick={() => void save()}>
            {busy ? "Đang lưu…" : "Lưu mẫu chung"}
          </button>
        </div>
      </fieldset>
    </>
  );
}
