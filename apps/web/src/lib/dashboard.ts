import {
  dashboardBuckets,
  dec,
  marginOf,
  percentChange,
  SHOP_TIME_ZONE,
  shopDay,
  shopDayStart,
  shopMonthRange,
  type DashboardRange,
} from "@ghusn/core";
import { Prisma, prisma } from "@ghusn/db";
import { getStockSettings } from "./settings";

/**
 * لوحة المتابعة (D-94). المبيعات = فواتير المحل (بتاريخها) + طلبات المتجر المسلّمة (بتاريخ التسليم)
 * − المرتجعات، بنفس تعريف التقرير الشهري؛ الأيام والأشهر بتوقيت الخرطوم.
 */

const s = (v: { toString(): string } | null | undefined) => v?.toString() ?? "0";

async function salesBetween(start: Date, end: Date) {
  const within = { gte: start, lt: end };
  const [sales, orders, returns] = await Promise.all([
    prisma.sale.aggregate({
      where: { createdAt: within },
      _count: true,
      _sum: { totalSdg: true, revenueUsd: true, cogsUsd: true },
    }),
    prisma.order.aggregate({
      where: { status: "DELIVERED", deliveredAt: within },
      _count: true,
      _sum: { totalSdg: true, revenueUsd: true, cogsUsd: true },
    }),
    prisma.saleReturn.aggregate({
      where: { createdAt: within },
      _sum: { refundSdg: true, refundUsd: true, restockCostUsd: true },
    }),
  ]);
  // تكلفة البضاعة بالجنيه بسعر صرف كل فاتورة/طلب يوم البيع (D-133) — فلا يتغير ربح الأيام الماضية مع سعر اليوم
  const [cost] = await prisma.$queryRaw<{ sdg: Prisma.Decimal | null }[]>`
    SELECT COALESCE((SELECT SUM("cogsUsd" * "sdgPerUsd") FROM "Sale" WHERE "createdAt" >= ${start} AND "createdAt" < ${end}), 0)
         + COALESCE((SELECT SUM("cogsUsd" * COALESCE("sdgPerUsd", "totalSdg" / NULLIF("revenueUsd", 0)))
                       FROM "Order" WHERE "status" = 'DELIVERED' AND "deliveredAt" >= ${start} AND "deliveredAt" < ${end}), 0)
         - COALESCE((SELECT SUM(r."restockCostUsd" * s."sdgPerUsd") FROM "SaleReturn" r JOIN "Sale" s ON s."id" = r."saleId"
                      WHERE r."createdAt" >= ${start} AND r."createdAt" < ${end}), 0) AS "sdg"`;
  // مجمل الربح بنفس تعريف التقرير الشهري: الإيراد − المرتجع − (التكلفة − تكلفة ما عاد للمخزون)
  const revenueUsd = dec(s(sales._sum.revenueUsd)).plus(s(orders._sum.revenueUsd)).minus(s(returns._sum.refundUsd));
  const cogsUsd = dec(s(sales._sum.cogsUsd)).plus(s(orders._sum.cogsUsd)).minus(s(returns._sum.restockCostUsd));
  const gross = dec(s(sales._sum.totalSdg)).plus(s(orders._sum.totalSdg));
  const count = sales._count + orders._count;
  const netSdg = gross.minus(s(returns._sum.refundSdg));
  return {
    netSdg,
    shopSdg: dec(s(sales._sum.totalSdg)),
    storeSdg: dec(s(orders._sum.totalSdg)),
    count,
    avgTicketSdg: count ? gross.div(count) : null,
    revenueUsd,
    profitUsd: revenueUsd.minus(cogsUsd),
    profitSdg: netSdg.minus(s(cost?.sdg)),
  };
}

/** من اشترى في [start, end)، ومنهم الجدد: أول شراء مكتمل لهم فيها. */
async function buyersBetween(start: Date, end: Date) {
  const [row] = await prisma.$queryRaw<{ buyers: bigint; fresh: bigint }[]>`
    WITH p AS (
      SELECT "customerId" AS id, "createdAt" AS at FROM "Sale" WHERE "customerId" IS NOT NULL
      UNION ALL
      SELECT "customerId", "deliveredAt" FROM "Order" WHERE "status" = 'DELIVERED' AND "deliveredAt" IS NOT NULL
    ), f AS (SELECT id, MIN(at) AS first_at FROM p GROUP BY id)
    SELECT COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM p WHERE p.id = f.id AND p.at >= ${start} AND p.at < ${end})) AS "buyers",
           COUNT(*) FILTER (WHERE f.first_at >= ${start} AND f.first_at < ${end}) AS "fresh"
      FROM f`;
  return { buyers: Number(row?.buyers ?? 0), fresh: Number(row?.fresh ?? 0) };
}

const change = (cur: { toString(): string } | null, prev: { toString(): string } | null) =>
  cur === null || prev === null ? null : (percentChange(cur.toString(), prev.toString())?.toFixed(4) ?? null);

/**
 * أرقام الرئيسية لفترة (D-120، D-133): المبيعات، مجمل الربح بالجنيه (بسعر يوم البيع) والدولار والهامش،
 * متوسط الفاتورة، والعملاء — ولكل رقم نسبة تغيّره عن فترة المقارنة العادلة.
 */
