import {
  dec,
  isDeadStock,
  marginOf,
  reorderSuggestion,
  shopDay,
  shopDayStart,
  variantLabel,
  type Decimal,
} from "@ghusn/core";
import { prisma } from "@ghusn/db";
import { getInsightsSettings, type InsightsSettings } from "./settings";

/**
 * التحليلات (D-118) — للمالك والمديرة: الأكثر ربحاً، الراكد، إعادة الطلب، الموظفات، القسم والمناسبة.
 * المبيعات = فواتير المحل (بتاريخها) + طلبات المتجر المسلّمة (بتاريخ التسليم)، والإيراد بالدولار بسعر
 * جنيه الفاتورة أو الطلب. المرتجع يُطرح بتاريخه: إيراده، وتكلفة ما عاد سليماً للمخزون.
 */

export type Range = { start: Date; end: Date; fromDay: string; toDay: string };

export const PERIODS = ["7", "30", "90"] as const;

/** الفترة: 7/30/90 يوماً حتى اليوم، أو من/إلى بأيام المحل. الافتراضي 30 يوماً. */
export function parsePeriod(params: { p?: string; from?: string; to?: string }): Range & { period: string | null } {
  const DAY = /^\d{4}-\d{2}-\d{2}$/;
  const today = shopDay(new Date());
  const nextDay = (d: string) => shopDay(new Date(shopDayStart(d).getTime() + 36 * 3_600_000));
  if (params.from && params.to && DAY.test(params.from) && DAY.test(params.to)) {
    const [a, b] = params.from <= params.to ? [params.from, params.to] : [params.to, params.from];
    const start = shopDayStart(a);
    const end = shopDayStart(nextDay(b));
    if ((end.getTime() - start.getTime()) / 86_400_000 <= 366) {
      return { start, end, fromDay: a, toDay: b, period: null };
    }
  }
  const p = params.p && (PERIODS as readonly string[]).includes(params.p) ? params.p : "30";
  const end = shopDayStart(nextDay(today));
  const start = new Date(end.getTime() - Number(p) * 86_400_000);
  return { start, end, fromDay: shopDay(start), toDay: today, period: p };
}

// ---------- مبيعات الأصناف ----------

export interface ItemSales {
  variantId: string;
  productId: string;
  label: string;
  sku: string;
  categoryId: string;
  category: string;
  /** الحد الأدنى للهامش (المنتج أو قسمه) للتظليل */
  minMargin: string;
  qty: Decimal;
  sdg: Decimal;
  usd: Decimal;
  cost: Decimal;
  returnedQty: Decimal;
  returnedSdg: Decimal;
  returnedUsd: Decimal;
  /** تكلفة ما عاد سليماً للمخزون (تُطرح من التكلفة) */
  returnedCost: Decimal;
}

export const netQty = (i: ItemSales) => i.qty.minus(i.returnedQty);
export const netSdg = (i: ItemSales) => i.sdg.minus(i.returnedSdg);
export const netUsd = (i: ItemSales) => i.usd.minus(i.returnedUsd);
export const profitUsd = (i: ItemSales) => netUsd(i).minus(i.cost.minus(i.returnedCost));

const variantSelect = {
  sku: true,
  size: true,
  color: true,
  volume: true,
  product: {
    select: {
      id: true,
      nameAr: true,
      minMargin: true,
      category: { select: { id: true, nameAr: true, minMargin: true } },
    },
  },
} as const;

type VariantInfo = {
  sku: string;
  size: string | null;
  color: string | null;
  volume: string | null;
  product: {
    id: string;
    nameAr: string;
    minMargin: { toString(): string } | null;
    category: { id: string; nameAr: string; minMargin: { toString(): string } };
  };
};

