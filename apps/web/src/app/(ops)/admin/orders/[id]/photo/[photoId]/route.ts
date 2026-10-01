import { prisma } from "@ghusn/db";
import { roleCan } from "@/lib/auth/permissions";
import { getSession } from "@/lib/auth/session";
import { privateImageResponse } from "@/lib/private-images";

/** صورة الهدية في لوحة الطلبات (D-91). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; photoId: string }> }) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!roleCan(session.user.role, { order: ["read"] })) return new Response("Not found", { status: 404 });
  const { id, photoId } = await params;
  const photo = await prisma.giftPhoto.findFirst({ where: { id: photoId, orderId: id }, select: { imageKey: true } });
  if (!photo) return new Response("Not found", { status: 404 });
  return privateImageResponse(photo.imageKey);
}
