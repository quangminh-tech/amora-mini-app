import { loadQuoteImages } from "./pdfImages";
import { renderDocument } from "./documentTemplates";
import { PDFDocument, rgb, PDFFont, PDFPage, PDFImage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { Row, money, date, parse, downloadBlob } from "./api";
export type QuotePdfOptions = {
  showImages?: boolean;
  images?: Record<string, Uint8Array>;
  progress?: (message: string) => void;
};
export async function createQuotePdf(
  record: Row,
  lines: Row[],
  options: QuotePdfOptions = {},
) {
  const showImages = options.showImages !== false;
  const photos = options.images || {};
  let missingImages = 0;

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const response = await fetch("/fonts/DejaVuSans.ttf");
  if (!response.ok) throw new Error("Không tải được phông chữ PDF.");
  const font = await doc.embedFont(await response.arrayBuffer(), {
    subset: true,
  });
  let logo: PDFImage | undefined;
  try {
    const response = await fetch("/brand/amora-logo.png");
    if (response.ok) logo = await doc.embedPng(await response.arrayBuffer());
  } catch {
    /* Keep seller text if logo cannot be loaded. */
  }
  const document = renderDocument(record.document_snapshot, record);
  const seller = parse(record.seller_snapshot);
  const customer = parse(record.customer_snapshot);
  let page!: PDFPage;
  let y = 0;
  let pageCount = 0;
  const width = 595.28,
    margin = 42,
    brown = rgb(0.28, 0.25, 0.2),
    muted = rgb(0.46, 0.45, 0.41),
    burgundy = rgb(0.42, 0.19, 0.24);
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
    if (logo)
      page.drawImage(logo, { x: margin, y: y - 41, width: 114, height: 41 });
    else text("AMORA", margin, y - 20, 20);
    wrap(seller.name || "AMORA STUDIO", 365, 12)
      .slice(0, 2)
      .forEach((line, i) => text(line, 170, y - i * 16, 12));
    text(seller.tagline || "Simple Moments. Deep Calm.", 170, y - 37, 8, muted);
    text(record.code, 170, y - 55, 9, muted);
    y -= 84;
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
      color: burgundy,
    });
    if (showImages) text("Hình ảnh", margin + 8, y - 15, 8, rgb(1, 1, 1));
    text(
      "Sản phẩm / quy cách",
      showImages ? 116 : margin + 8,
      y - 15,
      9,
      rgb(1, 1, 1),
    );
    text("SL", 312, y - 15, 9, rgb(1, 1, 1));
    text("Đơn giá", 354, y - 15, 9, rgb(1, 1, 1));
    text("Thành tiền", 454, y - 15, 9, rgb(1, 1, 1));
    y -= 36;
  }
  newPage();
  for (const value of [
    seller.taxCode && "MST: " + seller.taxCode,
    seller.address,
    seller.phone && "Điện thoại: " + seller.phone,
    seller.email,
  ].filter(Boolean))
    block(value, 9);
  y -= 12;
  block(document.title, 16);
  if (document.intro) {
    y -= 12;
    block(document.intro);
  }
  y -= 12;
  block("Khách hàng: " + customer.name);
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
  const embedded = new Map<string, PDFImage | null>();
  for (const [lineIndex, line] of lines.entries()) {
    const id = String(line.product_id || line.productId || "");
    let photo: PDFImage | null = null;
    if (showImages && id && photos[id]) {
      if (embedded.has(id)) photo = embedded.get(id)!;
      else {
        try {
          const bytes = photos[id];
          photo =
            bytes[0] === 0x89 && bytes[1] === 0x50
              ? await doc.embedPng(bytes)
              : await doc.embedJpg(bytes);
        } catch {
          photo = null;
        }
        embedded.set(id, photo);
      }
    }
    if (showImages && !photo) missingImages++;
    const nameX = showImages ? 116 : margin + 8;
    const names = wrap(
      line.product_name +
        "\n" +
        line.sku +
        " · " +
        line.unit +
        (line.lead_days_min != null
          ? `\nChuẩn bị: ${line.lead_days_min}-${line.lead_days_max} ngày`
          : ""),
      showImages ? 180 : 244,
      9,
    );
    let offset = 0;
    let first = true;
    while (offset < names.length) {
      const available = y - 65;
      const fullHeight = Math.max(
        first && showImages ? 82 : 34,
        (names.length - offset) * 14 + 14,
      );
      const canKeepTogether = fullHeight <= 607;
      const startHeight = first && showImages ? 82 : 34;
      if (
        ((canKeepTogether && fullHeight > available) ||
          available < startHeight ||
          (lineIndex === lines.length - 1 &&
            fullHeight < 500 &&
            fullHeight + 100 > available)) &&
        y < 650
      ) {
        newPage();
        tableHead();
      }
      const capacity = Math.max(1, Math.floor((y - 65 - 14) / 14));
      const part = names.slice(offset, offset + capacity);
      const height = Math.max(
        first && showImages ? 82 : 34,
        part.length * 14 + 14,
      );
      if (y - height < 65) {
        newPage();
        tableHead();
        continue;
      }
      part.forEach((name, i) => text(name, nameX, y - i * 14, 9));
      if (first) {
        if (showImages) {
          const boxX = margin + 8,
            boxTop = y + 7,
            box = 56;
          page.drawRectangle({
            x: boxX,
            y: boxTop - box,
            width: box,
            height: box,
            color: rgb(0.97, 0.95, 0.92),
          });
          if (photo) {
            const size = photo.scale(
              Math.min((box - 4) / photo.width, (box - 4) / photo.height),
            );
            page.drawImage(photo, {
              x: boxX + (box - size.width) / 2,
              y: boxTop - box + (box - size.height) / 2,
              width: size.width,
              height: size.height,
            });
          } else {
            for (const [i, value] of ["Chưa có", "ảnh"].entries())
              text(value, boxX + 7, boxTop - 23 - i * 12, 7, muted);
          }
        }
        text(String(line.qty), 312, y, 9);
        right(money(line.unit_price), 438, y, 88);
        right(money(line.amount), 547, y, 99);
      }
      y -= height;
      page.drawLine({
        start: { x: margin, y: y + 10 },
        end: { x: 553, y: y + 10 },
        thickness: 0.4,
        color: rgb(0.85, 0.83, 0.79),
      });
      offset += part.length;
      first = false;
      if (offset < names.length) {
        newPage();
        tableHead();
      }
    }
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
  block(document.termsTitle, 11);
  if (document.terms) block(document.terms);
  if (record.terms) block(record.terms);
  y -= 12;
  for (const field of [
    seller.address,
    seller.phone && "Điện thoại: " + seller.phone,
    seller.email,
    seller.taxCode && "MST: " + seller.taxCode,
    seller.bank && "Thanh toán: " + seller.bank,
  ].filter(Boolean))
    block(field, 9);
  doc.getPages().forEach((p, i) =>
    wrap(`${seller.name} · ${record.code} · ${i + 1}/${pageCount}`, 511, 8)
      .slice(0, 2)
      .forEach((line, j) =>
        p.drawText(line, {
          x: margin,
          y: 42 - j * 12,
          size: 8,
          font,
          color: muted,
        }),
      ),
  );
  doc.setTitle("Báo giá " + record.code + " — AMORA STUDIO");
  const bytes = await doc.save();
  return { bytes, missingImages };
}

export async function exportQuote(
  record: Row,
  lines: Row[],
  options: QuotePdfOptions = {},
) {
  let images = options.images;
  if (options.showImages !== false && !images) {
    options.progress?.("Đang lấy ảnh sản phẩm…");
    images = (await loadQuoteImages(lines, options.progress)).result;
  }
  options.progress?.("Đang tạo báo giá PDF…");
  const { bytes, missingImages } = await createQuotePdf(record, lines, {
    ...options,
    images,
  });
  downloadBlob(
    new Blob([new Uint8Array(bytes)], { type: "application/pdf" }),
    record.code + ".pdf",
  );
  return { missingImages };
}
