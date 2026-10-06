import {
  allocateLateCost,
  canReceiveShipment,
  CoreError,
  dec,
  isInternalBarcode,
  planReceipt,
  revaluedAverage,
  roundMoney,
  roundUnitCost,
  searchTerms,
  stockValueUsd,
  sum,
  variantLabel,
  weightedAverageCost,
  type Decimal,
} from "@ghusn/core";
import { Prisma, prisma } from "@ghusn/db";
import { ShipmentError } from "./shipment-error";

type Tx = Prisma.TransactionClient;

/** يقفل صف رصيد المتغيّر (وينشئه إن لم يوجد) حتى تنتهي المعاملة — يمنع سباق التحديث. */
export async function lockStockLevel(tx: Tx, variantId: string) {
  await tx.$executeRaw`
    INSERT INTO "StockLevel" ("variantId", "qty", "avgCostUsd", "updatedAt")
    VALUES (${variantId}, 0, 0, now()) ON CONFLICT ("variantId") DO NOTHING`;
  const [row] = await tx.$queryRaw<{ qty: Prisma.Decimal; avgCostUsd: Prisma.Decimal }[]>`
    SELECT "qty", "avgCostUsd" FROM "StockLevel" WHERE "variantId" = ${variantId} FOR UPDATE`;
  if (!row) throw new Error("stock level lock failed");
  return { qty: row.qty.toString(), avgCostUsd: row.avgCostUsd.toString() };
}

export interface ReceiveLineInput {
  lineId: string;
  receivedQty: string;
  damagedQty: string;
  expiresAt: Date | null;
}

/**
 * استلام الشحنة (D-78): مرة واحدة ويغلقها. لكل بند وصل منه شيء سليم تُنشأ دفعة بتكلفة
 * واصلة ثابتة، ويزيد الرصيد ويُحدَّث متوسط التكلفة المرجّح — كله في معاملة واحدة.
 */
