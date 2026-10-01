"use server";

import { ORDER_STATUSES } from "@ghusn/core";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { OrderActionError, transitionOrder, uploadGiftPhoto } from "@/lib/orders";

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

/** صورة الهدية الجاهزة (D-13، D-91): تُرسل للعميل في صفحة المتابعة. */
export async function uploadPhotoAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requirePermission({ order: ["update"] });
  const id = String(formData.get("id") ?? "");
  const image = formData.get("image");
  if (!id || !(image instanceof File) || image.size === 0) return { error: "اختاري صورة الهدية." };
  try {
    await uploadGiftPhoto(id, image, session.user.id);
  } catch (e) {
    if (e instanceof OrderActionError) return { error: e.message };
    throw e;
  }
  revalidatePath("/admin/orders", "layout");
  return { success: "أُرسلت الصورة للعميل." };
}
