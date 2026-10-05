import { randomBytes } from "node:crypto";
import {
  assertTransition,
  consumeBatches,
  CoreError,
  dec,
  isStockOut,
  normalizePhone,
  CARD_MESSAGE_MAX,
  orderTotals,
  PAYMENT_WINDOW_HOURS,
  paymentDueAfterRejection,
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
import { notifyNewOrder, notifyPaymentProof } from "./notifications";
import { kickPushDelivery } from "./push";
import { formatAmount } from "./format";
import { localePath, siteUrl } from "./site";
import { currentSellingRate } from "./pricing";
import { PrivateImageError, savePrivateImage } from "./private-images";
import { activeWrapStyle } from "./wrapping";
import { bankakAccount, courierWallet, getStoreSettings, posWallets } from "./settings";

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
      | "CONFLICT"
      | "INVALID"
      | "BANKAK_UNAVAILABLE"
      | "PAYMENT_CLOSED"
      | "INVALID_REFERENCE"
      | "IMAGE_TOO_LARGE"
      | "IMAGE_UNREADABLE"
      | "WRAP_UNAVAILABLE"
      | "CARD_TOO_LONG",
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

/** المتاح لكل متغيّر (الرصيد − المحجوز) — للخادم فقط؛ المتجر يعرض «متوفر» و«كمية محدودة» دون العدد. */
export async function availableQtyByVariant(variantIds: string[]): Promise<Map<string, Decimal>> {
  if (variantIds.length === 0) return new Map();
  const [levels, reserved] = await Promise.all([
    prisma.stockLevel.findMany({ where: { variantId: { in: variantIds } }, select: { variantId: true, qty: true } }),
    reservedByVariant(prisma, variantIds),
  ]);
  return new Map(levels.map((l) => [l.variantId, dec(l.qty.toString()).minus(reserved.get(l.variantId) ?? 0)]));
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
export interface CartQuote {
  lines: CartQuoteLine[];
  subtotalSdg: string;
  /** التغليف المختار إن كان متاحاً (D-91). */
  wrap: { id: string; name: string; priceSdg: string } | null;
  totalSdg: string;
  allAvailable: boolean;
}

export async function quoteCart(
  locale: string,
  items: CartItemInput[],
  wrapStyleId: string | null = null,
): Promise<CartQuote> {
  const clean = items.filter((i) => Number.isInteger(i.qty) && i.qty >= 1).slice(0, MAX_ORDER_LINES);
  if (clean.length === 0) return { lines: [], subtotalSdg: "0", wrap: null, totalSdg: "0", allAvailable: false };
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
  const style = wrapStyleId ? await activeWrapStyle(wrapStyleId) : null;
  const subtotal = sum(lines.map((l) => l.lineTotalSdg));
  return {
    lines,
    subtotalSdg: subtotal.toFixed(0),
    wrap: style
      ? { id: style.id, name: locale === "en" ? style.nameEn : style.nameAr, priceSdg: dec(style.priceSdg).toFixed(0) }
      : null,
    totalSdg: subtotal.plus(style?.priceSdg ?? 0).toFixed(0),
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
  /** عند الاستلام (نقداً للمندوب أو في المحل) أو تحويل بنكك مسبقاً. */
  payment: "ON_RECEIPT" | "BANKAK";
  /** «صمّم هديتك» (D-91): نمط التغليف ونص البطاقة (اختياريان). */
  wrapStyleId: string | null;
  cardMessage: string | null;
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

  const cardMessage = input.cardMessage?.trim() || null;
  if (cardMessage && cardMessage.length > CARD_MESSAGE_MAX) throw new OrderError("CARD_TOO_LONG");
  const wrap = input.wrapStyleId ? await activeWrapStyle(input.wrapStyleId) : null;
  if (input.wrapStyleId && !wrap) throw new OrderError("WRAP_UNAVAILABLE");

  let totals;
  try {
    totals = orderTotals(
      input.items.map((i) => ({
        key: i.variantId,
        qty: i.qty,
        unitPriceSdg: byId.get(i.variantId)?.priceSdg?.toString() ?? "0",
      })),
      wrap?.priceSdg ?? 0,
    );
  } catch (e) {
    if (e instanceof CoreError) throw new OrderError("INVALID_QTY");
    throw e;
  }
  if (!totals.totalSdg.eq(input.expectedTotalSdg)) {
    throw new OrderError("PRICE_CHANGED", { total: totals.totalSdg.toFixed(0) });
  }
  const paymentMethod = input.payment === "BANKAK" ? "BANKAK" : input.fulfillment === "DELIVERY" ? "COD" : "IN_SHOP";
  if (paymentMethod === "BANKAK" && !(await bankakAccount())) throw new OrderError("BANKAK_UNAVAILABLE");
  const { codMaxSdg } = await getStoreSettings();
  if (paymentMethod === "COD" && codMaxSdg > 0 && totals.totalSdg.gt(codMaxSdg)) {
    throw new OrderError("COD_LIMIT", { limit: String(codMaxSdg) });
  }

  const now = new Date();
  // بنكك: السعر والمخزون محجوزان 24 ساعة حتى يصل الإشعار (D-12)
  const status: OrderStatus = paymentMethod === "BANKAK" ? "AWAITING_PAYMENT" : "NEW";
  const paymentDueAt = paymentMethod === "BANKAK" ? new Date(now.getTime() + PAYMENT_WINDOW_HOURS * 3_600_000) : null;
  try {
    const created = await prisma.$transaction(async (tx) => {
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
          status,
          paymentDueAt,
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
          wrapStyleId: wrap?.id ?? null,
          wrapName: wrap?.nameAr ?? null,
          wrapPriceSdg: wrap ? totals.wrapPriceSdg.toFixed(2) : null,
          cardMessage,
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
          history: { create: { fromStatus: null, toStatus: status, createdAt: now } },
        },
      });
      // الإشعار في نفس المعاملة (D-109): لا طلب بلا تنبيه، ولا تنبيه لطلب لم يُحفظ
      await notifyNewOrder(tx, {
        id: input.id,
        number,
        customerName: input.customerName,
        itemCount: totals.lines.length,
        totalSdg: totals.totalSdg,
        cityLabel: input.fulfillment === "DELIVERY" && input.city ? CITY_LABELS[input.city] : null,
        gift: !!input.recipientName,
        bankak: paymentMethod === "BANKAK",
      });
      return { number, trackingToken };
    });
    // إشعار الجوال بعد نجاح المعاملة (D-109)
    kickPushDelivery();
    return created;
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
  /** رقم عملية بنكك (استلام في المحل) أو مرجع رد المبلغ عند إلغاء طلب مدفوع. */
  reference?: string | null;
  /** مراجعة إشعار بنكك: الإشعار الذي رأته المديرة (قبول ← مؤكد، رفض ← بانتظار الدفع). */
  proofId?: string | null;
  /** إشعار جديد من العميل (صفحة المتابعة). */
  proof?: { imageKey: string; reference: string } | null;
}

/** سبب الإلغاء التلقائي — صفحة العميل تعرضه بلغته. */
export const UNPAID_CANCEL_REASON = "لم يُدفع خلال المهلة";

interface TransitionContext {
  rate: string | null;
  courier: string | null;
  shopWallets: { cash: string; bankak: string } | null;
}

async function transitionContext(to: OrderStatus, needsBankak: boolean): Promise<TransitionContext> {
  const rate = to === "DELIVERED" ? await currentSellingRate() : null;
  if (to === "DELIVERED" && !rate) throw new OrderActionError("لا يوجد سعر للجنيه اليوم — اطلبي من المديرة إدخاله.");
  return {
    rate,
    courier: to === "DELIVERED" ? await courierWallet() : null,
    shopWallets: to === "DELIVERED" || needsBankak ? await posWallets() : null,
  };
}

/**
 * الانتقال الوحيد لحالة الطلب (D-60). يتحقق من الجدول، ويخصم المخزون عند التجهيز، ويعيده عند
 * الإلغاء بعد التجهيز، ويسجّل المقبوض عند التسليم أو قبول إشعار بنكك (D-90)، ويرد المدفوع عند
 * الإلغاء، ويكتب السجل — كله في معاملة واحدة. actorId فارغ = العميل أو النظام (الإلغاء التلقائي).
 */
export async function transitionOrder(
  orderId: string,
  to: OrderStatus,
  actorId: string | null,
  opts: TransitionOptions = {},
): Promise<void> {
  const ctx = await transitionContext(to, to === "CONFIRMED" && !!opts.proofId);
  await prisma.$transaction(async (tx) => {
    await applyTransition(tx, orderId, to, actorId, opts, ctx);
    // إشعار بنكك من العميل ← تنبيه عاجل لمن تراجع الدفع (D-109)
    if (to === "PAYMENT_REVIEW" && opts.proof) {
      const [order, proof] = await Promise.all([
        tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { id: true, number: true, totalSdg: true } }),
        tx.paymentProof.findFirstOrThrow({ where: { orderId }, orderBy: { createdAt: "desc" }, select: { id: true } }),
      ]);
      await notifyPaymentProof(tx, order, proof.id);
    }
  });
  if (to === "PAYMENT_REVIEW" && opts.proof) kickPushDelivery();
}

