import { randomBytes } from "node:crypto";
import {
  assertTransition,
  consumeBatches,
  CoreError,
  dec,
  isStockOut,
  normalizePhone,
  orderTotals,
  RESERVING_STATUSES,
  roundMoney,
  sum,
  variantLabel,
  weightedAverageCost,
  type Decimal,
  type OrderStatus,
} from "@ghusn/core";
import { Prisma, prisma, type DeliveryCity, type Fulfillment } from "@ghusn/db";
import { nextDocumentNumber } from "./documents";
import { currentSellingRate } from "./pricing";
import { courierWallet, getStoreSettings, posWallets } from "./settings";

/**
 * طلبات المتجر (D-88، customer-journey). السعر بالجنيه يُثبَّت عند الإنشاء؛ المخزون محجوز حتى
 * «قيد التجهيز» ثم يُخصم فعلياً (نفس منطق نقطة البيع: FEFO والمتوسط المرجّح). كل تغيير حالة يمر
 * بـ transitionOrder ويُكتب في OrderStatusHistory.
 */

type Db = Prisma.TransactionClient | typeof prisma;

/** خطأ للعميل بكود ثابت؛ الواجهة تترجمه (عربي/إنجليزي). */
export class OrderError extends Error {
  constructor(
    readonly code:
      | "EMPTY"
      | "TOO_MANY"
      | "INVALID_QTY"
      | "INVALID_PHONE"
      | "INVALID_RECIPIENT_PHONE"
      | "UNAVAILABLE"
      | "PRICE_CHANGED"
      | "COD_LIMIT"
      | "CONFLICT",
    readonly params: Record<string, string> = {},
  ) {
    super(code);
  }
}

/** خطأ لموظفات المحل (عربي). */
export class OrderActionError extends Error {}

export const MAX_ORDER_LINES = 30;
export const MAX_LINE_QTY = 20;
const RESERVING = RESERVING_STATUSES as unknown as OrderStatus[];

/** المحجوز لكل متغيّر: كميات الطلبات التي لم يبدأ تجهيزها. */
export async function reservedByVariant(db: Db, variantIds?: string[]): Promise<Map<string, Decimal>> {
  const rows = await db.$queryRaw<{ variantId: string; qty: Prisma.Decimal }[]>`
    SELECT ol."variantId", SUM(ol."qty") AS "qty"
      FROM "OrderLine" ol JOIN "Order" o ON o."id" = ol."orderId"
     WHERE o."status"::text IN (${Prisma.join(RESERVING)})
       ${variantIds ? Prisma.sql`AND ol."variantId" IN (${Prisma.join(variantIds.length ? variantIds : [""])})` : Prisma.empty}
     GROUP BY ol."variantId"`;
  return new Map(rows.map((r) => [r.variantId, dec(r.qty.toString())]));
}