export async function itemSales(range: { start: Date; end: Date }): Promise<ItemSales[]> {
  const within = { gte: range.start, lt: range.end };
  const [saleLines, orderLines, returnLines] = await Promise.all([
    prisma.saleLine.findMany({
      where: { sale: { createdAt: within } },
      select: {
        variantId: true,
        qty: true,
        netSdg: true,
        costUsd: true,
        sale: { select: { sdgPerUsd: true } },
        variant: { select: variantSelect },
      },
    }),
    prisma.orderLine.findMany({
      where: { order: { status: "DELIVERED", deliveredAt: within } },
      select: {
        variantId: true,
        qty: true,
        lineTotalSdg: true,
        unitCostUsd: true,
        order: { select: { sdgPerUsd: true } },
        variant: { select: variantSelect },
      },
    }),
    prisma.saleReturnLine.findMany({
      where: { saleReturn: { createdAt: within } },
      select: {
        qty: true,
        damagedQty: true,
        refundSdg: true,
        unitCostUsd: true,
        saleLine: {
          select: { variantId: true, sale: { select: { sdgPerUsd: true } }, variant: { select: variantSelect } },
        },
      },
    }),
  ]);
  const items = new Map<string, ItemSales>();
  const item = (variantId: string, v: VariantInfo) => {
    let it = items.get(variantId);
    if (!it) {
      it = {
        variantId,
        productId: v.product.id,
        label: [v.product.nameAr, variantLabel(v)].filter(Boolean).join(" · "),
        sku: v.sku,
        categoryId: v.product.category.id,
        category: v.product.category.nameAr,
        minMargin: (v.product.minMargin ?? v.product.category.minMargin).toString(),
        qty: dec(0),
        sdg: dec(0),
        usd: dec(0),
        cost: dec(0),
        returnedQty: dec(0),
        returnedSdg: dec(0),
        returnedUsd: dec(0),
        returnedCost: dec(0),
      };
      items.set(variantId, it);
    }
    return it;
  };
  for (const l of saleLines) {
    const it = item(l.variantId, l.variant);
    it.qty = it.qty.plus(l.qty.toString());
    it.sdg = it.sdg.plus(l.netSdg.toString());
    it.usd = it.usd.plus(dec(l.netSdg.toString()).div(l.sale.sdgPerUsd.toString()));
    it.cost = it.cost.plus(l.costUsd.toString());
  }
  for (const l of orderLines) {
    const it = item(l.variantId, l.variant);
    const rate = l.order.sdgPerUsd?.toString();
    it.qty = it.qty.plus(l.qty.toString());
    it.sdg = it.sdg.plus(l.lineTotalSdg.toString());
    if (rate) it.usd = it.usd.plus(dec(l.lineTotalSdg.toString()).div(rate));
    it.cost = it.cost.plus(dec(l.qty.toString()).mul(l.unitCostUsd?.toString() ?? "0"));
  }
  for (const r of returnLines) {
    const it = item(r.saleLine.variantId, r.saleLine.variant);
    it.returnedQty = it.returnedQty.plus(r.qty.toString());
    it.returnedSdg = it.returnedSdg.plus(r.refundSdg.toString());
    it.returnedUsd = it.returnedUsd.plus(dec(r.refundSdg.toString()).div(r.saleLine.sale.sdgPerUsd.toString()));
    // التالف لا يعود للمخزون فتبقى تكلفته خسارة
    it.returnedCost = it.returnedCost.plus(
      dec(r.qty.toString()).minus(r.damagedQty.toString()).mul(r.unitCostUsd.toString()),
    );
  }
  return [...items.values()];
}

// ---------- الأكثر ربحاً ----------

