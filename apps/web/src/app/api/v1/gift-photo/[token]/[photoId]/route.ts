import { prisma } from "@ghusn/db";
import { privateImageResponse } from "@/lib/private-images";

/** صورة الهدية للعميل برابط طلبه السرّي (D-13) — لا تُخزَّن مؤقتاً ولا تُفهرس. */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string; photoId: string }> }) {
  const { token, photoId } = await params;
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(token)) return new Response("Not found", { status: 404 });
  const photo = await prisma.giftPhoto.findFirst({
    // صورة طُلب تعديلها لا تُعرض؛ والتي لم يُقرَّر فيها بعد (null) تُعرض — NOT وحده يستبعد null في SQL
    where: {
      id: photoId,
      order: { trackingToken: token },
      OR: [{ decision: null }, { decision: { not: "CHANGES" } }],
    },
    select: { imageKey: true },
  });
  if (!photo) return new Response("Not found", { status: 404 });
  const res = await privateImageResponse(photo.imageKey);
  res.headers.set("X-Robots-Tag", "noindex");
  return res;
}
