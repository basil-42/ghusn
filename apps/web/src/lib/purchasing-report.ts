import {
  SHOP_TIME_ZONE,
  batchEstimate,
  dec,
  extraCostRatio,
  shipmentNotes,
  sumBatches,
  variantLabel,
  type BatchEstimate,
  type BatchInput,
  type Decimal,
  type ShipmentNote,
  type ShipmentTotals,
  type TimeCell,
} from "@ghusn/core";
import { Prisma, prisma } from "@ghusn/db";
import { listSuppliers } from "./suppliers";

/**
 * ربحية الشحنات والموردين وأوقات البيع (D-128). الأرقام تقديرية للمقارنة — انظر purchasing.ts في @ghusn/core.
 * كل القيم تخرج نصوصاً (Decimal لا يُمرَّر للمتصفح).
 */

const DAY_MS = 86_400_000;
export const SHIPMENT_PERIODS = ["3", "6", "12", "all"] as const;
export type ShipmentPeriod = (typeof SHIPMENT_PERIODS)[number];
export const SHIPMENT_PERIOD_LABELS: Record<ShipmentPeriod, string> = {
  "3": "آخر 3 أشهر",
  "6": "آخر 6 أشهر",
  "12": "آخر 12 شهراً",
  all: "كل الشحنات",
};

export interface TotalsView {
  receivedQty: string;
  soldQty: string;
  lostQty: string;
  costUsd: string;
  revenueUsd: string;
  profitUsd: string;
  remainingUsd: string;
  lostUsd: string;
  sellThrough: string | null;
  margin: string | null;
  unpricedLines: number;
}

const view = (t: ShipmentTotals): TotalsView => ({
  receivedQty: t.receivedQty.toFixed(),
  soldQty: t.soldQty.toFixed(),
  lostQty: t.lostQty.toFixed(),
  costUsd: t.costUsd.toFixed(2),
  revenueUsd: t.revenueUsd.toFixed(2),
  profitUsd: t.profitUsd.toFixed(2),
  remainingUsd: t.remainingUsd.toFixed(2),
  lostUsd: t.lostUsd.toFixed(2),
  sellThrough: t.sellThrough?.toFixed(4) ?? null,
  margin: t.margin?.toFixed(4) ?? null,
  unpricedLines: t.unpricedLines,
});

export interface ShipmentLineView {
  variantId: string;
  label: string;
  sku: string;
  receivedQty: string;
  soldQty: string;
  lostQty: string;
  remainingQty: string;
  landedUnitUsd: string;
  avgPriceUsd: string | null;
  profitUsd: string | null;
  margin: string | null;
}

export interface ShipmentView {
  id: string;
  number: string;
  supplierId: string;
  supplierName: string;
  currencyCode: string;
  purchasedAt: Date;
  receivedAt: Date;
  ageDays: number;
  /** من الشراء للاستلام */
  leadDays: number;
  purchaseUsd: string;
  extraUsd: string;
  extraRatio: string | null;
  totals: TotalsView;
  lines: ShipmentLineView[];
}

interface Computed {
  view: ShipmentView;
  batches: (BatchInput & { estimate: BatchEstimate })[];
  purchaseUsd: Decimal;
  extraUsd: Decimal;
}

/** متوسط صافي سعر البيع بالدولار لكل صنف لكل يوم (فواتير المحل + طلبات المتجر المسلّمة). */
async function dailyPrices(variantIds: string[], since: Date) {
  if (variantIds.length === 0) return new Map<string, { day: Date; qty: Decimal; usd: Decimal }[]>();
  const rows = await prisma.$queryRaw<{ variantId: string; day: Date; qty: Prisma.Decimal; usd: Prisma.Decimal }[]>`
    SELECT x."variantId", date_trunc('day', x."at") AS "day", SUM(x."qty") AS "qty", SUM(x."usd") AS "usd" FROM (
      SELECT sl."variantId", s."createdAt" AS "at", sl."qty", sl."netSdg" / s."sdgPerUsd" AS "usd"
        FROM "SaleLine" sl JOIN "Sale" s ON s."id" = sl."saleId"
       WHERE s."createdAt" >= ${since} AND sl."variantId" IN (${Prisma.join(variantIds)}) AND s."sdgPerUsd" > 0
      UNION ALL
      SELECT ol."variantId", o."deliveredAt", ol."qty", ol."lineTotalSdg" / o."sdgPerUsd"
        FROM "OrderLine" ol JOIN "Order" o ON o."id" = ol."orderId"
       WHERE o."status" = 'DELIVERED' AND o."deliveredAt" >= ${since} AND o."sdgPerUsd" > 0
         AND ol."variantId" IN (${Prisma.join(variantIds)})
    ) x GROUP BY 1, 2`;
  const map = new Map<string, { day: Date; qty: Decimal; usd: Decimal }[]>();
  for (const r of rows) {
    const list = map.get(r.variantId) ?? [];
    list.push({ day: r.day, qty: dec(r.qty.toString()), usd: dec(r.usd.toString()) });
    map.set(r.variantId, list);
  }
  return map;
}