/** المتغيّرات النشطة المسعّرة التي لها متاح للبيع أونلاين (الرصيد − المحجوز > 0). */
export async function availableVariantIds(): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT v."id" FROM "ProductVariant" v
      JOIN "StockLevel" s ON s."variantId" = v."id"
      LEFT JOIN (
        SELECT ol."variantId", SUM(ol."qty") AS "qty"
          FROM "OrderLine" ol JOIN "Order" o ON o."id" = ol."orderId"
         WHERE o."status"::text IN (${Prisma.join(RESERVING)})
         GROUP BY ol."variantId"
      ) r ON r."variantId" = v."id"
     WHERE v."deletedAt" IS NULL AND v."isActive" AND v."priceSdg" IS NOT NULL
       AND s."qty" - COALESCE(r."qty", 0) > 0`;
  return rows.map((r) => r.id);
}

/** المنتجات الظاهرة في المتجر (نفس شروط lib/storefront). */
const webVisible = {
  deletedAt: null,
  isActive: true,
  priceSdg: { not: null },
  product: { deletedAt: null, isActive: true, isWebVisible: true, type: "STOCK", category: { isActive: true } },
} satisfies Prisma.ProductVariantWhereInput;

export interface CartItemInput {
  variantId: string;
  qty: number;
}

function checkItems(items: CartItemInput[]) {
  if (items.length === 0) throw new OrderError("EMPTY");
  if (items.length > MAX_ORDER_LINES) throw new OrderError("TOO_MANY");
  if (new Set(items.map((i) => i.variantId)).size !== items.length) throw new OrderError("INVALID_QTY");
  for (const i of items) {
    if (!Number.isInteger(i.qty) || i.qty < 1 || i.qty > MAX_LINE_QTY) throw new OrderError("INVALID_QTY");
  }
}

export interface CartQuoteLine {
  variantId: string;
  productId: string;
  name: string;
  option: string;
  imageKey: string | null;
  qty: number;
  unitPriceSdg: string;
  lineTotalSdg: string;
  /** المتاح يكفي الكمية المطلوبة (لا تُكشف الكمية نفسها). */
  available: boolean;
}

/** عرض السلة من أسعار وتوفر الخادم الآن. الأصناف غير المعروضة تُسقط. */
export async function quoteCart(
  locale: string,
  items: CartItemInput[],
): Promise<{ lines: CartQuoteLine[]; totalSdg: string; allAvailable: boolean }> {
  const clean = items.filter((i) => Number.isInteger(i.qty) && i.qty >= 1).slice(0, MAX_ORDER_LINES);
  if (clean.length === 0) return { lines: [], totalSdg: "0", allAvailable: false };
  const ids = clean.map((i) => i.variantId);
  const [variants, reserved] = await Promise.all([
    prisma.productVariant.findMany({
      where: { ...webVisible, id: { in: ids } },
      include: {
        stockLevel: { select: { qty: true } },
        product: {
          select: {
            id: true,
            nameAr: true,
            nameEn: true,
            images: { orderBy: { sortOrder: "asc" }, take: 1, select: { key: true } },
          },
        },
      },
    }),
    reservedByVariant(prisma, ids),
  ]);
  const byId = new Map(variants.map((v) => [v.id, v]));
  const lines: CartQuoteLine[] = [];
  for (const i of clean) {
    const v = byId.get(i.variantId);
    if (!v) continue;
    const qty = Math.min(i.qty, MAX_LINE_QTY);
    const unit = dec(v.priceSdg?.toString() ?? "0");
    const avail = dec(v.stockLevel?.qty.toString() ?? "0").minus(reserved.get(v.id) ?? 0);
    lines.push({
      variantId: v.id,
      productId: v.product.id,
      name: locale === "en" && v.product.nameEn ? v.product.nameEn : v.product.nameAr,
      option: variantLabel(v),
      imageKey: v.product.images[0]?.key ?? null,
      qty,
      unitPriceSdg: unit.toFixed(0),
      lineTotalSdg: unit.mul(qty).toFixed(0),
      available: avail.gte(qty),
    });
  }
  return {
    lines,
    totalSdg: sum(lines.map((l) => l.lineTotalSdg)).toFixed(0),
    allAvailable: lines.length > 0 && lines.every((l) => l.available),
  };
}

export interface CreateOrderInput {
  /** معرّف يولّده المتصفح — إرسال الطلب مرتين لا ينشئ طلبين. */
  id: string;
  locale: string;
  customerName: string;
  phone: string;
  fulfillment: Fulfillment;
  city: DeliveryCity | null;
  address: string | null;
  recipientName: string | null;
  recipientPhone: string | null;
  note: string | null;
  items: CartItemInput[];
  /** الإجمالي الذي رآه العميل — إن تغيّر السعر يُطلب منه التأكيد من جديد. */
  expectedTotalSdg: string;
}

export async function createWebOrder(input: CreateOrderInput): Promise<{ number: string; trackingToken: string }> {
  const phone = normalizePhone(input.phone, "SD");
  if (!phone) throw new OrderError("INVALID_PHONE");
  const recipientPhone = input.recipientPhone ? normalizePhone(input.recipientPhone, "SD") : null;
  if (input.recipientPhone && !recipientPhone) throw new OrderError("INVALID_RECIPIENT_PHONE");

  const existing = await prisma.order.findUnique({
    where: { id: input.id },
    select: { number: true, trackingToken: true, customer: { select: { phone: true } } },
  });
  if (existing) {
    if (existing.customer.phone !== phone) throw new OrderError("CONFLICT");
    return { number: existing.number, trackingToken: existing.trackingToken };
  }

  checkItems(input.items);
  const ids = input.items.map((i) => i.variantId);
  const variants = await prisma.productVariant.findMany({
    where: { ...webVisible, id: { in: ids } },
    include: { product: { select: { nameAr: true } } },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));
  const missing = input.items.filter((i) => !byId.has(i.variantId));
  if (missing.length) throw new OrderError("UNAVAILABLE");

  let totals;
  try {
    totals = orderTotals(
      input.items.map((i) => ({
        key: i.variantId,
        qty: i.qty,
        unitPriceSdg: byId.get(i.variantId)?.priceSdg?.toString() ?? "0",
      })),
    );
  } catch (e) {
    if (e instanceof CoreError) throw new OrderError("INVALID_QTY");
    throw e;
  }
  if (!totals.totalSdg.eq(input.expectedTotalSdg)) {
    throw new OrderError("PRICE_CHANGED", { total: totals.totalSdg.toFixed(0) });
  }
  const paymentMethod = input.fulfillment === "DELIVERY" ? "COD" : "IN_SHOP";
  const { codMaxSdg } = await getStoreSettings();
  if (paymentMethod === "COD" && codMaxSdg > 0 && totals.totalSdg.gt(codMaxSdg)) {
    throw new OrderError("COD_LIMIT", { limit: String(codMaxSdg) });
  }

  const now = new Date();
  try {
    return await prisma.$transaction(async (tx) => {
      // قفل أرصدة الأصناف بترتيب ثابت ثم حساب المحجوز: طلبان متزامنان على آخر قطعة لا ينجحان معاً
      const sorted = [...ids].sort();
      const levels = await tx.$queryRaw<{ variantId: string; qty: Prisma.Decimal }[]>`
        SELECT "variantId", "qty" FROM "StockLevel" WHERE "variantId" IN (${Prisma.join(sorted)})
         ORDER BY "variantId" FOR UPDATE`;
      const reserved = await reservedByVariant(tx, ids);
      const unavailable = input.items.filter((i) => {
        const stock = dec(levels.find((l) => l.variantId === i.variantId)?.qty.toString() ?? "0");
        return stock.minus(reserved.get(i.variantId) ?? 0).lt(i.qty);
      });
      if (unavailable.length) {
        throw new OrderError("UNAVAILABLE", {
          items: unavailable.map((i) => byId.get(i.variantId)?.product.nameAr ?? "").join("، "),
        });
      }

      const customer = await tx.customer.upsert({
        where: { phone },
        create: { phone, name: input.customerName },
        update: { name: input.customerName },
      });
      const number = await nextDocumentNumber(tx, "GHS", now, 6);
      const trackingToken = randomBytes(18).toString("base64url");
      await tx.order.create({
        data: {
          id: input.id,
          number,
          trackingToken,
          channel: "WEB",
          status: "NEW",
          locale: input.locale === "en" ? "en" : "ar",
          customerId: customer.id,
          customerName: input.customerName,
          fulfillment: input.fulfillment,
          city: input.fulfillment === "DELIVERY" ? input.city : null,
          address: input.fulfillment === "DELIVERY" ? input.address : null,
          recipientName: input.recipientName,
          recipientPhone,
          note: input.note,
          paymentMethod,
          subtotalSdg: totals.subtotalSdg.toFixed(2),
          totalSdg: totals.totalSdg.toFixed(2),
          createdAt: now,
          lines: {
            create: totals.lines.map((l, i) => {
              const v = byId.get(l.key);
              return {
                variantId: l.key,
                label: [v?.product.nameAr, v ? variantLabel(v) : ""].filter(Boolean).join(" · "),
                qty: l.qty.toFixed(),
                unitPriceSdg: l.unitPriceSdg.toFixed(2),
                lineTotalSdg: l.lineTotalSdg.toFixed(2),
                sortOrder: i,
              };
            }),
          },
          history: { create: { fromStatus: null, toStatus: "NEW", createdAt: now } },
        },
      });
      return { number, trackingToken };
    });
  } catch (e) {
    // نفس الطلب أُرسل مرتين في نفس اللحظة: الأول نجح
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const saved = await prisma.order.findUnique({ where: { id: input.id } });
      if (saved) return { number: saved.number, trackingToken: saved.trackingToken };
    }
    throw e;
  }
}

export interface TransitionOptions {
  reason?: string | null;
  courierRef?: string | null;
  /** استلام من المحل: نقداً (درج الوردية) أو بنكك. */
  channel?: "CASH" | "BANKAK" | null;
  reference?: string | null;
}

/**
 * الانتقال الوحيد لحالة الطلب (D-60). يتحقق من الجدول، ويخصم المخزون عند التجهيز، ويعيده عند
 * الإلغاء بعد التجهيز، ويسجّل المقبوض عند التسليم، ويكتب السجل — كله في معاملة واحدة.
 */
export async function transitionOrder(
  orderId: string,
  to: OrderStatus,
  actorId: string,
  opts: TransitionOptions = {},
): Promise<void> {
  const reason = opts.reason?.trim() || null;
  const rate = to === "DELIVERED" ? await currentSellingRate() : null;
  if (to === "DELIVERED" && !rate) throw new OrderActionError("لا يوجد سعر للجنيه اليوم — اطلبي من المديرة إدخاله.");
  const courier = to === "DELIVERED" ? await courierWallet() : null;
  const shopWallets = to === "DELIVERED" ? await posWallets() : null;

  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`;
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { lines: { orderBy: { sortOrder: "asc" } } },
    });
    if (!order) throw new OrderActionError("الطلب غير موجود.");
    const from = order.status as OrderStatus;
    try {
      assertTransition(from, to, order.fulfillment);
    } catch {
      throw new OrderActionError("لا يمكن نقل الطلب لهذه الحالة الآن — حدّثي الصفحة.");
    }
    if (to === "CANCELLED" && !reason) throw new OrderActionError("اكتبي سبب الإلغاء.");
    if (from === "OUT_FOR_DELIVERY" && to === "READY" && !reason) {
      throw new OrderActionError("اكتبي سبب تعذّر التسليم.");
    }
    const now = new Date();
    const data: Prisma.OrderUpdateInput = { status: to };

    if (to === "PREPARING") {
      // خصم المخزون فعلياً — نفس منطق نقطة البيع (الأقدم صلاحية أولاً، بمتوسط التكلفة)
      const costs: Decimal[] = [];
      const lines = [...order.lines].sort((a, b) => a.variantId.localeCompare(b.variantId));
      for (const line of lines) {
        const qty = dec(line.qty.toString());
        const [level] = await tx.$queryRaw<{ qty: Prisma.Decimal; avgCostUsd: Prisma.Decimal }[]>`
          SELECT "qty", "avgCostUsd" FROM "StockLevel" WHERE "variantId" = ${line.variantId} FOR UPDATE`;
        const stockQty = dec(level?.qty.toString() ?? "0");
        if (stockQty.lt(qty)) {
          throw new OrderActionError(`الرصيد لا يكفي: ${line.label} — راجعي المخزون قبل التجهيز.`);
        }
        const unitCost = dec(level?.avgCostUsd.toString() ?? "0");
        const batches = await tx.$queryRaw<
          { id: string; qtyRemaining: Prisma.Decimal; expiresAt: Date | null; receivedAt: Date }[]
        >`SELECT "id", "qtyRemaining", "expiresAt", "receivedAt" FROM "StockBatch"
          WHERE "variantId" = ${line.variantId} AND "qtyRemaining" > 0 FOR UPDATE`;
        const { takes } = consumeBatches(
          batches.map((b) => ({
            id: b.id,
            qtyRemaining: b.qtyRemaining.toString(),
            expiresAt: b.expiresAt ? b.expiresAt.toISOString().slice(0, 10) : null,
            receivedAt: b.receivedAt,
          })),
          qty,
        );
        for (const t of takes) {
          await tx.stockBatch.update({
            where: { id: t.batchId },
            data: { qtyRemaining: { decrement: t.qty.toFixed() } },
          });
        }
        const qtyAfter = stockQty.minus(qty);
        await tx.stockLevel.update({ where: { variantId: line.variantId }, data: { qty: qtyAfter.toFixed() } });
        const costUsd = roundMoney(qty.mul(unitCost));
        costs.push(qty.mul(unitCost));
        await tx.orderLine.update({ where: { id: line.id }, data: { unitCostUsd: unitCost.toFixed(6) } });
        await tx.stockMovement.create({
          data: {
            variantId: line.variantId,
            batchId: takes.length === 1 ? takes[0]?.batchId : null,
            kind: "SALE",
            qty: qty.neg().toFixed(),
            unitCostUsd: unitCost.toFixed(6),
            valueUsd: costUsd.neg().toFixed(2),
            qtyAfter: qtyAfter.toFixed(),
            avgCostAfterUsd: unitCost.toFixed(6),
            orderId: order.id,
            note: order.number,
            createdById: actorId,
          },
        });
      }
      data.cogsUsd = roundMoney(sum(costs)).toFixed(2);
      data.preparedAt = now;
    }

    if (to === "CANCELLED") {
      data.cancelledAt = now;
      data.cancelReason = reason;
      if (isStockOut(from)) {
        // خرج المخزون عند التجهيز ← يعود بتكلفته ويُعاد حساب المتوسط المرجّح
        for (const line of order.lines) {
          const qty = dec(line.qty.toString());
          const unitCost = dec(line.unitCostUsd?.toString() ?? "0");
          await tx.$executeRaw`
            INSERT INTO "StockLevel" ("variantId", "qty", "avgCostUsd", "updatedAt")
            VALUES (${line.variantId}, 0, 0, now()) ON CONFLICT ("variantId") DO NOTHING`;
          const [level] = await tx.$queryRaw<{ qty: Prisma.Decimal; avgCostUsd: Prisma.Decimal }[]>`
            SELECT "qty", "avgCostUsd" FROM "StockLevel" WHERE "variantId" = ${line.variantId} FOR UPDATE`;
          const oldQty = level?.qty.toString() ?? "0";
          const avgAfter = weightedAverageCost({
            oldQty,
            oldAvgUsd: level?.avgCostUsd.toString() ?? "0",
            inQty: qty,
            inUnitUsd: unitCost,
          });
          const qtyAfter = dec(oldQty).plus(qty);
          await tx.stockLevel.update({
            where: { variantId: line.variantId },
            data: { qty: qtyAfter.toFixed(), avgCostUsd: avgAfter.toFixed(6) },
          });
          const [batch] = await tx.$queryRaw<{ id: string }[]>`
            SELECT "id" FROM "StockBatch" WHERE "variantId" = ${line.variantId}
            ORDER BY "receivedAt" DESC LIMIT 1 FOR UPDATE`;
          if (batch) {
            await tx.stockBatch.update({
              where: { id: batch.id },
              data: { qtyRemaining: { increment: qty.toFixed() } },
            });
          }
          await tx.stockMovement.create({
            data: {
              variantId: line.variantId,
              batchId: batch?.id ?? null,
              kind: "RETURN",
              qty: qty.toFixed(),
              unitCostUsd: unitCost.toFixed(6),
              valueUsd: roundMoney(qty.mul(unitCost)).toFixed(2),
              qtyAfter: qtyAfter.toFixed(),
              avgCostAfterUsd: avgAfter.toFixed(6),
              orderId: order.id,
              note: `${order.number} — إلغاء`,
              createdById: actorId,
            },
          });
        }
      }
    }

    if (to === "OUT_FOR_DELIVERY") data.courierRef = opts.courierRef?.trim() || null;

    if (to === "DELIVERED" && rate) {
      const total = dec(order.totalSdg.toString());
      data.deliveredAt = now;
      data.sdgPerUsd = rate;
      data.revenueUsd = roundMoney(total.div(rate)).toFixed(2);
      if (order.paymentMethod === "COD") {
        if (!courier) throw new OrderActionError("حددي محفظة شركة التوصيل من الضبط.");
        await tx.orderPayment.create({
          data: {
            orderId: order.id,
            method: "COD",
            amountSdg: total.toFixed(2),
            walletId: courier,
            receivedById: actorId,
            receivedAt: now,
          },
        });
      } else if (order.paymentMethod === "IN_SHOP") {
        if (!opts.channel) throw new OrderActionError("اختاري طريقة الدفع: نقداً أو بنكك.");
        let shiftId: string | null = null;
        if (opts.channel === "CASH") {
          // النقد يدخل درج وردية الموظفة (يدخل النقد المتوقع عند الإغلاق)
          const [shift] = await tx.$queryRaw<{ id: string }[]>`
            SELECT "id" FROM "Shift" WHERE "userId" = ${actorId} AND "closedAt" IS NULL FOR UPDATE`;
          if (!shift) throw new OrderActionError("افتحي ورديتك أولاً لاستلام النقد.");
          shiftId = shift.id;
        }
        if (!shopWallets) throw new Error("wallets");
        await tx.orderPayment.create({
          data: {
            orderId: order.id,
            method: "IN_SHOP",
            channel: opts.channel,
            amountSdg: total.toFixed(2),
            walletId: opts.channel === "CASH" ? shopWallets.cash : shopWallets.bankak,
            shiftId,
            reference: opts.channel === "BANKAK" ? opts.reference?.trim() || null : null,
            receivedById: actorId,
            receivedAt: now,
          },
        });
      }
    }

    await tx.order.update({ where: { id: order.id }, data });
    await tx.orderStatusHistory.create({
      data: { orderId: order.id, fromStatus: from, toStatus: to, actorId, reason, createdAt: now },
    });
  });
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  NEW: "جديد",
  AWAITING_PAYMENT: "بانتظار الدفع",
  PAYMENT_REVIEW: "إشعار قيد المراجعة",
  CONFIRMED: "مؤكد",
  PREPARING: "قيد التجهيز",
  AWAITING_PHOTO_APPROVAL: "بانتظار موافقة الصورة",
  READY: "جاهز",
  OUT_FOR_DELIVERY: "مع شركة التوصيل",
  DELIVERED: "تم التسليم",
  CANCELLED: "ملغى",
};

