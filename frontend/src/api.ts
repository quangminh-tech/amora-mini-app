export type User = {
  id: string;
  name: string;
  email: string;
  role: "manager" | "ctv";
  mustChangePassword: boolean;
};
export type Row = Record<string, any>;
const base = (import.meta as any).env.VITE_API_URL?.replace(/\/$/, "") || "";
export const token = () => sessionStorage.getItem("amora-token");
export async function request(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  if (token()) headers.set("Authorization", "Bearer " + token());
  if (options.body && !(options.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);
  try {
    const res = await fetch(base + "/api" + path, {
      ...options,
      headers,
      signal: controller.signal,
    });
    if (res.status === 401) {
      sessionStorage.removeItem("amora-token");
      window.dispatchEvent(new Event("amora-logout"));
    }
    if (!res.ok) {
      let message = "Không thể xử lý yêu cầu (" + res.status + ").";
      try {
        message = (await res.json()).message || message;
      } catch {
        /* Render may return an HTML cold-start response. */
      }
      throw new Error(message);
    }
    if (res.status === 204) return null;
    return res;
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError")
      throw new Error(
        "Máy chủ đang khởi động hoặc kết nối chậm. Vui lòng thử lại.",
      );
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}
export const api = async (path: string, method = "GET", data?: unknown) => {
  const r = await request(path, {
    method,
    ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
  });
  return r ? r.json() : null;
};
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const money = (n: unknown) =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);
export const date = (n: string) =>
  new Date(n).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
export const labels: Record<string, string> = {
  pending: "Chờ xác nhận",
  confirmed: "Đã xác nhận",
  shipping: "Đang giao",
  completed: "Hoàn tất",
  cancelled: "Đã hủy",
  returned: "Đã trả hàng",
  draft: "Bản nháp",
  sent: "Đã gửi",
  accepted: "Đã chấp nhận",
  rejected: "Đã từ chối",
  approved: "Đã duyệt",
  paid: "Đã chi",
  void: "Không đủ điều kiện",
  retail: "Bán lẻ",
  wholesale: "Bán sỉ",
  b2b: "Doanh nghiệp",
  manager: "Quản lý",
  ctv: "Cộng tác viên",
};
export const parse = (v: any) => (typeof v === "string" ? JSON.parse(v) : v);
