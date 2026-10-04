"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { OccasionError, saveOccasion } from "@/lib/occasions";

export type FormState = { error?: string; success?: string };

const schema = z.object({
  id: z.string().max(40).optional(),
  slug: z.string().trim().min(2).max(60),
  nameAr: z.string().trim().min(2).max(40),
  nameEn: z.string().trim().min(2).max(40),
  descriptionAr: z.string().trim().max(200),
  descriptionEn: z.string().trim().max(200),
  sortOrder: z.coerce.number().int().min(0).max(999),
  bannerStart: z.string().max(10),
  bannerEnd: z.string().max(10),
});

/** حفظ مناسبة (D-92): الأقسام والمناسبات من صلاحية «الأقسام». */
export async function saveOccasionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requirePermission({ category: ["update"] });
  const text = (k: string) => String(formData.get(k) ?? "");
  const parsed = schema.safeParse({
    id: text("id") || undefined,
    slug: text("slug"),
    nameAr: text("nameAr"),
    nameEn: text("nameEn"),
    descriptionAr: text("descriptionAr"),
    descriptionEn: text("descriptionEn"),
    sortOrder: text("sortOrder") || "0",
    bannerStart: text("bannerStart"),
    bannerEnd: text("bannerEnd"),
  });
  if (!parsed.success) return { error: "راجعي الحقول: الاسمان بحرفين على الأقل، والرابط بالإنجليزي." };
  const image = formData.get("image");
  const cover = formData.get("cover");
  try {
    await saveOccasion({
      ...parsed.data,
      id: parsed.data.id ?? null,
      descriptionAr: parsed.data.descriptionAr || null,
      descriptionEn: parsed.data.descriptionEn || null,
      bannerStart: parsed.data.bannerStart || null,
      bannerEnd: parsed.data.bannerEnd || null,
      isActive: formData.get("isActive") === "on",
      image: image instanceof File ? image : null,
      removeImage: formData.get("removeImage") === "on",
      cover: cover instanceof File ? cover : null,
      removeCover: formData.get("removeCover") === "on",
    });
  } catch (e) {
    if (e instanceof OccasionError) return { error: e.message };
    throw e;
  }
  revalidatePath("/admin/occasions");
  revalidatePath("/", "layout");
  return { success: "تم الحفظ." };
}
