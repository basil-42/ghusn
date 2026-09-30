"use server";

import { shopMomentForDate } from "@ghusn/core";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { amountField } from "@/lib/suppliers";
import {
  WalletError,
  addAdjustment,
  createTransfer,
  createWallet,
  setOpeningBalance,
  setWalletActive,
  voidAdjustment,
  voidTransfer,
} from "@/lib/wallets";

export type FormState = { error?: string; success?: string };

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || null);

const dateField = z.string().transform((v, ctx) => {
  const at = shopMomentForDate(v);
  if (!at) ctx.addIssue({ code: "custom", message: "التاريخ غير صحيح أو في المستقبل." });
  return at ?? new Date(0);
});

function refresh() {
  revalidatePath("/admin/wallets", "layout");
  revalidatePath("/admin/exchange-rates");
}

async function run(fn: () => Promise<string>): Promise<FormState> {
  try {
    const success = await fn();
    refresh();
    return { success };
  } catch (e) {
    if (e instanceof WalletError) return { error: e.message };
    throw e;
  }
}

export async function transferAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requirePermission({ wallet: ["update"] });
  const parsed = z
    .object({
      fromWalletId: z.string().min(1, "اختر المحفظة الخارجة"),
      toWalletId: z.string().min(1, "اختر المحفظة الواصلة"),
      fromAmount: amountField("المبلغ الخارج"),
      toAmount: amountField("المبلغ الواصل"),
      feeAmount: z
        .union([z.literal("").transform(() => null), amountField("العمولة")])
        .optional()
        .transform((v) => v ?? null),
      at: dateField,
      reference: optionalText(60),
      note: optionalText(200),
      confirmRate: optionalText(30),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  return run(async () => `تم تسجيل التحويل ${await createTransfer(parsed.data, session.user.id)}.`);
}

export async function voidTransferAction(formData: FormData): Promise<void> {
  const session = await requirePermission({ wallet: ["update"] });
  const reason = String(formData.get("reason") ?? "").trim() || "تصحيح";
  await voidTransfer(String(formData.get("id") ?? ""), reason.slice(0, 200), session.user.id);
  refresh();
}

export async function openingAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requirePermission({ wallet: ["update"] });
  const parsed = z
    .object({
      walletId: z.string().min(1),
      amount: z.union([z.literal("0"), amountField("الرصيد")]),
      at: dateField,
      reason: optionalText(200),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  return run(async () => {
    await setOpeningBalance(parsed.data, session.user.id);
    return "تم حفظ الرصيد الافتتاحي.";
  });
}

export async function adjustmentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requirePermission({ wallet: ["update"] });
  const parsed = z
    .object({
      walletId: z.string().min(1),
      direction: z.enum(["IN", "OUT"]),
      amount: amountField("المبلغ"),
      at: dateField,
      reason: z.string().trim().min(3, "اكتب سبب التسوية").max(200),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { direction, amount, ...rest } = parsed.data;
  return run(async () => {
    await addAdjustment({ ...rest, amount: direction === "OUT" ? `-${amount}` : amount }, session.user.id);
    return "تم تسجيل التسوية.";
  });
}

export async function voidAdjustmentAction(formData: FormData): Promise<void> {
  const session = await requirePermission({ wallet: ["update"] });
  const reason = String(formData.get("reason") ?? "").trim() || "تصحيح";
  await voidAdjustment(String(formData.get("id") ?? ""), reason.slice(0, 200), session.user.id);
  refresh();
}

export async function createWalletAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requirePermission({ wallet: ["update"] });
  const parsed = z
    .object({
      name: z.string().trim().min(2, "اسم المحفظة").max(60),
      currencyCode: z.string().length(3, "اختر العملة"),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  return run(async () => {
    await createWallet(parsed.data);
    return "تمت إضافة المحفظة.";
  });
}

export async function toggleWalletAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requirePermission({ wallet: ["update"] });
  const id = String(formData.get("id") ?? "");
  const isActive = formData.get("isActive") === "true";
  return run(async () => {
    await setWalletActive(id, isActive);
    return isActive ? "تم تفعيل المحفظة." : "تم إيقاف المحفظة.";
  });
}