/** لون شارة الحالة في اللوحة. */
export function statusVariant(s: OrderStatus): "default" | "success" | "warning" | "destructive" {
  if (s === "NEW") return "warning";
  if (s === "DELIVERED") return "success";
  if (s === "CANCELLED") return "destructive";
  return "default";
}

export const CITY_LABELS: Record<DeliveryCity, string> = { KHARTOUM: "الخرطوم", BAHRI: "بحري", OMDURMAN: "أم درمان" };

/** مجموعات لوحة الطلبات. */
export const ORDER_TABS = [
  { key: "new", label: "جديدة", statuses: ["NEW", "AWAITING_PAYMENT", "PAYMENT_REVIEW"] },
  { key: "confirmed", label: "مؤكدة", statuses: ["CONFIRMED"] },
  { key: "preparing", label: "قيد التجهيز", statuses: ["PREPARING", "AWAITING_PHOTO_APPROVAL"] },
  { key: "ready", label: "جاهزة", statuses: ["READY"] },
  { key: "delivery", label: "مع التوصيل", statuses: ["OUT_FOR_DELIVERY"] },
  { key: "delivered", label: "مسلّمة", statuses: ["DELIVERED"] },
  { key: "cancelled", label: "ملغاة", statuses: ["CANCELLED"] },
] as const satisfies readonly { key: string; label: string; statuses: readonly OrderStatus[] }[];
export type OrderTab = (typeof ORDER_TABS)[number]["key"];

