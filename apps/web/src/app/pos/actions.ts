"use server";

import { dec, toLatinDigits } from "@ghusn/core";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { ApprovalRequired, SaleError, createSale, findPosItems } from "@/lib/sales";
import { ShiftError, closeShift, openShift } from "@/lib/shifts";

export type FormState = { error?: string; success?: string };

const clean = (v: string) =>
  toLatinDigits(v)
    .replace(/[,\s٬]/g, "")
    .replace("٫", ".");
const whole = (label: string) =>
  z
    .string()
    .transform(clean)
    .refine((v) => /^\d{1,12}$/.test(v), `${label}: رقم صحيح بالجنيه`);

export async function openShiftAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requirePermission({ pos: ["sell"] });
  const parsed = whole("العهدة الافتتاحية").safeParse(String(formData.get("openingCash") ?? ""));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  try {
    await openShift(session.user.id, dec(parsed.data).toFixed(2));
  } catch (e) {
    if (e instanceof ShiftError) return { error: e.message };
    throw e;
  }
  revalidatePath("/pos");
  redirect("/pos");
}

export async function closeShiftAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requirePermission({ pos: ["sell"] });
  const counted = whole("النقد المعدود").safeParse(String(formData.get("countedCash") ?? ""));
  if (!counted.success) return { error: counted.error.issues[0]?.message };
  const note =
    String(formData.get("note") ?? "")
      .trim()
      .slice(0, 300) || null;
  try {
    await closeShift(String(formData.get("shiftId") ?? ""), session.user.id, dec(counted.data).toFixed(2), note);
  } catch (e) {
    if (e instanceof ShiftError) return { error: e.message };
    throw e;
  }
  revalidatePath("/pos");
  redirect(`/pos/shift?closed=${String(formData.get("shiftId"))}`);
}

export async function findItemsAction(query: string) {
  await requirePermission({ pos: ["sell"] });
  return findPosItems(String(query).slice(0, 80));
}

const saleSchema = z.object({
  id: z.string().regex(/^[a-z0-9]{20,32}$/),
  lines: z
    .array(
      z.object({
        variantId: z.string().min(1),
        qty: z
          .string()
          .transform(clean)
          .refine((v) => /^\d{1,6}(\.\d{1,3})?$/.test(v) && dec(v).gt(0), "الكمية غير صحيحة"),
        lineDiscountSdg: whole("خصم الصنف"),
      }),
    )
    .min(1, "الفاتورة فارغة")
    .max(100),
  invoiceDiscountSdg: whole("خصم الفاتورة"),
  payments: z
    .array(
      z.object({
        method: z.enum(["CASH", "BANKAK"]),
        amountSdg: whole("المبلغ"),
        reference: z
          .string()
          .trim()
          .max(60)
          .nullish()
          .transform((v) => v || null),
      }),
    )
    .max(4),
  cashTenderedSdg: z
    .string()
    .transform(clean)
    .nullish()
    .transform((v) => v || null)
    .refine((v) => v === null || /^\d{1,12}$/.test(v), "المبلغ المستلم رقم صحيح"),
  customerPhone: z
    .string()
    .trim()
    .max(20)
    .nullish()
    .transform((v) => v || null),
  customerName: z
    .string()
    .trim()
    .max(80)
    .nullish()
    .transform((v) => v || null),
  approval: z.object({ phone: z.string().max(20), password: z.string().max(200) }).nullish(),
});

export type SaleResult = { ok: true; id: string } | { error: string } | { approvalRequired: string[] };

export async function createSaleAction(input: unknown): Promise<SaleResult> {
  const session = await requirePermission({ pos: ["sell"] });
  const parsed = saleSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "بيانات غير صحيحة" };
  try {
    const sale = await createSale({ ...parsed.data, approval: parsed.data.approval ?? null }, session.user.id);
    revalidatePath("/pos/shift");
    return { ok: true, id: sale.id };
  } catch (e) {
    if (e instanceof ApprovalRequired) return { approvalRequired: e.reasons };
    if (e instanceof SaleError) return { error: e.message };
    throw e;
  }
}
