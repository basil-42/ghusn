/**
 * تجهيز الصور في المتصفح قبل رفعها. لا يستورد شيئاً من الخادم — يُستخدم في مكوّنات العميل والخادم معاً.
 */

/** أقصى حجم يقبله الخادم لصورة مرفوعة. حد Server Actions في next.config أعلى منه بقليل (11MB). */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const MAX_EDGE = 2000;

/**
 * يصغّر الصورة في المتصفح (صورة جوال 5–20MB ← حوالي 0.5MB) — مهم على شبكات السودان البطيئة، ويمنع
 * تجاوز حد الطلب الذي يُسقط الصفحة. الشفافية تُملأ بالأبيض (JPEG لا يدعمها).
 * إن فشل (صيغة لا يدعمها المتصفح) أو لم يصغر الملف تُعاد الأصلية ويتحقق منها الخادم.
 */
export async function shrinkImage(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.88));
    return blob && blob.size < file.size ? new File([blob], "photo.jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}
