"use server";

import { shopMomentForDate } from "@ghusn/core";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { ExpenseError, createExpense, voidExpense } from "@/lib/expenses";
import { amountField } from "@/lib/suppliers";

export type FormState = { error?: string; success?: string };

const schema = z.object({
  categoryId: z.string().min(1, "اختاري القسم"),
  amount: amountField("المبلغ"),
  walletId: z.string().optional(),
  spentAt: z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (!v) return new Date();
      const at = shopMomentForDate(v);
      if (!at) ctx.addIssue({ code: "custom", message: "التاريخ غير صحيح أو في المستقبل." });
      return at ?? new Date(0);
    }),
  note: z
    .string()
    .trim()
    .max(300)
    .optional()
    .transform((v) => v || null),
});

export async function createExpenseAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requirePermission({ expense: ["create"] });
  const parsed = schema.safeParse({
    categoryId: formData.get("categoryId") ?? "",
    amount: formData.get("amount") ?? "",
    walletId: formData.get("walletId") ?? undefined,
    spentAt: formData.get("spentAt") ?? undefined,
    note: formData.get("note") ?? undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const file = formData.get("attachment");
  try {
    await createExpense(
      {
        ...parsed.data,
        walletId: parsed.data.walletId || null,
        attachment: file instanceof File && file.size > 0 ? file : null,
      },
      { id: session.user.id, role: session.user.role ?? "" },
    );
  } catch (e) {
    if (e instanceof ExpenseError) return { error: e.message };
    throw e;
  }
  revalidatePath("/admin/expenses");
  revalidatePath("/admin/reports");
  revalidatePath("/pos/shift");
  return { success: "تم تسجيل المصروف." };
}

export async function voidExpenseAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requirePermission({ expense: ["void"] });
  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < 3) return { error: "اكتبي سبب الإلغاء." };
  try {
    await voidExpense(String(formData.get("id") ?? ""), reason.slice(0, 200), session.user.id);
  } catch (e) {
    if (e instanceof ExpenseError) return { error: e.message };
    throw e;
  }
  revalidatePath("/admin/expenses");
  revalidatePath("/admin/reports");
  return { success: "تم الإلغاء." };
}
