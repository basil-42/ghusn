/**
 * موقع التوصيل (D-163): العميل يضغط «حدّد موقعي» (إحداثيات من الهاتف) أو يلصق رابطاً من خرائط Google /
 * Apple أو من مشاركة الموقع في واتساب. نقبل فقط إحداثيات صحيحة أو رابط خرائط من نطاق معروف، ونحفظ رابطاً
 * https نظيفاً — لا نحفظ أي رابط آخر يُعرض للموظفات لاحقاً.
 */
const MAP_HOSTS = new Set([
  "maps.app.goo.gl",
  "goo.gl",
  "maps.google.com",
  "www.google.com",
  "google.com",
  "maps.apple.com",
]);

const COORDS = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;

/** إحداثيات «خط العرض,خط الطول» ← رابط خرائط Google، أو null إن كانت خارج المدى. */
export function coordsToMapsUrl(lat: number, lng: number): string | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return `https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}`;
}

/**
 * يحوّل ما أدخله العميل إلى رابط موقع صالح أو null:
 * - «15.5961,32.5337» (من زر «حدّد موقعي»)
 * - نص فيه رابط خرائط (رسالة واتساب أو مشاركة من التطبيق) — يُؤخذ أول رابط.
 */
export function normalizeLocation(input: string | null | undefined): string | null {
  const v = (input ?? "").trim();
  if (!v || v.length > 1000) return null;
  const c = COORDS.exec(v);
  if (c) return coordsToMapsUrl(Number(c[1]), Number(c[2]));
  const raw = /https?:\/\/[^\s<>"']+/i.exec(v)?.[0];
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (!MAP_HOSTS.has(host)) return null;
  // google.com و goo.gl: روابط الخرائط فقط (لا بحث ولا روابط أخرى)
  if ((host === "www.google.com" || host === "google.com") && !url.pathname.startsWith("/maps")) return null;
  if (host === "goo.gl" && !url.pathname.startsWith("/maps")) return null;
  url.protocol = "https:";
  url.hash = "";
  const out = url.toString();
  return out.length <= 500 ? out : null;
}
