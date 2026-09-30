import {
  allocateLandedCost,
  canChangeShipmentCosts,
  canTransitionShipment,
  dec,
  documentNumber,
  isShipmentEditable,
  planReceipt,
  roundMoney,
  searchTerms,
  shipmentGoodsTotal,
  shopDay,
  toUsdExact,
  variantLabel,
  type Decimal,
  type ShipmentStatus,
} from "@ghusn/core";
import { Prisma, prisma, type ShipmentCostKind } from "@ghusn/db";
import { getRateAt } from "./exchange-rates";
import { ShipmentError } from "./shipment-error";
import { revalueForCost } from "./stock";

export { ShipmentError };

export const STATUS_LABELS: Record<ShipmentStatus, string> = {
  DRAFT: "مسودة",
  PURCHASED: "مشتراة",
  IN_TRANSIT: "في الطريق",
  IN_CUSTOMS: "في الجمارك",
  ARRIVED: "وصلت",
  RECEIVED: "مستلمة",
  CANCELLED: "ملغاة",
};

export const COST_LABELS: Record<ShipmentCostKind, string> = {
  SHIPPING: "شحن",
  CUSTOMS: "جمارك",
  CLEARANCE: "تخليص",
  TRANSPORT: "نقل داخلي",
  COMMISSION: "عمولة",
  OTHER: "أخرى",
};

type Tx = Prisma.TransactionClient;

