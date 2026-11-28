"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { ImageError, savePublicImage } from "@/lib/product-images";
import { getStoreSettings, saveStoreSettings } from "@/lib/settings";
import { WrapError, archiveCardDesign, saveCardDesign, saveWrapTier } from "@/lib/wrapping";

export type FormState = { error?: string; success?: string };

const sizes = z.enum(["SMALL", "MEDIUM", "LARGE"]);
const price = z
  .string()
  .trim()
  .regex(/^\d{0,9}$/);

const tierSchema = z.object({
  id: z.string().min(1).max(40),
  nameAr: z.string().trim().min(2).max(40),
  nameEn: z.string().trim().min(2).max(40),
  descriptionAr: z.string().trim().max(160),
  descriptionEn: z.string().trim().max(160),
  prices: z.object({ SMALL: price, MEDIUM: price, LARGE: price }),
  isActive: z.boolean(),
  materials: z
    .array(
      z.object({
        size: sizes,
        variantId: z.string().min(1).max(40),
        qty: z.string().regex(/^\d{1,6}(\.\d{1,3})?$/),
      }),
    )
    .max(60),
});

const num = (v: FormDataEntryValue | null) =>
  String(v ?? "")
    .replace(/,/g, "")
    .trim();

/** حفظ مستوى تغليف: الأسعار لكل حجم، والوصف والصورة والتفعيل، ووصفة المواد لكل حجم (D-165). */
export async function saveWrapTierAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requirePermission({ settings: ["update"] });
  let materials: unknown = [];
  try {
    materials = JSON.parse(String(formData.get("materials") ?? "[]"));
  } catch {
    return { error: "بيانات المواد غير صحيحة." };
  }
  const parsed = tierSchema.safeParse({
    id: formData.get("id"),
    nameAr: formData.get("nameAr"),
    nameEn: formData.get("nameEn"),
    descriptionAr: formData.get("descriptionAr") ?? "",
    descriptionEn: formData.get("descriptionEn") ?? "",
    prices: {
      SMALL: num(formData.get("priceSMALL")),
      MEDIUM: num(formData.get("priceMEDIUM")),
      LARGE: num(formData.get("priceLARGE")),
    },
    isActive: formData.get("isActive") === "on",
    materials,
  });
  if (!parsed.success) return { error: "راجعي الحقول: الاسم بحرفين على الأقل، والأسعار أرقام صحيحة، والكميات أرقام." };
  try {
    const image = formData.get("image");
    await saveWrapTier({
      ...parsed.data,
      image: image instanceof File ? image : null,
      removeImage: formData.get("removeImage") === "on",
      descriptionAr: parsed.data.descriptionAr || null,
      descriptionEn: parsed.data.descriptionEn || null,
    });
  } catch (e) {
    if (e instanceof WrapError) return { error: e.message };
    throw e;
  }
  revalidatePath("/admin/wrapping");
  revalidatePath("/", "layout");
  return { success: "تم الحفظ." };
}

const cardSchema = z.object({
  id: z.string().min(1).max(40).nullable(),
  nameAr: z.string().trim().min(2).max(40),
  nameEn: z.string().trim().min(2).max(40),
  textColor: z.enum(["FOREST", "IVORY", "GOLD"]),
  isActive: z.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(999),
});

/** إضافة شكل بطاقة أو تعديله (D-165). */
export async function saveCardDesignAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requirePermission({ settings: ["update"] });
  const parsed = cardSchema.safeParse({
    id: String(formData.get("id") ?? "") || null,
    nameAr: formData.get("nameAr"),
    nameEn: formData.get("nameEn"),
    textColor: formData.get("textColor"),
    isActive: formData.get("isActive") === "on",
    sortOrder: formData.get("sortOrder") || 0,
  });
  if (!parsed.success) return { error: "راجعي الحقول: الاسم بالعربي والإنجليزي بحرفين على الأقل." };
  try {
    const image = formData.get("image");
    await saveCardDesign({ ...parsed.data, image: image instanceof File ? image : null });
  } catch (e) {
    if (e instanceof WrapError) return { error: e.message };
    throw e;
  }
  revalidatePath("/admin/wrapping");
  revalidatePath("/", "layout");
  return { success: parsed.data.id ? "تم الحفظ." : "أُضيف الشكل." };
}

/** حذف شكل بطاقة (ناعم — الطلبات السابقة تُطبع بشكلها). */
export async function archiveCardDesignAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requirePermission({ settings: ["update"] });
  const id = z.string().min(1).max(40).safeParse(formData.get("id"));
  if (!id.success) return { error: "الشكل غير موجود." };
  await archiveCardDesign(id.data);
  revalidatePath("/admin/wrapping");
  revalidatePath("/", "layout");
  return { success: "حُذف الشكل." };
}

/** صورة بطاقة «صمّم هديتك» في الرئيسية (D-102): رفع أو حذف؛ تُحفظ في إعدادات المتجر. */
export async function saveGiftTileImageAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requirePermission({ settings: ["update"] });
  const current = await getStoreSettings();
  const image = formData.get("image");
  let giftTileImageKey = current.giftTileImageKey;
  if (formData.get("remove") === "on") giftTileImageKey = null;
  else if (image instanceof File && image.size > 0) {
    try {
      giftTileImageKey = await savePublicImage(image, "tiles", { medium: true });
    } catch (e) {
      if (e instanceof ImageError) return { error: e.message };
      throw e;
    }
  } else return { error: "اختاري صورة." };
  await saveStoreSettings({ ...current, giftTileImageKey });
  revalidatePath("/admin/wrapping");
  revalidatePath("/", "layout");
  return { success: giftTileImageKey ? "تم حفظ الصورة." : "حُذفت الصورة — تظهر البطاقة بالنص." };
}
