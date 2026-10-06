"use server";

import { toLatinDigits } from "@ghusn/core";
import { revalidatePath } from "next/cache";
import { changesLine, diffFields, recordAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth/session";
import { ExpenseError, saveExpenseCategory } from "@/lib/expenses";
import {
  messageSettingsSchema,
  posSettingsSchema,
  saveMessageSettings,
  receiptSettingsSchema,
  savePosSettings,
  saveReceiptSettings,
  getMessageSettings,
  getPosSettings,
  getReceiptSettings,
  getStockSettings,
  getStoreSettings,
  saveStockSettings,
  saveStoreSettings,
  stockSettingsSchema,
  storeSettingsSchema,
} from "@/lib/settings";

export type FormState = { error?: string; success?: string };

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const numberOf = (f: FormData, k: string) => Number(toLatinDigits(text(f, k)).replace(/[%٪\s,٬]/g, ""));

/** أسماء الحقول كما تظهر في سجل التدقيق (D-114). */
const FIELD_LABELS: Record<string, string> = {
  maxDiscountPercent: "حد خصم الموظفة %",
  returnDays: "مدة المرتجع (يوم)",
  cashWalletId: "محفظة النقد",
  bankakWalletId: "محفظة بنكك",
  staffExpenseLimitSdg: "حد مصروف الموظفة",
  shortageAlertSdg: "حد تنبيه العجز",
  courierWalletId: "محفظة شركة التوصيل",
  codMaxSdg: "حد الدفع عند الاستلام",
  bankakAccountName: "اسم حساب بنكك",
  bankakAccountNumber: "رقم حساب بنكك",
  bankakNote: "ملاحظة بنكك",
  heroImageKey: "صورة البانر",
  giftTileImageKey: "صورة «صمّم هديتك»",
  lowStockQty: "حد «قارب على النفاد»",
  expiryAlertDays: "تنبيه الصلاحية (يوم)",
  managerAdjustLimitUsd: "حد اعتماد المديرة للتسويات $",
  showLogo: "الشعار في الإيصال",
  tagline: "عبارة الإيصال",
  address: "العنوان",
  phone: "الهاتف",
  whatsapp: "واتساب",
  instagram: "إنستغرام",
  footer: "نص الختام",
  showCashier: "اسم الكاشير",
  showCustomerPhone: "هاتف العميل",
  signatureAr: "توقيع الرسائل (عربي)",
  signatureEn: "توقيع الرسائل (إنجليزي)",
  hoursAr: "ساعات العمل (عربي)",
  hoursEn: "ساعات العمل (إنجليزي)",
};

/** يسجّل تغيير الإعدادات بالفروق (قبل ← بعد)؛ حفظ بلا تغيير لا يُسجَّل. */
async function auditSettings(group: string, actorId: string, before: object, after: object) {
  const changes = diffFields(before as Record<string, unknown>, after as Record<string, unknown>, FIELD_LABELS);
  if (!changes.length) return;
  await recordAudit({
    type: "SETTINGS_UPDATED",
    actorId,
    title: `تعديل الإعدادات · ${group}`,
    detail: changesLine(changes),
    href: "/admin/settings",
    changes,
  });
}

export async function savePosSettingsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requirePermission({ settings: ["update"] });
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
  const before = await getPosSettings();
  await savePosSettings(parsed.data);
  await auditSettings("نقطة البيع", session.user.id, before, parsed.data);
  revalidatePath("/admin/settings");
  revalidatePath("/pos");
  revalidatePath("/admin");
  return { success: "تم حفظ إعدادات نقطة البيع." };
}

export async function saveReceiptSettingsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requirePermission({ settings: ["update"] });
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
  const before = await getReceiptSettings();
  await saveReceiptSettings(parsed.data);
  await auditSettings("الإيصال", session.user.id, before, parsed.data);
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
  const session = await requirePermission({ settings: ["update"] });
  const before = await getStoreSettings();
  const parsed = storeSettingsSchema.safeParse({
    // الصور تُرفع من أماكنها — تبقى كما هي
    ...before,
    courierWalletId: text(formData, "courierWalletId") || null,
    codMaxSdg: text(formData, "codMaxSdg") ? numberOf(formData, "codMaxSdg") : 0,
    bankakAccountName: text(formData, "bankakAccountName"),
    bankakAccountNumber: text(formData, "bankakAccountNumber"),
    bankakNote: text(formData, "bankakNote"),
  });
  if (!parsed.success) {
    return { error: "حد الدفع عند الاستلام رقم صحيح بالجنيه (0 = بلا حد)، ونصوص بنكك قصيرة." };
  }
  await saveStoreSettings(parsed.data);
  await auditSettings("المتجر", session.user.id, before, parsed.data);
  revalidatePath("/admin/settings");
  return { success: "تم حفظ إعدادات المتجر." };
}

export async function saveStockSettingsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requirePermission({ settings: ["update"] });
  const parsed = stockSettingsSchema.safeParse({
    lowStockQty: numberOf(formData, "lowStockQty"),
    expiryAlertDays: numberOf(formData, "expiryAlertDays"),
    managerAdjustLimitUsd: numberOf(formData, "managerAdjustLimitUsd"),
  });
  if (!parsed.success) {
    return { error: "الحد رقم 0 أو أكثر، ومهلة الصلاحية بين 1 و365 يوماً، وحد اعتماد التسويات بالدولار 0 أو أكثر." };
  }
  const before = await getStockSettings();
  await saveStockSettings(parsed.data);
  await auditSettings("المخزون", session.user.id, before, parsed.data);
  revalidatePath("/admin/settings");
  revalidatePath("/admin");
  return { success: "تم حفظ تنبيهات المخزون." };
}

export async function saveMessageSettingsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requirePermission({ settings: ["update"] });
  const parsed = messageSettingsSchema.safeParse({
    signatureAr: text(formData, "signatureAr"),
    signatureEn: text(formData, "signatureEn"),
    hoursAr: text(formData, "hoursAr"),
    hoursEn: text(formData, "hoursEn"),
  });
  if (!parsed.success) return { error: "التوقيع حتى 80 حرفاً، وساعات العمل حتى 120 حرفاً." };
  const before = await getMessageSettings();
  await saveMessageSettings(parsed.data);
  await auditSettings("رسائل واتساب", session.user.id, before, parsed.data);
  revalidatePath("/admin/settings");
  return { success: "تم حفظ إعدادات الرسائل." };
}
