import {
  dec,
  isBannerDay,
  isLowStock,
  normalizeArabic,
  pickSeasonTile,
  searchTerms,
  shopDay,
  type SeasonTileState,
} from "@ghusn/core";
import { prisma, type Prisma } from "@ghusn/db";
import type { Locale } from "@/i18n/routing";
import { availableQtyByVariant, availableVariantIds } from "./orders";
import { imageUrl } from "./product-images";
import { getStockSettings } from "./settings";

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
  /** المتغيّر الوحيد (أو الأرخص) — زر «+» في البطاقة يضيفه مباشرة إن لم تكن هناك خيارات. */
  defaultVariantId: string;
  imageUrl: string | null;
  createdAt: Date;
}

/** حقول البطاقة من قاعدة البيانات — مشتركة بين القوائم و«قد يعجبك أيضاً». */
function cardSelect(sellable: Prisma.ProductVariantWhereInput) {
  return {
    id: true,
    nameAr: true,
    nameEn: true,
    createdAt: true,
    category: { select: { nameAr: true, nameEn: true } },
    images: { orderBy: { sortOrder: "asc" }, take: 1, select: { key: true } },
    variants: { where: sellable, select: { id: true, priceSdg: true } },
  } satisfies Prisma.ProductSelect;
}

type CardRow = Prisma.ProductGetPayload<{ select: ReturnType<typeof cardSelect> }>;

function toCard(locale: Locale, p: CardRow): StoreProductCard {
  const priced = p.variants.map((v) => ({ id: v.id, price: dec(v.priceSdg?.toString() ?? "0") }));
  const cheapest = priced.reduce((a, b) => (b.price.lt(a.price) ? b : a));
  const image = p.images[0];
  return {
    id: p.id,
    name: nameOf(locale, p.nameAr, p.nameEn),
    category: locale === "en" ? p.category.nameEn : p.category.nameAr,
    priceSdg: cheapest.price.toFixed(0),
    hasOptions: p.variants.length > 1,
    defaultVariantId: cheapest.id,
    imageUrl: image ? imageUrl(image.key, "thumb") : null,
    createdAt: p.createdAt,
  };
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
    // بلا ترتيب بالسعر: الترتيب من قاعدة البيانات، فالحد يُطبَّق هناك (الاقتراحات، الصفوف)
    ...(opts.take && !opts.sort ? { take: opts.take } : {}),
    select: cardSelect(sellable),
  });
  const cards = products.map((p) => toCard(locale, p));
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
  /** «كمية محدودة»: المتاح عند حد التنبيه أو أقل (D-103). العدد نفسه لا يُرسل. */
  limited: boolean;
}

export interface StoreProduct {
  id: string;
  name: string;
  description: string | null;
  category: { slug: string; name: string };
  occasions: { slug: string; name: string }[];
  images: { full: string; medium: string; thumb: string; width: number; height: number }[];
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
      lowStockQty: true,
      category: { select: { slug: true, nameAr: true, nameEn: true } },
      occasions: {
        where: { occasion: { isActive: true } },
        orderBy: { occasion: { sortOrder: "asc" } },
        select: { occasion: { select: { slug: true, nameAr: true, nameEn: true } } },
      },
      images: { orderBy: { sortOrder: "asc" }, select: { key: true, width: true, height: true } },
      variants: {
        where: sellable,
        orderBy: { sortOrder: "asc" },
        select: { id: true, size: true, color: true, volume: true, priceSdg: true },
      },
    },
  });
  if (!p) return null;
  const available = await availableQtyByVariant(p.variants.map((v) => v.id));
  const { lowStockQty } = await getStockSettings();
  return {
    id: p.id,
    name: nameOf(locale, p.nameAr, p.nameEn),
    // كل لغة بوصفها فقط — لا نص عربي في الصفحة الإنجليزية (D-104)
    description: (locale === "en" ? p.descriptionEn : p.descriptionAr) || null,
    category: { slug: p.category.slug, name: locale === "en" ? p.category.nameEn : p.category.nameAr },
    occasions: p.occasions.map(({ occasion: o }) => ({ slug: o.slug, name: locale === "en" ? o.nameEn : o.nameAr })),
    images: p.images.map((i) => ({
      full: imageUrl(i.key, "full"),
      medium: imageUrl(i.key, "medium"),
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
      limited: isLowStock(available.get(v.id) ?? 0, p.lowStockQty?.toString() ?? null, lowStockQty),
    })),
  };
}

/**
 * «قد يعجبك أيضاً» (D-103): منتجات من نفس القسم (الأحدث)، ثم تكملة من مناسبات المنتج نفسه.
 */
export async function listRelatedProducts(
  locale: Locale,
  product: Pick<StoreProduct, "id" | "category" | "occasions">,
  take = 5,
): Promise<StoreProductCard[]> {
  const sellable = await sellableVariant();
  const base = { ...visibleProduct, id: { not: product.id }, variants: { some: sellable } };
  const sameCategory = await prisma.product.findMany({
    where: { ...base, category: { isActive: true, slug: product.category.slug } },
    orderBy: { createdAt: "desc" },
    take,
    select: cardSelect(sellable),
  });
  const rows = [...sameCategory];
  const slugs = product.occasions.map((o) => o.slug);
  if (rows.length < take && slugs.length) {
    rows.push(
      ...(await prisma.product.findMany({
        where: {
          ...base,
          id: { notIn: [product.id, ...rows.map((r) => r.id)] },
          occasions: { some: { occasion: { slug: { in: slugs }, isActive: true } } },
        },
        orderBy: { createdAt: "desc" },
        take: take - rows.length,
        select: cardSelect(sellable),
      })),
    );
  }
  return rows.map((r) => toCard(locale, r));
}