export async function profitInsights(range: Range) {
  const items = await itemSales(range);
  const rows = items
    .map((i) => {
      const profit = profitUsd(i);
      const margin = marginOf(netUsd(i), profit);
      return {
        variantId: i.variantId,
        label: i.label,
        category: i.category,
        qty: netQty(i).toFixed(),
        revenueSdg: netSdg(i).toFixed(0),
        revenueUsd: netUsd(i).toFixed(2),
        profitUsd: profit.toFixed(2),
        margin: margin?.toFixed(4) ?? null,
        belowMin: margin !== null && margin.lt(i.minMargin),
        minMargin: i.minMargin,
      };
    })
    .filter((r) => !dec(r.qty).isZero() || !dec(r.revenueUsd).isZero());
  const revenueSdg = items.reduce((a, i) => a.plus(netSdg(i)), dec(0));
  const revenueUsd = items.reduce((a, i) => a.plus(netUsd(i)), dec(0));
  const profit = items.reduce((a, i) => a.plus(profitUsd(i)), dec(0));
  const pieces = items.reduce((a, i) => a.plus(netQty(i)), dec(0));
  return {
    byProfit: [...rows].sort((a, b) => dec(b.profitUsd).cmp(a.profitUsd)),
    byQty: [...rows].sort((a, b) => dec(b.qty).cmp(a.qty)).slice(0, 10),
    totals: {
      revenueSdg: revenueSdg.toFixed(0),
      revenueUsd: revenueUsd.toFixed(2),
      profitUsd: profit.toFixed(2),
      margin: marginOf(revenueUsd, profit)?.toFixed(4) ?? null,
      items: rows.filter((r) => dec(r.qty).gt(0)).length,
      pieces: pieces.toFixed(),
    },
  };
}

// ---------- الموظفات ----------

/** فواتير المحل لكل بائعة (طلبات المتجر لا تُنسب لبائعة). */
export async function staffInsights(range: Range) {
  const sales = await prisma.sale.findMany({
    where: { createdAt: { gte: range.start, lt: range.end } },
    select: {
      cashierId: true,
      cashier: { select: { name: true } },
      subtotalSdg: true,
      totalSdg: true,
      lineDiscountSdg: true,
      invoiceDiscountSdg: true,
      revenueUsd: true,
      cogsUsd: true,
      approvedById: true,
    },
  });
  const by = new Map<
    string,
    {
      name: string;
      count: number;
      subtotal: Decimal;
      total: Decimal;
      discount: Decimal;
      profit: Decimal;
      approvals: number;
    }
  >();
  for (const s of sales) {
    const r = by.get(s.cashierId) ?? {
      name: s.cashier.name,
      count: 0,
      subtotal: dec(0),
      total: dec(0),
      discount: dec(0),
      profit: dec(0),
      approvals: 0,
    };
    r.count += 1;
    r.subtotal = r.subtotal.plus(s.subtotalSdg.toString());
    r.total = r.total.plus(s.totalSdg.toString());
    r.discount = r.discount.plus(s.lineDiscountSdg.toString()).plus(s.invoiceDiscountSdg.toString());
    r.profit = r.profit.plus(dec(s.revenueUsd.toString()).minus(s.cogsUsd.toString()));
    if (s.approvedById) r.approvals += 1;
    by.set(s.cashierId, r);
  }
  return [...by.values()]
    .map((r) => ({
      name: r.name,
      count: r.count,
      totalSdg: r.total.toFixed(0),
      avgSdg: r.total.div(r.count).toFixed(0),
      discountSdg: r.discount.toFixed(0),
      discountRate: r.subtotal.gt(0) ? r.discount.div(r.subtotal).toFixed(4) : null,
      profitUsd: r.profit.toFixed(2),
      approvals: r.approvals,
    }))
    .sort((a, b) => dec(b.totalSdg).cmp(a.totalSdg));
}

// ---------- القسم والمناسبة ----------