/** الرقم التالي لمستند (SHP-2026-001) — ذري حتى مع إدخال متزامن. */
async function nextDocumentNumber(tx: Tx, prefix: string, at: Date): Promise<string> {
  const year = Number(shopDay(at).slice(0, 4));
  const key = `${prefix}-${year}`;
  const [row] = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "DocumentCounter" ("key", "value") VALUES (${key}, 1)
    ON CONFLICT ("key") DO UPDATE SET "value" = "DocumentCounter"."value" + 1
    RETURNING "value"`;
  if (!row) throw new Error("counter failed");
  return documentNumber(prefix, year, row.value);
}

async function rateOrThrow(currencyCode: string, at: Date): Promise<string> {
  const rate = await getRateAt(currencyCode, at);
  if (!rate)
    throw new ShipmentError(`لا يوجد سعر صرف لـ ${currencyCode} في ذلك التاريخ. أدخليه من شاشة سعر الصرف أولاً.`);
  return rate;
}

// ---------- القراءة ----------

export async function listShipments(status?: ShipmentStatus) {
  const rows = await prisma.shipment.findMany({
    where: status ? { status } : {},
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      supplier: { select: { name: true } },
      lines: { select: { qty: true, unitPrice: true } },
      _count: { select: { lines: true } },
    },
  });
  const currencies = await currencyMap();
  return rows.map((s) => ({
    id: s.id,
    number: s.number,
    status: s.status,
    supplierName: s.supplier.name,
    purchasedAt: s.purchasedAt,
    lineCount: s._count.lines,
    goodsTotal: shipmentGoodsTotal(
      s.lines.map((l) => ({ qty: l.qty.toString(), unitPrice: l.unitPrice.toString() })),
    ).toString(),
    currency: currencies.get(s.currencyCode) ?? { code: s.currencyCode, symbol: s.currencyCode, decimals: 2 },
  }));
}

async function currencyMap() {
  const list = await prisma.currency.findMany({ select: { code: true, symbol: true, decimals: true } });
  return new Map(list.map((c) => [c.code, c]));
}

export async function getShipment(id: string) {
  const s = await prisma.shipment.findUnique({
    where: { id },
    include: {
      supplier: { select: { id: true, name: true } },
      receivedBy: { select: { name: true } },
      lines: {
        orderBy: { sortOrder: "asc" },
        include: {
          variant: {
            select: {
              id: true,
              sku: true,
              size: true,
              color: true,
              volume: true,
              product: { select: { nameAr: true, unit: true, trackExpiry: true } },
            },
          },
          batch: { select: { expiresAt: true } },
        },
      },
      costs: {
        orderBy: { paidAt: "asc" },
        include: { wallet: { select: { name: true } }, voidedBy: { select: { name: true } } },
      },
    },
  });
  if (!s) return null;
  const currencies = await currencyMap();
  const lines = s.lines.map((l) => ({
    id: l.id,
    variantId: l.variantId,
    label: [l.variant.product.nameAr, variantLabel(l.variant)].filter(Boolean).join(" · "),
    sku: l.variant.sku,
    unit: l.variant.product.unit,
    trackExpiry: l.variant.product.trackExpiry,
    qty: l.qty.toString(),
    unitPrice: l.unitPrice.toString(),
    received:
      l.receivedQty === null
        ? null
        : {
            qty: l.receivedQty.toString(),
            damaged: l.damagedQty?.toString() ?? "0",
            missing: l.qty
              .minus(l.receivedQty)
              .minus(l.damagedQty ?? 0)
              .toString(),
            lossUsd: l.lossUsd?.toString() ?? "0",
            expiresAt: l.batch?.expiresAt ?? null,
          },
  }));
  const activeCosts = s.costs.filter((c) => !c.voidedAt);

  // سعر الشراء: المثبّت عند التأكيد، أو سعر يوم الشراء للمسودة (للمعاينة)
  const purchaseRate = s.rateUsed?.toString() ?? (await getRateAt(s.currencyCode, s.purchasedAt));
  const costInputs = activeCosts.map((c) => ({ amount: c.amount.toString(), rateUsed: c.rateUsed.toString() }));
  const received = s.status === "RECEIVED";
  // بعد الاستلام: التكلفة الفعلية (السليم فقط، وتشمل الفواتير المتأخرة)؛ قبله: معاينة بالكمية المشتراة
  const landed =
    lines.length && purchaseRate
      ? received
        ? planReceipt(
            lines.map((l) => ({
              key: l.id,
              qty: l.qty,
              unitPrice: l.unitPrice,
              rateUsed: purchaseRate,
              receivedQty: l.received?.qty ?? "0",
              damagedQty: l.received?.damaged ?? "0",
            })),
            costInputs,
          )
        : allocateLandedCost(
            lines.map((l) => ({
              key: l.id,
              qty: l.qty,
              unitPrice: l.unitPrice,
              rateUsed: purchaseRate,
              receivedQty: l.qty,
            })),
            costInputs,
          ).lines.map((l) => ({
            key: l.key,
            landedUnitUsd: l.landedUnitUsd as Decimal | null,
            totalUsd: l.lineValueUsd.plus(l.extraUsd),
          }))
      : null;
  const goodsUsd = purchaseRate ? toUsdExact(shipmentGoodsTotal(lines), purchaseRate) : null;
  const extraUsd = costInputs.reduce((acc, c) => acc.plus(toUsdExact(c.amount, c.rateUsed)), dec(0));

  return {
    id: s.id,
    number: s.number,
    status: s.status,
    supplier: s.supplier,
    origin: s.origin,
    purchasedAt: s.purchasedAt,
    dueDate: s.dueDate,
    notes: s.notes,
    currency: currencies.get(s.currencyCode) ?? { code: s.currencyCode, symbol: s.currencyCode, decimals: 2 },
    rateUsed: s.rateUsed?.toString() ?? null,
    purchaseRate,
    goodsTotal: shipmentGoodsTotal(lines).toString(),
    lines,
    costs: s.costs.map((c) => ({
      id: c.id,
      kind: c.kind,
      amount: c.amount.toString(),
      currencyCode: c.currencyCode,
      rateUsed: c.rateUsed.toString(),
      amountUsd: c.amountUsd.toString(),
      walletName: c.wallet.name,
      paidAt: c.paidAt,
      note: c.note,
      voided: c.voidedAt ? { at: c.voidedAt, by: c.voidedBy?.name ?? null, reason: c.voidReason } : null,
    })),
    receivedAt: s.receivedAt,
    receivedBy: s.receivedBy?.name ?? null,
    landed: landed &&
      goodsUsd && {
        goodsUsd: roundMoney(goodsUsd).toString(),
        extraUsd: roundMoney(extraUsd).toString(),
        totalUsd: roundMoney(goodsUsd.plus(extraUsd)).toString(),
        lossUsd: roundMoney(lines.reduce((acc, l) => acc.plus(l.received?.lossUsd ?? "0"), dec(0))).toString(),
        lines: landed.map((l) => {
          const line = lines.find((x) => x.id === l.key)!;
          const valueUsd = toUsdExact(dec(line.qty).mul(line.unitPrice), purchaseRate!);
          return {
            lineId: l.key,
            valueUsd: roundMoney(valueUsd).toString(),
            sharePct: valueUsd.div(goodsUsd).mul(100).toDecimalPlaces(1).toString(),
            extraUsd: roundMoney(l.totalUsd.minus(valueUsd)).toString(),
            landedUnitUsd: l.landedUnitUsd?.toString() ?? null,
          };
        }),
      },
  };
}

/** بحث المتغيرات لإضافتها للشحنة (بالاسم أو SKU أو الباركود). */
export async function searchVariants(query: string) {
  const terms = searchTerms(query);
  if (terms.length === 0) return [];
  const products = await prisma.product.findMany({
    where: { deletedAt: null, AND: terms.map((t) => ({ searchText: { contains: t } })) },
    take: 10,
    include: { variants: { where: { deletedAt: null }, orderBy: { sortOrder: "asc" } } },
  });
  return products.flatMap((p) =>
    p.variants.map((v) => ({
      variantId: v.id,
      label: [p.nameAr, variantLabel(v)].filter(Boolean).join(" · "),
      sku: v.sku,
      unit: p.unit,
    })),
  );
}

// ---------- الكتابة ----------

export async function createShipment(supplierId: string, userId: string): Promise<string> {
  const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, deletedAt: null, isActive: true } });
  if (!supplier) throw new ShipmentError("اختاري مورداً نشطاً.");
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const shipment = await tx.shipment.create({
      data: {
        number: await nextDocumentNumber(tx, "SHP", now),
        supplierId,
        origin: supplier.country,
        currencyCode: supplier.currencyCode,
        purchasedAt: now,
        createdById: userId,
      },
    });
    return shipment.id;
  });
}

/** قفل صف الشحنة حتى نهاية المعاملة: التعديل والاستلام والإلغاء لا تتداخل. */
async function lockShipment(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT "id" FROM "Shipment" WHERE "id" = ${id} FOR UPDATE`;
}

