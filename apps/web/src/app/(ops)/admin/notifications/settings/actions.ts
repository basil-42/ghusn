"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { eventsForRole } from "@/lib/notifications";
import { prefsSchema, savePushPrefs } from "@/lib/push";

export type PrefsState = { error?: string; success?: string };

export async function savePrefsAction(_prev: PrefsState, form: FormData): Promise<PrefsState> {
  const session = await requireSession();
  // أحداث دورها فقط — لا تُحفظ أنواع لا تصلها أصلاً
  const allowed = new Set(eventsForRole(session.user.role).map((e) => e.type));
  const parsed = prefsSchema.safeParse({
    pushTypes: form.getAll("pushTypes").filter((t) => allowed.has(t as never)),
    quietEnabled: form.get("quietEnabled") === "on",
    quietStart: String(form.get("quietStart") ?? ""),
    quietEnd: String(form.get("quietEnd") ?? ""),
    urgentInQuiet: form.get("urgentInQuiet") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "البيانات غير صحيحة." };
  await savePushPrefs(session.user.id, parsed.data);
  revalidatePath("/admin/notifications/settings");
  return { success: "حُفظت التفضيلات." };
}
