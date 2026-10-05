/**
 * رؤوس الحماية (D-110). سياسة المحتوى (CSP) تُحسب عند كل طلب صفحة في proxy.ts — فتفعيل Umami أو
 * تغيير النطاق لا يحتاج إعادة بناء؛ والرؤوس الثابتة في next.config.ts لكل الردود.
 */

export interface CspOptions {
  dev: boolean;
  /** الموقع منشور على https (يفعّل الترقية لـ https وHSTS). */
  https: boolean;
  /** أصل سكربت Umami إن كان مفعّلاً (مثل https://stats.ghusn.store). */
  analyticsOrigin: string | null;
}

/**
 * - السكربتات من الموقع نفسه فقط (+ Umami)؛ «unsafe-inline» لسكربتات Next المضمّنة (البديل nonce يجعل
 *   كل الصفحات ديناميكية ويلغي التخزين المؤقت).
 * - لا تضمين للموقع داخل إطار (clickjacking)، ولا إرسال نماذج لموقع آخر، ولا plugins.
 * - الصور: الموقع، و data: (الباركود) و blob: (معاينة الصورة قبل رفعها).
 */
export function contentSecurityPolicy({ dev, https, analyticsOrigin }: CspOptions): string {
  const extra = analyticsOrigin ? ` ${analyticsOrigin}` : "";
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}${extra}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${extra}${dev ? " ws: wss:" : ""}`,
    "media-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    ...(https ? ["upgrade-insecure-requests"] : []),
  ];
  return directives.join("; ");
}

/** أصل رابط (https://host) أو null. */
export function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** رؤوس الصفحة حسب البيئة الحالية — تُقرأ عند التشغيل. */
export function pageSecurityHeaders(env: Record<string, string | undefined> = process.env): [string, string][] {
  const https = (env.APP_URL ?? "").startsWith("https://");
  const csp = contentSecurityPolicy({
    dev: env.NODE_ENV !== "production",
    https,
    analyticsOrigin: env.UMAMI_WEBSITE_ID ? originOf(env.UMAMI_SCRIPT_URL) : null,
  });
  return [
    ["Content-Security-Policy", csp],
    // HSTS فقط على https الحقيقي — على localhost يكسر التطوير
    ...(https ? ([["Strict-Transport-Security", "max-age=31536000; includeSubDomains"]] as [string, string][]) : []),
  ];
}
