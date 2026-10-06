import { roleCan } from "@/lib/auth/permissions";
import { getSession } from "@/lib/auth/session";
import { privateImageResponse } from "@/lib/private-images";
import { getAdjustmentPhoto } from "@/lib/stock-adjustments";

/** صورة تسوية: لمن تعتمد التسويات، أو لمن سجّلتها — لا تُخزَّن مؤقتاً خارج المتصفح. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const adj = await getAdjustmentPhoto((await params).id);
  const allowed =
    !!adj?.photoKey && (roleCan(session.user.role, { stock: ["approve"] }) || adj.requestedById === session.user.id);
  if (!allowed || !adj.photoKey) return new Response("Not found", { status: 404 });
  return privateImageResponse(adj.photoKey);
}
