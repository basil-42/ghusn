"use server";

import { ORDER_STATUSES } from "@ghusn/core";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { markOrderOpened } from "@/lib/notifications";
import { logOrderMessage, orderMessages } from "@/lib/order-messages";
import { BULK_MAX, bulkTransition, OrderActionError, transitionOrder, type BulkResult } from "@/lib/orders";

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

/** رسالة النجاح بعد كل انتقال (D-140) — تقول ما حدث فعلاً. */
const DONE: Partial<Record<(typeof ORDER_STATUSES)[number], string>> = {
  CONFIRMED: "تأكّد الطلب.",
  AWAITING_PAYMENT: "رُفض الإشعار وطُلب من العميل إشعار صحيح.",
  PREPARING: "بدأ التجهيز وخُصمت الأصناف من المخزون.",
  READY: "الطلب جاهز.",
  OUT_FOR_DELIVERY: "سُلِّم الطلب لشركة التوصيل.",
  DELIVERED: "تم تسليم الطلب.",
  CANCELLED: "أُلغي الطلب.",
};

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
  return {
    success: to === "CONFIRMED" && opts.proofId ? "اعتُمد الدفع وتأكّد الطلب." : (DONE[to] ?? "تم تحديث الطلب."),
  };
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

const bulkSchema = z.object({
  ids: z.array(z.string().min(1).max(40)).min(1).max(BULK_MAX),
  to: z.enum(["CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED"]),
  courierRef: z
    .string()
    .trim()
    .max(60)
    .optional()
    .transform((v) => v || null),
});

export interface BulkMessage {
  orderId: string;
  number: string;
  customerName: string;
  label: string;
  key: string;
  href: string;
}

export type BulkState = { results?: BulkResult[]; messages?: BulkMessage[]; error?: string };

/**
 * إجراء جماعي على الطلبات المحددة (D-124) — نفس صلاحية الإجراء الفردي («order:update»؛ لا إلغاء ولا مراجعة
 * دفع جماعياً). بعده: رسالة واتساب المقترحة لكل طلب نجح ولم تُرسل له بعد، لتفتحها الموظفة واحدة تلو الأخرى.
 */
export async function bulkTransitionAction(input: {
  ids: string[];
  to: string;
  courierRef?: string;
}): Promise<BulkState> {
  const session = await requirePermission({ order: ["update"] });
  const parsed = bulkSchema.safeParse(input);
  if (!parsed.success) return { error: "اختيار غير صحيح — حدّثي الصفحة." };
  const { ids, to, courierRef } = parsed.data;
  const results = await bulkTransition(ids, to, session.user.id, { courierRef });
  const messages: BulkMessage[] = [];
  for (const r of results.filter((x) => x.ok)) {
    const m = await orderMessages(r.id);
    if (m?.primary && !m.primary.lastSent) {
      messages.push({
        orderId: r.id,
        number: r.number,
        customerName: m.customerName,
        label: m.primary.label,
        key: m.primary.key,
        href: m.primary.href,
      });
    }
  }
  revalidatePath("/admin/orders", "layout");
  revalidatePath("/admin");
  return { results, messages };
}
