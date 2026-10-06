"use server";

import { MANUAL_ADJUSTMENT_REASONS, toLatinDigits } from "@ghusn/core";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { AdjustmentError, approveAdjustment, createAdjustment, rejectAdjustment } from "@/lib/stock-adjustments";

export type FormState = { error?: string; success?: string };

const numeric = (maxDp: number) =>
  z
    .string()
    .transform((v) =>
      toLatinDigits(v)
        .replace(/[,\s٬]/g, "")
        .replace("٫", "."),
    )
    .refine((v) => new RegExp(`^\\d{1,9}(\\.\\d{1,${maxDp}})?$`).test(v), "اكتبي رقماً صحيحاً.");

const optionalCost = z
  .string()
  .optional()
  .transform((v) =>
    v
      ? toLatinDigits(v)
          .replace(/[,\s٬]/g, "")
          .replace("٫", ".")
      : "",
  )
  .refine((v) => v === "" || /^\d{1,7}(\.\d{1,6})?$/.test(v), "تكلفة الوحدة بالدولار رقم (حتى 6 خانات عشرية).")
  .transform((v) => v || null);

const createSchema = z.object({
  variantId: z.string().min(1, "اختاري الصنف"),
  reason: z.enum(MANUAL_ADJUSTMENT_REASONS, { message: "اختاري السبب" }),
  qty: numeric(3),
  note: z
    .string()
    .trim()
    .max(300)
    .optional()
    .transform((v) => v || null),
  unitCostUsd: optionalCost,
});

function refresh() {
  revalidatePath("/admin/stock");
  revalidatePath("/admin/stock/adjustments");
  revalidatePath("/admin/reports");
  revalidatePath("/admin");
}

export async function createAdjustmentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requirePermission({ stock: ["adjust"] });
  const parsed = createSchema.safeParse({
    variantId: formData.get("variantId") ?? "",
    reason: formData.get("reason") ?? "",
    qty: formData.get("qty") ?? "",
    note: formData.get("note") ?? undefined,
    unitCostUsd: formData.get("unitCostUsd") ?? undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const photo = formData.get("photo");
  let result;
  try {
    result = await createAdjustment(
      { ...parsed.data, photo: photo instanceof File && photo.size > 0 ? photo : null },
      { id: session.user.id, role: session.user.role, name: session.user.name },
    );
  } catch (e) {
    if (e instanceof AdjustmentError) return { error: e.message };
    throw e;
  }
  refresh();
  return {
    success: result.approved
      ? `اعتُمدت التسوية ${result.number} وتعدّل الرصيد.`
      : `أُرسلت التسوية ${result.number} للاعتماد — لا يتغير الرصيد حتى تُعتمد.`,
  };
}

export async function approveAdjustmentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requirePermission({ stock: ["approve"] });
  const cost = optionalCost.safeParse(formData.get("unitCostUsd") ?? undefined);
  if (!cost.success) return { error: cost.error.issues[0]?.message };
  try {
    await approveAdjustment(
      String(formData.get("id") ?? ""),
      { id: session.user.id, role: session.user.role, name: session.user.name },
      cost.data,
    );
  } catch (e) {
    if (e instanceof AdjustmentError) return { error: e.message };
    throw e;
  }
  refresh();
  return { success: "اعتُمدت." };
}

export async function rejectAdjustmentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requirePermission({ stock: ["approve"] });
  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < 3) return { error: "اكتبي سبب الرفض." };
  try {
    await rejectAdjustment(String(formData.get("id") ?? ""), reason.slice(0, 200), {
      id: session.user.id,
      role: session.user.role,
      name: session.user.name,
    });
  } catch (e) {
    if (e instanceof AdjustmentError) return { error: e.message };
    throw e;
  }
  refresh();
  return { success: "رُفضت." };
}
