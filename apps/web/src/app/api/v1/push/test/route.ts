import { NextResponse } from "next/server";
import { apiSession } from "@/lib/auth/api";
import { SlidingWindowLimiter } from "@/lib/rate-limit";
import { sendTestPush } from "@/lib/push";

const limiter = new SlidingWindowLimiter(5, 60_000);

/** «إرسال إشعار تجريبي» لأجهزة المستخدمة الحالية. */
export async function POST() {
  const auth = await apiSession();
  if ("error" in auth) return auth.error;
  const key = auth.session.user.id;
  if (limiter.isLimited(key)) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  limiter.hit(key);
  return NextResponse.json(await sendTestPush(auth.session.user.id));
}
