"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { BannerError, deleteBanner, moveBanner, saveBanner } from "@/lib/banners";

export type FormState = { error?: string; success?: string };

const optional = (max: number) => z.string().trim().max(max);
const schema = z.object({
  id: z.string().max(40).optional(),
  titleAr: z.string().trim().min(2).max(60),
  titleEn: z.string().trim().min(2).max(60),
  textAr: optional(160),
  textEn: optional(160),
  ctaAr: z.string().trim().min(2).max(30),
  ctaEn: z.string().trim().min(2).max(30),
  badgeAr: optional(30),
  badgeEn: optional(30),
  linkType: z.enum(["PRODUCTS", "CATEGORY", "OCCASION", "PRODUCT", "GIFT"]),
  linkTarget: optional(60),
  startsOn: optional(10),
  endsOn: optional(10),
});

function refresh() {
  revalidatePath("/admin/banners");
  revalidatePath("/", "layout");
}

/** حفظ بانر (D-101) — صلاحية الإعدادات مثل صورة الواجهة سابقاً. */
export async function saveBannerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requirePermission({ settings: ["update"] });
  const text = (k: string) => String(formData.get(k) ?? "");
  const linkType = text("linkType");
  const parsed = schema.safeParse({
    id: text("id") || undefined,
    titleAr: text("titleAr"),
    titleEn: text("titleEn"),
    textAr: text("textAr"),
    textEn: text("textEn"),
    ctaAr: text("ctaAr"),
    ctaEn: text("ctaEn"),
    badgeAr: text("badgeAr"),
    badgeEn: text("badgeEn"),
    linkType,
    // كل نوع وجهة له قائمته في النموذج؛ نأخذ قيمة القائمة الموافقة فقط
    linkTarget: text(`target_${linkType}`),
    startsOn: text("startsOn"),
    endsOn: text("endsOn"),
  });
  if (!parsed.success) return { error: "راجعي الحقول: العنوانان ونصّا الزر بحرفين على الأقل." };
  const file = (k: string) => {
    const f = formData.get(k);
    return f instanceof File ? f : null;
  };
  const d = parsed.data;
  try {
    await saveBanner({
      ...d,
      id: d.id ?? null,
      textAr: d.textAr || null,
      textEn: d.textEn || null,
      badgeAr: d.badgeAr || null,
      badgeEn: d.badgeEn || null,
      linkTarget: d.linkTarget || null,
      startsOn: d.startsOn || null,
      endsOn: d.endsOn || null,
      isActive: formData.get("isActive") === "on",
      image: file("image"),
      mobileImage: file("mobileImage"),
      removeMobileImage: formData.get("removeMobileImage") === "on",
    });
  } catch (e) {
    if (e instanceof BannerError) return { error: e.message };
    throw e;
  }
  refresh();
  return { success: "تم الحفظ." };
}

const idSchema = z.string().min(1).max(40);

export async function moveBannerAction(formData: FormData): Promise<void> {
  await requirePermission({ settings: ["update"] });
  const id = idSchema.safeParse(formData.get("id"));
  const dir = formData.get("direction") === "up" ? "up" : "down";
  if (!id.success) return;
  await moveBanner(id.data, dir);
  refresh();
}

export async function deleteBannerAction(formData: FormData): Promise<void> {
  await requirePermission({ settings: ["update"] });
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return;
  await deleteBanner(id.data);
  refresh();
}
