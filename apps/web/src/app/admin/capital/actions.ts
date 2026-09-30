"use server";

import { shopMomentForDate } from "@ghusn/core";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { CapitalError, addContribution, voidContribution } from "@/lib/capital";
import { amountField } from "@/lib/suppliers";

export type FormState = { error?: string; success?: string };

export async function addContributionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requirePermission({ capital: ["update"] });
  const parsed = z
    .object({
      partnerName: z.string().trim().min(2, "اسم الشريك").max(60),
      amount: amountField("المبلغ"),
      currencyCode: z.string().min(3).max(3),
      contributedAt: z.string().transform((v, ctx) => {
        const at = shopMomentForDate(v);
        if (!at) ctx.addIssue({ code: "custom", message: "التاريخ غير صحيح أو في المستقبل." });
        return at ?? new Date(0);
      }),
      note: z
        .string()
        .trim()
        .max(200)
        .optional()
        .transform((v) => v || null),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  try {
    await addContribution(parsed.data, session.user.id);
  } catch (e) {
    if (e instanceof CapitalError) return { error: e.message };
    throw e;
  }
  revalidatePath("/admin/capital");
  revalidatePath("/admin/reports");
  return { success: "تم تسجيل التمويل." };
}

export async function voidContributionAction(formData: FormData): Promise<void> {
  await requirePermission({ capital: ["update"] });
  const reason = String(formData.get("reason") ?? "").trim() || "تصحيح";
  await voidContribution(String(formData.get("id") ?? ""), reason.slice(0, 200));
  revalidatePath("/admin/capital");
  revalidatePath("/admin/reports");
}
