/**
 * قياس الزيارات (D-108): Umami مستضاف على نفس الخادم (Coolify). يعمل فقط إن ضُبط المتغيّران في البيئة —
 * بدونهما لا يُحمَّل أي سكربت. يُقرأ عند الطلب (لا عند البناء)، فتفعيله لا يحتاج إعادة بناء.
 */
export interface AnalyticsConfig {
  src: string;
  websiteId: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function analyticsConfig(env: Record<string, string | undefined> = process.env): AnalyticsConfig | null {
  const src = env.UMAMI_SCRIPT_URL?.trim();
  const websiteId = env.UMAMI_WEBSITE_ID?.trim();
  if (!src || !websiteId || !UUID.test(websiteId)) return null;
  try {
    const url = new URL(src);
    // HTTPS فقط، إلا للتجربة المحلية
    if (url.protocol !== "https:" && url.hostname !== "localhost") return null;
    return { src: url.toString(), websiteId };
  } catch {
    return null;
  }
}

/**
 * الرابط كما يُرسل للقياس: رابط متابعة الطلب سرّي (D-88) فيُستبدل رمزه، ولا يُرسل أي query
 * (قد يحوي بحثاً فيه اسم أو رقم هاتف).
 */
export function analyticsPath(pathname: string): string {
  return pathname.replace(/^((?:\/en)?\/o\/)[^/]+/, "$1[token]") || "/";
}