async function loadEditable(tx: Tx, id: string) {
  await lockShipment(tx, id);
  const s = await tx.shipment.findUnique({ where: { id }, include: { lines: true } });
  if (!s) throw new ShipmentError("الشحنة غير موجودة.");
  if (!isShipmentEditable(s.status)) throw new ShipmentError("الشحنة مغلقة ولا تُعدَّل.");
  return s;
}

/**
 * يسجّل قيمة البضاعة في حساب المورد بسعر يوم الشراء. عند التعديل تُلغى الحركة السابقة
 * (مع السبب) وتُنشأ جديدة — كشف الحساب يحتفظ بكل التاريخ (D-74).
 */
async function postPurchase(tx: Tx, shipmentId: string, userId: string, reason: string) {
  const s = await tx.shipment.findUniqueOrThrow({ where: { id: shipmentId }, include: { lines: true } });
  if (!s.rateUsed) throw new Error("purchase rate missing");
  await tx.supplierLedgerEntry.updateMany({
    where: { shipmentId, kind: "PURCHASE", voidedAt: null },
    data: { voidedAt: new Date(), voidedById: userId, voidReason: reason },
  });
  if (s.status === "CANCELLED") return;
  const total = shipmentGoodsTotal(s.lines.map((l) => ({ qty: l.qty.toString(), unitPrice: l.unitPrice.toString() })));
  await tx.supplierLedgerEntry.create({
    data: {
      supplierId: s.supplierId,
      kind: "PURCHASE",
      occurredAt: s.purchasedAt,
      amount: total.toFixed(2),
      currencyCode: s.currencyCode,
      rateUsed: s.rateUsed,
      amountUsd: roundMoney(toUsdExact(total, s.rateUsed.toString())).toFixed(2),
      dueDate: s.dueDate,
      note: s.number,
      shipmentId: s.id,
      createdById: userId,
    },
  });
}

export async function updateShipmentDetails(
  id: string,
  input: { purchasedAt: Date | null; dueDate: Date | null; origin: string; notes: string | null },
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const s = await tx.shipment.findUnique({ where: { id } });
    if (!s) throw new ShipmentError("الشحنة غير موجودة.");
    // الاستحقاق والملاحظات تبقى قابلة للتعديل بعد الاستلام (السداد قد يتأخر)
    if (s.status === "CANCELLED") throw new ShipmentError("الشحنة ملغاة ولا تُعدَّل.");
    if (input.purchasedAt && s.status !== "DRAFT" && shopDay(input.purchasedAt) !== shopDay(s.purchasedAt)) {
      throw new ShipmentError("تاريخ الشراء يُعدَّل في المسودة فقط (سعر صرفه ثبّت التكلفة).");
    }
    await tx.shipment.update({
      where: { id },
      data: {
        ...(s.status === "DRAFT" && input.purchasedAt ? { purchasedAt: input.purchasedAt } : {}),
        dueDate: input.dueDate,
        origin: input.origin,
        notes: input.notes,
      },
    });
    // تاريخ الاستحقاق يظهر في حساب المورد
    await tx.supplierLedgerEntry.updateMany({
      where: { shipmentId: id, kind: "PURCHASE", voidedAt: null },
      data: { dueDate: input.dueDate },
    });
  });
}

