import { NextResponse } from "next/server";
import { apiSession } from "@/lib/auth/api";
import { notificationSummary } from "@/lib/notifications";

/** استطلاع الجرس (D-109): العدّاد وآخر الإشعارات للمستخدمة الحالية فقط. */
export async function GET() {
  const auth = await apiSession();
  if ("error" in auth) return auth.error;
  const summary = await notificationSummary(auth.session.user.id, auth.session.user.role);
  return NextResponse.json(summary, { headers: { "Cache-Control": "no-store" } });
}