export async function orderTabCounts(): Promise<Record<OrderTab, number>> {
  const rows = await prisma.order.groupBy({ by: ["status"], _count: true });
  const count = (s: readonly string[]) => rows.filter((r) => s.includes(r.status)).reduce((n, r) => n + r._count, 0);
  return Object.fromEntries(ORDER_TABS.map((t) => [t.key, count(t.statuses)])) as Record<OrderTab, number>;
}

export async function countNewOrders(): Promise<number> {
  return prisma.order.count({ where: { status: "NEW" } });
}

export async function listOrders(tab: OrderTab, take = 100) {
  const statuses = ORDER_TABS.find((t) => t.key === tab)?.statuses ?? [];
  const rows = await prisma.order.findMany({
    where: { status: { in: [...statuses] } },
    orderBy: { createdAt: tab === "delivered" || tab === "cancelled" ? "desc" : "asc" },
    take,
    include: { customer: { select: { phone: true } }, _count: { select: { lines: true } } },
  });
  return rows.map((o) => ({
    id: o.id,
    number: o.number,
    status: o.status as OrderStatus,
    customerName: o.customerName,
    phone: o.customer.phone,
    fulfillment: o.fulfillment,
    city: o.city,
    totalSdg: o.totalSdg.toString(),
    lines: o._count.lines,
    createdAt: o.createdAt,
  }));
}

