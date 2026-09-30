import {
  actualMargin,
  dec,
  effectiveMargins,
  reviewPrice,
  searchTerms,
  variantLabel,
  type PriceReviewKind,
} from "@ghusn/core";
import { Prisma, prisma, type PriceChangeReason } from "@ghusn/db";
import { SELLING_CURRENCY, getRateAt } from "./exchange-rates";

export class PricingError extends Error {}

export const REVIEW_LABELS: Record<PriceReviewKind, string> = {
  NO_COST: "بلا تكلفة بعد",
  NEEDS_PRICE: "بلا سعر",
  LOW: "هامش منخفض",
  HIGH: "هامش مرتفع",
  OK: "مناسب",
};

export const REASON_LABELS: Record<PriceChangeReason, string> = {
  INITIAL: "أول سعر",
  REVIEW_UP: "رفع (هامش منخفض)",
  REVIEW_DOWN: "تخفيض (هامش مرتفع)",
  MANUAL: "تعديل يدوي",
};

/** سعر الجنيه الساري الآن — كل التسعير عليه. */
export async function currentSellingRate(): Promise<string | null> {
  return getRateAt(SELLING_CURRENCY, new Date());
}

const ATTENTION: PriceReviewKind[] = ["LOW", "NEEDS_PRICE", "HIGH"];

/** صف مراجعة سعر: كل القيم نصوص (تُرسل لمكوّن المتصفح — للمالك والمديرة فقط). */
export interface PriceRow {
  variantId: string;
  productId: string;
  label: string;
  sku: string;
  qty: string;
  avgCostUsd: string;
  priceSdg: string | null;
  kind: PriceReviewKind;
  margin: string | null;
  suggestedSdg: string | null;
  suggestedMargin: string | null;
  targetMargin: string;
  minMargin: string;
}

const variantInclude = {
  stockLevel: true,
  product: {
    select: {
      id: true,
      nameAr: true,
      targetMargin: true,
      minMargin: true,
      category: { select: { targetMargin: true, minMargin: true } },
    },
  },
} satisfies Prisma.ProductVariantInclude;

type VariantForPricing = Prisma.ProductVariantGetPayload<{ include: typeof variantInclude }>;

function toRow(v: VariantForPricing, rate: string): PriceRow {
  const margins = effectiveMargins(
    { targetMargin: v.product.category.targetMargin.toString(), minMargin: v.product.category.minMargin.toString() },
    {
      targetMargin: v.product.targetMargin?.toString() ?? null,
      minMargin: v.product.minMargin?.toString() ?? null,
    },
  );
  const avgCostUsd = v.stockLevel?.avgCostUsd.toString() ?? "0";
  const priceSdg = v.priceSdg?.toString() ?? null;
  const r = reviewPrice({ priceSdg, avgCostUsd, sdgPerUsd: rate, ...margins });
  return {
    variantId: v.id,
    productId: v.product.id,
    label: [v.product.nameAr, variantLabel(v)].filter(Boolean).join(" · "),
    sku: v.sku,
    qty: v.stockLevel?.qty.toString() ?? "0",
    avgCostUsd,
    priceSdg,
    kind: r.kind,
    margin: r.margin?.toString() ?? null,
    suggestedSdg: r.suggestedSdg?.toFixed(0) ?? null,
    suggestedMargin: r.suggestedMargin?.toString() ?? null,
    targetMargin: margins.targetMargin.toString(),
    minMargin: margins.minMargin.toString(),
  };
}

const sellable = {
  deletedAt: null,
  isActive: true,
  product: { deletedAt: null, isActive: true, type: "STOCK" as const },
} satisfies Prisma.ProductVariantWhereInput;

/**
 * لوحة «منتجات تحتاج مراجعة سعر» (currency-and-costing §5، D-79): بلا سعر، أو هامش تحت
 * الحد الأدنى، أو أعلى من المستهدف بعشر نقاط — بسعر الجنيه الساري الآن.
 */
export async function listPriceReview({ q = "", all = false }: { q?: string; all?: boolean }) {
  const rate = await currentSellingRate();
  if (!rate) return { rate: null, rows: [] as PriceRow[], counts: null };
  const terms = searchTerms(q);
  const variants = await prisma.productVariant.findMany({
    where: { ...sellable, product: { ...sellable.product, AND: terms.map((t) => ({ searchText: { contains: t } })) } },
    include: variantInclude,
    orderBy: [{ product: { nameAr: "asc" } }, { sortOrder: "asc" }],
  });
  const rows = variants.map((v) => toRow(v, rate));
  const counts = {
    LOW: rows.filter((r) => r.kind === "LOW").length,
    NEEDS_PRICE: rows.filter((r) => r.kind === "NEEDS_PRICE").length,
    HIGH: rows.filter((r) => r.kind === "HIGH").length,
  };
  const order = (k: PriceReviewKind) => (ATTENTION.includes(k) ? ATTENTION.indexOf(k) : ATTENTION.length);
  return {
    rate,
    counts,
    rows: (all ? rows : rows.filter((r) => ATTENTION.includes(r.kind))).sort((a, b) => order(a.kind) - order(b.kind)),
  };
}

/** عدد الأصناف التي تحتاج مراجعة (للوحة الرئيسية). */
export async function countPriceReview(): Promise<number | null> {
  const { rate, counts } = await listPriceReview({});
  if (!rate || !counts) return null;
  return Object.values(counts).reduce((a, b) => a + b, 0);
}

