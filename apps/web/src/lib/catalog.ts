import {
  buildSearchText,
  checkBarcode,
  cleanOptions,
  formatSku,
  internalBarcode,
  searchTerms,
  validateVariants,
  type VariantIssue,
} from "@ghusn/core";
import { Prisma, prisma, type ProductType, type StockUnit } from "@ghusn/db";
import { z } from "zod";

export const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  STOCK: "بضاعة للبيع",
  MATERIAL: "مادة تغليف (داخلية)",
};
export const STOCK_UNIT_LABELS: Record<StockUnit, string> = { PIECE: "حبة", METER: "متر", SHEET: "ورقة" };

export const PAGE_SIZE = 30;

// ---------- القراءة ----------

export async function listCategories() {
  return prisma.category.findMany({ orderBy: { sortOrder: "asc" } });
}

/**
 * خيارات الأقسام للنماذج في المتصفح: الاسم والمعرّف فقط.
 * لا تُمرَّر سجلات الأقسام الكاملة لمكوّنات المتصفح — فيها الهوامش (للمالك والمديرة فقط).
 */
export async function listCategoryOptions(includeId?: string) {
  return prisma.category.findMany({
    where: { OR: [{ isActive: true }, ...(includeId ? [{ id: includeId }] : [])] },
    orderBy: { sortOrder: "asc" },
    select: { id: true, nameAr: true },
  });
}

export async function listProducts({ q, categoryId, page = 1 }: { q?: string; categoryId?: string; page?: number }) {
  const terms = searchTerms(q ?? "");
  const where: Prisma.ProductWhereInput = {
    deletedAt: null,
    ...(categoryId ? { categoryId } : {}),
    // كل كلمة يجب أن توجد في نص البحث الموحّد (فهرس trigram يسرّع ILIKE)
    AND: terms.map((t) => ({ searchText: { contains: t } })),
  };
  const [total, items] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        category: { select: { nameAr: true } },
        variants: {
          where: { deletedAt: null },
          orderBy: { sortOrder: "asc" },
          select: { id: true, sku: true, barcode: true, size: true, color: true, volume: true, isActive: true },
        },
        images: { orderBy: { sortOrder: "asc" }, take: 1, select: { key: true } },
      },
    }),
  ]);
  return { total, items, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export async function getProduct(id: string) {
  return prisma.product.findFirst({
    where: { id, deletedAt: null },
    include: {
      category: { select: { nameAr: true } },
      variants: { where: { deletedAt: null }, orderBy: { sortOrder: "asc" } },
      images: { orderBy: { sortOrder: "asc" } },
    },
  });
}

// ---------- التحقق ----------

// حقل نصي اختياري: فارغ أو null أو غائب ← null
const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `النص أطول من ${max} حرفاً`)
    .nullish()
    .transform((v) => v || null);

const variantInput = z.object({
  id: z.string().optional(),
  size: optional(40),
  color: optional(40),
  volume: optional(40),
  barcode: optional(40),
  isActive: z.boolean().default(true),
});

export const productInput = z.object({
  nameAr: z.string().trim().min(2, "اكتبي اسم المنتج بالعربي").max(120, "الاسم طويل جداً"),
  nameEn: optional(120),
  descriptionAr: optional(2000),
  descriptionEn: optional(2000),
  categoryId: z.string().min(1, "اختاري القسم"),
  type: z.enum(["STOCK", "MATERIAL"]),
  unit: z.enum(["PIECE", "METER", "SHEET"]),
  trackExpiry: z.boolean(),
  isActive: z.boolean(),
  isWebVisible: z.boolean(),
  variants: z.array(variantInput),
});
export type ProductInput = z.infer<typeof productInput>;

const ISSUE_MESSAGES: Record<VariantIssue["code"], (i: VariantIssue) => string> = {
  NO_VARIANTS: () => "أضيفي متغيّراً واحداً على الأقل.",
  TOO_MANY_VARIANTS: () => "عدد المتغيرات أكبر من المسموح (50).",
  MISSING_OPTIONS: (i) => `المتغيّر رقم ${"index" in i ? i.index + 1 : ""}: اكتبي المقاس أو اللون أو الحجم.`,
  DUPLICATE_OPTIONS: (i) => `المتغيّر رقم ${"index" in i ? i.index + 1 : ""} مكرر.`,
  DUPLICATE_BARCODE: (i) => `الباركود في المتغيّر رقم ${"index" in i ? i.index + 1 : ""} مكرر.`,
};

export class CatalogError extends Error {}

function checkVariants(variants: ProductInput["variants"]) {
  const issue = validateVariants(variants)[0];
  if (issue) throw new CatalogError(ISSUE_MESSAGES[issue.code](issue));
  return variants.map((v, index) => {
    if (!v.barcode) return { ...cleanOptions(v), index };
    const check = checkBarcode(v.barcode);
    if (!check.ok) {
      throw new CatalogError(
        check.reason === "CHECK_DIGIT"
          ? `باركود المتغيّر رقم ${index + 1} غير صحيح — تأكدي من الأرقام.`
          : `باركود المتغيّر رقم ${index + 1}: أرقام وحروف لاتينية فقط.`,
      );
    }
    return { ...cleanOptions(v), barcode: check.value, index };
  });
}