export async function saveShipmentLines(
  id: string,
  lines: { variantId: string; qty: string; unitPrice: string }[],
  userId: string,
): Promise<void> {
  const seen = new Set<string>();
  for (const l of lines) {
    if (seen.has(l.variantId)) throw new ShipmentError("المنتج مكرر في البنود — اجمعي الكمية في سطر واحد.");
    seen.add(l.variantId);
  }
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: [...seen] }, deletedAt: null, product: { deletedAt: null } },
    include: { product: { select: { nameAr: true, unit: true } } },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));
  for (const l of lines) {
    const v = byId.get(l.variantId);
    if (!v) throw new ShipmentError("منتج غير موجود أو مؤرشف.");
    if (dec(l.qty).lte(0)) throw new ShipmentError(`${v.product.nameAr}: الكمية يجب أن تكون أكبر من صفر.`);
    if (v.product.unit === "PIECE" && !dec(l.qty).isInteger()) {
      throw new ShipmentError(`${v.product.nameAr}: الكمية بالحبة عدد صحيح.`);
    }
  }

  await prisma.$transaction(async (tx) => {
    const s = await loadEditable(tx, id);
    await tx.shipmentLine.deleteMany({ where: { shipmentId: id } });
    await tx.shipmentLine.createMany({
      data: lines.map((l, i) => ({
        shipmentId: id,
        variantId: l.variantId,
        qty: l.qty,
        unitPrice: l.unitPrice,
        sortOrder: i,
      })),
    });
    if (s.status !== "DRAFT") {
      if (lines.length === 0) throw new ShipmentError("الشحنة المشتراة تحتاج بنداً واحداً على الأقل.");
      await postPurchase(tx, id, userId, "تعديل بنود الشحنة");
    }
  });
}

export async function transitionShipment(id: string, to: ShipmentStatus, userId: string): Promise<void> {
  const current = await prisma.shipment.findUnique({ where: { id }, include: { _count: { select: { lines: true } } } });
  if (!current) throw new ShipmentError("الشحنة غير موجودة.");
  if (!canTransitionShipment(current.status, to)) throw new ShipmentError("لا يمكن الانتقال لهذه الحالة.");
  // شراء بتاريخ اليوم ← لحظة التأكيد (يُطبَّق آخر سعر أُدخل اليوم، لا سعر لحظة إنشاء المسودة)
  const now = new Date();
  const purchasedAt = shopDay(current.purchasedAt) === shopDay(now) ? now : current.purchasedAt;
  const rate = to === "PURCHASED" ? await rateOrThrow(current.currencyCode, purchasedAt) : null;

  await prisma.$transaction(async (tx) => {
    // إعادة الفحص تحت القفل: ربما استُلمت أو تغيّرت من جهاز آخر منذ القراءة الأولى
    await lockShipment(tx, id);
    const locked = await tx.shipment.findUniqueOrThrow({ where: { id }, select: { status: true } });
    if (!canTransitionShipment(locked.status, to)) throw new ShipmentError("تغيّرت حالة الشحنة — حدّثي الصفحة.");
    if (to === "PURCHASED") {
      if (current._count.lines === 0) throw new ShipmentError("أضيفي بنود الشحنة قبل تأكيد الشراء.");
      await tx.shipment.update({ where: { id }, data: { status: to, rateUsed: rate, purchasedAt } });
      await postPurchase(tx, id, userId, "تأكيد الشراء");
      return;
    }
    if (to === "CANCELLED") {
      const costs = await tx.shipmentCost.count({ where: { shipmentId: id, voidedAt: null } });
      if (costs > 0) throw new ShipmentError("ألغي تكاليف الشحنة أولاً (مبالغ مدفوعة من المحافظ).");
      await tx.shipment.update({ where: { id }, data: { status: to } });
      await postPurchase(tx, id, userId, "إلغاء الشحنة");
      return;
    }
    await tx.shipment.update({ where: { id }, data: { status: to } });
  });
}

