"use server";

import { SHIPMENT_STATUSES, dec, shopMomentForDate, toLatinDigits } from "@ghusn/core";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import {
  COST_LABELS,
  ShipmentError,
  addShipmentCost,
  createShipment,
  saveShipmentLines,
  searchVariants,
  transitionShipment,
  updateShipmentDetails,
  voidShipmentCost,
} from "@/lib/shipments";
import { applyImport, previewImport, type ImportPreview } from "@/lib/shipment-import";
import { receiveShipment } from "@/lib/stock";
import { COUNTRIES, amountField } from "@/lib/suppliers";

export type FormState = { error?: string; success?: string };

const clean = (v: string) =>
  toLatinDigits(v)
    .replace(/[,\s٬]/g, "")
    .replace("٫", ".");

function fail(error: unknown): FormState {
  if (error instanceof ShipmentError) return { error: error.message };
  throw error;
}

function refresh(id: string) {
  revalidatePath(`/admin/shipments/${id}`);
  revalidatePath("/admin/shipments");
  revalidatePath("/admin/suppliers", "layout");
}

export async function createShipmentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requirePermission({ shipment: ["create"] });
  const supplierId = String(formData.get("supplierId") ?? "");
  if (!supplierId) return { error: "اختاري المورد." };
  let id: string;
  try {
    id = await createShipment(supplierId, session.user.id);
  } catch (error) {
    return fail(error);
  }
  revalidatePath("/admin/shipments");
  redirect(`/admin/shipments/${id}`);
}

const optionalDate = z
  .string()
  .optional()
  .transform((v, ctx) => {
    if (!v) return null;
    const at = shopMomentForDate(v, new Date(8.64e15)); // يسمح بالمستقبل (الاستحقاق)
    if (!at) ctx.addIssue({ code: "custom", message: "تاريخ غير صحيح." });
    return at;
  });

const detailsSchema = z.object({
  id: z.string().min(1),
  purchasedAt: z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (!v) return null;
      const at = shopMomentForDate(v);
      if (!at) ctx.addIssue({ code: "custom", message: "تاريخ الشراء غير صحيح أو في المستقبل." });
      return at;
    }),
  dueDate: optionalDate,
  origin: z.enum(Object.keys(COUNTRIES) as [string, ...string[]]),
  notes: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => v || null),
});

export async function updateDetailsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requirePermission({ shipment: ["update"] });
  const parsed = detailsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { id, ...input } = parsed.data;
  try {
    await updateShipmentDetails(id, input);
  } catch (error) {
    return fail(error);
  }
  refresh(id);
  return { success: "تم الحفظ." };
}

const lineSchema = z.object({
  variantId: z.string().min(1),
  qty: z
    .string()
    .transform(clean)
    .refine((v) => /^\d{1,9}(\.\d{1,3})?$/.test(v), "الكمية رقم (حتى 3 خانات عشرية)"),
  unitPrice: z
    .string()
    .transform(clean)
    .refine((v) => /^\d{1,13}(\.\d{1,4})?$/.test(v), "سعر الوحدة رقم (حتى 4 خانات عشرية)"),
});

export async function saveLinesAction(id: string, _prev: FormState, lines: unknown): Promise<FormState> {
  const session = await requirePermission({ shipment: ["update"] });
  const parsed = z.array(lineSchema).max(200).safeParse(lines);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  try {
    await saveShipmentLines(id, parsed.data, session.user.id);
  } catch (error) {
    return fail(error);
  }
  refresh(id);
  return { success: "تم حفظ البنود." };
}

export async function searchVariantsAction(query: string) {
  await requirePermission({ shipment: ["update"] });
  return searchVariants(String(query).slice(0, 80));
}

export async function transitionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requirePermission({ shipment: ["update"] });
  const id = String(formData.get("id") ?? "");
  const to = z.enum(SHIPMENT_STATUSES).safeParse(formData.get("to"));
  if (!to.success) return { error: "حالة غير معروفة." };
  try {
    await transitionShipment(id, to.data, session.user.id);
  } catch (error) {
    return fail(error);
  }
  refresh(id);
  return { success: "تم تحديث الحالة." };
}

const costSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(Object.keys(COST_LABELS) as [keyof typeof COST_LABELS, ...(keyof typeof COST_LABELS)[]]),
  amount: amountField("المبلغ"),
  walletId: z.string().min(1, "اختاري المحفظة"),
  paidAt: z.string().transform((v, ctx) => {
    const at = shopMomentForDate(v);
    if (!at) ctx.addIssue({ code: "custom", message: "تاريخ الدفع غير صحيح أو في المستقبل." });
    return at ?? new Date(0);
  }),
  note: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => v || null),
});

export async function addCostAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requirePermission({ shipmentCost: ["create"] });
  const parsed = costSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { id, ...input } = parsed.data;
  if (dec(input.amount).lte(0)) return { error: "المبلغ يجب أن يكون أكبر من صفر." };
  try {
    await addShipmentCost(id, input, session.user.id);
  } catch (error) {
    return fail(error);
  }
  refresh(id);
  return { success: "تمت إضافة التكلفة." };
}

export async function voidCostAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requirePermission({ shipmentCost: ["void"] });
  const parsed = z
    .object({
      id: z.string().min(1),
      costId: z.string().min(1),
      reason: z.string().trim().min(3, "اكتبي سبب الإلغاء").max(200),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  try {
    await voidShipmentCost(parsed.data.id, parsed.data.costId, parsed.data.reason, session.user.id);
  } catch (error) {
    return fail(error);
  }
  refresh(parsed.data.id);
  return { success: "تم الإلغاء." };
}

const qtyField = z
  .string()
  .transform(clean)
  .refine((v) => /^\d{1,9}(\.\d{1,3})?$/.test(v), "الكمية رقم (حتى 3 خانات عشرية)");

const receiveLineSchema = z.object({
  lineId: z.string().min(1),
  receivedQty: qtyField,
  damagedQty: qtyField,
  expiresAt: z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (!v) return null;
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
      const at = m ? new Date(`${v}T00:00:00Z`) : null;
      if (!at || Number.isNaN(at.getTime()) || at.toISOString().slice(0, 10) !== v) {
        ctx.addIssue({ code: "custom", message: "تاريخ الصلاحية غير صحيح." });
        return null;
      }
      return at;
    }),
});

export async function receiveAction(id: string, _prev: FormState, lines: unknown): Promise<FormState> {
  const session = await requirePermission({ shipment: ["receive"] });
  const parsed = z.array(receiveLineSchema).min(1).max(200).safeParse(lines);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  try {
    await receiveShipment(id, parsed.data, session.user.id);
  } catch (error) {
    return fail(error);
  }
  refresh(id);
  revalidatePath("/admin/stock");
  redirect(`/admin/shipments/${id}`);
}

// ---------- الاستيراد من Excel (D-85) ----------

export type ImportResult = { preview?: ImportPreview; error?: string; imported?: number };

function importFile(formData: FormData): File | null {
  const file = formData.get("file");
  return file instanceof File && file.size > 0 ? file : null;
}

export async function previewImportAction(id: string, formData: FormData): Promise<ImportResult> {
  await requirePermission({ shipment: ["update"], product: ["create"] });
  const file = importFile(formData);
  if (!file) return { error: "اختاري ملف Excel." };
  try {
    return { preview: await previewImport(id, file) };
  } catch (e) {
    if (e instanceof ShipmentError) return { error: e.message };
    throw e;
  }
}

export async function applyImportAction(id: string, formData: FormData): Promise<ImportResult> {
  const session = await requirePermission({ shipment: ["update"], product: ["create"] });
  const file = importFile(formData);
  if (!file) return { error: "اختاري ملف Excel." };
  let imported: number;
  try {
    imported = await applyImport(id, file, session.user.id);
  } catch (e) {
    if (e instanceof ShipmentError) return { error: e.message };
    throw e;
  }
  refresh(id);
  revalidatePath("/admin/products");
  return { imported };
}
