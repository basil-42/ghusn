import { NextResponse } from "next/server";
import { z } from "zod";
import { apiSession } from "@/lib/auth/api";
import { globalSearch } from "@/lib/global-search";
import { SlidingWindowLimiter } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const query = z.object({ q: z.string().trim().min(2).max(80) });

/** الكتابة السريعة ترسل طلباً كل ربع ثانية تقريباً — الحد لكل مستخدمة. */
const limiter = new SlidingWindowLimiter(120, 60 * 1000);

/** البحث الشامل في الإدارة (D-121): النتائج حسب صلاحية المستخدمة الحالية — لا تُخزَّن مؤقتاً. */
export async function GET(request: Request) {
  const auth = await apiSession();
  if ("error" in auth) return auth.error;
  const parsed = query.safeParse({ q: new URL(request.url).searchParams.get("q") ?? "" });
  if (!parsed.success) return NextResponse.json({ error: "INVALID" }, { status: 400 });
  const key = auth.session.user.id;
  if (limiter.isLimited(key)) return NextResponse.json({ error: "RATE_LIMIT" }, { status: 429 });
  limiter.hit(key);
  const groups = await globalSearch(parsed.data.q, auth.session.user.role);
  return NextResponse.json({ groups }, { headers: { "Cache-Control": "no-store" } });
}