/** متوسط سعر الصنف منذ يوم الاستلام (بدقة اليوم). */
function avgSince(rows: { day: Date; qty: Decimal; usd: Decimal }[] | undefined, from: Date): Decimal | null {
  if (!rows) return null;
  const startDay = from.getTime() - (from.getTime() % DAY_MS);
  let qty = dec(0);
  let usd = dec(0);
  for (const r of rows) {
    if (r.day.getTime() < startDay) continue;
    qty = qty.plus(r.qty);
    usd = usd.plus(r.usd);
  }
  return qty.gt(0) ? usd.div(qty) : null;
}

async function loadShipments(filter: { id?: string; since?: Date | null }, now: Date): Promise<Computed[]> {
  const shipments = await prisma.shipment.findMany({
    where: {
      id: filter.id,
      status: "RECEIVED",
      receivedAt: filter.since ? { gte: filter.since } : { not: null },
    },
    orderBy: { receivedAt: "desc" },
    include: {
      supplier: { select: { id: true, name: true } },
      costs: { where: { voidedAt: null }, select: { amountUsd: true } },
      lines: {
        orderBy: { sortOrder: "asc" },
        select: {
          qty: true,
          unitPrice: true,
          variant: {
            select: {
              id: true,
              sku: true,
              size: true,
              color: true,
              volume: true,
              product: { select: { nameAr: true } },
            },
          },
          batch: { select: { id: true, qtyReceived: true, qtyRemaining: true, landedUnitUsd: true, receivedAt: true } },
        },
      },
    },
  });
  const batches = shipments.flatMap((s) => s.lines.flatMap((l) => (l.batch ? [l.batch] : [])));
  const lost = batches.length
    ? await prisma.stockMovement.groupBy({
        by: ["batchId"],
        where: { kind: "ADJUSTMENT", qty: { lt: 0 }, batchId: { in: batches.map((b) => b.id) } },
        _sum: { qty: true },
      })
    : [];
  const lostBy = new Map(lost.map((l) => [l.batchId, dec(l._sum.qty?.toString() ?? "0").neg()]));
  const earliest = batches.reduce<Date | null>((a, b) => (!a || b.receivedAt < a ? b.receivedAt : a), null);
  const prices = earliest
    ? await dailyPrices([...new Set(shipments.flatMap((s) => s.lines.map((l) => l.variant.id)))], earliest)
    : new Map();

  return shipments.map((s) => {
    const receivedAt = s.receivedAt ?? now;
    const rate = s.rateUsed ? dec(s.rateUsed.toString()) : null;
    const purchaseUsd = s.lines.reduce(
      (a, l) => (rate && rate.gt(0) ? a.plus(dec(l.qty.toString()).mul(l.unitPrice.toString()).div(rate)) : a),
      dec(0),
    );
    const extraUsd = s.costs.reduce((a, c) => a.plus(c.amountUsd.toString()), dec(0));
    const computed = s.lines.flatMap((l) => {
      const b = l.batch;
      if (!b) return [];
      const avg = avgSince(prices.get(l.variant.id), b.receivedAt);
      const input: BatchInput = {
        receivedQty: b.qtyReceived.toString(),
        remainingQty: b.qtyRemaining.toString(),
        lostQty: lostBy.get(b.id) ?? dec(0),
        landedUnitUsd: b.landedUnitUsd.toString(),
        avgPriceUsd: avg,
      };
      const estimate = batchEstimate(input);
      const line: ShipmentLineView = {
        variantId: l.variant.id,
        label: [l.variant.product.nameAr, variantLabel(l.variant)].filter(Boolean).join(" · "),
        sku: l.variant.sku,
        receivedQty: dec(b.qtyReceived.toString()).toFixed(),
        soldQty: estimate.soldQty.toFixed(),
        lostQty: estimate.lostQty.toFixed(),
        remainingQty: dec(b.qtyRemaining.toString()).toFixed(),
        landedUnitUsd: dec(b.landedUnitUsd.toString()).toFixed(2),
        avgPriceUsd: avg?.toFixed(2) ?? null,
        profitUsd: estimate.profitUsd?.toFixed(2) ?? null,
        margin:
          estimate.profitUsd && estimate.revenueUsd?.gt(0)
            ? estimate.profitUsd.div(estimate.revenueUsd).toFixed(4)
            : null,
      };
      return [{ input: { ...input, estimate }, line }];
    });
    const totals = sumBatches(computed.map((c) => c.input));
    return {
      purchaseUsd,
      extraUsd,
      batches: computed.map((c) => c.input),
      view: {
        id: s.id,
        number: s.number,
        supplierId: s.supplier.id,
        supplierName: s.supplier.name,
        currencyCode: s.currencyCode,
        purchasedAt: s.purchasedAt,
        receivedAt,
        ageDays: Math.max(0, Math.floor((now.getTime() - receivedAt.getTime()) / DAY_MS)),
        leadDays: Math.max(0, Math.round((receivedAt.getTime() - s.purchasedAt.getTime()) / DAY_MS)),
        purchaseUsd: purchaseUsd.toFixed(2),
        extraUsd: extraUsd.toFixed(2),
        extraRatio: extraCostRatio(purchaseUsd, extraUsd)?.toFixed(4) ?? null,
        totals: view(totals),
        lines: computed.map((c) => c.line),
      },
    };
  });
}

