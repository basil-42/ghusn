import { createHash } from "node:crypto";
import sharp from "sharp";
import { MAX_UPLOAD_BYTES } from "./product-images";
import { storage } from "./storage";

/** سبب رفض الصورة — كل شاشة تترجمه لرسالتها. */
export class PrivateImageError extends Error {
  constructor(readonly code: "TOO_LARGE" | "UNREADABLE") {
    super(code);
  }
}

/**
 * صورة خاصة (فاتورة مصروف، إشعار بنكك): تصحيح الاتجاه وحذف البيانات الوصفية (D-73)، WebP بعرض
 * 1600 كحد أقصى، ومفتاح من المحتوى تحت «private/» — /media يرفضه، وتُقدَّم فقط من مسار بصلاحية.
 */
export async function savePrivateImage(file: File, folder: "expenses" | "payments" | "gifts"): Promise<string> {
  if (file.size > MAX_UPLOAD_BYTES) throw new PrivateImageError("TOO_LARGE");
  const input = Buffer.from(await file.arrayBuffer());
  let data: Buffer;
  try {
    data = await sharp(input, { limitInputPixels: 40_000_000, failOn: "error" })
      .rotate()
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 78 })
      .toBuffer();
  } catch {
    throw new PrivateImageError("UNREADABLE");
  }
  const key = `private/${folder}/${createHash("sha256").update(data).digest("hex").slice(0, 24)}.webp`;
  await storage.put(key, data, "image/webp");
  return key;
}

/** استجابة صورة خاصة: لا تُخزَّن مؤقتاً خارج المتصفح. */
export async function privateImageResponse(key: string): Promise<Response> {
  const body = await storage.get(key);
  if (!body) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
