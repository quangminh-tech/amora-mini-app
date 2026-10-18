import { PDFDocument, PDFPage, PDFFont, PDFImage, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { Row } from "./api";
export const ink = rgb(0.17, 0.14, 0.13),
  muted = rgb(0.46, 0.4, 0.36),
  accent = rgb(0.42, 0.19, 0.24),
  paper = rgb(0.985, 0.973, 0.953);
export function wrapText(
  font: PDFFont,
  value: unknown,
  width: number,
  size: number,
): string[] {
  const lines: string[] = [];
  for (const paragraph of String(value ?? "")
    .replace(/[\u0000-\u0008\u000b-\u001f]/g, "")
    .split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      if (!word) continue;
      const candidate = line ? line + " " + word : word;
      if (line && font.widthOfTextAtSize(candidate, size) > width) {
        lines.push(line);
        line = "";
      }
      if (font.widthOfTextAtSize(word, size) > width) {
        for (const ch of word) {
          if (line && font.widthOfTextAtSize(line + ch, size) > width) {
            lines.push(line);
            line = "";
          }
          line += ch;
        }
      } else line = line ? line + " " + word : word;
    }
    lines.push(line);
  }
  return lines;
}
export function limitLines(lines: string[], max: number) {
  if (lines.length <= max) return lines;
  return [...lines.slice(0, max - 1), lines[max - 1].slice(0, -3) + "…"];
}
export class PdfLayout {
  page!: PDFPage;
  y = 0;
  readonly margin = 38;
  constructor(
    public doc: PDFDocument,
    public font: PDFFont,
    public seller: Row,
    public title: string,
    public width = 595.28,
    public height = 841.89,
    public logo?: PDFImage,
  ) {}
  text(value: unknown, x: number, y: number, size = 9, color = ink) {
    this.page.drawText(String(value ?? ""), {
      x,
      y,
      size,
      font: this.font,
      color,
    });
  }
  lines(
    value: unknown,
    x: number,
    y: number,
    width: number,
    size = 9,
    max = 100,
  ) {
    const ls = limitLines(wrapText(this.font, value, width, size), max);
    ls.forEach((l, i) => this.text(l, x, y - i * (size + 4), size));
    return y - ls.length * (size + 4);
  }
  newPage() {
    this.page = this.doc.addPage([this.width, this.height]);
    const top = this.height - 38;
    if (this.logo)
      this.page.drawImage(this.logo, {
        x: 38,
        y: top - 45,
        width: 125,
        height: 45,
      });
    else this.text("AMORA", 38, top - 25, 22, accent);
    this.lines(
      this.seller.name || "AMORA STUDIO",
      180,
      top,
      this.width - 218,
      10,
      2,
    );
    const contact = [
      this.seller.taxCode && "MST: " + this.seller.taxCode,
      this.seller.phone,
      this.seller.email,
    ]
      .filter(Boolean)
      .join(" · ");
    this.lines(contact, 180, top - 30, this.width - 218, 8, 2);
    if (this.seller.address)
      this.lines(this.seller.address, 180, top - 55, this.width - 218, 8, 2);
    this.y = top - 96;
    this.y = this.lines(this.title, 38, this.y, this.width - 76, 16, 2) - 16;
  }
  ensure(height: number) {
    if (this.y - height < 65) this.newPage();
  }
  block(value: unknown, size = 9) {
    for (const line of wrapText(this.font, value, this.width - 76, size)) {
      this.ensure(size + 5);
      this.text(line, 38, this.y, size);
      this.y -= size + 5;
    }
    this.y -= 5;
  }
  async image(bytes: Uint8Array) {
    return bytes[0] === 137
      ? this.doc.embedPng(bytes)
      : this.doc.embedJpg(bytes);
  }
  finish() {
    const pages = this.doc.getPages();
    pages.forEach((page, i) => {
      const name = limitLines(
        wrapText(
          this.font,
          this.seller.name || "AMORA STUDIO",
          this.width - 125,
          8,
        ),
        1,
      )[0];
      page.drawText(name, {
        x: 38,
        y: 28,
        size: 8,
        font: this.font,
        color: muted,
      });
      page.drawText(`${i + 1}/${pages.length}`, {
        x: this.width - 68,
        y: 28,
        size: 8,
        font: this.font,
        color: muted,
      });
    });
    this.doc.setTitle(this.title);
    return this.doc.save();
  }
}
export async function createLayout(
  seller: Row,
  title: string,
  landscape = false,
) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const response = await fetch("/fonts/DejaVuSans.ttf");
  if (!response.ok) throw new Error("Không tải được phông chữ PDF.");
  const font = await doc.embedFont(await response.arrayBuffer(), {
    subset: true,
  });
  let logo;
  try {
    const response = await fetch("/brand/amora-logo.png");
    if (response.ok) logo = await doc.embedPng(await response.arrayBuffer());
  } catch {
    /* Text wordmark remains readable if logo cannot load. */
  }
  const layout = new PdfLayout(
    doc,
    font,
    seller,
    title,
    landscape ? 841.89 : 595.28,
    landscape ? 595.28 : 841.89,
    logo,
  );
  layout.newPage();
  return layout;
}