export async function periodKpis(range: DashboardRange) {
  const [cur, prev, buyers, prevBuyers] = await Promise.all([
    salesBetween(range.start, range.end),
    salesBetween(range.prevStart, range.prevEnd),
    buyersBetween(range.start, range.end),
    buyersBetween(range.prevStart, range.prevEnd),
  ]);
  return {
    netSdg: cur.netSdg.toFixed(0),
    prevNetSdg: prev.netSdg.toFixed(0),
    count: cur.count,
    change: change(cur.netSdg, prev.netSdg),
    avgTicketSdg: cur.avgTicketSdg?.toFixed(0) ?? null,
    avgTicketChange: change(cur.avgTicketSdg, prev.avgTicketSdg),
    profitSdg: cur.profitSdg.toFixed(0),
    profitUsd: cur.profitUsd.toFixed(2),
    // الربح قد يكون سالباً في الفترة السابقة: لا نسبة حينها
    profitChange: change(cur.profitSdg, prev.profitSdg),
    margin: marginOf(cur.revenueUsd, cur.profitUsd)?.toFixed(4) ?? null,
    customers: buyers.buyers,
    customersChange: change(buyers.buyers, prevBuyers.buyers),
    newCustomers: buyers.fresh,
  };
}

export interface SeriesPoint {
  key: string;
  /** صافي المحل (بعد المرتجعات) والمتجر — بالجنيه. */
  shopSdg: string;
  storeSdg: string;
  totalSdg: string;
  /** عمود لم يأتِ بعد (باقي الأسبوع/الشهر/السنة). */
  future: boolean;
}

/**
 * أعمدة رسم المبيعات (D-134): يوم لكل عمود (و«اليوم» آخر 7 أيام)، وشهر للسنة — صافي المبيعات بنفس
 * تعريف الأرقام (المحل − المرتجعات + المتجر المسلَّم)، بلا مقارنة (النمو في البطاقات فوقه).
 */
export async function salesSeries(range: DashboardRange, now = new Date()): Promise<SeriesPoint[]> {
  const pattern = range.bucket === "day" ? "YYYY-MM-DD" : "YYYY-MM";
  // مفتاح العمود بتوقيت المحل — نفس صيغة مفاتيح dashboardBuckets
  const bucket = (col: string) =>
    Prisma.raw(`to_char(("${col}" AT TIME ZONE 'UTC') AT TIME ZONE '${SHOP_TIME_ZONE}', '${pattern}')`);
  const from = range.chartStart;
  const to = range.periodEnd;
  const rows = await prisma.$queryRaw<{ k: string; shop: Prisma.Decimal; store: Prisma.Decimal }[]>`
    SELECT k, SUM(shop) AS "shop", SUM(store) AS "store" FROM (
      SELECT ${bucket("createdAt")} AS k, "totalSdg" AS shop, 0 AS store
        FROM "Sale" WHERE "createdAt" >= ${from} AND "createdAt" < ${to}
      UNION ALL
      SELECT ${bucket("createdAt")}, -"refundSdg", 0
        FROM "SaleReturn" WHERE "createdAt" >= ${from} AND "createdAt" < ${to}
      UNION ALL
      SELECT ${bucket("deliveredAt")}, 0, "totalSdg"
        FROM "Order" WHERE "status" = 'DELIVERED' AND "deliveredAt" >= ${from} AND "deliveredAt" < ${to}
    ) x GROUP BY k`;
  const by = new Map(rows.map((r) => [r.k, { shop: dec(r.shop.toString()), store: dec(r.store.toString()) }]));
  const nowKey = range.bucket === "day" ? shopDay(now) : shopDay(now).slice(0, 7);
  return dashboardBuckets(range).map((key) => {
    const v = by.get(key);
    return {
      key,
      shopSdg: (v?.shop ?? dec(0)).toFixed(0),
      storeSdg: (v?.store ?? dec(0)).toFixed(0),
      totalSdg: (v ? v.shop.plus(v.store) : dec(0)).toFixed(0),
      future: !range.complete && key > nowKey,
    };
  });
}

/** مبيعات اليوم والشهر حتى الآن، ومقارنة بنفس المدة من الشهر الماضي. */
export async function salesKpis(now = new Date()) {
  const today = shopDay(now);
  const month = today.slice(0, 7);
  const { start: monthStart } = shopMonthRange(month);
  const [y, m] = month.split("-").map(Number) as [number, number];
  const prevMonth = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  const prev = shopMonthRange(prevMonth);
  // نفس عدد الأيام والساعات من بداية الشهر الماضي، ولا يتجاوز نهايته
  const prevEnd = new Date(Math.min(prev.start.getTime() + (now.getTime() - monthStart.getTime()), prev.end.getTime()));
  const [day, mtd, prevMtd] = await Promise.all([
    salesBetween(shopDayStart(today), now),
    salesBetween(monthStart, now),
    salesBetween(prev.start, prevEnd),
  ]);
  return {
    today: { netSdg: day.netSdg.toFixed(0), count: day.count },
    month: {
      netSdg: mtd.netSdg.toFixed(0),
      count: mtd.count,
      avgTicketSdg: mtd.avgTicketSdg?.toFixed(0) ?? null,
      change: percentChange(mtd.netSdg, prevMtd.netSdg)?.toFixed(4) ?? null,
    },
  };
}