export async function receiveShipment(id: string, input: ReceiveLineInput[], userId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // قفل الشحنة يمنع استلامها مرتين من جهازين
    await tx.$queryRaw`SELECT "id" FROM "Shipment" WHERE "id" = ${id} FOR UPDATE`;
    const s = await tx.shipment.findUnique({
      where: { id },
      include: {
        lines: {
          include: { variant: { include: { product: { select: { nameAr: true, unit: true, trackExpiry: true } } } } },
        },
        costs: { where: { voidedAt: null } },
      },
    });
    if (!s) throw new ShipmentError("الشحنة غير موجودة.");
    if (!canReceiveShipment(s.status)) throw new ShipmentError("لا يمكن استلام هذه الشحنة.");
    if (!s.rateUsed) throw new Error("purchase rate missing");
    const rateUsed = s.rateUsed.toString();

    const byLine = new Map(input.map((l) => [l.lineId, l]));
    if (byLine.size !== s.lines.length || s.lines.some((l) => !byLine.has(l.id))) {
      throw new ShipmentError("بنود الشحنة تغيّرت — حدّثي الصفحة.");
    }
    for (const line of s.lines) {
      const l = byLine.get(line.id)!;
      if (
        line.variant.product.unit === "PIECE" &&
        (!dec(l.receivedQty).isInteger() || !dec(l.damagedQty).isInteger())
      ) {
        throw new ShipmentError(`${line.variant.product.nameAr}: الكمية بالحبة عدد صحيح.`);
      }
      if (dec(l.receivedQty).plus(l.damagedQty).gt(line.qty.toString())) {
        throw new ShipmentError(`${line.variant.product.nameAr}: السليم + التالف أكثر من المشترى.`);
      }
    }

    let plan;
    try {
      plan = planReceipt(
        s.lines.map((line) => ({
          key: line.id,
          qty: line.qty.toString(),
          unitPrice: line.unitPrice.toString(),
          rateUsed,
          receivedQty: byLine.get(line.id)!.receivedQty,
          damagedQty: byLine.get(line.id)!.damagedQty,
        })),
        s.costs.map((c) => ({ amount: c.amount.toString(), rateUsed: c.rateUsed.toString() })),
      );
    } catch (e) {
      if (e instanceof CoreError && e.code === "INVALID_QUANTITY") {
        throw new ShipmentError("لم يُستلم شيء سليم — أدخلي الكميات المستلمة.");
      }
      throw e;
    }

    const now = new Date();
    const lines = new Map(s.lines.map((l) => [l.id, l]));
    // ترتيب ثابت للأقفال يمنع الجمود (deadlock) مع معاملات أخرى
    const ordered = [...plan].sort((a, b) => lines.get(a.key)!.variantId.localeCompare(lines.get(b.key)!.variantId));
    for (const p of ordered) {
      const line = lines.get(p.key)!;
      const expiresAt = line.variant.product.trackExpiry ? byLine.get(line.id)!.expiresAt : null;
      await tx.shipmentLine.update({
        where: { id: line.id },
        data: {
          receivedQty: p.receivedQty.toFixed(),
          damagedQty: p.damagedQty.toFixed(),
          lossUsd: roundMoney(p.lossUsd).toFixed(2),
        },
      });
      if (!p.landedUnitUsd) continue;

      const level = await lockStockLevel(tx, line.variantId);
      const qtyAfter = dec(level.qty).plus(p.receivedQty);
      const avgAfter = weightedAverageCost({
        oldQty: level.qty,
        oldAvgUsd: level.avgCostUsd,
        inQty: p.receivedQty,
        inUnitUsd: p.landedUnitUsd,
      });
      const batch = await tx.stockBatch.create({
        data: {
          variantId: line.variantId,
          shipmentLineId: line.id,
          qtyReceived: p.receivedQty.toFixed(),
          qtyRemaining: p.receivedQty.toFixed(),
          landedUnitUsd: p.landedUnitUsd.toFixed(6),
          expiresAt,
          receivedAt: now,
        },
      });
      await tx.stockLevel.update({
        where: { variantId: line.variantId },
        data: { qty: qtyAfter.toFixed(), avgCostUsd: avgAfter.toFixed(6) },
      });
      await tx.stockMovement.create({
        data: {
          variantId: line.variantId,
          batchId: batch.id,
          kind: "RECEIPT",
          qty: p.receivedQty.toFixed(),
          unitCostUsd: p.landedUnitUsd.toFixed(6),
          valueUsd: roundMoney(p.receivedQty.mul(p.landedUnitUsd)).toFixed(2),
          qtyAfter: qtyAfter.toFixed(),
          avgCostAfterUsd: avgAfter.toFixed(6),
          shipmentId: s.id,
          note: s.number,
          createdById: userId,
        },
      });
    }

    await tx.shipment.update({
      where: { id },
      data: { status: "RECEIVED", receivedAt: now, receivedById: userId },
    });
  });
}

/**
 * تكلفة تُضاف أو تُلغى بعد الاستلام (D-78): نصيب الوحدات الباقية يرفع (أو يخفض) متوسط
 * التكلفة وتكلفة الدفعة، ونصيب ما خرج يُسجَّل مصروفاً، ونصيب البند الذي لم يصل يزيد خسارته.
 */
