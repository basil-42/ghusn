import { dec } from "@ghusn/core";
import { prisma } from "@ghusn/db";

/**
 * أنماط التغليف (D-91): «غصن» و«ورقة» و«شجرة». لكل نمط سعر خدمة بالجنيه ووصفة مواد تغليف
 * (منتجات من نوع «مادة») تُخصم من المخزون عند بدء التجهيز. النمط يظهر في المتجر فقط إذا كان
 * مفعّلاً وسعره أكبر من صفر.
 */

export class WrapError extends Error {}

export interface StoreWrapStyle {
  id: string;
  code: string;
  name: string;
  description: string | null;
  priceSdg: string;
}

export async function listStoreWrapStyles(locale: string): Promise<StoreWrapStyle[]> {
  const rows = await prisma.wrapStyle.findMany({
    where: { isActive: true, priceSdg: { gt: 0 } },
    orderBy: { sortOrder: "asc" },
  });
  return rows.map((w) => ({
    id: w.id,
    code: w.code,
    name: locale === "en" ? w.nameEn : w.nameAr,
    description: locale === "en" ? (w.descriptionEn ?? w.descriptionAr) : (w.descriptionAr ?? w.descriptionEn),
    priceSdg: w.priceSdg.toFixed(0),
  }));
}

/** نمط متاح للطلب الآن (أو null). */
export async function activeWrapStyle(id: string) {
  const w = await prisma.wrapStyle.findFirst({ where: { id, isActive: true, priceSdg: { gt: 0 } } });
  return w ? { id: w.id, nameAr: w.nameAr, nameEn: w.nameEn, priceSdg: w.priceSdg.toString() } : null;
}

/** للإدارة: الأنماط ووصفاتها مع تكلفة المواد التقريبية الآن (بمتوسط التكلفة). */
export async function listWrapStylesForAdmin() {
  const rows = await prisma.wrapStyle.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      materials: {
        orderBy: { id: "asc" },
        include: {
          variant: {
            include: {
              product: { select: { nameAr: true, unit: true } },
              stockLevel: { select: { qty: true, avgCostUsd: true } },
            },
          },
        },
      },
    },
  });
  return rows.map((w) => ({
    id: w.id,
    code: w.code,
    nameAr: w.nameAr,
    nameEn: w.nameEn,
    descriptionAr: w.descriptionAr ?? "",
    descriptionEn: w.descriptionEn ?? "",
    priceSdg: w.priceSdg.toFixed(0),
    isActive: w.isActive,
    materials: w.materials.map((m) => ({
      variantId: m.variantId,
      name: [m.variant.product.nameAr, m.variant.size, m.variant.color].filter(Boolean).join(" · "),
      unit: m.variant.product.unit,
      qty: m.qty.toString(),
      stockQty: m.variant.stockLevel?.qty.toString() ?? "0",
    })),
    materialCostUsd: w.materials
      .reduce((a, m) => a.plus(dec(m.qty.toString()).mul(m.variant.stockLevel?.avgCostUsd.toString() ?? "0")), dec(0))
      .toFixed(2),
  }));
}

/** مواد التغليف المتاحة لاختيارها في الوصفة. */
export async function listMaterialOptions() {
  const rows = await prisma.productVariant.findMany({
    where: { deletedAt: null, isActive: true, product: { type: "MATERIAL", deletedAt: null } },
    include: { product: { select: { nameAr: true } } },
    orderBy: { product: { nameAr: "asc" } },
  });
  return rows.map((v) => ({
    value: v.id,
    label: [v.product.nameAr, v.size, v.color].filter(Boolean).join(" · "),
  }));
}

export interface WrapStyleInput {
  id: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string | null;
  descriptionEn: string | null;
  priceSdg: string;
  isActive: boolean;
  materials: { variantId: string; qty: string }[];
}

export async function saveWrapStyle(input: WrapStyleInput): Promise<void> {
  const price = dec(input.priceSdg);
  if (!price.isInteger() || price.lt(0)) throw new WrapError("السعر رقم صحيح بالجنيه.");
  if (input.isActive && price.lte(0)) throw new WrapError("حددي سعر الخدمة قبل التفعيل.");
  const seen = new Set<string>();
  for (const m of input.materials) {
    if (seen.has(m.variantId)) throw new WrapError("المادة مكررة في الوصفة.");
    seen.add(m.variantId);
    if (!dec(m.qty).gt(0)) throw new WrapError("كمية المادة يجب أن تكون أكبر من صفر.");
  }
  if (input.materials.length) {
    const ok = await prisma.productVariant.count({
      where: { id: { in: [...seen] }, product: { type: "MATERIAL" } },
    });
    if (ok !== seen.size) throw new WrapError("اختاري مواد تغليف فقط.");
  }
  await prisma.$transaction([
    prisma.wrapStyle.update({
      where: { id: input.id },
      data: {
        nameAr: input.nameAr,
        nameEn: input.nameEn,
        descriptionAr: input.descriptionAr,
        descriptionEn: input.descriptionEn,
        priceSdg: price.toFixed(2),
        isActive: input.isActive,
      },
    }),
    prisma.wrapStyleMaterial.deleteMany({ where: { wrapStyleId: input.id } }),
    prisma.wrapStyleMaterial.createMany({
      data: input.materials.map((m) => ({ wrapStyleId: input.id, variantId: m.variantId, qty: dec(m.qty).toFixed(3) })),
    }),
  ]);
}
