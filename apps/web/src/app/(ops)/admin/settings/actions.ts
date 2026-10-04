"use server";

import { toLatinDigits } from "@ghusn/core";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/session";
import { ExpenseError, saveExpenseCategory } from "@/lib/expenses";
import {
  posSettingsSchema,
  receiptSettingsSchema,
  savePosSettings,
  saveReceiptSettings,
  getStoreSettings,
  saveStockSettings,
  saveStoreSettings,
  stockSettingsSchema,
  storeSettingsSchema,
} from "@/lib/settings";

export type FormState = { error?: string; success?: string };

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const numberOf = (f: FormData, k: string) => Number(toLatinDigits(text(f, k)).replace(/[%٪\s,٬]/g, ""));

export async function savePosSettingsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requirePermission({ settings: ["update"] });
  const parsed = posSettingsSchema.safeParse({
    maxDiscountPercent: numberOf(formData, "maxDiscountPercent"),
    returnDays: numberOf(formData, "returnDays"),
    cashWalletId: text(formData, "cashWalletId") || null,
    bankakWalletId: text(formData, "bankakWalletId") || null,
    staffExpenseLimitSdg: numberOf(formData, "staffExpenseLimitSdg"),
    shortageAlertSdg: numberOf(formData, "shortageAlertSdg"),
  });
  if (!parsed.success) {
    return {
      error: "حد الخصم بين 0 و100، ومدة المرتجع بين 0 و365 يوماً، وحد المصروف وحد تنبيه العجز أرقام صحيحة بالجنيه.",
    };
  }
  await savePosSettings(parsed.data);
  revalidatePath("/admin/settings");
  revalidatePath("/pos");
  revalidatePath("/admin");
  return { success: "تم حفظ إعدادات نقطة البيع." };
}

export async function saveReceiptSettingsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requirePermission({ settings: ["update"] });
  const parsed = receiptSettingsSchema.safeParse({
    showLogo: formData.get("showLogo") === "on",
    tagline: text(formData, "tagline"),
    address: text(formData, "address"),
    phone: text(formData, "phone"),
    whatsapp: text(formData, "whatsapp"),
    instagram: text(formData, "instagram"),
    footer: String(formData.get("footer") ?? "").trim(),
    showCashier: formData.get("showCashier") === "on",
    showCustomerPhone: formData.get("showCustomerPhone") === "on",
  });
  if (!parsed.success) return { error: "نص أطول من المسموح." };
  await saveReceiptSettings(parsed.data);
  revalidatePath("/admin/settings");
  return { success: "تم حفظ الإيصال." };
}

export async function saveExpenseCategoryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requirePermission({ settings: ["update"] });
  const name = text(formData, "name").slice(0, 60);
  if (name.length < 2) return { error: "اكتبي اسم القسم." };
  try {
    await saveExpenseCategory({
      id: text(formData, "id") || null,
      name,
      staffAllowed: formData.get("staffAllowed") === "on",
      isActive: formData.get("isActive") !== "off",
    });
  } catch (e) {
    if (e instanceof ExpenseError) return { error: e.message };
    throw e;
  }
  revalidatePath("/admin/settings");
  revalidatePath("/admin/expenses");
  return { success: "تم الحفظ." };
}

export async function saveStoreSettingsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requirePermission({ settings: ["update"] });
  const parsed = storeSettingsSchema.safeParse({
    courierWalletId: text(formData, "courierWalletId") || null,
    codMaxSdg: text(formData, "codMaxSdg") ? numberOf(formData, "codMaxSdg") : 0,
    bankakAccountName: text(formData, "bankakAccountName"),
    bankakAccountNumber: text(formData, "bankakAccountNumber"),
    bankakNote: text(formData, "bankakNote"),
    heroImageKey: (await getStoreSettings()).heroImageKey,
  });
  if (!parsed.success) {
    return { error: "حد الدفع عند الاستلام رقم صحيح بالجنيه (0 = بلا حد)، ونصوص بنكك قصيرة." };
  }
  await saveStoreSettings(parsed.data);
  revalidatePath("/admin/settings");
  return { success: "تم حفظ إعدادات المتجر." };
}

export async function saveStockSettingsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requirePermission({ settings: ["update"] });
  const parsed = stockSettingsSchema.safeParse({
    lowStockQty: numberOf(formData, "lowStockQty"),
    expiryAlertDays: numberOf(formData, "expiryAlertDays"),
  });
  if (!parsed.success) return { error: "الحد رقم 0 أو أكثر، ومهلة الصلاحية بين 1 و365 يوماً." };
  await saveStockSettings(parsed.data);
  revalidatePath("/admin/settings");
  revalidatePath("/admin");
  return { success: "تم حفظ تنبيهات المخزون." };
}