/** الأكثر مبيعاً هذا الشهر (المحل + طلبات المتجر المسلّمة) بالكمية. */
export async function topProducts(take = 5, now = new Date()) {
  const { start } = shopMonthRange(shopDay(now).slice(0, 7));
  const rows = await prisma.$queryRaw<{ productId: string; name: string; qty: Prisma.Decimal; sdg: Prisma.Decimal }[]>`
    SELECT p."id" AS "productId", p."nameAr" AS "name", SUM(x."qty") AS "qty", SUM(x."sdg") AS "sdg"
      FROM (
        SELECT sl."variantId", sl."qty", sl."netSdg" AS "sdg"
          FROM "SaleLine" sl JOIN "Sale" s ON s."id" = sl."saleId" WHERE s."createdAt" >= ${start}
        UNION ALL
        SELECT ol."variantId", ol."qty", ol."lineTotalSdg"
          FROM "OrderLine" ol JOIN "Order" o ON o."id" = ol."orderId"
         WHERE o."status" = 'DELIVERED' AND o."deliveredAt" >= ${start}
      ) x
      JOIN "ProductVariant" v ON v."id" = x."variantId"
      JOIN "Product" p ON p."id" = v."productId"
     GROUP BY p."id", p."nameAr"
     ORDER BY SUM(x."qty") DESC, SUM(x."sdg") DESC
     LIMIT ${take}`;
  return rows.map((r) => ({ productId: r.productId, name: r.name, qty: r.qty.toString(), sdg: r.sdg.toString() }));
}

/** أصناف البيع التي رصيدها عند الحد أو أقل (حد المنتج، وإلا العام) — ما استُلم منه شيء من قبل. */
export async function lowStock(take = 8) {
  const { lowStockQty } = await getStockSettings();
  const rows = await prisma.$queryRaw<
    {
      variantId: string;
      productId: string;
      name: string;
      size: string | null;
      color: string | null;
      volume: string | null;
      qty: Prisma.Decimal;
      total: bigint;
    }[]
  >`
    SELECT v."id" AS "variantId", p."id" AS "productId", p."nameAr" AS "name", v."size", v."color", v."volume",
           l."qty", COUNT(*) OVER () AS "total"
      FROM "StockLevel" l
      JOIN "ProductVariant" v ON v."id" = l."variantId"
      JOIN "Product" p ON p."id" = v."productId"
     WHERE p."type" = 'STOCK' AND p."deletedAt" IS NULL AND p."isActive"
       AND v."deletedAt" IS NULL AND v."isActive"
       AND l."qty" <= COALESCE(p."lowStockQty", ${lowStockQty})
     ORDER BY l."qty" ASC, p."nameAr" ASC
     LIMIT ${take}`;
  return {
    total: Number(rows[0]?.total ?? 0),
    items: rows.map((r) => ({
      variantId: r.variantId,
      productId: r.productId,
      label: [r.name, r.volume, r.size, r.color].filter(Boolean).join(" · "),
      qty: r.qty.toString(),
    })),
  };
}

/** دفعات بها رصيد تنتهي صلاحيتها خلال المهلة (أو انتهت). */
export async function expiringBatches(take = 8, now = new Date()) {
  const { expiryAlertDays } = await getStockSettings();
  const limit = shopDay(new Date(now.getTime() + expiryAlertDays * 86_400_000));
  const where = { qtyRemaining: { gt: 0 }, expiresAt: { not: null, lte: new Date(`${limit}T00:00:00Z`) } };
  const [total, rows] = await Promise.all([
    prisma.stockBatch.count({ where }),
    prisma.stockBatch.findMany({
      where,
      orderBy: { expiresAt: "asc" },
      take,
      include: { variant: { include: { product: { select: { id: true, nameAr: true } } } } },
    }),
  ]);
  const today = shopDay(now);
  return {
    total,
    days: expiryAlertDays,
    items: rows.map((b) => {
      const day = b.expiresAt?.toISOString().slice(0, 10) ?? "";
      return {
        id: b.id,
        productId: b.variant.product.id,
        label: [b.variant.product.nameAr, b.variant.volume, b.variant.size, b.variant.color]
          .filter(Boolean)
          .join(" · "),
        qty: b.qtyRemaining.toString(),
        expiresOn: day,
        expired: day < today,
      };
    }),
  };
}

/** الورديات المفتوحة الآن ومبيعاتها. */
export async function openShifts() {
  const rows = await prisma.shift.findMany({
    where: { closedAt: null },
    orderBy: { openedAt: "asc" },
    include: { user: { select: { name: true } }, _count: { select: { sales: true } } },
  });
  return rows.map((sh) => ({ id: sh.id, userName: sh.user.name, openedAt: sh.openedAt, sales: sh._count.sales }));
}
