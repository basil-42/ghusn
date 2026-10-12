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

export async function renderPdf(url: string): Promise<Buffer> {
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
    const page = await browser.newPage();
    await page.emulateMedia({ media: "print" });
    const res = await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
    if (!res?.ok()) throw new Error(`PDF source returned ${res?.status() ?? "no response"}`);
    await page.evaluate(() => document.fonts.ready);
    return await page.pdf({ preferCSSPageSize: true, printBackground: true });
  } finally {
    await browser.close();
  }
}
