import { bannerWindow, isValidBannerWindow, MAX_HOME_BANNERS, shopDay, type BannerWindow } from "@ghusn/core";
import { prisma, type BannerLink } from "@ghusn/db";
import { ImageError, imageUrl, savePublicImage } from "./product-images";

/**
 * بانرات الرئيسية (D-101): تديرها المديرة من «البانرات». يظهر حتى 3 مفعّلة في مدتها بالترتيب؛ بلا بانر
 * يظهر بانر الهوية. الصور عامة (WebP)، ومقاس متوسط للجوال.
 */

export class BannerError extends Error {}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** عمود DATE يعود منتصف ليل UTC — اليوم نفسه بلا إزاحة. */
const dayOf = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const dateOf = (day: string | null) => (day ? new Date(`${day}T00:00:00Z`) : null);

const liveWhere = { isActive: true, deletedAt: null };

function hrefOf(type: BannerLink, target: string | null): string {
  switch (type) {
    case "CATEGORY":
      return target ? `/c/${target}` : "/products";
    case "OCCASION":
      return target ? `/occasion/${target}` : "/products";
    case "PRODUCT":
      return target ? `/p/${target}` : "/products";
    case "GIFT":
      return "/gift";
    default:
      return "/products";
  }
}

export interface StoreBanner {
  id: string;
  title: string;
  text: string | null;
  cta: string;
  badge: string | null;
  href: string;
  desktopSrc: string;
  mobileSrc: string;
}

/** البانرات الظاهرة اليوم بلغة الزائر. */
export async function listStoreBanners(locale: string, now = new Date()): Promise<StoreBanner[]> {
  const today = shopDay(now);
  const rows = await prisma.banner.findMany({
    where: liveWhere,
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    take: 20,
  });
  const en = locale === "en";
  return rows
    .filter((b) => bannerWindow(today, dayOf(b.startsOn), dayOf(b.endsOn)) === "live")
    .slice(0, MAX_HOME_BANNERS)
    .map((b) => ({
      id: b.id,
      title: en ? b.titleEn : b.titleAr,
      text: (en ? b.textEn : b.textAr) || null,
      cta: en ? b.ctaEn : b.ctaAr,
      badge: (en ? b.badgeEn : b.badgeAr) || null,
      href: hrefOf(b.linkType, b.linkTarget),
      desktopSrc: imageUrl(b.imageKey, "full"),
      mobileSrc: imageUrl(b.mobileImageKey ?? b.imageKey, "medium"),
    }));
}

export interface AdminBanner {
  id: string;
  titleAr: string;
  titleEn: string;
  textAr: string;
  textEn: string;
  ctaAr: string;
  ctaEn: string;
  badgeAr: string;
  badgeEn: string;
  linkType: BannerLink;
  linkTarget: string;
  startsOn: string;
  endsOn: string;
  isActive: boolean;
  imageUrl: string;
  mobileImageUrl: string | null;
  /** «يظهر الآن» أو «مجدول» أو «منتهٍ» أو «موقوف» — وأيضاً «زائد» إن تجاوز الحد. */
  status: BannerWindow | "off" | "overflow";
}

export async function listBannersForAdmin(now = new Date()): Promise<AdminBanner[]> {
  const today = shopDay(now);
  const rows = await prisma.banner.findMany({
    where: { deletedAt: null },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  let live = 0;
  return rows.map((b) => {
    const w = bannerWindow(today, dayOf(b.startsOn), dayOf(b.endsOn));
    let status: AdminBanner["status"] = b.isActive ? w : "off";
    if (status === "live" && ++live > MAX_HOME_BANNERS) status = "overflow";
    return {
      id: b.id,
      titleAr: b.titleAr,
      titleEn: b.titleEn,
      textAr: b.textAr ?? "",
      textEn: b.textEn ?? "",
      ctaAr: b.ctaAr,
      ctaEn: b.ctaEn,
      badgeAr: b.badgeAr ?? "",
      badgeEn: b.badgeEn ?? "",
      linkType: b.linkType,
      linkTarget: b.linkTarget ?? "",
      startsOn: dayOf(b.startsOn) ?? "",
      endsOn: dayOf(b.endsOn) ?? "",
      isActive: b.isActive,
      imageUrl: imageUrl(b.imageKey, "thumb"),
      mobileImageUrl: b.mobileImageKey ? imageUrl(b.mobileImageKey, "thumb") : null,
      status,
    };
  });
}

/** خيارات وجهة الزر: الأقسام والمناسبات والمنتجات المعروضة. */
export async function listBannerLinkOptions() {
  const [categories, occasions, products] = await Promise.all([
    prisma.category.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { slug: true, nameAr: true },
    }),
    prisma.occasion.findMany({ orderBy: { sortOrder: "asc" }, select: { slug: true, nameAr: true } }),
    prisma.product.findMany({
      where: { deletedAt: null, isActive: true, isWebVisible: true, type: "STOCK" },
      orderBy: { nameAr: "asc" },
      select: { id: true, nameAr: true },
      take: 500,
    }),
  ]);
  return {
    categories: categories.map((c) => ({ value: c.slug, label: c.nameAr })),
    occasions: occasions.map((o) => ({ value: o.slug, label: o.nameAr })),
    products: products.map((p) => ({ value: p.id, label: p.nameAr })),
  };
}

