import { dec, percentChange, SHOP_TIME_ZONE, shopDay, shopDayStart, shopMonthRange } from "@ghusn/core";
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
    prisma.sale.aggregate({ where: { createdAt: within }, _count: true, _sum: { totalSdg: true } }),
    prisma.order.aggregate({
      where: { status: "DELIVERED", deliveredAt: within },
      _count: true,
      _sum: { totalSdg: true },
    }),
    prisma.saleReturn.aggregate({ where: { createdAt: within }, _sum: { refundSdg: true } }),
  ]);
  const gross = dec(s(sales._sum.totalSdg)).plus(s(orders._sum.totalSdg));
  const count = sales._count + orders._count;
  return {
    netSdg: gross.minus(s(returns._sum.refundSdg)),
    shopSdg: dec(s(sales._sum.totalSdg)),
    storeSdg: dec(s(orders._sum.totalSdg)),
    count,
    avgTicketSdg: count ? gross.div(count) : null,
  };
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

export interface DayPoint {
  day: string;
  shopSdg: string;
  storeSdg: string;
  totalSdg: string;
}

/** المبيعات اليومية لآخر 30 يوماً (المحل والمتجر)، كل الأيام حتى الفارغة. */
export async function dailySales(days = 30, now = new Date()): Promise<DayPoint[]> {
  const today = shopDay(now);
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i--)
    keys.push(shopDay(new Date(shopDayStart(today).getTime() - i * 86_400_000 + 43_200_000)));
  const start = shopDayStart(keys[0] ?? today);
  const tz = Prisma.raw(`'${SHOP_TIME_ZONE}'`);
  const [shop, store] = await Promise.all([
    prisma.$queryRaw<{ day: string; sdg: Prisma.Decimal }[]>`
      SELECT to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS "day", SUM("totalSdg") AS "sdg"
        FROM "Sale" WHERE "createdAt" >= ${start} GROUP BY 1`,
    prisma.$queryRaw<{ day: string; sdg: Prisma.Decimal }[]>`
      SELECT to_char(("deliveredAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS "day", SUM("totalSdg") AS "sdg"
        FROM "Order" WHERE "status" = 'DELIVERED' AND "deliveredAt" >= ${start} GROUP BY 1`,
  ]);
  const shopBy = new Map(shop.map((r) => [r.day, dec(r.sdg.toString())]));
  const storeBy = new Map(store.map((r) => [r.day, dec(r.sdg.toString())]));
  return keys.map((day) => {
    const a = shopBy.get(day) ?? dec(0);
    const b = storeBy.get(day) ?? dec(0);
    return { day, shopSdg: a.toFixed(0), storeSdg: b.toFixed(0), totalSdg: a.plus(b).toFixed(0) };
  });
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

/** للموظفة: ورديتها المفتوحة ومبيعاتها فيها. */
export async function myShift(userId: string) {
  const shift = await prisma.shift.findFirst({ where: { userId, closedAt: null } });
  if (!shift) return null;
  const agg = await prisma.sale.aggregate({ where: { shiftId: shift.id }, _count: true, _sum: { totalSdg: true } });
  return { openedAt: shift.openedAt, count: agg._count, totalSdg: dec(s(agg._sum.totalSdg)).toFixed(0) };
}
