import { occasionSlug, shopDay, shopDayStart } from "@ghusn/core";
import { Prisma, prisma } from "@ghusn/db";
import { refreshSearchText } from "./catalog";
import { ImageError, savePublicImage } from "./product-images";

/**
 * إدارة المناسبات (D-92): الاسم والوصف بالعربي والإنجليزي، الرابط، الصورة، الترتيب، التفعيل، ونافذة
 * بانر الموسم. لا حذف — إيقاف المناسبة يخفيها من المتجر ويبقي ربط المنتجات.
 */

export class OccasionError extends Error {}

/** يوم YYYY-MM-DD يُخزَّن كبداية يوم المحل؛ والعكس للنماذج. */
const toDay = (d: Date | null) => (d ? shopDay(d) : "");

export async function listOccasionsForAdmin() {
  const rows = await prisma.occasion.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: { _count: { select: { products: { where: { product: { deletedAt: null } } } } } },
  });
  return rows.map((o) => ({
    id: o.id,
    slug: o.slug,
    nameAr: o.nameAr,
    nameEn: o.nameEn,
    descriptionAr: o.descriptionAr ?? "",
    descriptionEn: o.descriptionEn ?? "",
    imageKey: o.imageKey,
    isActive: o.isActive,
    sortOrder: o.sortOrder,
    bannerStart: toDay(o.bannerStart),
    bannerEnd: toDay(o.bannerEnd),
    products: o._count.products,
  }));
}

/** خيارات المناسبات لنموذج المنتج (الاسم والمعرّف فقط). */
export async function listOccasionOptions() {
  return prisma.occasion.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, nameAr: true, isActive: true },
  });
}

export interface OccasionInput {
  id: string | null;
  slug: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string | null;
  descriptionEn: string | null;
  isActive: boolean;
  sortOrder: number;
  bannerStart: string | null;
  bannerEnd: string | null;
  image: File | null;
  removeImage: boolean;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function saveOccasion(input: OccasionInput): Promise<void> {
  const slug = occasionSlug(input.slug);
  if (!slug) throw new OccasionError("الرابط بحروف إنجليزية صغيرة وأرقام وشرطات (مثل mothers-day).");
  const start = input.bannerStart || null;
  const end = input.bannerEnd || null;
  if ((start && !DAY.test(start)) || (end && !DAY.test(end))) throw new OccasionError("تاريخ البانر غير صحيح.");
  if (!!start !== !!end) throw new OccasionError("حددي تاريخ بداية البانر ونهايته معاً، أو اتركيهما فارغين.");
  if (start && end && start > end) throw new OccasionError("نهاية البانر قبل بدايته.");

  let imageKey: string | null | undefined;
  if (input.image && input.image.size > 0) {
    try {
      imageKey = await savePublicImage(input.image, "occasions");
    } catch (e) {
      if (e instanceof ImageError) throw new OccasionError(e.message);
      throw e;
    }
  } else if (input.removeImage) {
    imageKey = null;
  }

  const data = {
    slug,
    nameAr: input.nameAr,
    nameEn: input.nameEn,
    descriptionAr: input.descriptionAr,
    descriptionEn: input.descriptionEn,
    isActive: input.isActive,
    sortOrder: input.sortOrder,
    bannerStart: start ? shopDayStart(start) : null,
    bannerEnd: end ? shopDayStart(end) : null,
    ...(imageKey !== undefined ? { imageKey } : {}),
  };
  try {
    await prisma.$transaction(async (tx) => {
      if (!input.id) {
        await tx.occasion.create({ data });
        return;
      }
      const before = await tx.occasion.findUniqueOrThrow({ where: { id: input.id } });
      await tx.occasion.update({ where: { id: input.id }, data });
      // اسم المناسبة جزء من نص بحث منتجاتها
      if (before.nameAr !== input.nameAr || before.nameEn !== input.nameEn) {
        const links = await tx.productOccasion.findMany({
          where: { occasionId: input.id },
          select: { productId: true },
        });
        for (const l of links) await refreshSearchText(tx, l.productId);
      }
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new OccasionError("هذا الرابط مستخدم لمناسبة أخرى.");
    }
    throw e;
  }
}

/** ربط منتج بمناسباته (يستبدل القائمة) — داخل معاملة حفظ المنتج. */
export async function setProductOccasions(
  tx: Prisma.TransactionClient,
  productId: string,
  occasionIds: string[],
): Promise<void> {
  const valid = occasionIds.length
    ? (await tx.occasion.findMany({ where: { id: { in: occasionIds } }, select: { id: true } })).map((o) => o.id)
    : [];
  await tx.productOccasion.deleteMany({ where: { productId } });
  if (valid.length)
    await tx.productOccasion.createMany({ data: valid.map((occasionId) => ({ productId, occasionId })) });
}
