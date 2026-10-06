"use server";

import { ORDER_STATUSES } from "@ghusn/core";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { markOrderOpened } from "@/lib/notifications";
import { logOrderMessage } from "@/lib/order-messages";
import { OrderActionError, transitionOrder } from "@/lib/orders";

export type FormState = { error?: string; success?: string };

const schema = z.object({
  id: z.string().min(1),
  to: z.enum(ORDER_STATUSES),
  reason: z
    .string()
    .trim()
    .max(300)
    .optional()
    .transform((v) => v || null),
  courierRef: z
    .string()
    .trim()
    .max(60)
    .optional()
    .transform((v) => v || null),
  channel: z
    .enum(["CASH", "BANKAK"])
    .optional()
    .transform((v) => v ?? null),
  reference: z
    .string()
    .trim()
    .max(60)
    .optional()
    .transform((v) => v || null),
  proofId: z
    .string()
    .max(40)
    .optional()
    .transform((v) => v || null),
});

/**
 * كل تغيير حالة يمر من هنا إلى transitionOrder (D-60). الإلغاء للمديرة والمالك، ومراجعة إشعار
 * بنكك (قبول/رفض) لمن يملك «order:payment» (D-90).
 */
export async function transitionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "بيانات غير صحيحة — حدّثي الصفحة." };
  const { id, to, ...opts } = parsed.data;
  const session = await requirePermission(
    to === "CANCELLED" ? { order: ["cancel"] } : opts.proofId ? { order: ["payment"] } : { order: ["update"] },
  );
  try {
    await transitionOrder(id, to, session.user.id, opts);
  } catch (e) {
    if (e instanceof OrderActionError) return { error: e.message };
    throw e;
  }
  revalidatePath("/admin/orders", "layout");
  revalidatePath("/admin");
  return { success: "تم." };
}

/** فتح صفحة الطلب (D-109): يوقف تكرار التنبيه والتصعيد، ويجعل إشعاراته مقروءة لمن فتحته. */
export async function markOrderOpenedAction(orderId: string): Promise<void> {
  const session = await requirePermission({ order: ["read"] });
  const id = z.string().min(1).max(40).safeParse(orderId);
  if (!id.success) return;
  await markOrderOpened(id.data, session.user.id).catch(() => {});
}

/** تسجيل فتح رسالة واتساب جاهزة (D-113) — يظهر «أُرسلت بواسطة…» للأخريات. */
export async function logOrderMessageAction(orderId: string, key: string): Promise<void> {
  const session = await requirePermission({ order: ["read"] });
  await logOrderMessage(orderId.slice(0, 40), key.slice(0, 40), session.user.id);
  revalidatePath(`/admin/orders/${orderId}`);
}
