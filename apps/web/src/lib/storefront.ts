import { dec, isBannerDay, searchTerms, shopDay } from "@ghusn/core";
import { prisma, type Prisma } from "@ghusn/db";
import type { Locale } from "@/i18n/routing";
import { availableVariantIds } from "./orders";
import { imageUrl } from "./product-images";

/**
 * بيانات المتجر العام. ما يظهر: منتج بضاعة نشط «ظاهر في المتجر» في قسم نشط، وله متغيّر واحد
 * على الأقل نشط ومسعّر ومتوفر. لا تُعاد التكلفة ولا الهوامش ولا الكميات — «متوفر» فقط.
 * المتاح = الرصيد − المحجوز لطلبات لم يبدأ تجهيزها (lib/orders).
 */

const visibleProduct = {
  deletedAt: null,
  isActive: true,
  isWebVisible: true,
  type: "STOCK",
  category: { isActive: true },
} satisfies Prisma.ProductWhereInput;

/** متغيّر متاح للبيع أونلاين: نشط ومسعّر ومتاحه (الرصيد − المحجوز) أكبر من صفر. */
async function sellableVariant(): Promise<Prisma.ProductVariantWhereInput> {
  return { deletedAt: null, isActive: true, priceSdg: { not: null }, id: { in: await availableVariantIds() } };
}

const nameOf = (locale: Locale, ar: string, en: string | null) => (locale === "en" && en ? en : ar);

export interface StoreCategory {
  slug: string;
  name: string;
  count: number;
  imageUrl: string | null;
}

/** الأقسام التي فيها منتج متاح واحد على الأقل، بترتيبها في الإدارة. */
export async function listStoreCategories(locale: Locale): Promise<StoreCategory[]> {
  const sellable = await sellableVariant();
  const categories = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: {
      slug: true,
      nameAr: true,
      nameEn: true,
      products: {
        where: { ...visibleProduct, variants: { some: sellable } },
        orderBy: { createdAt: "desc" },
        select: { images: { orderBy: { sortOrder: "asc" }, take: 1, select: { key: true } } },
      },
    },
  });
  return categories
    .filter((c) => c.products.length > 0)
    .map((c) => {
      const cover = c.products.find((p) => p.images[0])?.images[0];
      return {
        slug: c.slug,
        name: locale === "en" ? c.nameEn : c.nameAr,
        count: c.products.length,
        imageUrl: cover ? imageUrl(cover.key, "thumb") : null,
      };
    });
}

export interface StoreProductCard {
  id: string;
  name: string;
  category: string;
  /** أقل سعر بين المتغيّرات المتاحة (بالجنيه، عدد صحيح كنص). */
  priceSdg: string;
  hasOptions: boolean;
  imageUrl: string | null;
  createdAt: Date;
}

export type StoreSort = "newest" | "price-asc" | "price-desc";

export async function listStoreProducts(
  locale: Locale,
  opts: { categorySlug?: string; occasionSlug?: string; q?: string; sort?: StoreSort; take?: number } = {},
): Promise<StoreProductCard[]> {
  const sellable = await sellableVariant();
  // البحث: كل كلمة (بعد توحيد الهمزات والتشكيل) في نص البحث — الاسم والقسم والمناسبات
  const terms = opts.q !== undefined ? searchTerms(opts.q) : [];
  if (opts.q !== undefined && terms.length === 0) return [];
  const products = await prisma.product.findMany({
    where: {
      ...visibleProduct,
      ...(opts.categorySlug ? { category: { isActive: true, slug: opts.categorySlug } } : {}),
      ...(opts.occasionSlug ? { occasions: { some: { occasion: { slug: opts.occasionSlug, isActive: true } } } } : {}),
      ...(terms.length ? { AND: terms.map((t) => ({ searchText: { contains: t } })) } : {}),
      variants: { some: sellable },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      nameAr: true,
      nameEn: true,
      createdAt: true,
      category: { select: { nameAr: true, nameEn: true } },
      images: { orderBy: { sortOrder: "asc" }, take: 1, select: { key: true } },
      variants: { where: sellable, select: { priceSdg: true } },
    },
  });
  const cards = products.map((p) => {
    const prices = p.variants.map((v) => dec(v.priceSdg?.toString() ?? "0"));
    const min = prices.reduce((a, b) => (b.lt(a) ? b : a));
    const image = p.images[0];
    return {
      id: p.id,
      name: nameOf(locale, p.nameAr, p.nameEn),
      category: locale === "en" ? p.category.nameEn : p.category.nameAr,
      priceSdg: min.toFixed(0),
      hasOptions: p.variants.length > 1,
      imageUrl: image ? imageUrl(image.key, "thumb") : null,
      createdAt: p.createdAt,
    };
  });
  if (opts.sort === "price-asc") cards.sort((a, b) => dec(a.priceSdg).comparedTo(b.priceSdg));
  if (opts.sort === "price-desc") cards.sort((a, b) => dec(b.priceSdg).comparedTo(a.priceSdg));
  return opts.take ? cards.slice(0, opts.take) : cards;
}

