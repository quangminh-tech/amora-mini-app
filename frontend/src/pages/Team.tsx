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
  useLoad, Pagination, useDebounced,
} from "../components/UI";
import { TransferBar } from "../components/Transfer";
import { Common } from "../types";
export function Commissions({ user, revision, refresh, tell }: Common) {
  const [page,setPage]=useState(1),[search,setSearch]=useState(""),[status,setStatus]=useState("");
  const term=useDebounced(search);
  const {data:result,error}=useLoad<Row>(`/commissions?page=${page}&search=${encodeURIComponent(term)}&status=${status}`,revision);
  const rows:Row[] | undefined=result?.items;
  const {data:summary}=useLoad<Row>("/commissions/summary",revision);
  const [edit, setEdit] = useState<Row | null>(null),
    [err, setErr] = useState(""),
    [busy, setBusy] = useState(false);
  const manager = user.role === "manager";
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/commissions/" + edit!.id + "/status", "POST", {
        status: edit!.target,
        version: edit!.version,
        reference: edit!.reference,
      });
      setEdit(null);
      refresh();
      tell("Đã cập nhật hoa hồng.");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="notice">
        Hoa hồng tính trên tiền sản phẩm, không gồm vận chuyển. Chỉ ghi nhận khi
        đơn hoàn tất và đã thu đủ tiền; quản lý duyệt rồi xác nhận chi.
      </div>
      <div className="metrics compact">
        {[
          ["pending", "Chờ duyệt"],
          ["approved", "Đã duyệt · chờ chi"],
          ["paid", "Đã chi"],
        ].map(([key, label]) => (
          <div className="metric" key={key}>
            <div>{label}</div>
            <strong>
              {money(
                summary?.[key],
              )}
            </strong>
          </div>
        ))}
      </div>
      <div className="toolbar"><div className="search"><input aria-label="Tìm hoa hồng" placeholder="Tìm mã đơn, tên CTV…" value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}}/></div><select aria-label="Trạng thái hoa hồng" value={status} onChange={e=>{setStatus(e.target.value);setPage(1)}}><option value="">Tất cả trạng thái</option>{["pending","approved","paid","void"].map(x=><option key={x} value={x}>{x==="pending"?"Chờ duyệt":labels[x]}</option>)}</select></div>
      <ErrorBox error={error} />
      <section className="panel table-wrap">
        {rows?.length ? (
          <table>
            <thead>
              <tr>
                <th>Đơn hàng</th>
                {manager && <th>Cộng tác viên</th>}
                <th>Hoa hồng</th>
                <th>Trạng thái</th>
                <th>Tham chiếu chi</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="code">{r.order_code}</td>
                  {manager && <td>{r.ctv_name}</td>}
                  <td>{money(r.amount)}</td>
                  <td>
                    {r.status === "pending" ? (
                      <span className="badge pending">Chờ duyệt</span>
                    ) : (
                      <Badge value={r.status} />
                    )}
                  </td>
                  <td>{r.payment_reference || "—"}</td>
                  <td>
                    {manager && ["pending", "approved"].includes(r.status) && (
                      <button
                        className="secondary"
                        onClick={() => {
                          setErr("");
                          setEdit({
                            ...r,
                            target:
                              r.status === "pending" ? "approved" : "paid",
                            reference: "",
                          });
                        }}
                      >
                        {r.status === "pending"
                          ? "Duyệt hoa hồng"
                          : "Xác nhận đã chi"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty text="Hoa hồng sẽ xuất hiện khi đơn CTV hoàn tất và thu đủ tiền." />
        )}
      </section>
      <Pagination data={result} page={page} setPage={setPage}/>
      {edit && (
        <Modal
          title={
            edit.target === "approved"
              ? "Duyệt hoa hồng"
              : "Xác nhận đã chi hoa hồng"
          }
          close={() => setEdit(null)}
        >
          <form onSubmit={save}>
            <p>
              {edit.ctv_name} · {edit.order_code}
            </p>
            <h2>{money(edit.amount)}</h2>
            {edit.target === "paid" ? (
              <Field label="Mã chuyển khoản / nội dung chi">
                <input
                  required
                  maxLength={300}
                  value={edit.reference}
                  onChange={(e) =>
                    setEdit({ ...edit, reference: e.target.value })
                  }
                />
              </Field>
            ) : (
              <p>Kiểm tra đơn hàng và số tiền trước khi duyệt.</p>
            )}
            <ErrorBox error={err} />
            <div className="form-actions">
              <button className="primary" disabled={busy}>
                Xác nhận
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

export function Users({ user, revision, refresh, tell }: Common) {
  const [page,setPage]=useState(1),[search,setSearch]=useState(""),[status,setStatus]=useState(""),[role,setRole]=useState("");
  const term=useDebounced(search);
  const {data:result,error}=useLoad<Row>(`/admin/users?page=${page}&search=${encodeURIComponent(term)}&status=${status}&role=${role}`,revision);
  const rows:Row[] | undefined=result?.items;
  const {data:limits}=useLoad<Row>("/admin/account-limits",revision);
  const [limitForm,setLimitForm]=useState<Row | null>(null);
  async function saveLimits(e:FormEvent){e.preventDefault();setBusy(true);setErr("");try{await api("/admin/account-limits","PUT",{managers:Number(limitForm!.managers),ctvs:Number(limitForm!.ctvs),version:limitForm!.version});setLimitForm(null);refresh();tell("Đã lưu giới hạn tài khoản.")}catch(e){setErr((e as Error).message)}finally{setBusy(false)}}
  const [edit, setEdit] = useState<Row | null>(null),
    [err, setErr] = useState(""),
    [busy, setBusy] = useState(false);
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (edit!.reset)
        await api("/admin/users/" + edit!.id + "/reset-password", "POST", {
          password: edit!.password,
        });
      else
        await api(
          "/admin/users" + (edit!.id ? "/" + edit!.id : ""),
          edit!.id ? "PUT" : "POST",
          edit,
        );
      setEdit(null);
      refresh();
      tell("Đã lưu tài khoản.");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="toolbar">
        <p className="muted">
          {limits?.active_managers || 0}/{limits?.managers || "—"} quản lý · {limits?.active_ctvs || 0}/{limits?.ctvs || "—"} CTV đang hoạt động
        </p>
        <button
          className="primary"
          onClick={() => {
            setErr("");
            setEdit({
              name: "",
              email: "",
              role: "ctv",
              password: "",
              active: true,
            });
          }}
        >
          + Cấp tài khoản
        </button>
      </div>
      <div className="toolbar"><div className="search"><input aria-label="Tìm CTV" placeholder="Tên hoặc email CTV…" value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}}/></div><select aria-label="Lọc vai trò" value={role} onChange={e=>{setRole(e.target.value);setPage(1)}}><option value="">Mọi vai trò</option><option value="ctv">Cộng tác viên</option><option value="manager">Quản lý</option></select><select aria-label="Lọc tài khoản" value={status} onChange={e=>{setStatus(e.target.value);setPage(1)}}><option value="">Mọi trạng thái</option><option value="active">Đang hoạt động</option><option value="inactive">Đã khóa</option></select><button className="secondary" onClick={()=>{setErr("");setLimitForm({...limits})}} disabled={!limits}>Giới hạn tài khoản</button></div>
      <TransferBar kind="users" filters={{search:term,status,role}} refresh={refresh} tell={tell}/>
      <p className="notice">Mỗi CTV có tài khoản và dữ liệu riêng. Báo giá, đơn hàng và hoa hồng luôn gắn với người phụ trách trên chứng từ.</p>
      <ErrorBox error={error} />
      <section className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>Thành viên</th>
              <th>Vai trò</th>
              <th>Trạng thái</th>
              <th>Báo giá / Đơn</th><th>Tiền hàng hoàn tất</th><th>Hoa hồng chưa chi</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows?.map((r) => (
              <tr key={r.id}>
                <td>
                  <strong>{r.name}</strong>
                  <small className="block muted">{r.email}</small>
                </td>
                <td>{labels[r.role]}</td>
                <td>
                  <span
                    className={
                      "badge " + (r.active ? "completed" : "cancelled")
                    }
                  >
                    {r.active ? "Đang hoạt động" : "Đã khóa"}
                  </span>
                </td>
                <td>{r.quotes_count} / {r.orders_count}</td><td>{money(r.revenue)}</td><td>{money(r.outstanding)}</td>
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
                  {r.id !== user.id && (
                    <button
                      className="ghost"
                      onClick={() => {
                        setErr("");
                        setEdit({ ...r, reset: true, password: "" });
                      }}
                    >
                      Đặt lại mật khẩu
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <Pagination data={result} page={page} setPage={setPage}/>
      {limitForm && <Modal title="Giới hạn tài khoản hoạt động" close={()=>setLimitForm(null)}><form onSubmit={saveLimits}><p className="muted">Tài khoản đã khóa vẫn giữ lịch sử và không chiếm chỗ hoạt động.</p><div className="form-grid"><Field label="Số quản lý tối đa"><input type="number" required min={1} max={1000} value={limitForm.managers} onChange={e=>setLimitForm({...limitForm,managers:e.target.value})}/></Field><Field label="Số CTV tối đa"><input type="number" required min={1} max={10000} value={limitForm.ctvs} onChange={e=>setLimitForm({...limitForm,ctvs:e.target.value})}/></Field></div><ErrorBox error={err}/><div className="form-actions"><button className="primary" disabled={busy}>Lưu giới hạn</button></div></form></Modal>}
      {edit && (
        <Modal
          title={
            edit.reset
              ? "Đặt lại mật khẩu"
              : edit.id
                ? "Chỉnh sửa tài khoản"
                : "Cấp tài khoản"
          }
          close={() => setEdit(null)}
        >
          <form onSubmit={save}>
            {!edit.reset && (
              <>
                <Field label="Họ tên">
                  <input
                    required
                    maxLength={120}
                    value={edit.name}
                    onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                  />
                </Field>
                <Field label="Email">
                  <input
                    type="email"
                    required
                    maxLength={200}
                    value={edit.email}
                    onChange={(e) =>
                      setEdit({ ...edit, email: e.target.value })
                    }
                  />
                </Field>
                {!edit.id && (
                  <Field label="Vai trò">
                    <select
                      value={edit.role}
                      onChange={(e) =>
                        setEdit({ ...edit, role: e.target.value })
                      }
                    >
                      <option value="ctv">Cộng tác viên</option>
                      <option value="manager">Quản lý</option>
                    </select>
                  </Field>
                )}
                {edit.id && (
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={edit.active}
                      disabled={edit.id === user.id}
                      onChange={(e) =>
                        setEdit({ ...edit, active: e.target.checked })
                      }
                    />
                    Cho phép hoạt động
                  </label>
                )}
              </>
            )}
            {(!edit.id || edit.reset) && (
              <Field label="Mật khẩu tạm (tối thiểu 12 ký tự)">
                <input
                  type="password"
                  required
                  minLength={12}
                  maxLength={200}
                  autoComplete="new-password"
                  value={edit.password}
                  onChange={(e) =>
                    setEdit({ ...edit, password: e.target.value })
                  }
                />
              </Field>
            )}
            <p className="muted">
              Mật khẩu tạm phải được đổi khi đăng nhập. Khóa tài khoản hoặc đặt
              lại mật khẩu sẽ thu hồi các phiên đăng nhập.
            </p>
            <ErrorBox error={err} />
            <div className="form-actions">
              <button className="primary" disabled={busy}>
                Lưu tài khoản
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