/** تفاصيل الطلب للوحة الموظفات (بلا تكلفة). */
export async function getOrderForStaff(id: string) {
  const o = await prisma.order.findUnique({
    where: { id },
    include: {
      customer: { select: { phone: true } },
      lines: { orderBy: { sortOrder: "asc" }, include: { variant: { select: { sku: true, barcode: true } } } },
      history: { orderBy: { createdAt: "asc" }, include: { actor: { select: { name: true } } } },
      payments: { include: { wallet: { select: { name: true } } } },
    },
  });
  if (!o) return null;
  return {
    id: o.id,
    number: o.number,
    status: o.status as OrderStatus,
    fulfillment: o.fulfillment,
    paymentMethod: o.paymentMethod,
    customerName: o.customerName,
    phone: o.customer.phone,
    city: o.city,
    address: o.address,
    recipientName: o.recipientName,
    recipientPhone: o.recipientPhone,
    note: o.note,
    courierRef: o.courierRef,
    totalSdg: o.totalSdg.toString(),
    createdAt: o.createdAt,
    cancelReason: o.cancelReason,
    lines: o.lines.map((l) => ({
      id: l.id,
      label: l.label,
      sku: l.variant.sku,
      qty: l.qty.toString(),
      unitPriceSdg: l.unitPriceSdg.toString(),
      lineTotalSdg: l.lineTotalSdg.toString(),
    })),
    history: o.history.map((h) => ({
      id: h.id,
      from: h.fromStatus as OrderStatus | null,
      to: h.toStatus as OrderStatus,
      actor: h.actor?.name ?? null,
      reason: h.reason,
      at: h.createdAt,
    })),
    payments: o.payments.map((p) => ({
      id: p.id,
      method: p.method,
      channel: p.channel,
      amountSdg: p.amountSdg.toString(),
      wallet: p.wallet.name,
      at: p.receivedAt,
    })),
  };
}

/** صفحة متابعة العميل برابطها السرّي — ما يخصه فقط (بلا هاتف كامل ولا بيانات داخلية). */
export async function getOrderByToken(token: string, locale: string) {
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(token)) return null;
  const o = await prisma.order.findUnique({
    where: { trackingToken: token },
    include: {
      lines: {
        orderBy: { sortOrder: "asc" },
        include: { variant: { include: { product: { select: { nameAr: true, nameEn: true } } } } },
      },
    },
  });
  if (!o) return null;
  return {
    number: o.number,
    status: o.status as OrderStatus,
    fulfillment: o.fulfillment,
    paymentMethod: o.paymentMethod,
    customerName: o.customerName,
    city: o.city,
    address: o.address,
    recipientName: o.recipientName,
    totalSdg: o.totalSdg.toFixed(0),
    createdAt: o.createdAt,
    lines: o.lines.map((l) => ({
      id: l.id,
      name: locale === "en" && l.variant.product.nameEn ? l.variant.product.nameEn : l.variant.product.nameAr,
      option: variantLabel(l.variant),
      qty: l.qty.toFixed(0),
      lineTotalSdg: l.lineTotalSdg.toFixed(0),
    })),
  };
}