export async function breakdownInsights(range: Range) {
  const items = await itemSales(range);
  const group = (key: (i: ItemSales) => string[]) => {
    const m = new Map<string, { sdg: Decimal; usd: Decimal; profit: Decimal; qty: Decimal }>();
    for (const i of items) {
      for (const k of key(i)) {
        const r = m.get(k) ?? { sdg: dec(0), usd: dec(0), profit: dec(0), qty: dec(0) };
        r.sdg = r.sdg.plus(netSdg(i));
        r.usd = r.usd.plus(netUsd(i));
        r.profit = r.profit.plus(profitUsd(i));
        r.qty = r.qty.plus(netQty(i));
        m.set(k, r);
      }
    }
    return [...m.entries()]
      .map(([label, r]) => ({
        label,
        revenueSdg: r.sdg.toFixed(0),
        revenueUsd: r.usd.toFixed(2),
        profitUsd: r.profit.toFixed(2),
        margin: marginOf(r.usd, r.profit)?.toFixed(4) ?? null,
        qty: r.qty.toFixed(),
      }))
      .sort((a, b) => dec(b.revenueSdg).cmp(a.revenueSdg));
  };
  // الصنف بأكثر من مناسبة يُحسب في كل مناسباته (D-118)
  const links = await prisma.productOccasion.findMany({
    where: { productId: { in: [...new Set(items.map((i) => i.productId))] } },
    select: { productId: true, occasion: { select: { nameAr: true } } },
  });
  const occasions = new Map<string, string[]>();
  for (const l of links) occasions.set(l.productId, [...(occasions.get(l.productId) ?? []), l.occasion.nameAr]);
  const categoryMin = new Map(items.map((i) => [i.category, i.minMargin]));
  return {
    categories: group((i) => [i.category]).map((c) => ({
      ...c,
      belowMin: c.margin !== null && dec(c.margin).lt(categoryMin.get(c.label) ?? 0),
    })),
    occasions: group((i) => occasions.get(i.productId) ?? [NO_OCCASION]),
  };
}

export const NO_OCCASION = "بلا مناسبة";

// ---------- المخزون: الراكد وإعادة الطلب ----------

async function stockFacts(settings: InsightsSettings) {
  const now = new Date();
  const windowStart = new Date(now.getTime() - settings.salesWindowDays * 86_400_000);
  const [variants, lastSale, lastOrder, receipts, soldShop, soldWeb, inbound] = await Promise.all([
    prisma.productVariant.findMany({
      where: { deletedAt: null, isActive: true, product: { deletedAt: null, type: "STOCK" } },
      select: {
        id: true,
        ...variantSelect,
        stockLevel: { select: { qty: true, avgCostUsd: true } },
      },
    }),
    prisma.$queryRaw<{ variantId: string; at: Date }[]>`
      SELECT l."variantId", MAX(s."createdAt") AS "at" FROM "SaleLine" l JOIN "Sale" s ON s."id" = l."saleId" GROUP BY 1`,
    prisma.$queryRaw<{ variantId: string; at: Date }[]>`
      SELECT l."variantId", MAX(o."deliveredAt") AS "at" FROM "OrderLine" l JOIN "Order" o ON o."id" = l."orderId"
       WHERE o."status" = 'DELIVERED' GROUP BY 1`,
    prisma.$queryRaw<{ variantId: string; first: Date; last: Date }[]>`
      SELECT "variantId", MIN("createdAt") AS "first", MAX("createdAt") AS "last" FROM "StockMovement"
       WHERE "kind" = 'RECEIPT' GROUP BY 1`,
    prisma.$queryRaw<{ variantId: string; qty: string }[]>`
      SELECT l."variantId", SUM(l."qty")::text AS "qty" FROM "SaleLine" l JOIN "Sale" s ON s."id" = l."saleId"
       WHERE s."createdAt" >= ${windowStart} GROUP BY 1`,
    prisma.$queryRaw<{ variantId: string; qty: string }[]>`
      SELECT l."variantId", SUM(l."qty")::text AS "qty" FROM "OrderLine" l JOIN "Order" o ON o."id" = l."orderId"
       WHERE o."status" = 'DELIVERED' AND o."deliveredAt" >= ${windowStart} GROUP BY 1`,
    // شحنات لم تُستلم بعد (ولم تُلغَ ولا مسودة)
    prisma.$queryRaw<{ variantId: string; qty: string }[]>`
      SELECT l."variantId", SUM(l."qty")::text AS "qty" FROM "ShipmentLine" l JOIN "Shipment" sh ON sh."id" = l."shipmentId"
       WHERE sh."status" IN ('PURCHASED', 'IN_TRANSIT', 'IN_CUSTOMS', 'ARRIVED') GROUP BY 1`,
  ]);
  const map = <T extends { variantId: string }>(rows: T[]) => new Map(rows.map((r) => [r.variantId, r]));
  const sale = map(lastSale);
  const order = map(lastOrder);
  const rec = map(receipts);
  const shop = map(soldShop);
  const web = map(soldWeb);
  const coming = map(inbound);
  return variants.map((v) => {
    const a = sale.get(v.id)?.at ?? null;
    const b = order.get(v.id)?.at ?? null;
    return {
      variantId: v.id,
      label: [v.product.nameAr, variantLabel(v)].filter(Boolean).join(" · "),
      sku: v.sku,
      category: v.product.category.nameAr,
      qty: dec(v.stockLevel?.qty.toString() ?? "0"),
      avgCostUsd: dec(v.stockLevel?.avgCostUsd.toString() ?? "0"),
      lastSaleAt: a && b ? (a > b ? a : b) : (a ?? b),
      firstReceivedAt: rec.get(v.id)?.first ?? null,
      lastReceivedAt: rec.get(v.id)?.last ?? null,
      soldQty: dec(shop.get(v.id)?.qty ?? "0").plus(web.get(v.id)?.qty ?? "0"),
      inboundQty: dec(coming.get(v.id)?.qty ?? "0"),
    };
  });
}

