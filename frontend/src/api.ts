export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export type User = {
  id: string;
  name: string;
  email: string;
  role: "manager" | "ctv";
  mustChangePassword: boolean;
};
export type Row = Record<string, any>;
const base =
  (import.meta as any).env.VITE_API_URL?.trim().replace(/\/$/, "") || "";
export const token = () => sessionStorage.getItem("amora-token");
export async function request(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  if (token()) headers.set("Authorization", "Bearer " + token());
  if (options.body && !(options.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) controller.abort();
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
      throw new ApiError(message, res.status);
    }
    if (res.status === 204) return null;
    return res;
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError")
      throw new Error(
        "Máy chủ đang khởi động hoặc kết nối chậm. Vui lòng thử lại.",
      );
    if (e instanceof TypeError)
      throw new ApiError(
        "Chưa kết nối được máy chủ. Máy chủ có thể đang khởi động; vui lòng thử lại.",
        0,
      );
    throw e;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abort);
  }
}
export const api = async (
  path: string,
  method = "GET",
  data?: unknown,
  options: RequestInit = {},
) => {
  const r = await request(path, {
    ...options,
    method,
    ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
  });
  if (!r) return null;
  if (!r.headers.get("Content-Type")?.includes("application/json"))
    throw new ApiError(
      "Máy chủ chưa trả dữ liệu hợp lệ. Vui lòng thử lại; nếu lỗi tiếp tục, báo quản lý kiểm tra cấu hình kết nối.",
      502,
    );
  return r.json();
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
