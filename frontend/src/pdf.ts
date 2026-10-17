import { PDFDocument, rgb, PDFFont, PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { Row, money, date, parse, downloadBlob } from "./api";
export async function exportQuote(record: Row, lines: Row[]) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const response = await fetch("/fonts/DejaVuSans.ttf");
  if (!response.ok) throw new Error("Không tải được phông chữ PDF.");
  const font = await doc.embedFont(await response.arrayBuffer(), {
    subset: true,
  });
  const seller = parse(record.seller_snapshot);
  const customer = parse(record.customer_snapshot);
  let page!: PDFPage;
  let y = 0;
  let pageCount = 0;
  const width = 595.28,
    margin = 42,
    brown = rgb(0.28, 0.25, 0.2),
    muted = rgb(0.46, 0.45, 0.41);
  const text = (
    value: string,
    x: number,
    top: number,
    size = 10,
    color = brown,
  ) => page.drawText(value, { x, y: top, size, font, color });
  function newPage() {
    page = doc.addPage([width, 841.89]);
    pageCount++;
    y = 792;
    text(seller.name || "AMORA STUDIO", margin, y, 19);
    text(record.code, 420, y, 9, muted);
    y -= 24;
    text(seller.tagline || "Simple Moments. Deep Calm.", margin, y, 9, muted);
    y -= 30;
  }
  function ensure(height: number) {
    if (y - height < 65) newPage();
  }
  function wrap(
    value: string,
    maxWidth: number,
    size: number,
    f: PDFFont = font,
  ) {
    const result: string[] = [];
    for (const paragraph of String(value || "").split("\n")) {
      let line = "";
      for (const word of paragraph.split(/\s+/)) {
        const candidate = line ? line + " " + word : word;
        if (f.widthOfTextAtSize(candidate, size) > maxWidth && line) {
          result.push(line);
          line = "";
        }
        if (f.widthOfTextAtSize(word, size) > maxWidth) {
          for (const char of word) {
            if (f.widthOfTextAtSize(line + char, size) > maxWidth) {
              result.push(line);
              line = "";
            }
            line += char;
          }
        } else line = line ? line + " " + word : word;
      }
      result.push(line);
    }
    return result;
  }
  function block(value: string, size = 10, maxWidth = 510) {
    for (const line of wrap(value, maxWidth, size)) {
      ensure(16);
      text(line, margin, y, size);
      y -= 16;
    }
  }
  function right(value: string, end: number, top: number, maxWidth: number) {
    let size = 9;
    while (font.widthOfTextAtSize(value, size) > maxWidth && size > 6)
      size -= 0.25;
    text(value, end - font.widthOfTextAtSize(value, size), top, size);
  }
  function tableHead() {
    ensure(32);
    page.drawRectangle({
      x: margin,
      y: y - 23,
      width: 511,
      height: 25,
      color: rgb(0.93, 0.91, 0.86),
    });
    text("Sản phẩm / quy cách", margin + 8, y - 15, 9);
    text("SL", 300, y - 15, 9);
    text("Đơn giá", 348, y - 15, 9);
    text("Thành tiền", 454, y - 15, 9);
    y -= 36;
  }
  newPage();
  block("BÁO GIÁ SẢN PHẨM", 18);
  y -= 12;
  block("Kính gửi: " + customer.name);
  if (customer.company) block(customer.company);
  if (customer.phone) block("Điện thoại: " + customer.phone);
  if (customer.address) block("Địa chỉ: " + customer.address);
  block(
    "Ngày báo giá: " +
      date(record.created_at) +
      "     •     Hiệu lực đến: " +
      date(record.valid_until),
  );
  y -= 14;
  tableHead();
  for (const line of lines) {
    const names = wrap(
      line.product_name + "\n" + line.sku + " · " + line.unit + (line.lead_days_min!=null ? `\nChuẩn bị: ${line.lead_days_min}–${line.lead_days_max} ngày` : ""),
      240,
      9,
    );
    const h = Math.max(34, names.length * 14 + 10);
    if (y - h < 65) {
      newPage();
      tableHead();
    }
    names.forEach((name, i) => text(name, margin + 8, y - i * 14, 9));
    text(String(line.qty), 300, y, 9);
    right(money(line.unit_price), 438, y, 91);
    right(money(line.amount), 547, y, 99);
    y -= h;
    page.drawLine({
      start: { x: margin, y: y + 14 },
      end: { x: 553, y: y + 14 },
      thickness: 0.4,
      color: rgb(0.85, 0.83, 0.79),
    });
  }
  ensure(100);
  y -= 12;
  block("Tiền hàng: " + money(record.subtotal));
  block("Vận chuyển: " + money(record.shipping));
  block(
    "TỔNG BÁO GIÁ: " + money(Number(record.subtotal) + Number(record.shipping)),
    13,
  );
  y -= 16;
  if (record.note) {
    block("Ghi chú", 11);
    block(record.note);
    y -= 8;
  }
  block("Điều kiện báo giá", 11);
  block(record.terms);
  y -= 12;
  for (const field of [
    seller.address,
    seller.phone && "Điện thoại: " + seller.phone,
    seller.email,
    seller.taxCode && "MST: " + seller.taxCode,
    seller.bank && "Thanh toán: " + seller.bank,
  ].filter(Boolean))
    block(field, 9);
  doc
    .getPages()
    .forEach((p, i) =>
      p.drawText(
        `${seller.name}  ·  ${record.code}  ·  ${i + 1}/${pageCount}`,
        { x: margin, y: 30, size: 8, font, color: muted },
      ),
    );
  doc.setTitle("Báo giá " + record.code + " — AMORA STUDIO");
  const bytes = await doc.save();
  downloadBlob(
    new Blob([new Uint8Array(bytes)], { type: "application/pdf" }),
    record.code + ".pdf",
  );
}