export async function revalueForCost(
  tx: Tx,
  shipmentId: string,
  cost: { id: string; amount: string; rateUsed: string },
  sign: 1 | -1,
  userId: string,
  note: string,
): Promise<void> {
  const s = await tx.shipment.findUniqueOrThrow({
    where: { id: shipmentId },
    include: { lines: { include: { batch: true } } },
  });
  if (!s.rateUsed) throw new Error("purchase rate missing");
  const rateUsed = s.rateUsed.toString();
  const allocation = allocateLateCost(
    s.lines.map((l) => ({
      key: l.id,
      qty: l.qty.toString(),
      unitPrice: l.unitPrice.toString(),
      rateUsed,
      receivedQty: l.batch ? l.batch.qtyReceived.toString() : "0",
      remainingQty: l.batch ? l.batch.qtyRemaining.toString() : "0",
    })),
    { amount: cost.amount, rateUsed: cost.rateUsed },
    sign,
  );

  const lines = new Map(s.lines.map((l) => [l.id, l]));
  const ordered = [...allocation].sort((a, b) =>
    lines.get(a.key)!.variantId.localeCompare(lines.get(b.key)!.variantId),
  );
  for (const a of ordered) {
    const line = lines.get(a.key)!;
    if (!line.batch) {
      // لم يصل من البند شيء: نصيبه يزيد (أو ينقص) خسارة الشحنة
      await tx.shipmentLine.update({
        where: { id: line.id },
        data: { lossUsd: roundMoney(dec(line.lossUsd?.toString() ?? "0").plus(a.extraUsd)).toFixed(2) },
      });
      continue;
    }
    const level = await lockStockLevel(tx, line.variantId);
    let inventory: Decimal = a.inventoryUsd;
    let expense: Decimal = a.expenseUsd;
    // لا رصيد موجب يحمل القيمة (بيع دون اتصال جعله سالباً) ← كلها مصروف
    if (dec(level.qty).lte(0)) {
      expense = expense.plus(inventory);
      inventory = dec(0);
    }
    let avgAfter: Decimal;
    try {
      avgAfter = revaluedAverage(level.qty, level.avgCostUsd, inventory);
    } catch {
      throw new ShipmentError("لا يمكن الإلغاء: متوسط التكلفة سيصبح سالباً. راجعي المالك.");
    }
    await tx.stockBatch.update({
      where: { id: line.batch.id },
      data: {
        landedUnitUsd: roundUnitCost(dec(line.batch.landedUnitUsd.toString()).plus(a.unitDeltaUsd)).toFixed(6),
      },
    });
    await tx.stockLevel.update({ where: { variantId: line.variantId }, data: { avgCostUsd: avgAfter.toFixed(6) } });
    await tx.stockMovement.create({
      data: {
        variantId: line.variantId,
        batchId: line.batch.id,
        kind: "REVALUATION",
        qty: "0",
        valueUsd: roundMoney(inventory).toFixed(2),
        expenseUsd: roundMoney(expense).toFixed(2),
        qtyAfter: level.qty,
        avgCostAfterUsd: avgAfter.toFixed(6),
        shipmentId,
        shipmentCostId: cost.id,
        note,
        createdById: userId,
      },
    });
  }
}

// ---------- القراءة ----------

/** شاشة المخزون: الكمية للجميع، والتكلفة والقيمة لمن يملك صلاحية التكلفة فقط. */
export async function listStock(query: string, withCost: boolean, options: { negativeOnly?: boolean } = {}) {
  const terms = searchTerms(query);
  const variants = await prisma.productVariant.findMany({
    where: {
      deletedAt: null,
      product: { deletedAt: null, AND: terms.map((t) => ({ searchText: { contains: t } })) },
      // رصيد سالب من بيع دون اتصال (D-63) — يحتاج عدّاً وتسوية
      ...(options.negativeOnly ? { stockLevel: { qty: { lt: 0 } } } : {}),
    },
    orderBy: [{ product: { nameAr: "asc" } }, { sortOrder: "asc" }],
    take: 200,
    include: { product: { select: { id: true, nameAr: true, unit: true } }, stockLevel: true },
  });
  const rows = variants.map((v) => {
    const qty = v.stockLevel?.qty.toString() ?? "0";
    const avg = v.stockLevel?.avgCostUsd.toString() ?? "0";
    return {
      variantId: v.id,
      productId: v.product.id,
      label: [v.product.nameAr, variantLabel(v)].filter(Boolean).join(" · "),
      sku: v.sku,
      unit: v.product.unit,
      qty,
      priceSdg: v.priceSdg?.toString() ?? null,
      ...(withCost ? { avgCostUsd: avg, valueUsd: dec(qty).gt(0) ? stockValueUsd(qty, avg).toFixed(2) : "0.00" } : {}),
    };
  });
  return {
    rows,
    totalValueUsd: withCost ? sum(rows.map((r) => r.valueUsd ?? "0")).toFixed(2) : null,
  };
}

/** عدد الأصناف ذات الرصيد السالب — شارة في شاشة المخزون. */
export const countNegativeStock = () =>
  prisma.stockLevel.count({ where: { qty: { lt: 0 }, variant: { deletedAt: null, product: { deletedAt: null } } } });

const MOVEMENT_LABELS: Record<string, string> = {
  RECEIPT: "استلام شحنة",
  REVALUATION: "إعادة تقييم",
  SALE: "بيع",
  RETURN: "مرتجع",
  CONSUMPTION: "استهلاك تغليف",
  ADJUSTMENT: "تسوية",
};