export interface PriceInput {
  variantId: string;
  priceSdg: string;
  note: string | null;
}

/**
 * اعتماد أسعار (D-24): بسعر الجنيه الساري لحظة الموافقة، ويُسجَّل كل تغيير في PriceHistory
 * مع التكلفة والهامش. سعر تحت الحد الأدنى للهامش يحتاج سبباً مكتوباً.
 */
export async function approvePrices(items: PriceInput[], userId: string): Promise<number> {
  const rate = await currentSellingRate();
  if (!rate) throw new PricingError("لا يوجد سعر للجنيه — أدخليه من شاشة سعر الصرف أولاً.");
  const ids = [...new Set(items.map((i) => i.variantId))];
  if (ids.length !== items.length) throw new PricingError("صنف مكرر في القائمة.");

  return prisma.$transaction(async (tx) => {
    // قفل المتغيّرات: اعتمادان متزامنان لنفس الصنف يُسجَّلان بالترتيب لا فوق بعض
    await tx.$queryRaw`SELECT "id" FROM "ProductVariant" WHERE "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR UPDATE`;
    const variants = await tx.productVariant.findMany({
      where: { id: { in: ids }, ...sellable },
      include: variantInclude,
    });
    const byId = new Map(variants.map((v) => [v.id, v]));
    let changed = 0;
    for (const item of items) {
      const v = byId.get(item.variantId);
      if (!v) throw new PricingError("صنف غير موجود أو غير معروض للبيع.");
      const price = dec(item.priceSdg);
      if (!price.isInteger() || price.lte(0)) throw new PricingError("السعر بالجنيه رقم صحيح أكبر من صفر.");
      if (v.priceSdg && price.eq(v.priceSdg.toString())) continue;

      const before = toRow(v, rate);
      const cost = dec(before.avgCostUsd);
      const margin = cost.gt(0) ? actualMargin({ priceSdg: price, sdgPerUsd: rate, avgCostUsd: cost }) : null;
      if (margin && margin.lt(before.minMargin) && !item.note) {
        throw new PricingError(
          `${before.label}: السعر ${price.toFixed(0)} هامشه ${margin.mul(100).toFixed(1)}% تحت الحد الأدنى — اكتبي السبب.`,
        );
      }
      const reason: PriceChangeReason = !v.priceSdg
        ? "INITIAL"
        : before.kind === "LOW"
          ? "REVIEW_UP"
          : before.kind === "HIGH"
            ? "REVIEW_DOWN"
            : "MANUAL";
      await tx.productVariant.update({ where: { id: v.id }, data: { priceSdg: price.toFixed(2) } });
      await tx.priceHistory.create({
        data: {
          variantId: v.id,
          oldPriceSdg: v.priceSdg,
          newPriceSdg: price.toFixed(2),
          sdgPerUsd: rate,
          avgCostUsd: cost.toFixed(6),
          margin: margin?.toDecimalPlaces(6).toFixed(6) ?? null,
          reason,
          note: item.note,
          approvedById: userId,
        },
      });
      changed += 1;
    }
    return changed;
  });
}

/** تجاوز هوامش القسم لمنتج (فارغ = هامش القسم). */
export async function setProductMargins(
  productId: string,
  input: { targetMargin: string | null; minMargin: string | null },
): Promise<void> {
  const product = await prisma.product.findFirst({
    where: { id: productId, deletedAt: null },
    include: { category: { select: { targetMargin: true, minMargin: true } } },
  });
  if (!product) throw new PricingError("المنتج غير موجود.");
  try {
    effectiveMargins(
      { targetMargin: product.category.targetMargin.toString(), minMargin: product.category.minMargin.toString() },
      input,
    );
  } catch {
    throw new PricingError("الهامش بين 0% و99%، والحد الأدنى لا يزيد عن المستهدف.");
  }
  await prisma.product.update({ where: { id: productId }, data: input });
}

/** أسعار منتج: للجميع السعر فقط؛ لمن يعتمد الأسعار: التكلفة والهامش والاقتراح والسجل. */
export async function getProductPricing(productId: string, withCost: boolean) {
  const variants = await prisma.productVariant.findMany({
    where: { productId, deletedAt: null },
    orderBy: { sortOrder: "asc" },
    include: variantInclude,
  });
  if (!withCost) {
    return {
      rate: null,
      rows: null,
      prices: variants.map((v) => ({
        variantId: v.id,
        label: variantLabel(v) || v.product.nameAr,
        priceSdg: v.priceSdg?.toString() ?? null,
      })),
      history: [],
    };
  }
  const rate = await currentSellingRate();
  const history = await prisma.priceHistory.findMany({
    where: { variant: { productId } },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { approvedBy: { select: { name: true } }, variant: { select: { size: true, color: true, volume: true } } },
  });
  return {
    rate,
    rows: rate ? variants.map((v) => toRow(v, rate)) : null,
    prices: variants.map((v) => ({
      variantId: v.id,
      label: variantLabel(v) || v.product.nameAr,
      priceSdg: v.priceSdg?.toString() ?? null,
    })),
    history: history.map((h) => ({
      id: h.id,
      variant: variantLabel(h.variant),
      oldPriceSdg: h.oldPriceSdg?.toString() ?? null,
      newPriceSdg: h.newPriceSdg.toString(),
      sdgPerUsd: h.sdgPerUsd.toString(),
      margin: h.margin?.toString() ?? null,
      reason: h.reason,
      note: h.note,
      by: h.approvedBy.name,
      at: h.createdAt,
    })),
  };
}
