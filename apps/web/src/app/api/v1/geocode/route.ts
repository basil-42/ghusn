import { z } from "zod";
import { geocode } from "@/lib/geocode";
import { clientIp, SlidingWindowLimiter } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const query = z.object({
  q: z.string().trim().min(2).max(100),
  locale: z.enum(["ar", "en"]).default("ar"),
});

/** البحث يكون بالضغط لا أثناء الكتابة، فالحد صغير. */
const limiter = new SlidingWindowLimiter(20, 60 * 1000);

/** بحث الأحياء والمعالم لمنتقي موقع التوصيل (D-164). */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = query.safeParse({
    q: url.searchParams.get("q") ?? "",
    locale: url.searchParams.get("locale") ?? undefined,
  });
  if (!parsed.success) return Response.json({ error: "INVALID" }, { status: 400 });
  const ip = clientIp(request.headers);
  if (limiter.isLimited(ip)) return Response.json({ error: "RATE_LIMIT" }, { status: 429 });
  limiter.hit(ip);
  try {
    const results = await geocode(parsed.data.q, parsed.data.locale);
    return Response.json({ results }, { headers: { "Cache-Control": "public, max-age=3600" } });
  } catch {
    return Response.json({ error: "UNAVAILABLE" }, { status: 502 });
  }
}