export async function stockInsights() {
  const settings = await getInsightsSettings();
  const facts = await stockFacts(settings);
  const now = new Date();
  const dead = facts
    .filter((f) =>
      isDeadStock({
        qty: f.qty,
        lastSaleAt: f.lastSaleAt,
        lastReceivedAt: f.lastReceivedAt,
        now,
        days: settings.deadStockDays,
      }),
    )
    .map((f) => ({
      variantId: f.variantId,
      label: f.label,
      sku: f.sku,
      category: f.category,
      qty: f.qty.toFixed(),
      valueUsd: f.qty.mul(f.avgCostUsd).toFixed(2),
      lastSaleAt: f.lastSaleAt,
      since: f.firstReceivedAt,
    }))
    .sort((a, b) => dec(b.valueUsd).cmp(a.valueUsd));
  const reorder = facts
    .map((f) => {
      const s = reorderSuggestion({
        soldQty: f.soldQty,
        windowDays: settings.salesWindowDays,
        stockQty: f.qty,
        inboundQty: f.inboundQty,
        leadDays: settings.leadTimeDays,
        coverDays: settings.coverDays,
        minSold: settings.reorderMinSold,
      });
      if (!s || s.suggestQty.isZero()) return null;
      return {
        variantId: f.variantId,
        label: f.label,
        sku: f.sku,
        category: f.category,
        perDay: s.perDay.toFixed(2),
        qty: f.qty.toFixed(),
        inboundQty: f.inboundQty.toFixed(),
        daysLeft: s.daysLeft?.floor().toFixed() ?? null,
        suggestQty: s.suggestQty.toFixed(),
        costUsd: f.avgCostUsd.gt(0) ? s.suggestQty.mul(f.avgCostUsd).toFixed(2) : null,
        urgent: s.urgent,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => Number(b.urgent) - Number(a.urgent) || dec(a.daysLeft ?? 0).cmp(b.daysLeft ?? 0));
  return {
    settings,
    dead,
    deadValueUsd: dead.reduce((a, d) => a.plus(d.valueUsd), dec(0)).toFixed(2),
    reorder,
    reorderCostUsd: reorder.reduce((a, r) => a.plus(r.costUsd ?? 0), dec(0)).toFixed(2),
    urgentCount: reorder.filter((r) => r.urgent).length,
  };
}
