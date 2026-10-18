import { Row, money, date } from "./api";
import {
  createLayout,
  wrapText,
  limitLines,
  paper,
  muted,
  accent,
} from "./pdfCore";
type Options = {
  issueDate?: string;
  validDays?: number;
  contact?: string;
  title: string;
  recipient: string;
  note: string;
  showPrices: boolean;
  images: Record<string, Uint8Array>;
  bands?: { label: string }[];
  bandPrices?: Record<string, string[]>;
};
export async function createCataloguePdf(data: Row, options: Options) {
  const p = await createLayout(data.seller, options.title);
  if (options.recipient) p.block("Khách hàng: " + options.recipient, 10);
  if (options.contact) p.block("Người liên hệ: " + options.contact, 9);
  if (options.issueDate)
    p.block(
      "Ngày lập: " +
        date(options.issueDate) +
        " · Hiệu lực: " +
        options.validDays +
        " ngày",
      9,
    );
  for (const product of data.products) {
    p.ensure(270);
    const top = p.y;
    p.page.drawRectangle({
      x: 38,
      y: top - 250,
      width: 519,
      height: 257,
      color: paper,
    });
    const bytes = options.images[product.id];
    if (bytes) {
      const image = await p.image(bytes);
      const scale = Math.min(148 / image.width, 148 / image.height);
      p.page.drawImage(image, {
        x: 49 + (148 - image.width * scale) / 2,
        y: top - 158 + (148 - image.height * scale) / 2,
        width: image.width * scale,
        height: image.height * scale,
      });
    } else p.text("Chưa có ảnh", 85, top - 85, 9, muted);
    let y =
      p.lines(product.model_name || product.name, 211, top - 13, 330, 11, 3) -
      3;
    y =
      p.lines(
        [product.scent_name, product.size_label, product.color_label]
          .filter(Boolean)
          .join(" · "),
        211,
        y,
        330,
        9,
        3,
      ) - 3;
    y = p.lines("SKU: " + product.sku, 211, y, 330, 8, 2) - 5;
    p.lines(
      product.description || product.model_description || "",
      211,
      y,
      330,
      9,
      7,
    );
    const price = data.prices.find((x: Row) => x.product_id === product.id);
    if (options.showPrices) {
      p.text(
        price ? money(price.unit_price) : "Liên hệ báo giá",
        49,
        top - 185,
        12,
        accent,
      );
      if (price)
        p.lines(
          "MOQ " + price.min_qty + " " + product.unit,
          49,
          top - 204,
          148,
          8,
          2,
        );
    }
    p.lines(
      `Chuẩn bị: ${product.lead_days_min}-${product.lead_days_max} ngày`,
      49,
      top - 239,
      480,
      8,
      2,
    );
    p.y = top - 270;
    const full = product.description || product.model_description || "";
    if (wrapText(p.font, full, 330, 9).length > 7) {
      p.block("Mô tả đầy đủ: " + product.name, 10);
      p.block(full);
    }
  }
  if (options.note) {
    p.ensure(40);
    p.block("Thông tin thêm", 11);
    p.block(options.note);
  }
  return p.finish();
}
export async function createTierPricePdf(data: Row, options: Options) {
  const bands = options.bands || [];
  if (bands.length < 1 || bands.length > 4)
    throw new Error("Bảng giá cần 1-4 bậc số lượng.");
  const p = await createLayout(data.seller, options.title, true);
  if (options.recipient) p.block("Khách hàng: " + options.recipient, 10);
  if (options.contact) p.block("Người liên hệ: " + options.contact, 9);
  if (options.issueDate)
    p.block(
      "Ngày lập: " +
        date(options.issueDate) +
        " · Hiệu lực: " +
        options.validDays +
        " ngày",
      9,
    );
  p.block("Giá áp dụng theo số lượng của từng mã sản phẩm.", 8);
  const widths = [30, 170, 200, ...bands.map(() => (766 - 400) / bands.length)];
  function head() {
    p.ensure(35);
    let x = 38;
    p.page.drawRectangle({
      x,
      y: p.y - 25,
      width: 766,
      height: 29,
      color: paper,
    });
    ["STT", "Sản phẩm / SKU", "Quy cách", ...bands.map((x) => x.label)].forEach(
      (t, i) => {
        p.lines(t, x + 5, p.y - 8, widths[i] - 10, 8, 2);
        x += widths[i];
      },
    );
    p.y -= 40;
  }
  head();
  data.products.forEach((product: Row, i: number) => {
    const cols = [
      String(i + 1),
      product.name + "\n" + product.sku,
      [
        product.scent_name,
        product.size_label,
        product.color_label,
        product.description || product.model_description,
      ]
        .filter(Boolean)
        .join("\n"),
      ...bands.map((_, j) => {
        const v = options.bandPrices?.[product.id]?.[j];
        return v ? money(v) : "Liên hệ";
      }),
    ];
    const wrapped = cols.map((v, j) => wrapText(p.font, v, widths[j] - 10, 8));
    const maxLines = Math.max(...wrapped.map((ls) => ls.length));
    let offset = 0;
    while (offset < maxLines) {
      let available = Math.min(22, Math.floor((p.y - 80) / 12));
      if (available < 2) {
        p.newPage();
        head();
        available = Math.min(22, Math.floor((p.y - 80) / 12));
      }
      const take = Math.min(available, maxLines - offset),
        height = Math.max(35, take * 12 + 12);
      if (p.y - height < 65) {
        p.newPage();
        head();
        continue;
      }
      let x = 38;
      wrapped.forEach((ls, j) => {
        const chunk =
          j === 0 ? [String(i + 1)] : ls.slice(offset, offset + take);
        chunk.forEach((l, n) => p.text(l, x + 5, p.y - n * 12, 8));
        x += widths[j];
      });
      p.y -= height;
      p.page.drawLine({
        start: { x: 38, y: p.y + 8 },
        end: { x: 804, y: p.y + 8 },
        thickness: 0.4,
        color: muted,
      });
      p.y -= 6;
      offset += take;
    }
  });
  if (options.note) {
    p.ensure(40);
    p.block("Ghi chú", 11);
    p.block(options.note);
  }
  return p.finish();
}
