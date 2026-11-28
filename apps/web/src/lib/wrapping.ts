import { dec, lowestWrapPrice, type WrapPrices, type WrappableSize } from "@ghusn/core";
import { prisma, type CardTextColor, type WrapTier } from "@ghusn/db";
import { ImageError, imageUrl, savePublicImage } from "./product-images";

/**
 * التغليف (D-165، يعدّل D-91): مستويان «عادي» و«فاخر». لكل مستوى سعر للقطعة حسب حجمها (صغير/وسط/كبير)
 * ووصفة مواد لكل حجم تُخصم من المخزون عند بدء التجهيز. المستوى يظهر في المتجر مفعّلاً وبسعر لحجم واحد
 * على الأقل. الأنماط القديمة (بلا tier) موقوفة وتبقى للطلبات السابقة.
 *
 * أشكال البطاقات: خلفية 10×15 يرفعها المصمم ونص العميل فوقها؛ بلا شكل = قالب غصن.
 */

export class WrapError extends Error {}

export const WRAPPABLE_SIZES = ["SMALL", "MEDIUM", "LARGE"] as const satisfies readonly WrappableSize[];
export const WRAP_SIZE_LABELS: Record<WrappableSize | "NONE", string> = {
  SMALL: "صغير",
  MEDIUM: "وسط",
  LARGE: "كبير",
  NONE: "لا يُغلّف",
};

type PricedRow = {
  priceSmallSdg: { toString(): string };
  priceMediumSdg: { toString(): string };
  priceLargeSdg: { toString(): string };
};
export const pricesOf = (w: PricedRow): WrapPrices => ({
  SMALL: w.priceSmallSdg.toString(),
  MEDIUM: w.priceMediumSdg.toString(),
  LARGE: w.priceLargeSdg.toString(),
});

// ---------- المتجر ----------

export interface StoreWrapTier {
  tier: WrapTier;
  name: string;
  description: string | null;
  imageUrl: string | null;
  /** أقل سعر قطعة — «من …» في الرئيسية و«صمّم هديتك». */
  fromPriceSdg: string;
}

export async function listStoreWrapTiers(locale: string): Promise<StoreWrapTier[]> {
  const rows = await prisma.wrapStyle.findMany({
    where: { tier: { not: null }, isActive: true },
    orderBy: { sortOrder: "asc" },
  });
  return rows.flatMap((w) => {
    const from = lowestWrapPrice(pricesOf(w));
    if (!from || !w.tier) return [];
    return [
      {
        tier: w.tier,
        name: locale === "en" ? w.nameEn : w.nameAr,
        description: locale === "en" ? (w.descriptionEn ?? w.descriptionAr) : (w.descriptionAr ?? w.descriptionEn),
        imageUrl: w.imageKey ? imageUrl(w.imageKey, "thumb") : null,
        fromPriceSdg: from.toFixed(0),
      },
    ];
  });
}

/** المستويات المفعّلة بأسعارها (لحساب السعر في الخادم). */
export async function activeWrapTiers() {
  const rows = await prisma.wrapStyle.findMany({
    where: { tier: { not: null }, isActive: true },
    orderBy: { sortOrder: "asc" },
  });
  return rows
    .filter((w) => w.tier && lowestWrapPrice(pricesOf(w)))
    .map((w) => ({ id: w.id, tier: w.tier as WrapTier, nameAr: w.nameAr, nameEn: w.nameEn, prices: pricesOf(w) }));
}

export interface StoreCardDesign {
  id: string;
  name: string;
  imageUrl: string;
  textColor: CardTextColor;
}

