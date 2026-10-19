import { api, request, Row } from "./api";

export type PdfImageSource = { id: string; image_id?: string | null };
export async function loadPdfImages(
  products: PdfImageSource[],
  progress?: (message: string) => void,
) {
  const result: Record<string, Uint8Array> = {};
  let missing = 0;
  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    progress?.(`Đang chuẩn bị ảnh ${i + 1}/${products.length}…`);
    if (!p.image_id) {
      missing++;
      continue;
    }
    let bitmap: ImageBitmap | undefined;
    let canvas: HTMLCanvasElement | undefined;
    try {
      const response = await request("/images/" + p.image_id);
      bitmap = await createImageBitmap(await response!.blob());
      const scale = Math.min(1, 640 / Math.max(bitmap.width, bitmap.height));
      canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Không xử lý được ảnh.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const jpeg = await new Promise<Blob>((resolve, reject) =>
        canvas!.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("Không xử lý được ảnh."))),
          "image/jpeg",
          0.82,
        ),
      );
      result[p.id] = new Uint8Array(await jpeg.arrayBuffer());
    } catch (e) {
      // Authentication, permissions and infrastructure failure must not look like a missing photo.
      const status = (e as { status?: number }).status;
      if (
        status === 0 ||
        status === 401 ||
        status === 403 ||
        (status && status >= 500)
      )
        throw e;
      missing++;
    } finally {
      bitmap?.close();
      if (canvas) {
        canvas.width = 1;
        canvas.height = 1;
      }
    }
  }
  return { result, missing };
}

export async function loadQuoteImages(
  lines: Row[],
  progress?: (message: string) => void,
) {
  const ids = [
    ...new Set(lines.map((l) => l.product_id || l.productId).filter(Boolean)),
  ] as string[];
  const sources: PdfImageSource[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const data = await api(
      "/products?page=1&pageSize=1&modelId=00000000-0000-0000-0000-000000000000&includeIds=" +
        chunk.join(","),
    );
    for (const id of chunk)
      sources.push({
        id,
        image_id: data.images.find((image: Row) => image.product_id === id)?.id,
      });
  }
  return loadPdfImages(sources, progress);
}
