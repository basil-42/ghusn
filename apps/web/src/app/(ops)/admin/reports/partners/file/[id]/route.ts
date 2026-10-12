import { roleCan } from "@/lib/auth/permissions";
import { getSession } from "@/lib/auth/session";
import { statementFile } from "@/lib/partners";

/** تنزيل كشف الشريك المحفوظ (D-130) — لمن يرى الشركاء. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !roleCan(session.user.role, { partner: ["read"] })) return new Response("Not found", { status: 404 });
  const file = await statementFile((await params).id);
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(file.body), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${file.filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
