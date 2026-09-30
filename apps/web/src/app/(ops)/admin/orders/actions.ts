"use server";

import { ORDER_STATUSES } from "@ghusn/core";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
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
});

/** كل تغيير حالة يمر من هنا إلى transitionOrder (D-60). الإلغاء للمديرة والمالك. */
export async function transitionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "بيانات غير صحيحة — حدّثي الصفحة." };
  const { id, to, ...opts } = parsed.data;
  const session = await requirePermission(to === "CANCELLED" ? { order: ["cancel"] } : { order: ["update"] });
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
