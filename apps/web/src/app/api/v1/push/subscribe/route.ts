import { NextResponse } from "next/server";
import { z } from "zod";
import { apiSession } from "@/lib/auth/api";
import { pushConfig, removeSubscription, saveSubscription, subscriptionSchema } from "@/lib/push";

/** تفعيل إشعارات الجوال لهذا الجهاز (D-109). */
export async function POST(request: Request) {
  const auth = await apiSession();
  if ("error" in auth) return auth.error;
  if (!pushConfig()) return NextResponse.json({ error: "PUSH_DISABLED" }, { status: 503 });
  const parsed = subscriptionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID" }, { status: 400 });
  await saveSubscription(auth.session.user.id, parsed.data);
  return NextResponse.json({ ok: true });
}

const removal = z.union([z.object({ endpoint: z.url().max(1000) }), z.object({ id: z.string().min(1).max(40) })]);

/** إيقافها لجهاز من أجهزة المستخدمة الحالية فقط. */
export async function DELETE(request: Request) {
  const auth = await apiSession();
  if ("error" in auth) return auth.error;
  const parsed = removal.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID" }, { status: 400 });
  await removeSubscription(auth.session.user.id, parsed.data);
  return NextResponse.json({ ok: true });
}
