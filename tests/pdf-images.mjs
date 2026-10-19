// Synthetic coloured PNGs below are technical fixtures, never product images or seeded assets.
import { build } from "../frontend/node_modules/esbuild/lib/main.js";
import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { deflateSync } from "node:zlib";
import assert from "node:assert/strict";
const root = resolve(dirname(fileURLToPath(import.meta.url)), ".."),
  scratch = await mkdtemp(join(tmpdir(), "amora-photo-")),
  out = join(scratch, "pdf.mjs");
await build({
  stdin: {
    contents: `export {createQuotePdf} from './pdf';export {loadQuoteImages,loadPdfImages} from './pdfImages';`,
    loader: "ts",
    resolveDir: join(root, "frontend/src"),
  },
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: out,
  define: { "import.meta.env": "{}" },
  logLevel: "warning",
});
function png(w, h, colour) {
  const crc = (bytes) => {
    let c = 0xffffffff;
    for (const b of bytes) {
      c ^= b;
      for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const b = Buffer.alloc(data.length + 12);
    b.writeUInt32BE(data.length);
    b.write(type, 4);
    data.copy(b, 8);
    b.writeUInt32BE(crc(b.subarray(4, 8 + data.length)), 8 + data.length);
    return b;
  };
  const head = Buffer.alloc(13);
  head.writeUInt32BE(w);
  head.writeUInt32BE(h, 4);
  head[8] = 8;
  head[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * (w * 3 + 1) + 1 + x * 3;
      const inner =
        x > w * 0.15 && x < w * 0.85 && y > h * 0.15 && y < h * 0.85;
      for (let k = 0; k < 3; k++) raw[i + k] = inner ? colour[k] : 245;
    }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", head),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
const portrait = png(180, 260, [130, 70, 80]),
  landscape = png(300, 150, [110, 140, 110]);
const assets = async (url) =>
  new Response(await readFile(join(root, "frontend/public", String(url))));
globalThis.fetch = assets;
const { createQuotePdf, loadQuoteImages, loadPdfImages } = await import(
  pathToFileURL(out)
);
const record = {
  code: "BG-KIEM-THU-ANH",
  created_at: "2026-10-19T02:00:00Z",
  valid_until: "2026-11-02",
  subtotal: 11550000,
  shipping: 200000,
  note: "KIỂM THỬ KỸ THUẬT. Khối màu là ảnh giả lập kiểm tra tỷ lệ, không phải ảnh sản phẩm và không phải báo giá gửi khách.",
  terms: "Thông tin thương mại cần được xác nhận trước khi sử dụng.",
  seller_snapshot: {
    name: "AMORA STUDIO",
    phone: "",
    email: "",
    address: "",
    taxCode: "",
    tagline: "Simple Moments. Deep Calm.",
  },
  customer_snapshot: {
    name: "Khách kiểm thử PDF",
    company: "DỮ LIỆU MINH HỌA",
  },
};
const lines = Array.from({ length: 5 }, (_, i) => ({
  product_id: "p" + (i + 1),
  product_name: `${i + 1}. SẢN PHẨM KIỂM THỬ · 220g · Trắng`,
  sku: "TEST-" + (i + 1),
  unit: "lọ",
  qty: 10,
  unit_price: i % 2 ? 279000 : 199000,
  amount: (i % 2 ? 279000 : 199000) * 10,
  lead_days_min: 7,
  lead_days_max: 10,
}));
const images = {
  p1: portrait,
  p2: landscape,
  p4: new Uint8Array([1, 2, 3]),
  p5: portrait,
};
const photo = await createQuotePdf(record, lines, { images });
assert.equal(photo.missingImages, 2);
const long = await createQuotePdf(
  { ...record, code: "BG-KIEM-THU-NHIEU-TRANG", subtotal: 60 * 199000 },
  Array.from({ length: 60 }, (_, i) => ({
    ...lines[i % 5],
    product_name:
      i === 0
        ? "MÔ TẢ DÀI KIỂM THỬ " +
          "Quy cách và màu cốc cần hiển thị đầy đủ. ".repeat(160)
        : `Dòng kiểm thử ${i + 1} · Mùi / size / màu`,
    qty: 1,
    unit_price: 199000,
    amount: 199000,
  })),
  { images },
);
const { PDFDocument, PDFName, PDFRawStream } = await import(
  "../frontend/node_modules/pdf-lib/es/index.js"
).catch(
  async () => await import("../frontend/node_modules/pdf-lib/cjs/index.js"),
);
const photoDoc = await PDFDocument.load(photo.bytes),
  longDoc = await PDFDocument.load(long.bytes);
const imageCount = (doc) =>
  doc.context
    .enumerateIndirectObjects()
    .filter(
      ([, v]) =>
        v instanceof PDFRawStream &&
        v.dict.get(PDFName.of("Subtype")) === PDFName.of("Image"),
    ).length;
assert(imageCount(photoDoc) >= 3);
assert(longDoc.getPageCount() > 5);
const dir = process.env.PDF_IMAGE_QA_DIR || scratch;
await mkdir(dir, { recursive: true });
await writeFile(join(dir, "quote-with-images.pdf"), photo.bytes);
await writeFile(join(dir, "quote-images-long.pdf"), long.bytes);
// Test authenticated source mapping, missing images, failure handling and cleanup without a browser.
globalThis.sessionStorage = {
  getItem() {
    return null;
  },
  removeItem() {},
};
globalThis.window = { dispatchEvent() {} };
let closed = 0;
globalThis.createImageBitmap = async (blob) => ({
  width: 300,
  height: 150,
  bytes: await blob.arrayBuffer(),
  close() {
    closed++;
  },
});
globalThis.document = {
  createElement() {
    let bitmap;
    return {
      width: 0,
      height: 0,
      getContext() {
        return {
          fillRect() {},
          drawImage(b) {
            bitmap = b;
          },
        };
      },
      toBlob(cb) {
        cb(new Blob([bitmap.bytes], { type: "image/jpeg" }));
      },
    };
  },
};
globalThis.fetch = async (url) => {
  if (String(url).startsWith("/api/products"))
    return Response.json({
      images: [
        { id: "image2", product_id: "p2" },
        { id: "image1", product_id: "p1" },
      ],
    });
  if (url === "/api/images/image1") return new Response(portrait);
  if (url === "/api/images/image2") return new Response(landscape);
  if (url === "/api/images/missing")
    return Response.json({ message: "Not found" }, { status: 404 });
  if (url === "/api/images/denied")
    return Response.json({ message: "Denied" }, { status: 403 });
  if (url === "/api/images/down")
    return Response.json({ message: "Unavailable" }, { status: 503 });
  throw new Error("Unexpected " + url);
};
const loaded = await loadQuoteImages([
  { product_id: "p1" },
  { product_id: "p2" },
  { product_id: "p3" },
]);
assert.deepEqual(Buffer.from(loaded.result.p1), portrait);
assert.deepEqual(Buffer.from(loaded.result.p2), landscape);
assert.equal(loaded.missing, 1);
assert.equal(closed, 2);
assert.equal(
  (await loadPdfImages([{ id: "p", image_id: "missing" }])).missing,
  1,
);
await assert.rejects(
  () => loadPdfImages([{ id: "p", image_id: "denied" }]),
  (e) => e.status === 403,
);
await assert.rejects(
  () => loadPdfImages([{ id: "p", image_id: "down" }]),
  (e) => e.status === 503,
);
console.log(
  `PASS: embedded images, portrait/landscape containment, missing/corrupt placeholders, long-row continuation, 60-line pagination, exact SKU mapping, permission/service failures and bitmap cleanup. QA PDFs: ${dir}`,
);