export async function getStoreCategory(locale: Locale, slug: string) {
  const c = await prisma.category.findFirst({
    where: { slug, isActive: true },
    select: { nameAr: true, nameEn: true },
  });
  return c ? { slug, name: locale === "en" ? c.nameEn : c.nameAr } : null;
}

export interface StoreVariant {
  id: string;
  label: string;
  size: string | null;
  color: string | null;
  volume: string | null;
  priceSdg: string;
}

export interface StoreProduct {
  id: string;
  name: string;
  description: string | null;
  category: { slug: string; name: string };
  images: { full: string; thumb: string; width: number; height: number }[];
  variants: StoreVariant[];
}

export async function getStoreProduct(locale: Locale, id: string): Promise<StoreProduct | null> {
  const sellable = await sellableVariant();
  const p = await prisma.product.findFirst({
    where: { id, ...visibleProduct, variants: { some: sellable } },
    select: {
      id: true,
      nameAr: true,
      nameEn: true,
      descriptionAr: true,
      descriptionEn: true,
      category: { select: { slug: true, nameAr: true, nameEn: true } },
      images: { orderBy: { sortOrder: "asc" }, select: { key: true, width: true, height: true } },
      variants: {
        where: sellable,
        orderBy: { sortOrder: "asc" },
        select: { id: true, size: true, color: true, volume: true, priceSdg: true },
      },
    },
  });
  if (!p) return null;
  return {
    id: p.id,
    name: nameOf(locale, p.nameAr, p.nameEn),
    description: locale === "en" ? (p.descriptionEn ?? p.descriptionAr) : (p.descriptionAr ?? p.descriptionEn),
    category: { slug: p.category.slug, name: locale === "en" ? p.category.nameEn : p.category.nameAr },
    images: p.images.map((i) => ({
      full: imageUrl(i.key, "full"),
      thumb: imageUrl(i.key, "thumb"),
      width: i.width,
      height: i.height,
    })),
    variants: p.variants.map((v) => ({
      id: v.id,
      label: [v.volume, v.size, v.color].filter(Boolean).join(" · "),
      size: v.size,
      color: v.color,
      volume: v.volume,
      priceSdg: dec(v.priceSdg?.toString() ?? "0").toFixed(0),
    })),
  };
}

export interface StoreOccasion {
  slug: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
}

/** المناسبات الظاهرة التي فيها منتج متاح واحد على الأقل (D-92). */
export async function listStoreOccasions(locale: Locale): Promise<StoreOccasion[]> {
  const sellable = await sellableVariant();
  const rows = await prisma.occasion.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      products: {
        where: { product: { ...visibleProduct, variants: { some: sellable } } },
        take: 1,
        select: {
          product: { select: { images: { orderBy: { sortOrder: "asc" }, take: 1, select: { key: true } } } },
        },
      },
    },
  });
  return rows
    .filter((o) => o.products.length > 0)
    .map((o) => {
      const cover = o.imageKey ?? o.products[0]?.product.images[0]?.key ?? null;
      return {
        slug: o.slug,
        name: locale === "en" ? o.nameEn : o.nameAr,
        description: locale === "en" ? (o.descriptionEn ?? o.descriptionAr) : (o.descriptionAr ?? o.descriptionEn),
        imageUrl: cover ? imageUrl(cover, "thumb") : null,
      };
    });
}

export async function getStoreOccasion(locale: Locale, slug: string): Promise<StoreOccasion | null> {
  const o = await prisma.occasion.findFirst({ where: { slug, isActive: true } });
  if (!o) return null;
  return {
    slug: o.slug,
    name: locale === "en" ? o.nameEn : o.nameAr,
    description: locale === "en" ? (o.descriptionEn ?? o.descriptionAr) : (o.descriptionAr ?? o.descriptionEn),
    imageUrl: o.imageKey ? imageUrl(o.imageKey, "full") : null,
  };
}

/** بانر الموسم اليوم (بتوقيت الخرطوم): أول مناسبة ظاهرة بالترتيب تقع اليوم في فترتها. */
export async function getSeasonBanner(locale: Locale, now = new Date()): Promise<StoreOccasion | null> {
  const today = shopDay(now);
  const rows = await prisma.occasion.findMany({
    where: { isActive: true, bannerStart: { not: null }, bannerEnd: { not: null } },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  const o = rows.find((r) =>
    isBannerDay(today, r.bannerStart ? shopDay(r.bannerStart) : null, r.bannerEnd ? shopDay(r.bannerEnd) : null),
  );
  if (!o) return null;
  return {
    slug: o.slug,
    name: locale === "en" ? o.nameEn : o.nameAr,
    description: locale === "en" ? (o.descriptionEn ?? o.descriptionAr) : (o.descriptionAr ?? o.descriptionEn),
    imageUrl: o.imageKey ? imageUrl(o.imageKey, "full") : null,
  };
}