export async function addShipmentCost(
  id: string,
  input: { kind: ShipmentCostKind; amount: string; walletId: string; paidAt: Date; note: string | null },
  userId: string,
): Promise<void> {
  const wallet = await prisma.wallet.findFirst({ where: { id: input.walletId, isActive: true } });
  if (!wallet) throw new ShipmentError("اختاري المحفظة.");
  const rate = await rateOrThrow(wallet.currencyCode, input.paidAt);
  await prisma.$transaction(async (tx) => {
    const s = await loadForCosts(tx, id);
    const cost = await tx.shipmentCost.create({
      data: {
        shipmentId: id,
        kind: input.kind,
        amount: dec(input.amount).toFixed(2),
        currencyCode: wallet.currencyCode,
        rateUsed: rate,
        amountUsd: roundMoney(toUsdExact(input.amount, rate)).toFixed(2),
        walletId: wallet.id,
        paidAt: input.paidAt,
        note: input.note,
        createdById: userId,
      },
    });
    // فاتورة متأخرة بعد الاستلام ← إعادة تقييم المخزون (D-78)
    if (s.status === "RECEIVED") {
      await revalueForCost(
        tx,
        id,
        { id: cost.id, amount: cost.amount.toString(), rateUsed: cost.rateUsed.toString() },
        1,
        userId,
        `تكلفة متأخرة: ${COST_LABELS[input.kind]}`,
      );
    }
  });
}

export async function voidShipmentCost(id: string, costId: string, reason: string, userId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const s = await loadForCosts(tx, id);
    const cost = await tx.shipmentCost.findFirst({ where: { id: costId, shipmentId: id, voidedAt: null } });
    if (!cost) throw new ShipmentError("التكلفة غير موجودة أو ملغاة.");
    // الشرط voidedAt: null يمنع إلغاءها مرتين من جهازين
    const updated = await tx.shipmentCost.updateMany({
      where: { id: costId, voidedAt: null },
      data: { voidedAt: new Date(), voidedById: userId, voidReason: reason },
    });
    if (updated.count === 0) throw new ShipmentError("التكلفة غير موجودة أو ملغاة.");
    if (s.status === "RECEIVED") {
      await revalueForCost(
        tx,
        id,
        { id: cost.id, amount: cost.amount.toString(), rateUsed: cost.rateUsed.toString() },
        -1,
        userId,
        `إلغاء تكلفة: ${reason}`,
      );
    }
  });
}

async function loadForCosts(tx: Tx, id: string) {
  await lockShipment(tx, id);
  const s = await tx.shipment.findUnique({ where: { id } });
  if (!s) throw new ShipmentError("الشحنة غير موجودة.");
  if (s.status === "DRAFT") throw new ShipmentError("أكّدي الشراء قبل تسجيل تكاليف الشحنة.");
  if (!canChangeShipmentCosts(s.status)) throw new ShipmentError("الشحنة ملغاة ولا تُعدَّل.");
  return s;
}

/** دفعات للموردين مستحقة خلال أيام (للوحة الرئيسية) — فقط لمن رصيده ما زال «علينا». */
export async function listDueSoon(days = 7) {
  const limit = new Date(Date.now() + days * 86_400_000);
  const entries = await prisma.supplierLedgerEntry.findMany({
    where: { voidedAt: null, dueDate: { lte: limit }, kind: { in: ["PURCHASE", "OPENING_BALANCE"] } },
    orderBy: { dueDate: "asc" },
    include: { supplier: { select: { id: true, name: true, currencyCode: true } } },
  });
  const balances = await prisma.supplierLedgerEntry.groupBy({
    by: ["supplierId"],
    where: { voidedAt: null, supplierId: { in: [...new Set(entries.map((e) => e.supplierId))] } },
    _sum: { amount: true },
  });
  const owed = new Map(balances.map((b) => [b.supplierId, b._sum.amount?.toString() ?? "0"]));
  const seen = new Set<string>();
  return entries.flatMap((e) => {
    const balance = owed.get(e.supplierId) ?? "0";
    if (seen.has(e.supplierId) || !dec(balance).gt(0) || !e.dueDate) return [];
    seen.add(e.supplierId);
    return [
      {
        supplierId: e.supplierId,
        supplierName: e.supplier.name,
        dueDate: e.dueDate,
        balance,
        currencyCode: e.supplier.currencyCode,
        overdue: e.dueDate < new Date(),
      },
    ];
  });
}
