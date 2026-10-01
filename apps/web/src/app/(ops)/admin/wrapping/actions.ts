"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { WrapError, saveWrapStyle } from "@/lib/wrapping";

export type FormState = { error?: string; success?: string };

const schema = z.object({
  id: z.string().min(1).max(40),
  nameAr: z.string().trim().min(2).max(40),
  nameEn: z.string().trim().min(2).max(40),
  descriptionAr: z.string().trim().max(160),
  descriptionEn: z.string().trim().max(160),
  priceSdg: z
    .string()
    .trim()
    .regex(/^\d{1,9}$/),
  isActive: z.boolean(),
  materials: z
    .array(z.object({ variantId: z.string().min(1).max(40), qty: z.string().regex(/^\d{1,6}(\.\d{1,3})?$/) }))
    .max(20),
});

/** حفظ نمط تغليف ووصفة مواده (D-91). */
export async function saveWrapStyleAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requirePermission({ settings: ["update"] });
  let materials: unknown = [];
  try {
    materials = JSON.parse(String(formData.get("materials") ?? "[]"));
  } catch {
    return { error: "بيانات المواد غير صحيحة." };
  }
  const parsed = schema.safeParse({
    id: formData.get("id"),
    nameAr: formData.get("nameAr"),
    nameEn: formData.get("nameEn"),
    descriptionAr: formData.get("descriptionAr") ?? "",
    descriptionEn: formData.get("descriptionEn") ?? "",
    priceSdg: String(formData.get("priceSdg") ?? "").replace(/,/g, "") || "0",
    isActive: formData.get("isActive") === "on",
    materials,
  });
  if (!parsed.success) return { error: "راجعي الحقول: الاسم بحرفين على الأقل، والسعر رقم صحيح، والكميات أرقام." };
  try {
    await saveWrapStyle({
      ...parsed.data,
      descriptionAr: parsed.data.descriptionAr || null,
      descriptionEn: parsed.data.descriptionEn || null,
    });
  } catch (e) {
    if (e instanceof WrapError) return { error: e.message };
    throw e;
  }
  revalidatePath("/admin/wrapping");
  return { success: "تم الحفظ." };
}