/** خصم كمية من المخزون (FEFO) بحركة مربوطة بالطلب — بلا رصيد سالب. يعيد تكلفة الوحدة والإجمالي. */
async function deductStock(
  tx: Prisma.TransactionClient,
  p: {
    variantId: string;
    qty: Decimal;
    kind: "SALE" | "CONSUMPTION";
    label: string;
    order: { id: string; number: string };
    actorId: string | null;
  },
): Promise<{ unitCost: Decimal; exact: Decimal }> {
  const [level] = await tx.$queryRaw<{ qty: Prisma.Decimal; avgCostUsd: Prisma.Decimal }[]>`
    SELECT "qty", "avgCostUsd" FROM "StockLevel" WHERE "variantId" = ${p.variantId} FOR UPDATE`;
  const stockQty = dec(level?.qty.toString() ?? "0");
  if (stockQty.lt(p.qty)) throw new OrderActionError(`الرصيد لا يكفي: ${p.label} — راجعي المخزون قبل التجهيز.`);
  const unitCost = dec(level?.avgCostUsd.toString() ?? "0");
  const batches = await tx.$queryRaw<
    { id: string; qtyRemaining: Prisma.Decimal; expiresAt: Date | null; receivedAt: Date }[]
  >`SELECT "id", "qtyRemaining", "expiresAt", "receivedAt" FROM "StockBatch"
    WHERE "variantId" = ${p.variantId} AND "qtyRemaining" > 0 FOR UPDATE`;
  const { takes } = consumeBatches(
    batches.map((b) => ({
      id: b.id,
      qtyRemaining: b.qtyRemaining.toString(),
      expiresAt: b.expiresAt ? b.expiresAt.toISOString().slice(0, 10) : null,
      receivedAt: b.receivedAt,
    })),
    p.qty,
  );
  for (const t of takes) {
    await tx.stockBatch.update({ where: { id: t.batchId }, data: { qtyRemaining: { decrement: t.qty.toFixed() } } });
  }
  const qtyAfter = stockQty.minus(p.qty);
  await tx.stockLevel.update({ where: { variantId: p.variantId }, data: { qty: qtyAfter.toFixed() } });
  const exact = p.qty.mul(unitCost);
  await tx.stockMovement.create({
    data: {
      variantId: p.variantId,
      batchId: takes.length === 1 ? takes[0]?.batchId : null,
      kind: p.kind,
      qty: p.qty.neg().toFixed(),
      unitCostUsd: unitCost.toFixed(6),
      valueUsd: roundMoney(exact).neg().toFixed(2),
      qtyAfter: qtyAfter.toFixed(),
      avgCostAfterUsd: unitCost.toFixed(6),
      orderId: p.order.id,
      note: p.order.number,
      createdById: p.actorId,
    },
  });
  return { unitCost, exact };
}

