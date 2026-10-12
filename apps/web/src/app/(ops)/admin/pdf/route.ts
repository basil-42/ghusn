import { shopDay } from "@ghusn/core";
import { recordAudit } from "@/lib/audit";
import { getSession } from "@/lib/auth/session";
import { PdfForbidden, PdfUnavailable, internalUrl, renderPdf } from "@/lib/pdf";

/** صفحات التقارير التي تُنزَّل PDF (تحمل رأس الطباعة وتنسيق A4). */
const ALLOWED = /^\/admin\/reports(\/[a-z]+(\/[A-Za-z0-9_-]+)?)?$/;

/**
 * تنزيل التقرير PDF مباشرة (D-131): Chromium في الخادم يفتح نفس صفحة التقرير بجلسة المستخدم نفسه (فتفحص
 * الصفحة صلاحياته كالمعتاد) بتنسيق الطباعة، ويعيد ملفاً جاهزاً — بلا نافذة طباعة. إن تعذّر المولّد يعيد
 * 503 فيرجع الزر لطباعة المتصفح.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const target = new URL(request.url).searchParams.get("path") ?? "";
  let parsed: URL;
  try {
    parsed = new URL(target, "http://x");
  } catch {
    return new Response("Bad path", { status: 400 });
  }
  if (parsed.origin !== "http://x" || !ALLOWED.test(parsed.pathname) || target.length > 500) {
    return new Response("Bad path", { status: 400 });
  }
  let pdf: Buffer;
  try {
    pdf = await renderPdf(internalUrl(`${parsed.pathname}${parsed.search}`), {
      cookieHeader: request.headers.get("cookie"),
      expectPath: parsed.pathname,
    });
  } catch (e) {
    if (e instanceof PdfForbidden) return new Response("Forbidden", { status: 403 });
    if (e instanceof PdfUnavailable) return new Response(e.message, { status: 503 });
    throw e;
  }
  const name = [
    "ghusn",
    ...parsed.pathname.split("/").slice(2),
    ...[...parsed.searchParams.values()].map((v) => v.replace(/[^A-Za-z0-9-]/g, "")).filter(Boolean),
  ].join("-");
  await recordAudit({
    type: "DATA_EXPORTED",
    actorId: session.user.id,
    title: "تنزيل تقرير PDF",
    detail: `${parsed.pathname}${parsed.search}`,
  });
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${name === "ghusn-reports" ? `ghusn-report-${shopDay(new Date())}` : name}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