/**
 * كارت الصنف (D-111): كل حركاته من الدفتر الذي لا يُعدَّل، الأحدث أولاً، مع مرجع كل حركة
 * (فاتورة، طلب، شحنة، مرتجع، تسوية). التكلفة لمن يملك صلاحيتها فقط.
 */
export async function stockCard(variantId: string, withCost: boolean, take = 200) {
  const v = await prisma.productVariant.findFirst({
    where: { id: variantId },
    include: { product: { select: { id: true, nameAr: true, unit: true } }, stockLevel: true },
  });
  if (!v) return null;
  const movements = await prisma.stockMovement.findMany({
    where: { variantId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
    include: {
      sale: { select: { id: true, number: true } },
      order: { select: { id: true, number: true } },
      shipment: { select: { id: true, number: true } },
      saleReturn: { select: { number: true } },
      adjustment: { select: { id: true, number: true, reason: true, note: true } },
      batch: { select: { expiresAt: true } },
      createdBy: { select: { name: true } },
    },
  });
  return {
    variantId: v.id,
    productId: v.product.id,
    label: [v.product.nameAr, variantLabel(v)].filter(Boolean).join(" · "),
    sku: v.sku,
    unit: v.product.unit,
    qty: v.stockLevel?.qty.toString() ?? "0",
    ...(withCost ? { avgCostUsd: v.stockLevel?.avgCostUsd.toString() ?? "0" } : {}),
    movements: movements.map((m) => {
      const ref = m.sale
        ? { label: m.sale.number, href: `/pos/receipt/${m.sale.id}` }
        : m.order
          ? { label: m.order.number, href: `/admin/orders/${m.order.id}` }
          : m.saleReturn
            ? { label: m.saleReturn.number, href: null }
            : m.adjustment
              ? { label: m.adjustment.number, href: `/admin/stock/adjustments?focus=${m.adjustment.id}` }
              : m.shipment
                ? { label: m.shipment.number, href: `/admin/shipments/${m.shipment.id}` }
                : null;
      return {
        id: m.id,
        at: m.createdAt,
        kind: m.kind,
        kindLabel: MOVEMENT_LABELS[m.kind] ?? m.kind,
        adjustmentReason: m.adjustment?.reason ?? null,
        ref,
        note: m.adjustment?.note ?? (m.kind === "REVALUATION" ? m.note : null),
        expiresOn: m.kind === "RECEIPT" && m.batch?.expiresAt ? m.batch.expiresAt.toISOString().slice(0, 10) : null,
        qty: m.qty.toString(),
        qtyAfter: m.qtyAfter.toString(),
        override: m.override,
        by: m.createdBy?.name ?? null,
        ...(withCost ? { avgCostAfterUsd: m.avgCostAfterUsd.toString(), valueUsd: m.valueUsd.toString() } : {}),
      };
    }),
  };
}

export interface LabelItem {
  variantId: string;
  name: string;
  variant: string;
  sku: string;
  barcode: string;
  count: number;
}

/** ملصقات شحنة مستلمة: العدد الافتراضي = السليم، للباركود الداخلي فقط (المصنع مطبوع أصلاً). */
export async function shipmentLabelItems(shipmentId: string): Promise<LabelItem[]> {
  const lines = await prisma.shipmentLine.findMany({
    where: { shipmentId },
    orderBy: { sortOrder: "asc" },
    include: { variant: { include: { product: { select: { nameAr: true, unit: true } } } } },
  });
  return lines.map((l) => ({
    variantId: l.variantId,
    name: l.variant.product.nameAr,
    variant: variantLabel(l.variant),
    sku: l.variant.sku,
    barcode: l.variant.barcode,
    count:
      l.variant.product.unit === "PIECE" && isInternalBarcode(l.variant.barcode) && l.receivedQty
        ? Number(l.receivedQty.toFixed(0))
        : 0,
  }));
}

export async function labelVariants(ids: string[]) {
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: ids }, deletedAt: null },
    include: { product: { select: { nameAr: true } } },
  });
  return new Map(
    variants.map((v) => [v.id, { name: v.product.nameAr, variant: variantLabel(v), sku: v.sku, barcode: v.barcode }]),
  );
}
