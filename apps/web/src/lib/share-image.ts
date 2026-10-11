import sharp from "sharp";
import { renderShareCard, type ShareCardInput } from "./share-card";
import { siteUrl } from "./site";
import { storage } from "./storage";

/** سطر الهوية أسفل البطاقة. */
export function shareTagline(locale: "ar" | "en"): string {
  const host = new URL(siteUrl()).host;
  return locale === "en" ? `Gifts made to be remembered · ${host}` : `هدايا تُصنع لتُذكر · ${host}`;
}

export async function readImage(file: string | null): Promise<Buffer | null> {
  return file ? storage.get(file) : null;
}

/**
 * رد صورة المعاينة (D-126): تُخزَّن أسبوعاً (الرابط يحمل نسخة تتغيّر بتغيّر المحتوى). إن تعذّر رسم النص
 * (خطوط أو Pango غير متاحة على الخادم) تُرسل صورة المنتج نفسها مقصوصة — أفضل من لا معاينة.
 */
export async function shareImageResponse(card: ShareCardInput, versioned: boolean): Promise<Response> {
  let body: Buffer;
  try {
    body = await renderShareCard(card);
  } catch (e) {
    console.error("share card", e);
    if (!card.image) return new Response(null, { status: 404 });
    body = await sharp(card.image).resize(1200, 630, { fit: "cover" }).jpeg({ quality: 80 }).toBuffer();
  }
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": versioned ? "public, max-age=604800, immutable" : "public, max-age=3600",
    },
  });
}
