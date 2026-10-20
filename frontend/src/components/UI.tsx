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

export function Icon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    dashboard: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
    catalogue: "M3 4h7l2 2 2-2h7v16h-7l-2 2-2-2H3zM12 6v16",
    products: "M4 7l8-4 8 4v10l-8 4-8-4zM4 7l8 4 8-4M12 11v10",
    prices: "M3 3h8l10 10-8 8L3 11zM7 7h.01",
    orders: "M6 3h12v18H6zM9 7h6M9 11h6M9 15h4",
    quotes: "M5 3h10l4 4v14H5zM14 3v5h5M8 12h8M8 16h6",
    customers:
      "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M17 4a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-4",
    commissions: "M3 6h18v13H3zM3 10h18M16 15h2",
    users:
      "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M17 8h5M19.5 5.5v5",
    directories: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
    settings:
      "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2",
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] || paths.orders} />
    </svg>
  );
}

export function Badge({ value }: { value: string }) {
  return <span className={"badge " + value}>{labels[value] || value}</span>;
}

export function Empty({ text = "Chưa có dữ liệu." }: { text?: string }) {
  return (
    <div className="empty">
      <Icon name="products" />
      <p>{text}</p>
    </div>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  const overlay = React.useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const dialogs = document.querySelectorAll(".overlay");
      if (
        e.key === "Escape" &&
        dialogs[dialogs.length - 1] === overlay.current
      ) {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [close]);
  return (
    <div
      ref={overlay}
      className="overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <h2>{title}</h2>
          <button
            type="button"
            className="ghost"
            onClick={close}
            aria-label="Đóng"
          >
            ×
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

export function ErrorBox({ error }: { error: string }) {
  return error ? (
    <div role="alert" className="error">
      {error}
    </div>
  ) : null;
}

export function ProductImage({ id }: { id?: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let active = true;
    let src = "";
    if (id)
      request("/images/" + id)
        .then((r) => r!.blob())
        .then((b) => {
          src = URL.createObjectURL(b);
          if (active) setUrl(src);
          else URL.revokeObjectURL(src);
        })
        .catch(() => {});
    return () => {
      active = false;
      if (src) URL.revokeObjectURL(src);
    };
  }, [id]);
  return url ? (
    <img src={url} alt="Ảnh sản phẩm AMORA" />
  ) : (
    <div className="image-placeholder">
      <Icon name="products" />
      <span>Chưa có ảnh sản phẩm</span>
    </div>
  );
}

export function Loading({ label = "Đang tải dữ liệu…" }: { label?: string }) {
  return (
    <div className="loading-state" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      {label}
    </div>
  );
}
export function useLoad<T>(path: string | null, revision = 0) {
  const [state, setState] = useState<{
    key: string;
    data: T | null;
    error: string;
    loading: boolean;
  }>({ key: "", data: null, error: "", loading: true });
  const key = path + "|" + revision;
  useEffect(() => {
    let current = true;
    const controller = new AbortController();
    if (!path) return;
    setState({ key, data: null, error: "", loading: true });
    api(path, "GET", undefined, { signal: controller.signal })
      .then((data) => {
        if (current) setState({ key, data, error: "", loading: false });
      })
      .catch((e) => {
        if (current)
          setState({ key, data: null, error: e.message, loading: false });
      });
    return () => {
      current = false;
      controller.abort();
    };
  }, [path, revision]);
  return !path
    ? { data: null, error: "", loading: false }
    : state.key === key
      ? state
      : { data: null, error: "", loading: true };
}

export function useDebounced(value: string, delay = 250) {
  const [result, setResult] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setResult(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return result;
}
export function Pagination({
  data,
  page,
  setPage,
  loading = false,
}: {
  data: Row | null;
  page: number;
  setPage: (p: number) => void;
  loading?: boolean;
}) {
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  return (
    <div className="pagination" aria-busy={loading}>
      <span>
        {loading
          ? "Đang tải trang " + page + "…"
          : data?.total
            ? `${(page - 1) * data.pageSize + 1}–${Math.min(page * data.pageSize, data.total)} / ${data.total}`
            : "0 kết quả"}
      </span>
      <div>
        <button
          className="secondary"
          disabled={loading || !data || page <= 1}
          onClick={() => setPage(page - 1)}
        >
          ← Trước
        </button>
        <span>
          Trang {page} / {data ? pages : "…"}
        </span>
        <button
          className="secondary"
          disabled={loading || !data || page >= pages}
          onClick={() => setPage(page + 1)}
        >
          Sau →
        </button>
      </div>
    </div>
  );
}
