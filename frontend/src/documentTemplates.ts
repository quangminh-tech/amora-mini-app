import { Row, parse, date } from "./api";
export const documentVariables = [
  "customer_name",
  "company_name",
  "seller_name",
  "quote_code",
  "quote_date",
  "valid_until",
];
export function renderDocument(snapshot: unknown, record: Row) {
  const s = parse((snapshot as any) || {}) || {},
    t = s.template || {},
    customer = parse(record.customer_snapshot || {}) || {},
    seller = parse(record.seller_snapshot || {}) || {};
  const variables = {
    ...(s.values || {}),
    customer_name: customer.name || "",
    company_name: customer.company || "",
    seller_name: seller.name || "AMORA STUDIO",
    quote_code: record.code || "",
    quote_date: record.created_at ? date(record.created_at) : "",
    valid_until: record.valid_until ? date(record.valid_until) : "",
  };
  const render = (text: string) =>
    String(text || "").replace(
      /\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/g,
      (_, key: string) => variables[key] ?? "",
    );
  return {
    title: render(t.title) || "BẢNG BÁO GIÁ SẢN PHẨM",
    intro: render(t.intro),
    termsTitle: render(t.termsTitle) || "Điều kiện báo giá",
    terms: render(t.terms),
  };
}