export interface SupplierView {
  id: string;
  name: string;
  currencyCode: string;
  shipments: number;
  purchaseUsd: string;
  extraRatio: string | null;
  /** متوسط أيام الوصول */
  leadDays: number | null;
  totals: TotalsView;
  /** بعملة المورد: + علينا */
  balance: string;
  symbol: string;
  decimals: number;
}

export interface ShipmentReport {
  shipments: ShipmentView[];
  suppliers: SupplierView[];
  notes: ShipmentNote[];
}

export async function shipmentReport(period: ShipmentPeriod, now = new Date()): Promise<ShipmentReport> {
  const since = period === "all" ? null : new Date(now.getTime() - Number(period) * 30.44 * DAY_MS);
  const [computed, ledgers] = await Promise.all([loadShipments({ since }, now), listSuppliers()]);
  const bySupplier = new Map<string, Computed[]>();
  for (const c of computed) bySupplier.set(c.view.supplierId, [...(bySupplier.get(c.view.supplierId) ?? []), c]);
  const suppliers = [...bySupplier.entries()]
    .map(([id, list]): SupplierView => {
      const first = list[0];
      const ledger = ledgers.find((l) => l.id === id);
      const purchaseUsd = list.reduce((a, c) => a.plus(c.purchaseUsd), dec(0));
      const extraUsd = list.reduce((a, c) => a.plus(c.extraUsd), dec(0));
      return {
        id,
        name: first?.view.supplierName ?? "",
        currencyCode: ledger?.currency.code ?? first?.view.currencyCode ?? "",
        shipments: list.length,
        purchaseUsd: purchaseUsd.toFixed(2),
        extraRatio: extraCostRatio(purchaseUsd, extraUsd)?.toFixed(4) ?? null,
        leadDays: list.length ? Math.round(list.reduce((a, c) => a + c.view.leadDays, 0) / list.length) : null,
        totals: view(sumBatches(list.flatMap((c) => c.batches))),
        balance: ledger?.balance ?? "0",
        symbol: ledger?.currency.symbol ?? "",
        decimals: ledger?.currency.decimals ?? 2,
      };
    })
    .sort((a, b) => dec(b.totals.profitUsd).comparedTo(a.totals.profitUsd));
  const shipments = computed.map((c) => c.view);
  return {
    shipments,
    suppliers,
    notes: shipmentNotes(
      shipments.map((s) => ({
        id: s.id,
        number: s.number,
        supplierName: s.supplierName,
        ageDays: s.ageDays,
        sellThrough: s.totals.sellThrough,
        margin: s.totals.soldQty !== "0" ? s.totals.margin : null,
        remainingUsd: s.totals.remainingUsd,
      })),
    ),
  };
}

export interface SupplierCost {
  supplierId: string;
  supplierName: string;
  shipmentId: string;
  shipmentNumber: string;
  landedUnitUsd: string;
  leadDays: number;
  receivedAt: Date;
}

export interface VariantComparison {
  variantId: string;
  label: string;
  /** آخر تكلفة واصلة لكل مورد، الأرخص أولاً */
  suppliers: SupplierCost[];
}

