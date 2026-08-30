// 封面缩略图生成：EPUB 封面图 / PDF 首页 → 小尺寸 data URL。
// 结果存入 BookMeta.coverThumb，书架无需加载整本书。
import type { PDFDocumentProxy } from 'pdfjs-dist';

import { pdfjs } from './pdf.ts';

const THUMB_MAX = 160;
const JPEG_QUALITY = 0.75;

/** 图片字节 → 缩略图 data URL；失败返回 undefined（书架回退占位封面） */
export async function makeImageThumb(
  data: Uint8Array,
  mediaType: string,
): Promise<string | undefined> {
  try {
    const bitmap = await createImageBitmap(
      new Blob([new Uint8Array(data)], { type: mediaType }),
    );
    const scale = Math.min(1, THUMB_MAX / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  } catch {
    return undefined;
  }
}

/** PDF 首页 → 缩略图 data URL */
export async function makePdfThumb(
  data: Uint8Array,
): Promise<string | undefined> {
  const task = pdfjs.getDocument({ data: data.slice() });
  let doc: PDFDocumentProxy | undefined;
  try {
    doc = await task.promise;
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    if (base.width <= 0) return undefined;
    const viewport = page.getViewport({ scale: THUMB_MAX / base.width });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  } catch {
    return undefined;
  } finally {
    void task.destroy();
  }
}
