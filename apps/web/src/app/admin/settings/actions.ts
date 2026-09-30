"use server";

import { toLatinDigits } from "@ghusn/core";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/session";
import { posSettingsSchema, receiptSettingsSchema, savePosSettings, saveReceiptSettings } from "@/lib/settings";

export type FormState = { error?: string; success?: string };

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const numberOf = (f: FormData, k: string) => Number(toLatinDigits(text(f, k)).replace(/[%٪\s]/g, ""));

export async function savePosSettingsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requirePermission({ settings: ["update"] });
  const parsed = posSettingsSchema.safeParse({
    maxDiscountPercent: numberOf(formData, "maxDiscountPercent"),
    returnDays: numberOf(formData, "returnDays"),
    cashWalletId: text(formData, "cashWalletId") || null,
    bankakWalletId: text(formData, "bankakWalletId") || null,
  });
  if (!parsed.success) return { error: "حد الخصم بين 0 و100، ومدة المرتجع بين 0 و365 يوماً." };
  await savePosSettings(parsed.data);
  revalidatePath("/admin/settings");
  revalidatePath("/pos");
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