export async function listStoreCardDesigns(locale: string): Promise<StoreCardDesign[]> {
  const rows = await prisma.cardDesign.findMany({
    where: { isActive: true, deletedAt: null },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return rows.map((d) => ({
    id: d.id,
    name: locale === "en" ? d.nameEn : d.nameAr,
    imageUrl: imageUrl(d.imageKey, "medium"),
    textColor: d.textColor,
  }));
}

export async function activeCardDesign(id: string) {
  return prisma.cardDesign.findFirst({ where: { id, isActive: true, deletedAt: null }, select: { id: true } });
}

// ---------- الإدارة: المستويات ----------

/** المستويان بأسعارهما ووصفاتهما، مع تكلفة المواد التقريبية الآن لكل حجم (بمتوسط التكلفة). */
export async function listWrapTiersForAdmin() {
  const rows = await prisma.wrapStyle.findMany({
    where: { tier: { not: null } },
    orderBy: { sortOrder: "asc" },
    include: {
      materials: {
        where: { size: { not: null } },
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
    tier: w.tier as WrapTier,
    nameAr: w.nameAr,
    nameEn: w.nameEn,
    descriptionAr: w.descriptionAr ?? "",
    descriptionEn: w.descriptionEn ?? "",
    prices: {
      SMALL: w.priceSmallSdg.toFixed(0),
      MEDIUM: w.priceMediumSdg.toFixed(0),
      LARGE: w.priceLargeSdg.toFixed(0),
    } as Record<WrappableSize, string>,
    isActive: w.isActive,
    imageUrl: w.imageKey ? imageUrl(w.imageKey, "thumb") : null,
    materials: w.materials.map((m) => ({
      size: m.size as WrappableSize,
      variantId: m.variantId,
      name: [m.variant.product.nameAr, m.variant.size, m.variant.color].filter(Boolean).join(" · "),
      qty: m.qty.toString(),
      stockQty: m.variant.stockLevel?.qty.toString() ?? "0",
    })),
    materialCostUsd: Object.fromEntries(
      WRAPPABLE_SIZES.map((s) => [
        s,
        w.materials
          .filter((m) => m.size === s)
          .reduce(
            (a, m) => a.plus(dec(m.qty.toString()).mul(m.variant.stockLevel?.avgCostUsd.toString() ?? "0")),
            dec(0),
          )
          .toFixed(2),
      ]),
    ) as Record<WrappableSize, string>,
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

export interface WrapTierInput {
  id: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string | null;
  descriptionEn: string | null;
  prices: Record<WrappableSize, string>;
  isActive: boolean;
  materials: { size: WrappableSize; variantId: string; qty: string }[];
  image?: File | null;
  removeImage?: boolean;
}

async function storeImage(
  image: File | null | undefined,
  remove: boolean | undefined,
  prefix: string,
): Promise<string | null | undefined> {
  if (image && image.size > 0) {
    try {
      return await savePublicImage(image, prefix, { medium: true });
    } catch (e) {
      if (e instanceof ImageError) throw new WrapError(e.message);
      throw e;
    }
  }
  return remove ? null : undefined;
}

export async function saveWrapTier(input: WrapTierInput): Promise<void> {
  const existing = await prisma.wrapStyle.findFirst({ where: { id: input.id, tier: { not: null } } });
  if (!existing) throw new WrapError("مستوى التغليف غير موجود.");
  const prices = WRAPPABLE_SIZES.map((s) => dec(input.prices[s] || "0"));
  if (prices.some((p) => !p.isInteger() || p.lt(0))) throw new WrapError("الأسعار أرقام صحيحة بالجنيه.");
  if (input.isActive && prices.every((p) => p.lte(0)))
    throw new WrapError("حددي سعراً لحجم واحد على الأقل قبل التفعيل.");
  const seen = new Set<string>();
  for (const m of input.materials) {
    const k = `${m.size}:${m.variantId}`;
    if (seen.has(k)) throw new WrapError("المادة مكررة في وصفة الحجم نفسه.");
    seen.add(k);
    if (!dec(m.qty).gt(0)) throw new WrapError("كمية المادة يجب أن تكون أكبر من صفر.");
  }
  const variantIds = [...new Set(input.materials.map((m) => m.variantId))];
  if (variantIds.length) {
    const ok = await prisma.productVariant.count({ where: { id: { in: variantIds }, product: { type: "MATERIAL" } } });
    if (ok !== variantIds.length) throw new WrapError("اختاري مواد تغليف فقط.");
  }
  // الصورة تُحفظ قبل المعاملة (ملف) — المفتاح من المحتوى، فإعادة المحاولة لا تكرّرها
  const imageKey = await storeImage(input.image, input.removeImage, "wraps");
  const [small, medium, large] = prices as [ReturnType<typeof dec>, ReturnType<typeof dec>, ReturnType<typeof dec>];
  await prisma.$transaction([
    prisma.wrapStyle.update({
      where: { id: input.id },
      data: {
        ...(imageKey !== undefined ? { imageKey } : {}),
        nameAr: input.nameAr,
        nameEn: input.nameEn,
        descriptionAr: input.descriptionAr,
        descriptionEn: input.descriptionEn,
        priceSmallSdg: small.toFixed(2),
        priceMediumSdg: medium.toFixed(2),
        priceLargeSdg: large.toFixed(2),
        isActive: input.isActive,
      },
    }),
    prisma.wrapStyleMaterial.deleteMany({ where: { wrapStyleId: input.id } }),
    prisma.wrapStyleMaterial.createMany({
      data: input.materials.map((m) => ({
        wrapStyleId: input.id,
        size: m.size,
        variantId: m.variantId,
        qty: dec(m.qty).toFixed(3),
      })),
    }),
  ]);
}

// ---------- الإدارة: أشكال البطاقات ----------

export async function listCardDesignsForAdmin() {
  const rows = await prisma.cardDesign.findMany({
    where: { deletedAt: null },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return rows.map((d) => ({
    id: d.id,
    nameAr: d.nameAr,
    nameEn: d.nameEn,
    imageUrl: imageUrl(d.imageKey, "medium"),
    textColor: d.textColor,
    isActive: d.isActive,
    sortOrder: d.sortOrder,
  }));
}

export interface CardDesignInput {
  id: string | null;
  nameAr: string;
  nameEn: string;
  textColor: CardTextColor;
  isActive: boolean;
  sortOrder: number;
  image?: File | null;
}

export async function saveCardDesign(input: CardDesignInput): Promise<void> {
  const imageKey = await storeImage(input.image, false, "cards");
  const data = {
    nameAr: input.nameAr,
    nameEn: input.nameEn,
    textColor: input.textColor,
    isActive: input.isActive,
    sortOrder: input.sortOrder,
  };
  if (input.id) {
    const found = await prisma.cardDesign.findFirst({ where: { id: input.id, deletedAt: null } });
    if (!found) throw new WrapError("الشكل غير موجود.");
    await prisma.cardDesign.update({ where: { id: input.id }, data: { ...data, ...(imageKey ? { imageKey } : {}) } });
  } else {
    if (!imageKey) throw new WrapError("اختاري صورة الشكل.");
    await prisma.cardDesign.create({ data: { ...data, imageKey } });
  }
}

/** حذف ناعم: الطلبات السابقة تبقى تطبع بشكلها. */
export async function archiveCardDesign(id: string): Promise<void> {
  await prisma.cardDesign.updateMany({
    where: { id, deletedAt: null },
    data: { deletedAt: new Date(), isActive: false },
  });
}
