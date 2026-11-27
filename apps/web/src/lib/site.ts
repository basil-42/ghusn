/**
 * عنوان الموقع العام (APP_URL، مثل https://ghusn.store) والروابط حسب اللغة: العربية بلا بادئة،
 * والإنجليزية تحت /en (D-88). تستخدمها خريطة الموقع والبيانات الوصفية وروابط واتساب.
 */
export function siteUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/** المسار حسب اللغة: localePath("en", "/p/1") ← "/en/p/1"، و"/" للعربية ← "/". */
export function localePath(locale: string, path: string): string {
  const clean = path === "/" ? "" : path;
  return locale === "en" ? `/en${clean}` : clean || "/";
}

/** روابط النسختين لصفحة واحدة (hreflang) والرابط الأساسي للغة الحالية. */
export function alternates(locale: string, path: string) {
  return {
    canonical: localePath(locale, path),
    languages: { ar: localePath("ar", path), en: localePath("en", path), "x-default": localePath("ar", path) },
  };
}

/** رابط حساب إنستغرام أو تيك توك من اسم الحساب («@ghusn» أو «ghusn») أو رابط كامل (D-160). */
export function socialLink(kind: "instagram" | "tiktok", value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (/^https:\/\//i.test(v)) return v;
  const handle = v.replace(/^@/, "").replace(/[^\w.]/g, "");
  if (!handle) return null;
  return kind === "instagram" ? `https://www.instagram.com/${handle}` : `https://www.tiktok.com/@${handle}`;
}

/** رقم واتساب المحل (من «الضبط» ← الإيصال) كرابط wa.me برسالة جاهزة، أو null. */
export function whatsappLink(number: string, text: string): string | null {
  const digits = number.replace(/\D/g, "");
  return digits.length >= 8 ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : null;
}