export interface BannerInput {
  id: string | null;
  titleAr: string;
  titleEn: string;
  textAr: string | null;
  textEn: string | null;
  ctaAr: string;
  ctaEn: string;
  badgeAr: string | null;
  badgeEn: string | null;
  linkType: BannerLink;
  linkTarget: string | null;
  startsOn: string | null;
  endsOn: string | null;
  isActive: boolean;
  image: File | null;
  mobileImage: File | null;
  removeMobileImage: boolean;
}

async function upload(file: File): Promise<string> {
  try {
    return await savePublicImage(file, "banners", { medium: true });
  } catch (e) {
    if (e instanceof ImageError) throw new BannerError(e.message);
    throw e;
  }
}

async function assertTarget(type: BannerLink, target: string | null) {
  if (type === "PRODUCTS" || type === "GIFT") return null;
  if (!target) throw new BannerError("اختاري وجهة الزر.");
  const ok =
    type === "CATEGORY"
      ? await prisma.category.count({ where: { slug: target } })
      : type === "OCCASION"
        ? await prisma.occasion.count({ where: { slug: target } })
        : await prisma.product.count({ where: { id: target, deletedAt: null } });
  if (!ok) throw new BannerError("وجهة الزر غير موجودة.");
  return target;
}

export async function saveBanner(input: BannerInput): Promise<void> {
  const start = input.startsOn || null;
  const end = input.endsOn || null;
  if ((start && !DAY.test(start)) || (end && !DAY.test(end))) throw new BannerError("التاريخ غير صحيح.");
  if (!isValidBannerWindow(start, end)) throw new BannerError("تاريخ النهاية قبل البداية.");
  const linkTarget = await assertTarget(input.linkType, input.linkTarget);
  const hasImage = !!input.image && input.image.size > 0;
  if (!input.id && !hasImage) throw new BannerError("اختاري صورة البانر.");

  // الصور تُحفظ قبل الكتابة — المفتاح من المحتوى، فإعادة المحاولة لا تكرّرها
  const imageKey = hasImage ? await upload(input.image!) : undefined;
  const mobileImageKey =
    input.mobileImage && input.mobileImage.size > 0
      ? await upload(input.mobileImage)
      : input.removeMobileImage
        ? null
        : undefined;

  const data = {
    titleAr: input.titleAr,
    titleEn: input.titleEn,
    textAr: input.textAr,
    textEn: input.textEn,
    ctaAr: input.ctaAr,
    ctaEn: input.ctaEn,
    badgeAr: input.badgeAr,
    badgeEn: input.badgeEn,
    linkType: input.linkType,
    linkTarget,
    startsOn: dateOf(start),
    endsOn: dateOf(end),
    isActive: input.isActive,
    ...(mobileImageKey !== undefined ? { mobileImageKey } : {}),
  };
  if (input.id) {
    const found = await prisma.banner.count({ where: { id: input.id, deletedAt: null } });
    if (!found) throw new BannerError("البانر غير موجود.");
    await prisma.banner.update({ where: { id: input.id }, data: { ...data, ...(imageKey ? { imageKey } : {}) } });
    return;
  }
  const last = await prisma.banner.aggregate({ where: { deletedAt: null }, _max: { sortOrder: true } });
  await prisma.banner.create({ data: { ...data, imageKey: imageKey!, sortOrder: (last._max.sortOrder ?? -1) + 1 } });
}

/** حذف ناعم (السجل يبقى). */
export async function deleteBanner(id: string): Promise<void> {
  await prisma.banner.updateMany({ where: { id, deletedAt: null }, data: { deletedAt: new Date(), isActive: false } });
}

/** تحريك البانر خطوة للأعلى أو الأسفل؛ يعيد ترقيم الكل بالترتيب الحالي. */
export async function moveBanner(id: string, direction: "up" | "down"): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const rows = await tx.banner.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true },
    });
    const i = rows.findIndex((r) => r.id === id);
    const j = direction === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= rows.length) return;
    [rows[i], rows[j]] = [rows[j]!, rows[i]!];
    for (const [k, r] of rows.entries()) await tx.banner.update({ where: { id: r.id }, data: { sortOrder: k } });
  });
}