export interface StoreOccasion {
  slug: string;
  name: string;
  description: string | null;
  /** الأيقونة المربعة (دوائر المناسبات)، أو صورة أول منتج. */
  imageUrl: string | null;
  /** الغلاف العريض 2:1 (بطاقة الموسم، أعلى صفحة المناسبة) — بلا بديل (D-102). */
  coverUrl: string | null;
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
      const icon = o.imageKey ?? o.products[0]?.product.images[0]?.key ?? null;
      return {
        slug: o.slug,
        name: locale === "en" ? o.nameEn : o.nameAr,
        description: locale === "en" ? (o.descriptionEn ?? o.descriptionAr) : (o.descriptionAr ?? o.descriptionEn),
        imageUrl: icon ? imageUrl(icon, "thumb") : null,
        coverUrl: o.coverKey ? imageUrl(o.coverKey, "full") : null,
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
    coverUrl: o.coverKey ? imageUrl(o.coverKey, "full") : null,
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
    coverUrl: o.coverKey ? imageUrl(o.coverKey, "full") : null,
  };
}

export interface SeasonTile {
  state: SeasonTileState;
  slug: string;
  name: string;
  coverUrl: string | null;
  /** أيام المحل (YYYY-MM-DD) — للشارة «حتى …» أو «من …». */
  start: string | null;
  end: string | null;
  /** عدد الهدايا المتاحة وأقل سعر — للسطر تحت الاسم (0 = لا يظهر). */
  count: number;
  minPriceSdg: string | null;
}

/**
 * بطاقة «هدايا الموسم» في الرئيسية (D-102): موسم فعّال ← أو يبدأ خلال 14 يوماً («قريباً») ← أو أول
 * مناسبة فيها منتجات. ثابتة بلا تبديل.
 */
export async function getSeasonTile(locale: Locale, now = new Date()): Promise<SeasonTile | null> {
  const sellable = await sellableVariant();
  const rows = await prisma.occasion.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      _count: { select: { products: { where: { product: { ...visibleProduct, variants: { some: sellable } } } } } },
    },
  });
  const days = rows.map((o) => ({
    start: o.bannerStart ? shopDay(o.bannerStart) : null,
    end: o.bannerEnd ? shopDay(o.bannerEnd) : null,
    hasProducts: o._count.products > 0,
  }));
  const pick = pickSeasonTile(shopDay(now), days);
  if (!pick) return null;
  const o = rows[pick.index]!;
  const products = o._count.products ? await listStoreProducts(locale, { occasionSlug: o.slug }) : [];
  const min = products.reduce<string | null>((m, p) => (m === null || dec(p.priceSdg).lt(m) ? p.priceSdg : m), null);
  return {
    state: pick.state,
    slug: o.slug,
    name: locale === "en" ? o.nameEn : o.nameAr,
    coverUrl: o.coverKey ? imageUrl(o.coverKey, "medium") : null,
    start: days[pick.index]!.start,
    end: days[pick.index]!.end,
    count: products.length,
    minPriceSdg: min,
  };
}

export interface SearchSuggestions {
  products: { id: string; name: string; category: string; priceSdg: string; imageUrl: string | null }[];
  categories: { slug: string; name: string }[];
  occasions: { slug: string; name: string }[];
}

/** كل كلمات البحث موجودة في الاسم (بالعربي أو الإنجليزي) بعد التوحيد. */
const matchesAll = (terms: string[], ...names: (string | null | undefined)[]) => {
  const text = normalizeArabic(names.filter(Boolean).join(" "));
  return terms.every((t) => text.includes(t));
};

/**
 * اقتراحات البحث أثناء الكتابة (D-100): حتى 6 منتجات، و3 أقسام، و3 مناسبات — بنفس منطق صفحة البحث
 * (كل كلمة بعد توحيد الهمزات والتاء المربوطة). بلا تكلفة ولا كميات.
 */
export async function searchSuggestions(locale: Locale, q: string): Promise<SearchSuggestions> {
  const terms = searchTerms(q);
  if (terms.length === 0) return { products: [], categories: [], occasions: [] };
  const [products, categories, occasions] = await Promise.all([
    listStoreProducts(locale, { q, take: 6 }),
    prisma.category.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { slug: true, nameAr: true, nameEn: true },
    }),
    listStoreOccasions(locale),
  ]);
  return {
    products: products.map(({ id, name, category, priceSdg, imageUrl }) => ({
      id,
      name,
      category,
      priceSdg,
      imageUrl,
    })),
    categories: categories
      .filter((c) => matchesAll(terms, c.nameAr, c.nameEn))
      .slice(0, 3)
      .map((c) => ({ slug: c.slug, name: locale === "en" ? c.nameEn : c.nameAr })),
    occasions: occasions
      .filter((o) => matchesAll(terms, o.name))
      .slice(0, 3)
      .map((o) => ({ slug: o.slug, name: o.name })),
  };
}