/** إعادة كمية للمخزون بتكلفتها (إلغاء بعد التجهيز) وإعادة حساب المتوسط المرجّح. */
async function restock(
  tx: Prisma.TransactionClient,
  p: {
    variantId: string;
    qty: Decimal;
    unitCost: Decimal;
    order: { id: string; number: string };
    actorId: string | null;
  },
): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO "StockLevel" ("variantId", "qty", "avgCostUsd", "updatedAt")
    VALUES (${p.variantId}, 0, 0, now()) ON CONFLICT ("variantId") DO NOTHING`;
  const [level] = await tx.$queryRaw<{ qty: Prisma.Decimal; avgCostUsd: Prisma.Decimal }[]>`
    SELECT "qty", "avgCostUsd" FROM "StockLevel" WHERE "variantId" = ${p.variantId} FOR UPDATE`;
  const oldQty = level?.qty.toString() ?? "0";
  const avgAfter = weightedAverageCost({
    oldQty,
    oldAvgUsd: level?.avgCostUsd.toString() ?? "0",
    inQty: p.qty,
    inUnitUsd: p.unitCost,
  });
  const qtyAfter = dec(oldQty).plus(p.qty);
  await tx.stockLevel.update({
    where: { variantId: p.variantId },
    data: { qty: qtyAfter.toFixed(), avgCostUsd: avgAfter.toFixed(6) },
  });
  const [batch] = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "StockBatch" WHERE "variantId" = ${p.variantId}
    ORDER BY "receivedAt" DESC LIMIT 1 FOR UPDATE`;
  if (batch) {
    await tx.stockBatch.update({ where: { id: batch.id }, data: { qtyRemaining: { increment: p.qty.toFixed() } } });
  }
  await tx.stockMovement.create({
    data: {
      variantId: p.variantId,
      batchId: batch?.id ?? null,
      kind: "RETURN",
      qty: p.qty.toFixed(),
      unitCostUsd: p.unitCost.toFixed(6),
      valueUsd: roundMoney(p.qty.mul(p.unitCost)).toFixed(2),
      qtyAfter: qtyAfter.toFixed(),
      avgCostAfterUsd: avgAfter.toFixed(6),
      orderId: p.order.id,
      note: `${p.order.number} — إلغاء`,
      createdById: p.actorId,
    },
  });
}