// ---------- الكتابة ----------

type Tx = Prisma.TransactionClient;

async function nextSequence(tx: Tx, name: "sku_seq" | "internal_barcode_seq"): Promise<bigint> {
  const [row] = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval(${name}::regclass) AS n`;
  if (!row) throw new Error(`sequence ${name} failed`);
  return row.n;
}

async function nextInternalBarcode(tx: Tx): Promise<string> {
  // نادر جداً: باركود مصنع يبدأ بـ 200 بنفس الرقم — نتخطاه
  for (;;) {
    const code = internalBarcode(await nextSequence(tx, "internal_barcode_seq"));
    if (!(await tx.productVariant.findUnique({ where: { barcode: code }, select: { id: true } }))) return code;
  }
}

async function refreshSearchText(tx: Tx, productId: string) {
  const p = await tx.product.findUniqueOrThrow({
    where: { id: productId },
    include: { category: true, variants: { where: { deletedAt: null } } },
  });
  const searchText = buildSearchText([
    p.nameAr,
    p.nameEn,
    p.category.nameAr,
    p.category.nameEn,
    ...p.variants.flatMap((v) => [v.sku, v.barcode, v.size, v.color, v.volume]),
  ]);
  await tx.product.update({ where: { id: productId }, data: { searchText } });
}

function productData(input: ProductInput) {
  return {
    nameAr: input.nameAr,
    nameEn: input.nameEn,
    descriptionAr: input.descriptionAr,
    descriptionEn: input.descriptionEn,
    categoryId: input.categoryId,
    type: input.type,
    unit: input.unit,
    trackExpiry: input.trackExpiry,
    isActive: input.isActive,
    // مواد التغليف داخلية ولا تظهر في المتجر
    isWebVisible: input.type === "STOCK" && input.isWebVisible,
  };
}

/** تحويل أخطاء التفرّد في قاعدة البيانات إلى رسالة واضحة. */
function mapDbError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    throw new CatalogError("هذا الباركود مستخدم لمنتج آخر.");
  }
  throw error;
}

export async function createProduct(input: ProductInput, userId: string): Promise<string> {
  const variants = checkVariants(input.variants);
  try {
    return await prisma.$transaction(async (tx) => {
      const product = await tx.product.create({ data: { ...productData(input), createdById: userId } });
      for (const v of variants) {
        await tx.productVariant.create({
          data: {
            productId: product.id,
            sku: formatSku(await nextSequence(tx, "sku_seq")),
            barcode: v.barcode ?? (await nextInternalBarcode(tx)),
            size: v.size,
            color: v.color,
            volume: v.volume,
            isActive: v.isActive,
            sortOrder: v.index,
          },
        });
      }
      await refreshSearchText(tx, product.id);
      return product.id;
    });
  } catch (error) {
    mapDbError(error);
  }
}

export async function updateProduct(id: string, input: ProductInput): Promise<void> {
  const variants = checkVariants(input.variants);
  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.product.findFirst({
        where: { id, deletedAt: null },
        include: { variants: { where: { deletedAt: null } } },
      });
      if (!existing) throw new CatalogError("المنتج غير موجود.");
      await tx.product.update({ where: { id }, data: productData(input) });

      const ownIds = new Set(existing.variants.map((v) => v.id));
      const keptIds = new Set(variants.flatMap((v) => (v.id ? [v.id] : [])));
      for (const keptId of keptIds) {
        if (!ownIds.has(keptId)) throw new CatalogError("متغيّر غير معروف.");
      }

      // المتغيّر المحذوف يُؤرشف (قد يكون له مخزون أو مبيعات لاحقاً) — لا يُحذف فعلياً
      const removed = existing.variants.filter((v) => !keptIds.has(v.id)).map((v) => v.id);
      if (removed.length) {
        await tx.productVariant.updateMany({ where: { id: { in: removed } }, data: { deletedAt: new Date() } });
      }

      for (const v of variants) {
        const data = { size: v.size, color: v.color, volume: v.volume, isActive: v.isActive, sortOrder: v.index };
        if (v.id) {
          // باركود فارغ عند التعديل = إبقاء الحالي
          await tx.productVariant.update({
            where: { id: v.id },
            data: v.barcode ? { ...data, barcode: v.barcode } : data,
          });
        } else {
          await tx.productVariant.create({
            data: {
              ...data,
              productId: id,
              sku: formatSku(await nextSequence(tx, "sku_seq")),
              barcode: v.barcode ?? (await nextInternalBarcode(tx)),
            },
          });
        }
      }
      await refreshSearchText(tx, id);
    });
  } catch (error) {
    if (error instanceof CatalogError) throw error;
    mapDbError(error);
  }
}

/** أرشفة (حذف منطقي) — يختفي من القوائم ويبقى في السجلات. */
export async function archiveProduct(id: string): Promise<void> {
  await prisma.product.updateMany({ where: { id, deletedAt: null }, data: { deletedAt: new Date(), isActive: false } });
}
