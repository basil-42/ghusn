import { roleCan } from "@/lib/auth/permissions";
import { getSession } from "@/lib/auth/session";
import { buildImportTemplate } from "@/lib/shipment-import";

/** تنزيل قالب Excel لاستيراد بنود الشحنة (D-85). */
export async function GET() {
  const session = await getSession();
  if (!session || !roleCan(session.user.role, { shipment: ["update"] })) {
    return new Response("Not found", { status: 404 });
  }
  const body = await buildImportTemplate();
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="ghusn-shipment-template.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