async function applyTransition(
  tx: Prisma.TransactionClient,
  orderId: string,
  to: OrderStatus,
  actorId: string | null,
  opts: TransitionOptions,
  ctx: TransitionContext,
): Promise<void> {
  const { rate, courier, shopWallets } = ctx;
  const reason = opts.reason?.trim() || null;
  await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`;
  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: {
      lines: { orderBy: { sortOrder: "asc" } },
      payments: true,
      paymentProofs: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!order) throw new OrderActionError("الطلب غير موجود.");
  const from = order.status as OrderStatus;
  try {
    assertTransition(from, to, {
      fulfillment: order.fulfillment,
      payment: order.paymentMethod,
    });
  } catch {
    throw new OrderActionError("لا يمكن نقل الطلب لهذه الحالة الآن — حدّثي الصفحة.");
  }
  if (to === "CANCELLED" && !reason) throw new OrderActionError("اكتبي سبب الإلغاء.");
  if (from === "OUT_FOR_DELIVERY" && to === "READY" && !reason) {
    throw new OrderActionError("اكتبي سبب تعذّر التسليم.");
  }
  const now = new Date();
  const data: Prisma.OrderUpdateInput = { status: to };

  if (to === "PAYMENT_REVIEW") {
    // إشعار العميل: داخل المهلة فقط؛ بعدها يُلغى الطلب ويُفك الحجز
    if (!opts.proof) throw new OrderActionError("الإشعار يرفعه العميل من صفحة المتابعة.");
    if (order.paymentDueAt && order.paymentDueAt <= now) throw new OrderError("PAYMENT_CLOSED");
    await tx.paymentProof.create({
      data: { orderId: order.id, imageKey: opts.proof.imageKey, reference: opts.proof.reference, createdAt: now },
    });
  }

  if (from === "PAYMENT_REVIEW") {
    const proof = order.paymentProofs[0];
    if (to !== "CANCELLED" && (!proof || proof.id !== opts.proofId || proof.reviewedAt)) {
      throw new OrderActionError("وصل إشعار أحدث أو رُوجع هذا الإشعار — حدّثي الصفحة.");
    }
    if (to === "AWAITING_PAYMENT" && !reason) throw new OrderActionError("اكتبي سبب رفض الإشعار ليراه العميل.");
    if (proof && !proof.reviewedAt) {
      await tx.paymentProof.update({
        where: { id: proof.id },
        data: { reviewedAt: now, reviewedById: actorId, accepted: to === "CONFIRMED", reviewNote: reason },
      });
    }
    if (to === "AWAITING_PAYMENT") data.paymentDueAt = paymentDueAfterRejection(order.paymentDueAt, now);
    if (to === "CONFIRMED" && proof) {
      // المبلغ في حساب بنكك بعد المطابقة مع كشف الحساب
      if (!shopWallets) throw new Error("wallets");
      await tx.orderPayment.create({
        data: {
          orderId: order.id,
          method: "BANKAK",
          channel: "BANKAK",
          amountSdg: order.totalSdg.toFixed(2),
          walletId: shopWallets.bankak,
          reference: proof.reference,
          receivedById: actorId,
          receivedAt: now,
        },
      });
    }
  }

  if (to === "PREPARING" && from === "CONFIRMED") {
    // خصم المخزون فعلياً — نفس منطق نقطة البيع (الأقدم صلاحية أولاً، بمتوسط التكلفة)
    const costs: Decimal[] = [];
    const lines = [...order.lines].sort((a, b) => a.variantId.localeCompare(b.variantId));
    for (const line of lines) {
      const { unitCost, exact } = await deductStock(tx, {
        variantId: line.variantId,
        qty: dec(line.qty.toString()),
        kind: "SALE",
        label: line.label,
        order,
        actorId,
      });
      costs.push(exact);
      await tx.orderLine.update({ where: { id: line.id }, data: { unitCostUsd: unitCost.toFixed(6) } });
    }
    // مواد التغليف حسب وصفة النمط وقت التجهيز (D-91)
    const wrapCosts: Decimal[] = [];
    if (order.wrapStyleId) {
      const materials = await tx.wrapStyleMaterial.findMany({
        where: { wrapStyleId: order.wrapStyleId },
        include: { variant: { include: { product: { select: { nameAr: true } } } } },
        orderBy: { variantId: "asc" },
      });
      for (const m of materials) {
        const { exact } = await deductStock(tx, {
          variantId: m.variantId,
          qty: dec(m.qty.toString()),
          kind: "CONSUMPTION",
          label: `مادة تغليف: ${m.variant.product.nameAr}`,
          order,
          actorId,
        });
        wrapCosts.push(exact);
      }
      data.wrapCostUsd = roundMoney(sum(wrapCosts)).toFixed(2);
    }
    data.cogsUsd = roundMoney(sum([...costs, ...wrapCosts])).toFixed(2);
    data.preparedAt = now;
  }

  // طلب قديم في حالة «بانتظار موافقة الصورة» الملغاة (D-99): يُفرَّغ موعدها عند خروجه منها
  if (from === "AWAITING_PHOTO_APPROVAL") data.photoDueAt = null;

  if (to === "CANCELLED") {
    data.cancelledAt = now;
    data.cancelReason = reason;
    // طلب مدفوع مسبقاً (بنكك): الإلغاء يسجّل رد المبلغ من نفس المحفظة
    const paidByWallet = new Map<string, Decimal>();
    for (const p of order.payments) {
      paidByWallet.set(p.walletId, (paidByWallet.get(p.walletId) ?? dec(0)).plus(p.amountSdg.toString()));
    }
    for (const [walletId, paid] of paidByWallet) {
      if (!paid.gt(0)) continue;
      if (!actorId) throw new OrderActionError("طلب مدفوع — يلغيه المدير مع رد المبلغ.");
      await tx.orderPayment.create({
        data: {
          orderId: order.id,
          method: order.paymentMethod,
          channel: "BANKAK",
          amountSdg: paid.neg().toFixed(2),
          walletId,
          reference: opts.reference?.trim() || null,
          receivedById: actorId,
          receivedAt: now,
        },
      });
    }
    if (isStockOut(from)) {
      // خرج المخزون عند التجهيز ← يعود بتكلفته (الأصناف ومواد التغليف) ويُعاد حساب المتوسط المرجّح
      for (const line of order.lines) {
        await restock(tx, {
          variantId: line.variantId,
          qty: dec(line.qty.toString()),
          unitCost: dec(line.unitCostUsd?.toString() ?? "0"),
          order,
          actorId,
        });
      }
      const consumed = await tx.stockMovement.findMany({
        where: { orderId: order.id, kind: "CONSUMPTION" },
        orderBy: { variantId: "asc" },
      });
      for (const m of consumed) {
        await restock(tx, {
          variantId: m.variantId,
          qty: dec(m.qty.toString()).neg(),
          unitCost: dec(m.unitCostUsd?.toString() ?? "0"),
          order,
          actorId,
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
}

/**
 * إشعار بنكك من صفحة المتابعة (D-90): صورة التحويل ورقم العملية. يُقبل داخل المهلة فقط والطلب
 * «بانتظار الدفع»؛ بعد رفض إشعار سابق يمكن الإرسال من جديد.
 */
export async function submitPaymentProof(token: string, file: File, reference: string): Promise<void> {
  const ref = reference.trim();
  if (ref.length < 3 || ref.length > 60) throw new OrderError("INVALID_REFERENCE");
  const order = await prisma.order.findUnique({
    where: { trackingToken: token },
    select: { id: true, status: true, paymentMethod: true, paymentDueAt: true },
  });
  if (!order || order.paymentMethod !== "BANKAK" || order.status !== "AWAITING_PAYMENT") {
    throw new OrderError("PAYMENT_CLOSED");
  }
  if (order.paymentDueAt && order.paymentDueAt <= new Date()) {
    await expireUnpaidOrders();
    throw new OrderError("PAYMENT_CLOSED");
  }
  let imageKey: string;
  try {
    imageKey = await savePrivateImage(file, "payments");
  } catch (e) {
    if (e instanceof PrivateImageError) {
      throw new OrderError(e.code === "TOO_LARGE" ? "IMAGE_TOO_LARGE" : "IMAGE_UNREADABLE");
    }
    throw e;
  }
  try {
    await transitionOrder(order.id, "PAYMENT_REVIEW", null, { proof: { imageKey, reference: ref } });
  } catch (e) {
    // سُبق بإلغاء أو بإشعار آخر في نفس اللحظة
    if (e instanceof OrderActionError) throw new OrderError("PAYMENT_CLOSED");
    throw e;
  }
}

/**
 * الإلغاء التلقائي لطلبات بنكك التي انتهت مهلتها دون إشعار (D-12): يُفك الحجز. يعمل كل بضع دقائق
 * (pg-boss، lib/jobs) وعند فتح لوحة الطلبات. الطلب «قيد المراجعة» لا يُلغى — ينتظر المديرة.
 */
export async function expireUnpaidOrders(now = new Date()): Promise<number> {
  const due = await prisma.order.findMany({
    where: { status: "AWAITING_PAYMENT", paymentDueAt: { lte: now } },
    select: { id: true },
    take: 200,
  });
  let n = 0;
  for (const o of due) {
    try {
      await transitionOrder(o.id, "CANCELLED", null, { reason: UNPAID_CANCEL_REASON });
      n++;
    } catch (e) {
      // وصل الإشعار في نفس اللحظة — لا شيء يُلغى
      if (!(e instanceof OrderActionError || e instanceof OrderError)) throw e;
    }
  }
  return n;
}

/** رابط واتساب لتذكير العميل بالدفع (قبل ربط WhatsApp API — المرحلة 3). */
export function paymentReminderLink(o: {
  phone: string;
  number: string;
  totalSdg: string;
  trackingToken: string;
  locale: string;
}) {
  const url = `${siteUrl()}${localePath(o.locale, `/o/${o.trackingToken}`)}`;
  const total = formatAmount(o.totalSdg, 0);
  const text =
    o.locale === "en"
      ? `Hello from Ghusn 🌿 Your order ${o.number} (${total} SDG) is reserved and awaiting your Bankak transfer. Please upload the receipt here: ${url}`
      : `مرحباً من غصن 🌿 طلبك ${o.number} (${total} ج.س) محجوز بانتظار تحويل بنكك. ارفع صورة الإشعار من هنا: ${url}`;
  return `https://wa.me/${o.phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}

/**
 * «تتبّع طلبك» (D-93): رقم الطلب (كاملاً أو أرقامه الأخيرة) + هاتف الطلب ← رابط المتابعة. الهاتف شرط
 * دائماً، فلا يكفي تخمين الرقم؛ وحد المحاولات في الإجراء.
 */
export async function findOrderToken(numberInput: string, phoneInput: string): Promise<string | null> {
  const phone = normalizePhone(phoneInput, "SD");
  if (!phone) return null;
  const raw = numberInput.trim().toUpperCase().replace(/\s+/g, "");
  const digits = /^\d{1,6}$/.test(raw) ? raw.padStart(6, "0") : null;
  if (!digits && !/^GHS-\d{4}-\d{6}$/.test(raw)) return null;
  const order = await prisma.order.findFirst({
    where: {
      customer: { phone },
      ...(digits ? { number: { endsWith: `-${digits}` } } : { number: raw }),
    },
    orderBy: { createdAt: "desc" },
    select: { trackingToken: true },
  });
  return order?.trackingToken ?? null;
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  NEW: "جديد",
  AWAITING_PAYMENT: "بانتظار الدفع",
  PAYMENT_REVIEW: "إشعار قيد المراجعة",
  CONFIRMED: "مؤكد",
  PREPARING: "قيد التجهيز",
  AWAITING_PHOTO_APPROVAL: "قيد التجهيز (قديم)",
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

/** ما ينتظر إجراءً من المحل: طلبات جديدة، وإشعارات بنكك للمراجعة. */
export async function countNewOrders(): Promise<{ new: number; paymentReview: number }> {
  const [n, review] = await Promise.all([
    prisma.order.count({ where: { status: "NEW" } }),
    prisma.order.count({ where: { status: "PAYMENT_REVIEW" } }),
  ]);
  return { new: n, paymentReview: review };
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
    paymentMethod: o.paymentMethod,
    paymentDueAt: o.paymentDueAt,
    wrapped: !!o.wrapStyleId,
    createdAt: o.createdAt,
  }));
}

