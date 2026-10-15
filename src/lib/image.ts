/**
 * 瀏覽器端的照片預處理。
 *
 * 手機直出的照片動輒 4–5 MB，轉成 base64 後更大。這裡先縮到長邊 1280px，
 * 對辨識盒面文字與底盤標示已經夠用，同時讓上傳與離線儲存都不會爆掉。
 */

const MAX_EDGE = 1280;
const JPEG_QUALITY = 0.85;

export async function fileToResizedDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("瀏覽器不支援 canvas，無法處理照片");
    ctx.drawImage(bitmap, 0, 0, width, height);

    return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  } finally {
    bitmap.close();
  }
}
