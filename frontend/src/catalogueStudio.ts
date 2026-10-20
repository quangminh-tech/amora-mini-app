import { request } from "./api";
export type Section = {
  id: string;
  kind: "product" | "text" | "gallery" | "table";
  title: string;
  description: string;
  sku: string;
  productId: string | null;
  spec: string;
  price: number | null;
  layout: "split" | "gallery" | "compact";
  fit: "contain" | "cover";
  position: number;
  pageBreak: boolean;
  imageIds: string[];
  columns: string[];
  rows: string[][];
};
export type Content = {
  title: string;
  subtitle: string;
  intro: string;
  contact: string;
  note: string;
  theme: "cream" | "white" | "dark";
  motion: boolean;
  showPrices: boolean;
  coverId: string | null;
  sections: Section[];
};
export type StudioDocument = {
  id: string;
  name: string;
  content: Content;
  version: number;
  editable: boolean;
  published: boolean;
};
export function newSection(kind: Section["kind"]): Section {
  return {
    id: crypto.randomUUID(),
    kind,
    title: kind === "table" ? "Quy cách sản phẩm" : "",
    description: "",
    sku: "",
    productId: null,
    spec: "",
    price: null,
    layout: "split",
    fit: "contain",
    position: 50,
    pageBreak: false,
    imageIds: [],
    columns: kind === "table" ? ["Sản phẩm", "Quy cách", "Ghi chú"] : [],
    rows: kind === "table" ? [["", "", ""]] : [],
  };
}
// Photos are flattened to JPEG so exported documents have no external-image dependencies.
export async function uploadStudioImage(
  documentId: string,
  file: Blob,
  caption = "",
): Promise<string> {
  if (file.size > 12 * 1024 * 1024) throw new Error("Ảnh nguồn tối đa 12 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width * bitmap.height > 40_000_000)
      throw new Error("Ảnh quá lớn; chọn ảnh dưới 40 megapixel.");
    const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Không xử lý được ảnh.");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const jpeg = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Không nén được ảnh."))),
        "image/jpeg",
        0.88,
      ),
    );
    canvas.width = canvas.height = 1;
    if (jpeg.size > 2 * 1024 * 1024)
      throw new Error("Ảnh sau nén vẫn quá 2 MB. Chọn ảnh nhỏ hơn.");
    const form = new FormData();
    form.append("file", jpeg, "catalogue.jpg");
    form.append("caption", caption.slice(0, 180));
    return (
      await (await request(`/studio/${documentId}/assets`, {
        method: "POST",
        body: form,
      }))!.json()
    ).id;
  } finally {
    bitmap.close();
  }
}
