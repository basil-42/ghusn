import { NextResponse } from "next/server";
import { z } from "zod";
import { apiSession } from "@/lib/auth/api";
import { markNotificationsRead } from "@/lib/notifications";

const body = z.union([
  z.object({ all: z.literal(true) }),
  z.object({ ids: z.array(z.string().min(1).max(40)).min(1).max(100) }),
]);

/** تحديد إشعارات المستخدمة الحالية كمقروءة — لا تمسّ إشعارات غيرها. */
export async function POST(request: Request) {
  const auth = await apiSession();
  if ("error" in auth) return auth.error;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID" }, { status: 400 });
  await markNotificationsRead(auth.session.user.id, "all" in parsed.data ? "all" : parsed.data.ids);
  return NextResponse.json({ ok: true });
}
