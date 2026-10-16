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
} from "./api";
import { Login, PasswordForm } from "./components/Auth";
import { Icon, Modal } from "./components/UI";
import { Dashboard } from "./pages/Dashboard";
import { Products, Prices } from "./pages/Catalogue";
import { Customers } from "./pages/Customers";
import { SalesPage } from "./pages/Sales";
import { Commissions, Users } from "./pages/Team";
import { Settings } from "./pages/Settings";
const routes = [
  ["dashboard", "Tổng quan"],
  ["products", "Sản phẩm"],
  ["prices", "Bảng giá"],
  ["orders", "Đơn hàng"],
  ["quotes", "Báo giá"],
  ["customers", "Khách hàng"],
  ["commissions", "Hoa hồng"],
  ["users", "Cộng tác viên"],
  ["settings", "Thiết lập"],
] as const;
export default function App() {
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(!!token()),
    [page, setPage] = useState("dashboard"),
    [menu, setMenu] = useState(false),
    [revision, setRevision] = useState(0),
    [toast, setToast] = useState(""),
    [account, setAccount] = useState(false);
  const refresh = () => setRevision((x) => x + 1);
  const tell = (s: string) => {
    setToast(s);
    setTimeout(() => setToast(""), 4500);
  };
  useEffect(() => {
    const logout = () => {
      setUser(null);
      setLoading(false);
    };
    window.addEventListener("amora-logout", logout);
    if (token())
      api("/auth/me")
        .then(setUser)
        .catch(() => sessionStorage.removeItem("amora-token"))
        .finally(() => setLoading(false));
    return () => window.removeEventListener("amora-logout", logout);
  }, []);
  const logout = async () => {
    try {
      await api("/auth/logout", "POST");
    } catch {
      /* Clear local access even if disconnected. */
    }
    sessionStorage.removeItem("amora-token");
    setUser(null);
    setPage("dashboard");
  };
  if (loading) return <div className="loading">Đang kết nối AMORA…</div>;
  if (!user)
    return (
      <Login
        done={(u) => {
          setUser(u);
          setPage("dashboard");
        }}
      />
    );
  if (user.mustChangePassword)
    return (
      <div className="login-shell">
        <div className="login-card">
          <div className="wordmark">AMORA</div>
          <h2>Thiết lập mật khẩu riêng</h2>
          <p>Đổi mật khẩu tạm để bắt đầu sử dụng.</p>
          <PasswordForm done={logout} />
        </div>
      </div>
    );
  const manager = user.role === "manager";
  const common = { user, revision, refresh, tell };
  return (
    <div className="app">
      <aside className={menu ? "sidebar open" : "sidebar"}>
        <div className="brand">
          <span className="wordmark">AMORA</span>
          <small>STUDIO · MINI</small>
        </div>
        <div className="nav-caption">KHÔNG GIAN KINH DOANH</div>
        <nav>
          {routes
            .filter(
              ([k]) => manager || !["users", "settings", "prices"].includes(k),
            )
            .map(([key, label]) => (
              <button
                key={key}
                className={page === key ? "active" : ""}
                onClick={() => {
                  setPage(key);
                  setMenu(false);
                }}
              >
                <Icon name={key} />
                {label}
                {key === "quotes" && <span className="nav-dot" />}
              </button>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="ritual">
            Simple Moments.
            <br />
            <i>Deep Calm.</i>
          </div>
          <button className="profile" onClick={() => setAccount(true)}>
            <span className="avatar">{user.name.slice(0, 1)}</span>
            <span>
              {user.name}
              <small>{labels[user.role]}</small>
            </span>
            <span>↗</span>
          </button>
        </div>
      </aside>
      {menu && <div className="scrim" onClick={() => setMenu(false)} />}
      <main>
        <header className="topbar">
          <button
            className="mobile-menu ghost"
            onClick={() => setMenu(!menu)}
            aria-label="Mở menu"
          >
            ☰
          </button>
          <span>
            AMORA Mini <span className="separator">/</span>{" "}
            {routes.find(([k]) => k === page)?.[1]}
          </span>
          <div className="top-right">
            <span className="status-dot" />
            Không gian nội bộ
            <button className="ghost" onClick={logout}>
              Đăng xuất
            </button>
          </div>
        </header>
        <div className="workspace">
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                {manager ? "QUẢN LÝ KINH DOANH" : "KHÔNG GIAN CỘNG TÁC VIÊN"}
              </p>
              <h1>{routes.find(([k]) => k === page)?.[1]}</h1>
              <p>
                {page === "dashboard"
                  ? `Chào ${user.name}. Cùng chăm chút những điều quan trọng hôm nay.`
                  : page === "products"
                    ? "Bốn mùi hương. Những khoảnh khắc có chủ đích."
                    : page === "orders"
                      ? "Theo dõi từng đơn hàng, từ lời hẹn đầu tiên đến khi hoàn tất."
                      : page === "commissions"
                        ? "Minh bạch từng đơn hàng, rõ ràng từng khoản chi."
                        : "Một không gian gọn gàng để làm việc mỗi ngày."}
              </p>
            </div>
            <span className="today">
              {new Date().toLocaleDateString("vi-VN", {
                weekday: "long",
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                timeZone: "Asia/Ho_Chi_Minh",
              })}
            </span>
          </div>
          {page === "dashboard" && <Dashboard {...common} navigate={setPage} />}
          {page === "products" && <Products {...common} />}
          {page === "prices" && manager && <Prices {...common} />}
          {page === "customers" && <Customers {...common} />}
          {(page === "orders" || page === "quotes") && (
            <SalesPage key={page} {...common} type={page} />
          )}
          {page === "commissions" && <Commissions {...common} />}
          {page === "users" && manager && <Users {...common} />}
          {page === "settings" && manager && <Settings {...common} />}
          <footer className="workspace-footer">
            AMORA STUDIO <span>Ít hơn, nhưng đúng hơn.</span>
          </footer>
        </div>
      </main>
      {toast && (
        <div className="toast" role="status">
          ✓ {toast}
        </div>
      )}
      {account && (
        <Modal title="Tài khoản của bạn" close={() => setAccount(false)}>
          <p>{user.email}</p>
          <PasswordForm done={logout} />
        </Modal>
      )}
    </div>
  );
}
