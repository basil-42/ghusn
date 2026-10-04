import { z } from "zod";
import { clientIp, SlidingWindowLimiter } from "@/lib/rate-limit";
import { searchSuggestions } from "@/lib/storefront";

// كل طلب يُحسب من الخادم الآن (أسعار وتوفر حالية)
export const dynamic = "force-dynamic";

const query = z.object({
  q: z.string().trim().min(2).max(80),
  locale: z.enum(["ar", "en"]).default("ar"),
});

/** حد سخي: الكتابة السريعة ترسل طلباً كل ربع ثانية تقريباً. */
const limiter = new SlidingWindowLimiter(60, 60 * 1000);

/**
 * اقتراحات البحث أثناء الكتابة (D-100) — بيانات عامة فقط (اسم، سعر بالجنيه، صورة مصغرة)، فتُخزَّن
 * مؤقتاً لثوانٍ في المتصفح وCloudflare.
 */
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
  const data = await searchSuggestions(parsed.data.locale, parsed.data.q);
  return Response.json(data, { headers: { "Cache-Control": "public, max-age=30, s-maxage=60" } });
}