/**
 * طلبات المتجر المسلّمة لصفحة «المبيعات» (المالك والمديرة): الإيراد بسعر يوم التسليم والتكلفة من
 * يوم التجهيز، مثل التقرير الشهري (D-89).
 */
export async function listDeliveredOrders(take = 100) {
  const rows = await prisma.order.findMany({
    where: { status: "DELIVERED" },
    orderBy: { deliveredAt: "desc" },
    take,
  });
  return rows.map((o) => ({
    id: o.id,
    number: o.number,
    customerName: o.customerName,
    fulfillment: o.fulfillment,
    paymentMethod: o.paymentMethod,
    deliveredAt: o.deliveredAt ?? o.updatedAt,
    totalSdg: o.totalSdg.toString(),
    profitUsd: dec(o.revenueUsd?.toString() ?? "0")
      .minus(o.cogsUsd?.toString() ?? "0")
      .toString(),
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
      payments: { orderBy: { receivedAt: "asc" }, include: { wallet: { select: { name: true } } } },
      paymentProofs: { orderBy: { createdAt: "desc" }, include: { reviewedBy: { select: { name: true } } } },
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
    paymentDueAt: o.paymentDueAt,
    wrapName: o.wrapName,
    wrapPriceSdg: o.wrapPriceSdg?.toString() ?? null,
    subtotalSdg: o.subtotalSdg.toString(),
    cardMessage: o.cardMessage,
    reminderLink:
      o.status === "AWAITING_PAYMENT"
        ? paymentReminderLink({ ...o, phone: o.customer.phone, totalSdg: o.totalSdg.toFixed(0) })
        : null,
    proofs: o.paymentProofs.map((p) => ({
      id: p.id,
      reference: p.reference,
      at: p.createdAt,
      reviewedAt: p.reviewedAt,
      reviewer: p.reviewedBy?.name ?? null,
      accepted: p.accepted,
      note: p.reviewNote,
    })),
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
      reference: p.reference,
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
      paymentProofs: { orderBy: { createdAt: "desc" }, take: 1 },
      wrapStyle: { select: { nameAr: true, nameEn: true } },
      history: { orderBy: { createdAt: "asc" }, select: { id: true, toStatus: true, createdAt: true } },
    },
  });
  if (!o) return null;
  const proof = o.paymentProofs[0];
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
    paymentDueAt: o.paymentDueAt,
    /** سبب رفض آخر إشعار (يكتبه المحل للعميل) — يظهر ما دام الطلب بانتظار الدفع. */
    proofRejection: o.status === "AWAITING_PAYMENT" && proof?.accepted === false ? (proof.reviewNote ?? "") : null,
    unpaidExpired: o.status === "CANCELLED" && o.cancelReason === UNPAID_CANCEL_REASON,
    wrap: o.wrapName
      ? {
          name: (locale === "en" ? o.wrapStyle?.nameEn : o.wrapStyle?.nameAr) ?? o.wrapName,
          priceSdg: o.wrapPriceSdg?.toFixed(0) ?? "0",
        }
      : null,
    cardMessage: o.cardMessage,
    /** الخط الزمني للعميل: كل مرحلة ووقتها (بلا أسباب ولا أسماء الموظفين). */
    timeline: o.history.map((h) => ({ id: h.id, status: h.toStatus as OrderStatus, at: h.createdAt })),
    lines: o.lines.map((l) => ({
      id: l.id,
      name: locale === "en" && l.variant.product.nameEn ? l.variant.product.nameEn : l.variant.product.nameAr,
      option: variantLabel(l.variant),
      qty: l.qty.toFixed(0),
      lineTotalSdg: l.lineTotalSdg.toFixed(0),
    })),
  };
}
