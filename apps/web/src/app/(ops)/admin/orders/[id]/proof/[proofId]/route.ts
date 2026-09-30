import { prisma } from "@ghusn/db";
import { roleCan } from "@/lib/auth/permissions";
import { getSession } from "@/lib/auth/session";
import { privateImageResponse } from "@/lib/private-images";

/** صورة إشعار بنكك (D-90): لمن يراجع الدفع فقط — لا تُخزَّن مؤقتاً خارج المتصفح. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; proofId: string }> }) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!roleCan(session.user.role, { order: ["payment"] })) return new Response("Not found", { status: 404 });
  const { id, proofId } = await params;
  const proof = await prisma.paymentProof.findFirst({
    where: { id: proofId, orderId: id },
    select: { imageKey: true },
  });
  if (!proof) return new Response("Not found", { status: 404 });
  return privateImageResponse(proof.imageKey);
}
