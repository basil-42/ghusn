import { prisma } from "@ghusn/db";

export const dynamic = "force-dynamic";

/**
 * فحص الصحة للنشر (D-166): Coolify وUptime Kuma يطلبانه. 200 = التطبيق يعمل والقاعدة ترد؛ 503 غير ذلك.
 * لا يكشف تفاصيل الخطأ.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
