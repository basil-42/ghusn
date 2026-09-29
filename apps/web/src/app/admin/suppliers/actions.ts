"use server";

import { shopMomentForDate } from "@ghusn/core";
import { prisma } from "@ghusn/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { COUNTRIES, SupplierError, amountField, createSupplier, recordPayment, voidEntry } from "@/lib/suppliers";

export type FormState = { error?: string; success?: string };

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `النص أطول من ${max} حرفاً`)
    .optional()
    .transform((v) => v || null);

/** تاريخ من النموذج ← لحظة العملية (اليوم = الآن، يوم سابق = آخره بتوقيت الخرطوم). */
const dateField = z.string().transform((v, ctx) => {
  const at = shopMomentForDate(v);
  if (!at) ctx.addIssue({ code: "custom", message: "التاريخ غير صحيح أو في المستقبل." });
  return at ?? new Date(0);
});

const supplierSchema = z.object({
  name: z.string().trim().min(2, "اكتبي اسم المورد").max(120),
  country: z.enum(Object.keys(COUNTRIES) as [string, ...string[]], { message: "اختاري الدولة" }),
  currencyCode: z.string().length(3, "اختاري العملة"),
  phone: optionalText(40),
  notes: optionalText(500),
});

const openingSchema = z.object({
  openingAmount: amountField("الرصيد الافتتاحي"),
  openingDirection: z.enum(["OWE", "CREDIT"]),
  openingDate: dateField,
});

function message(error: unknown): string {
  if (error instanceof SupplierError) return error.message;
  throw error;
}

export async function createSupplierAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requirePermission({ supplier: ["create"] });
  const raw = Object.fromEntries(formData);
  const parsed = supplierSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  let opening = null;
  if (String(raw.openingAmount ?? "").trim()) {
    const o = openingSchema.safeParse(raw);
    if (!o.success) return { error: o.error.issues[0]?.message };
    opening = { amount: o.data.openingAmount, direction: o.data.openingDirection, at: o.data.openingDate };
  }

  let id: string;
  try {
    id = await createSupplier({ ...parsed.data, opening }, session.user.id);
  } catch (error) {
    return { error: message(error) };
  }
  revalidatePath("/admin/suppliers");
  redirect(`/admin/suppliers/${id}`);
}

export async function updateSupplierAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requirePermission({ supplier: ["update"] });
  const parsed = supplierSchema
    .omit({ currencyCode: true })
    .extend({ id: z.string().min(1), isActive: z.literal("on").optional() })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { id, isActive, ...data } = parsed.data;
  await prisma.supplier.update({ where: { id }, data: { ...data, isActive: isActive === "on" } });
  revalidatePath(`/admin/suppliers/${id}`);
  revalidatePath("/admin/suppliers");
  return { success: "تم حفظ بيانات المورد." };
}

const paymentSchema = z.object({
  supplierId: z.string().min(1),
  walletId: z.string().min(1, "اختاري المحفظة"),
  paidAmount: amountField("المبلغ المدفوع"),
  supplierAmount: z.string().optional(),
  date: dateField,
  reference: optionalText(80),
  note: optionalText(300),
});

export async function recordPaymentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requirePermission({ supplierPayment: ["create"] });
  const parsed = paymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { supplierId, walletId, paidAmount, date, reference, note } = parsed.data;

  let supplierAmount: string | null = null;
  if (parsed.data.supplierAmount?.trim()) {
    const s = amountField("المبلغ المخصوم من حساب المورد").safeParse(parsed.data.supplierAmount);
    if (!s.success) return { error: s.error.issues[0]?.message };
    supplierAmount = s.data;
  }

  try {
    await recordPayment(
      { supplierId, walletId, paidAmount, supplierAmount, at: date, reference, note },
      session.user.id,
    );
  } catch (error) {
    return { error: message(error) };
  }
  revalidatePath(`/admin/suppliers/${supplierId}`);
  revalidatePath("/admin/suppliers");
  return { success: "تم تسجيل الدفعة." };
}

export async function voidEntryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requirePermission({ supplierPayment: ["void"] });
  const parsed = z
    .object({
      supplierId: z.string().min(1),
      entryId: z.string().min(1),
      reason: z.string().trim().min(3, "اكتبي سبب الإلغاء").max(200),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  try {
    await voidEntry(parsed.data.supplierId, parsed.data.entryId, parsed.data.reason, session.user.id);
  } catch (error) {
    return { error: message(error) };
  }
  revalidatePath(`/admin/suppliers/${parsed.data.supplierId}`);
  revalidatePath("/admin/suppliers");
  return { success: "تم الإلغاء." };
}
