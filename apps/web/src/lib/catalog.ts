import {
  buildSearchText,
  checkBarcode,
  cleanOptions,
  formatSku,
  internalBarcode,
  searchTerms,
  validateVariants,
  variantLabel,
  type VariantIssue,
} from "@ghusn/core";
import { Prisma, prisma, type ProductType, type StockUnit } from "@ghusn/db";
import { z } from "zod";
import { setProductOccasions } from "./occasions";

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
      occasions: { select: { occasionId: true } },
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
  /** المناسبات (D-92) — غير موجودة = لا تغيير (الإنشاء السريع والاستيراد). */
  occasionIds: z.array(z.string().min(1).max(40)).max(30).optional(),
  /** حد «قارب على النفاد» لهذا المنتج (D-94) — غير موجود = لا تغيير، null = الحد العام. */
  lowStockQty: z
    .string()
    .regex(/^\d{1,6}(\.\d{1,3})?$/)
    .nullable()
    .optional(),
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

/** نص البحث الموحّد: الاسمان والقسم والمناسبات والمتغيّرات (يبحث به المتجر ولوحة الإدارة). */
export async function refreshSearchText(tx: Tx, productId: string) {
  const p = await tx.product.findUniqueOrThrow({
    where: { id: productId },
    include: {
      category: true,
      variants: { where: { deletedAt: null } },
      occasions: { include: { occasion: { select: { nameAr: true, nameEn: true } } } },
    },
  });
  const searchText = buildSearchText([
    p.nameAr,
    p.nameEn,
    p.category.nameAr,
    p.category.nameEn,
    ...p.occasions.flatMap((o) => [o.occasion.nameAr, o.occasion.nameEn]),
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
    ...(input.lowStockQty !== undefined ? { lowStockQty: input.lowStockQty } : {}),
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
      if (input.occasionIds) await setProductOccasions(tx, product.id, input.occasionIds);
      await refreshSearchText(tx, product.id);
      return product.id;
    });
  } catch (error) {
    mapDbError(error);
  }
}

export const OPTION_KINDS = ["volume", "size", "color"] as const;
export type OptionKind = (typeof OPTION_KINDS)[number];

/**
 * إنشاء سريع من شاشة الشحنة (D-84): الاسم والقسم والنوع والوحدة، ومتغيّرات اختيارية من نوع
 * واحد (مثل الحجم: 50ml، 100ml). يمر بنفس createProduct (SKU، الباركود، البحث)، والصور
 * والوصف تُكمَّل لاحقاً من صفحة المنتج. يعيد المتغيّرات لإضافتها للبنود مباشرة.
 */
export async function quickCreateProduct(
  input: {
    nameAr: string;
    categoryId: string;
    type: "STOCK" | "MATERIAL";
    unit: "PIECE" | "METER" | "SHEET";
    trackExpiry: boolean;
    optionKind: OptionKind;
    options: string[];
    barcode: string | null;
  },
  userId: string,
) {
  const options = [...new Set(input.options.map((o) => o.trim()).filter(Boolean))];
  if (options.length > 1 && input.barcode) {
    throw new CatalogError("باركود المصنع لمتغيّر واحد فقط — أضيفي باركودات المتغيرات من صفحة المنتج.");
  }
  const variants = (options.length ? options : [null]).map((o) => ({
    size: input.optionKind === "size" ? o : null,
    color: input.optionKind === "color" ? o : null,
    volume: input.optionKind === "volume" ? o : null,
    barcode: options.length <= 1 ? input.barcode : null,
    isActive: true,
  }));
  const category = await prisma.category.findFirst({ where: { id: input.categoryId, isActive: true } });
  if (!category) throw new CatalogError("اختاري القسم.");
  const productId = await createProduct(
    {
      nameAr: input.nameAr,
      nameEn: null,
      descriptionAr: null,
      descriptionEn: null,
      categoryId: input.categoryId,
      type: input.type,
      unit: input.unit,
      trackExpiry: input.trackExpiry,
      isActive: true,
      isWebVisible: false,
      variants,
    },
    userId,
  );
  const created = await prisma.productVariant.findMany({
    where: { productId },
    orderBy: { sortOrder: "asc" },
    select: { id: true, sku: true, size: true, color: true, volume: true },
  });
  return created.map((v) => ({
    variantId: v.id,
    label: [input.nameAr, variantLabel(v)].filter(Boolean).join(" · "),
    sku: v.sku,
    unit: input.unit,
  }));
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
      if (input.occasionIds) await setProductOccasions(tx, id, input.occasionIds);
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
