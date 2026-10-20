import { CatalogueStudio } from "./pages/CatalogueStudio";
import { CtvPrices } from "./pages/CtvPrices";
import { CtvPolicy } from "./components/CtvPolicy";
import { DocumentTemplates } from "./pages/DocumentTemplates";
import React, { useEffect, useState, FormEvent, ReactNode } from "react";
import {
  ApiError,
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
import { Directories } from "./pages/Directories";
import { Settings } from "./pages/Settings";
const routes = [
  ["dashboard", "Tổng quan"],
  ["users", "Cộng tác viên"],
  ["products", "Danh mục sản phẩm"],
  ["catalogue", "Catalogue"],
  ["prices", "Bảng giá"],
  ["quotes", "Báo giá"],
  ["orders", "Đơn hàng"],
  ["commissions", "Hoa hồng"],
  ["customers", "Khách hàng"],
  ["directories", "Danh mục dùng chung"],
  ["templates", "Mẫu chứng từ"],
  ["settings", "Thiết lập"],
] as const;
export default function App() {
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(!!token()),
    [page, setPage] = useState("dashboard"),
    [recordId, setRecordId] = useState<string | undefined>(undefined),
    [menu, setMenu] = useState(false),
    [revision, setRevision] = useState(0),
    [toast, setToast] = useState(""),
    [account, setAccount] = useState(false),
    [connectionError, setConnectionError] = useState(""),
    [reconnect, setReconnect] = useState(0);
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
    let active = true;
    if (token()) {
      setLoading(true);
      setConnectionError("");
      api("/auth/me")
        .then((u) => {
          if (active) setUser(u);
        })
        .catch((e) => {
          if (active && !(e instanceof ApiError && e.status === 401))
            setConnectionError(e.message);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }
    return () => {
      active = false;
      window.removeEventListener("amora-logout", logout);
    };
  }, [reconnect]);
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
  if (connectionError && token())
    return (
      <div className="login-shell">
        <section className="login-card">
          <div className="wordmark">AMORA</div>
          <h2>Đang chờ kết nối</h2>
          <p>{connectionError}</p>
          <p>Phiên của bạn vẫn được giữ. Hãy thử kết nối lại sau ít phút.</p>
          <button
            className="primary"
            onClick={() => setReconnect((n) => n + 1)}
          >
            Kết nối lại
          </button>
          <button
            className="ghost"
            onClick={() => {
              sessionStorage.removeItem("amora-token");
              setConnectionError("");
              setUser(null);
            }}
          >
            Về màn hình đăng nhập
          </button>
        </section>
      </div>
    );
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
  const launch = (page: string, id?: string) => {
    setRecordId(id);
    setPage(page);
    setMenu(false);
  };
  const common = { user, revision, refresh, tell, recordId, launch };
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
              ([k]) =>
                manager ||
                !["users", "settings", "directories", "templates"].includes(k),
            )
            .map(([key, label]) => (
              <button
                key={key}
                className={page === key ? "active" : ""}
                onClick={() => {
                  if (
                    page === "catalogue" &&
                    key !== "catalogue" &&
                    !window.dispatchEvent(
                      new Event("amora-studio-leave", { cancelable: true }),
                    )
                  )
                    return;
                  setRecordId(undefined);
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
      <main className={page === "dashboard" ? "dashboard-main" : ""}>
        <header className="topbar">
          <button
            className="mobile-menu ghost"
            onClick={() => setMenu(!menu)}
            aria-label="Mở menu"
          >
            ☰
          </button>
          <span>
            AMORA Studio <span className="separator">/</span>{" "}
            {routes.find(([k]) => k === page)?.[1]}
          </span>
          <div className="top-right">
            <span className="status-dot" />
            {!manager && <CtvPolicy revision={revision} />}
            Không gian nội bộ
            <button className="ghost" onClick={logout}>
              Đăng xuất
            </button>
          </div>
        </header>
        <div className="workspace">
          <div
            className={
              page === "dashboard"
                ? "page-heading dashboard-page-heading"
                : "page-heading"
            }
          >
            <div>
              <p className="eyebrow">
                {manager ? "QUẢN LÝ KINH DOANH" : "KHÔNG GIAN CỘNG TÁC VIÊN"}
              </p>
              <h1>{routes.find(([k]) => k === page)?.[1]}</h1>
              <p>
                {page === "dashboard"
                  ? `Chào ${user.name}. Cùng chăm chút những điều quan trọng hôm nay.`
                  : page === "products"
                    ? "Sản phẩm, mùi hương và mức giá để CTV tư vấn."
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
          {page === "catalogue" && <CatalogueStudio {...common} />}
          {page === "prices" &&
            (manager ? <Prices {...common} /> : <CtvPrices {...common} />)}
          {page === "customers" && <Customers {...common} />}
          {(page === "orders" || page === "quotes") && (
            <SalesPage key={page} {...common} type={page} />
          )}
          {page === "commissions" && <Commissions {...common} />}
          {page === "users" && manager && <Users {...common} />}
          {page === "templates" && manager && <DocumentTemplates {...common} />}
          {page === "settings" && manager && <Settings {...common} />}
          {page === "directories" && manager && <Directories {...common} />}
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
