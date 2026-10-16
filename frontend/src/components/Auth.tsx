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
import { Field, ErrorBox } from "./UI";
export function Login({ done }: { done: (u: User) => void }) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await api("/auth/login", "POST", { email, password });
      sessionStorage.setItem("amora-token", r.token);
      done(r.user);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-shell">
      <div className="login-story">
        <span className="wordmark">AMORA</span>
        <p className="eyebrow">STUDIO · KHÔNG GIAN NỘI BỘ</p>
        <h1>
          Một khoảng yên.
          <br />
          <i>Để làm việc tốt hơn.</i>
        </h1>
        <p>
          Quản lý đơn hàng, chăm sóc khách hàng
          <br />
          và đồng hành cùng cộng tác viên.
        </p>
        <span>Simple Moments. Deep Calm.</span>
      </div>
      <form onSubmit={submit} className="login-card">
        <p className="eyebrow">AMORA MINI</p>
        <h2>Chào mừng trở lại</h2>
        <p>Đăng nhập để bắt đầu ngày làm việc.</p>
        <Field label="Email">
          <input
            autoFocus
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Mật khẩu">
          <input
            type="password"
            required
            maxLength={200}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <ErrorBox error={error} />
        <button disabled={busy} className="primary full">
          {busy ? "Đang kết nối, vui lòng chờ…" : "Đăng nhập →"}
        </button>
        <small className="muted">
          Tài khoản do quản lý AMORA cấp. Nếu quên mật khẩu, liên hệ quản lý để
          đặt lại.
        </small>
      </form>
    </div>
  );
}

export function PasswordForm({ done }: { done: () => void }) {
  const [old, setOld] = useState(""),
    [next, setNext] = useState(""),
    [confirm, setConfirm] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (next !== confirm) {
      setError("Mật khẩu xác nhận chưa khớp.");
      return;
    }
    setBusy(true);
    try {
      await api("/auth/password", "POST", {
        currentPassword: old,
        newPassword: next,
      });
      done();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit}>
      <Field label="Mật khẩu hiện tại">
        <input
          type="password"
          autoComplete="current-password"
          required
          maxLength={200}
          value={old}
          onChange={(e) => setOld(e.target.value)}
        />
      </Field>
      <Field label="Mật khẩu mới (tối thiểu 12 ký tự)">
        <input
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          maxLength={200}
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
      </Field>
      <Field label="Nhập lại mật khẩu mới">
        <input
          type="password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </Field>
      <ErrorBox error={error} />
      <button className="primary" disabled={busy}>
        Đổi mật khẩu và đăng nhập lại
      </button>
    </form>
  );
}
