"use server";

import { CUSTOMER_SEGMENT_LABELS, dec, normalizePhone, toLatinDigits } from "@ghusn/core";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { customerCardByPhone } from "@/lib/customers";
import { saleSchema } from "@/lib/sale-schema";
import { ApprovalRequired, SaleError, createSale, findPosItems } from "@/lib/sales";
import { ReturnError, cashOutCredit, createReturn, findSaleForReturn } from "@/lib/returns";
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

export type CustomerCard = { name: string | null; badge: string | null; purchases: number; lastNote: string | null };

/** عند كتابة رقم مسجّل في نقطة البيع: اسمه وتصنيفه وآخر ملاحظة (D-116). */
export async function lookupCustomerAction(phoneInput: string): Promise<CustomerCard | null> {
  await requirePermission({ pos: ["sell"] });
  const phone = normalizePhone(String(phoneInput).slice(0, 20), "SD");
  if (!phone) return null;
  const card = await customerCardByPhone(phone);
  return card
    ? {
        name: card.name,
        badge: card.segment ? CUSTOMER_SEGMENT_LABELS[card.segment] : null,
        purchases: card.purchases,
        lastNote: card.lastNote,
      }
    : null;
}

export async function findItemsAction(query: string) {
  await requirePermission({ pos: ["sell"] });
  return findPosItems(String(query).slice(0, 80));
}

export type SaleResult = { ok: true; id: string } | { error: string } | { approvalRequired: string[] };

export async function createSaleAction(input: unknown): Promise<SaleResult> {
  const session = await requirePermission({ pos: ["sell"] });
  const parsed = saleSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "بيانات غير صحيحة" };
  try {
    const sale = await createSale(
      { ...parsed.data, approval: parsed.data.approval ?? null, creditReturnId: parsed.data.creditReturnId ?? null },
      session.user.id,
    );
    revalidatePath("/pos/shift");
    return { ok: true, id: sale.id };
  } catch (e) {
    if (e instanceof ApprovalRequired) return { approvalRequired: e.reasons };
    if (e instanceof SaleError) return { error: e.message };
    throw e;
  }
}

// ---------- المرتجعات (D-81) ----------

export async function findSaleForReturnAction(number: string) {
  await requirePermission({ pos: ["sell"] });
  return findSaleForReturn(String(number).slice(0, 30));
}

const returnSchema = z.object({
  id: z.string().regex(/^[a-z0-9]{20,32}$/),
  saleId: z.string().min(1),
  lines: z
    .array(
      z.object({
        saleLineId: z.string().min(1),
        qty: z
          .string()
          .transform(clean)
          .refine((v) => /^\d{1,6}(\.\d{1,3})?$/.test(v), "الكمية غير صحيحة"),
        damagedQty: z
          .string()
          .transform(clean)
          .refine((v) => /^\d{1,6}(\.\d{1,3})?$/.test(v), "التالف غير صحيح"),
      }),
    )
    .min(1)
    .max(100),
  mode: z.enum(["REFUND", "EXCHANGE"]),
  refundMethod: z.enum(["CASH", "BANKAK"]),
  reference: z
    .string()
    .trim()
    .max(60)
    .nullish()
    .transform((v) => v || null),
  reason: z
    .string()
    .trim()
    .max(200)
    .nullish()
    .transform((v) => v || null),
  approval: z.object({ phone: z.string().max(20), password: z.string().max(200) }).nullish(),
});

export async function createReturnAction(input: unknown): Promise<SaleResult> {
  const session = await requirePermission({ pos: ["sell"] });
  const parsed = returnSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "بيانات غير صحيحة" };
  try {
    const r = await createReturn({ ...parsed.data, approval: parsed.data.approval ?? null }, session.user.id);
    revalidatePath("/pos/shift");
    return { ok: true, id: r.id };
  } catch (e) {
    if (e instanceof ApprovalRequired) return { approvalRequired: e.reasons };
    if (e instanceof ReturnError || e instanceof SaleError) return { error: e.message };
    throw e;
  }
}

export async function cashOutCreditAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requirePermission({ pos: ["sell"] });
  const id = String(formData.get("returnId") ?? "");
  try {
    await cashOutCredit(id, session.user.id);
  } catch (e) {
    if (e instanceof ReturnError || e instanceof SaleError) return { error: e.message };
    throw e;
  }
  revalidatePath(`/pos/returns/${id}`);
  return { success: "تم رد الرصيد نقداً." };
}
