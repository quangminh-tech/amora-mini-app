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
} from "../components/UI";
import { Common } from "../types";
export function Customers({ revision, refresh, tell }: Common) {
  const { data: d, error } = useLoad<Row[]>("/customers", revision);
  const [search, setSearch] = useState(""),
    [edit, setEdit] = useState<Row | null>(null),
    [err, setErr] = useState(""),
    [busy, setBusy] = useState(false);
  const blank = { name: "", phone: "", email: "", company: "", address: "" };
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api(
        "/customers" + (edit!.id ? "/" + edit!.id : ""),
        edit!.id ? "PUT" : "POST",
        edit,
      );
      setEdit(null);
      refresh();
      tell("Đã lưu khách hàng.");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="toolbar">
        <div className="search">
          <span>⌕</span>
          <input
            aria-label="Tìm khách hàng"
            placeholder="Tên khách, số điện thoại, công ty…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button
          className="primary"
          onClick={() => {
            setErr("");
            setEdit(blank);
          }}
        >
          + Thêm khách hàng
        </button>
      </div>
      <ErrorBox error={error} />
      <section className="panel table-wrap">
        {d?.length ? (
          <table>
            <thead>
              <tr>
                <th>Khách hàng</th>
                <th>Điện thoại</th>
                <th>Email</th>
                <th>Công ty</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {d
                .filter((r) =>
                  (r.name + r.phone + r.company)
                    .toLowerCase()
                    .includes(search.toLowerCase()),
                )
                .map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.name}</strong>
                      <small className="muted block">{r.address}</small>
                    </td>
                    <td>{r.phone || "—"}</td>
                    <td>{r.email || "—"}</td>
                    <td>{r.company || "—"}</td>
                    <td>
                      <button
                        className="ghost"
                        onClick={() => {
                          setErr("");
                          setEdit({ ...r });
                        }}
                      >
                        Sửa
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        ) : (
          <Empty text="Thêm khách hàng trước khi tạo đơn hoặc báo giá." />
        )}
      </section>
      {edit && (
        <Modal
          title={edit.id ? "Chỉnh sửa khách hàng" : "Thêm khách hàng"}
          close={() => setEdit(null)}
        >
          <form onSubmit={save}>
            <div className="form-grid">
              {[
                ["name", "Tên khách hàng", 180],
                ["phone", "Điện thoại", 40],
                ["email", "Email", 200],
                ["company", "Công ty", 300],
              ].map(([k, label, max]) => (
                <Field key={k} label={String(label)}>
                  <input
                    required={k === "name"}
                    type={k === "email" ? "email" : "text"}
                    maxLength={Number(max)}
                    value={edit[k]}
                    onChange={(e) => setEdit({ ...edit, [k]: e.target.value })}
                  />
                </Field>
              ))}
            </div>
            <Field label="Địa chỉ">
              <textarea
                rows={3}
                maxLength={1000}
                value={edit.address}
                onChange={(e) => setEdit({ ...edit, address: e.target.value })}
              />
            </Field>
            <ErrorBox error={err} />
            <div className="form-actions">
              <button className="primary" disabled={busy}>
                Lưu khách hàng
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
