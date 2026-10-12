import { chromium } from "playwright-core";

/**
 * PDF من الخادم (D-130): متصفح Chromium بلا واجهة يفتح صفحة الطباعة نفسها داخل الخادم ويحوّلها لـ PDF —
 * نفس الخطوط وربط الحروف العربية والتنسيق الذي يراه المستخدم. المسار من CHROMIUM_PATH (في الإنتاج)، وإلا
 * متصفح Playwright المثبت محلياً (npx playwright install chromium).
 */

export class PdfUnavailable extends Error {}

/** عنوان التطبيق من داخل الخادم نفسه (لا يمر عبر Cloudflare). */
export function internalUrl(path: string): string {
  const base = process.env.INTERNAL_URL ?? `http://127.0.0.1:${process.env.PORT ?? 3000}`;
  return `${base.replace(/\/$/, "")}${path}`;
}

export interface RenderOptions {
  /** كوكيز طلب المستخدم: الصفحة تُفتح بجلسته نفسها فتفحص صلاحياته كالمعتاد */
  cookieHeader?: string | null;
  /** يرفض النتيجة إن انتهت الصفحة إلى مسار غير هذا (تحويل للدخول أو للرئيسية = لا صلاحية) */
  expectPath?: string;
}

export class PdfForbidden extends Error {}

function parseCookies(header: string, url: string) {
  const host = new URL(url).hostname;
  return header
    .split(";")
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => {
      const i = c.indexOf("=");
      const name = c.slice(0, i);
      return { name, value: c.slice(i + 1), domain: host, path: "/", secure: name.startsWith("__Secure-") };
    })
    .filter((c) => c.name);
}

export async function renderPdf(url: string, options: RenderOptions = {}): Promise<Buffer> {
  let browser;
  try {
    browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_PATH || undefined,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
  } catch (e) {
    console.error("[pdf] chromium unavailable", e);
    throw new PdfUnavailable("تعذّر تشغيل مولّد PDF على الخادم.");
  }
  try {
    const context = await browser.newContext();
    if (options.cookieHeader) await context.addCookies(parseCookies(options.cookieHeader, url));
    const page = await context.newPage();
    await page.emulateMedia({ media: "print" });
    const res = await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
    if (options.expectPath && new URL(page.url()).pathname !== options.expectPath) throw new PdfForbidden("forbidden");
    if (!res?.ok()) throw new Error(`PDF source returned ${res?.status() ?? "no response"}`);
    await page.evaluate(() => document.fonts.ready);
    return await page.pdf({ preferCSSPageSize: true, printBackground: true });
  } finally {
    await browser.close();
  }
}
