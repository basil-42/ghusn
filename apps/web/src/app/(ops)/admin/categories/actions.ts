"use server";

import { dec, slugify, toLatinDigits } from "@ghusn/core";
import { prisma } from "@ghusn/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { changesLine, diffFields, recordAudit } from "@/lib/audit";
import { roleCan } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { ImageError, savePublicImage } from "@/lib/product-images";

export type CategoryState = { error?: string; success?: string };

const name = (label: string) => z.string().trim().min(2, `اكتبي ${label}`).max(60);
// الهامش يُكتب نسبة مئوية (40) ويُحفظ كسراً (0.40)
const percent = z
  .string()
  .transform((v) => toLatinDigits(v).replace("%", "").trim())
  .refine((v) => /^\d{1,2}(\.\d{1,2})?$/.test(v), "الهامش رقم بين 0 و90")
  .transform((v) => dec(v).div(100))
  .refine((v) => v.lte("0.9"), "الهامش رقم بين 0 و90");

const updateSchema = z.object({
  id: z.string().min(1),
  nameAr: name("الاسم بالعربي"),
  nameEn: name("الاسم بالإنجليزي"),
  isActive: z.literal("on").optional(),
  targetMargin: percent.optional(),
  minMargin: percent.optional(),
});

export async function updateCategory(_prev: CategoryState, formData: FormData): Promise<CategoryState> {
  const session = await requirePermission({ category: ["update"] });
  const parsed = updateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { id, nameAr, nameEn, isActive, targetMargin, minMargin } = parsed.data;

  const margins: { targetMargin?: string; minMargin?: string } = {};
  if (targetMargin !== undefined || minMargin !== undefined) {
    if (!roleCan(session.user.role, { margin: ["update"] })) return { error: "ليست لديك صلاحية تعديل الهامش." };
    if (!targetMargin || !minMargin) return { error: "اكتبي الهامش المستهدف والحد الأدنى." };
    if (minMargin.gt(targetMargin)) return { error: "الحد الأدنى يجب ألا يزيد عن الهامش المستهدف." };
    margins.targetMargin = targetMargin.toFixed(4);
    margins.minMargin = minMargin.toFixed(4);
  }

  // صورة القسم في دوائر المتجر (D-139): رفع جديد يستبدلها، و«حذفها» يعيد صورة أحدث منتج
  const image = formData.get("image");
  let imageKey: string | null | undefined;
  if (image instanceof File && image.size > 0) {
    try {
      imageKey = await savePublicImage(image, "categories");
    } catch (e) {
      if (e instanceof ImageError) return { error: e.message };
      throw e;
    }
  } else if (formData.get("removeImage") === "on") {
    imageKey = null;
  }

  const before = await prisma.category.findUnique({ where: { id } });
  const after = await prisma.category.update({
    where: { id },
    data: { nameAr, nameEn, isActive: isActive === "on", ...margins, ...(imageKey !== undefined ? { imageKey } : {}) },
  });
  if (before) {
    const pct = (v: { toString(): string }) => `${dec(v.toString()).mul(100).toDecimalPlaces(2).toFixed()}%`;
    const changes = diffFields(
      {
        nameAr: before.nameAr,
        nameEn: before.nameEn,
        isActive: before.isActive,
        targetMargin: pct(before.targetMargin),
        minMargin: pct(before.minMargin),
        image: before.imageKey ? "مرفوعة" : "—",
      },
      {
        nameAr: after.nameAr,
        nameEn: after.nameEn,
        isActive: after.isActive,
        targetMargin: pct(after.targetMargin),
        minMargin: pct(after.minMargin),
        image: after.imageKey === before.imageKey ? (before.imageKey ? "مرفوعة" : "—") : after.imageKey ? "جديدة" : "—",
      },
      {
        nameAr: "الاسم",
        nameEn: "الاسم بالإنجليزي",
        isActive: "نشط",
        targetMargin: "الهامش المستهدف",
        minMargin: "الحد الأدنى للهامش",
        image: "صورة القسم",
      },
    );
    if (changes.length) {
      await recordAudit({
        type: "CATEGORY_UPDATED",
        actorId: session.user.id,
        title: `تعديل قسم · ${after.nameAr}`,
        detail: changesLine(changes),
        href: "/admin/categories",
        changes,
        // تغيير الهامش يغيّر الأسعار المقترحة كلها
        sensitive: changes.some((c) => c.field.includes("الهامش")),
      });
    }
  }
  revalidatePath("/admin/categories");
  revalidatePath("/", "layout");
  return { success: "تم الحفظ." };
}

const createSchema = z.object({ nameAr: name("الاسم بالعربي"), nameEn: name("الاسم بالإنجليزي") });

export async function createCategory(_prev: CategoryState, formData: FormData): Promise<CategoryState> {
  await requirePermission({ category: ["create"] });
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const base = slugify(parsed.data.nameEn) || "category";
  let slug = base;
  for (let n = 2; await prisma.category.findUnique({ where: { slug } }); n++) slug = `${base}-${n}`;
  const last = await prisma.category.aggregate({ _max: { sortOrder: true } });

  // هامش القسم الجديد = الافتراضي (40% / 35%) حتى تغيّره المديرة
  await prisma.category.create({
    data: { ...parsed.data, slug, sortOrder: (last._max.sortOrder ?? 0) + 1 },
  });
  revalidatePath("/admin/categories");
  return { success: `تمت إضافة قسم «${parsed.data.nameAr}».` };
}