/**
 * نفس الصنف من موردين آخرين (D-128): آخر تكلفة واصلة للقطعة لكل مورد — رقم دقيق من الدفعة، لا تقدير.
 * تظهر فقط للأصناف التي اشتُريت من أكثر من مورد.
 */
async function supplierComparisons(variants: { variantId: string; label: string }[]): Promise<VariantComparison[]> {
  if (variants.length === 0) return [];
  const batches = await prisma.stockBatch.findMany({
    where: {
      variantId: { in: variants.map((v) => v.variantId) },
      shipmentLine: { shipment: { status: "RECEIVED" } },
    },
    orderBy: { receivedAt: "desc" },
    select: {
      variantId: true,
      landedUnitUsd: true,
      receivedAt: true,
      shipmentLine: {
        select: {
          shipment: {
            select: { id: true, number: true, purchasedAt: true, supplier: { select: { id: true, name: true } } },
          },
        },
      },
    },
  });
  return variants.flatMap((v) => {
    const latest = new Map<string, SupplierCost>();
    for (const b of batches) {
      const s = b.shipmentLine?.shipment;
      if (b.variantId !== v.variantId || !s || latest.has(s.supplier.id)) continue;
      latest.set(s.supplier.id, {
        supplierId: s.supplier.id,
        supplierName: s.supplier.name,
        shipmentId: s.id,
        shipmentNumber: s.number,
        landedUnitUsd: dec(b.landedUnitUsd.toString()).toFixed(2),
        leadDays: Math.max(0, Math.round((b.receivedAt.getTime() - s.purchasedAt.getTime()) / DAY_MS)),
        receivedAt: b.receivedAt,
      });
    }
    if (latest.size < 2) return [];
    const suppliers = [...latest.values()].sort((a, b) => dec(a.landedUnitUsd).comparedTo(b.landedUnitUsd));
    return [{ variantId: v.variantId, label: v.label, suppliers }];
  });
}

export async function shipmentProfitDetail(id: string, now = new Date()) {
  const [computed] = await loadShipments({ id }, now);
  if (!computed) return null;
  const seen = new Set<string>();
  const variants = computed.view.lines.filter((l) => !seen.has(l.variantId) && seen.add(l.variantId));
  return {
    shipment: computed.view,
    comparisons: await supplierComparisons(variants.map((l) => ({ variantId: l.variantId, label: l.label }))),
  };
}

// ─── أوقات البيع ───────────────────────────────────────────────────────────

export const TIME_WEEKS = ["4", "12"] as const;
export type TimeChannel = "all" | "shop" | "web";

export interface SalesTimes {
  shop: TimeCell[];
  web: TimeCell[];
  start: Date;
}

/**
 * عدد الفواتير ومبلغها بالجنيه لكل (يوم، ساعة) بتوقيت المحل: فواتير المحل بوقت البيع، وطلبات المتجر
 * (غير الملغاة) بوقت إنشائها. اليوم 0 = السبت.
 */
export async function salesTimes(weeks: number, now = new Date()): Promise<SalesTimes> {
  const start = new Date(now.getTime() - weeks * 7 * DAY_MS);
  const rows = await prisma.$queryRaw<
    { ch: "shop" | "web"; dow: number; hour: number; count: number; amount: Prisma.Decimal }[]
  >`
    SELECT x."ch",
           EXTRACT(ISODOW FROM (x."at" AT TIME ZONE 'UTC') AT TIME ZONE ${SHOP_TIME_ZONE})::int AS "dow",
           EXTRACT(HOUR FROM (x."at" AT TIME ZONE 'UTC') AT TIME ZONE ${SHOP_TIME_ZONE})::int AS "hour",
           COUNT(*)::int AS "count", SUM(x."amount") AS "amount"
      FROM (
        SELECT 'shop' AS "ch", "createdAt" AS "at", "totalSdg" AS "amount" FROM "Sale" WHERE "createdAt" >= ${start}
        UNION ALL
        SELECT 'web', "createdAt", "totalSdg" FROM "Order" WHERE "status" <> 'CANCELLED' AND "createdAt" >= ${start}
      ) x GROUP BY 1, 2, 3`;
  // ISODOW: الاثنين 1 … الأحد 7 ← السبت 0 … الجمعة 6
  const cell = (r: (typeof rows)[number]): TimeCell => ({
    day: (r.dow + 1) % 7,
    hour: r.hour,
    count: r.count,
    amount: r.amount.toString(),
  });
  return {
    shop: rows.filter((r) => r.ch === "shop").map(cell),
    web: rows.filter((r) => r.ch === "web").map(cell),
    start,
  };
}
