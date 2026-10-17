import { loadEnv } from "vite";
export function apiOrigin(value, required = false) {
  const raw = (value || "").trim();
  if (!raw) {
    if (required)
      throw new Error(
        "Cloudflare Pages cần VITE_API_URL=https://TEN-BACKEND.onrender.com.",
      );
    return "";
  }
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("VITE_API_URL không phải URL hợp lệ.");
  }
  if (
    url.protocol !== "https:" ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password ||
    url.hostname.includes("*")
  )
    throw new Error(
      "VITE_API_URL phải là HTTPS origin, không thêm /api, đường dẫn hoặc mật khẩu.",
    );
  return url.origin;
}

export function configuredApiOrigin(required = false) {
  const env = loadEnv("production", process.cwd(), "VITE_");
  return apiOrigin(env.VITE_API_URL, required);
}
