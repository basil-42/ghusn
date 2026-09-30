import { dec, type Decimal, type DecimalInput } from "./decimal";
import { CoreError } from "./errors";

/**
 * دورة حياة الطلب (customer-journey §2، D-60). الانتقال يمر بدالة واحدة في التطبيق تتحقق من هذا
 * الجدول وتكتب السجل. الحجز: من الإنشاء حتى بدء التجهيز؛ عند التجهيز يُخصم المخزون فعلياً.
 */

export const ORDER_STATUSES = [
  "NEW",
  "AWAITING_PAYMENT",
  "PAYMENT_REVIEW",
  "CONFIRMED",
  "PREPARING",
  "AWAITING_PHOTO_APPROVAL",
  "READY",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  NEW: ["CONFIRMED", "AWAITING_PAYMENT", "CANCELLED"],
  AWAITING_PAYMENT: ["PAYMENT_REVIEW", "CANCELLED"],
  PAYMENT_REVIEW: ["CONFIRMED", "AWAITING_PAYMENT", "CANCELLED"],
  CONFIRMED: ["PREPARING", "CANCELLED"],
  PREPARING: ["AWAITING_PHOTO_APPROVAL", "READY", "CANCELLED"],
  AWAITING_PHOTO_APPROVAL: ["READY", "PREPARING", "CANCELLED"],
  READY: ["OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"],
  // تعذّر التسليم ← يعود جاهزاً بموعد جديد؛ رفض الاستلام ← إلغاء ويعود للمخزون
  OUT_FOR_DELIVERY: ["DELIVERED", "READY", "CANCELLED"],
  DELIVERED: [],
  CANCELLED: [],
};

/** الحالات التي تحجز المخزون (قبل الخصم الفعلي عند التجهيز). */
export const RESERVING_STATUSES = [
  "NEW",
  "AWAITING_PAYMENT",
  "PAYMENT_REVIEW",
  "CONFIRMED",
] as const satisfies readonly OrderStatus[];

/** بعد بدء التجهيز خرج المخزون فعلاً: الإلغاء يعيده، وهو إجراء المديرة/المالك بسبب مكتوب. */
export const STOCK_OUT_STATUSES = [
  "PREPARING",
  "AWAITING_PHOTO_APPROVAL",
  "READY",
  "OUT_FOR_DELIVERY",
] as const satisfies readonly OrderStatus[];

export function nextStatuses(from: OrderStatus): readonly OrderStatus[] {
  return TRANSITIONS[from];
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export type Fulfillment = "DELIVERY" | "PICKUP";

/**
 * التحقق الكامل من الانتقال مع طريقة الاستلام: «مع شركة التوصيل» للتوصيل فقط، و«تم التسليم» من
 * «جاهز» مباشرة للاستلام من المحل فقط (التوصيل يمر بشركة التوصيل).
 */
export function assertTransition(from: OrderStatus, to: OrderStatus, fulfillment: Fulfillment): void {
  const ok =
    canTransition(from, to) &&
    !(to === "OUT_FOR_DELIVERY" && fulfillment !== "DELIVERY") &&
    !(from === "READY" && to === "DELIVERED" && fulfillment !== "PICKUP");
  if (!ok) throw new CoreError("INVALID_TRANSITION", `Order cannot go from ${from} to ${to} (${fulfillment})`);
}

export const isStockOut = (s: OrderStatus) => (STOCK_OUT_STATUSES as readonly OrderStatus[]).includes(s);
export const isReserving = (s: OrderStatus) => (RESERVING_STATUSES as readonly OrderStatus[]).includes(s);

/** المتاح للبيع أونلاين = الرصيد − المحجوز لطلبات لم يبدأ تجهيزها (لا يقل عن صفر). */
export function availableQty(stockQty: DecimalInput, reservedQty: DecimalInput): Decimal {
  const a = dec(stockQty).minus(reservedQty);
  return a.gt(0) ? a : dec(0);
}

export interface OrderLineInput {
  key: string;
  qty: DecimalInput;
  unitPriceSdg: DecimalInput;
}

/** إجمالي الطلب بالجنيه من أسعار الخادم (لا يُوثق بمجموع المتصفح). بلا خصم في المتجر حالياً. */
export function orderTotals(lines: readonly OrderLineInput[]) {
  if (lines.length === 0) throw new CoreError("EMPTY_CART", "Order has no lines");
  const out = lines.map((l) => {
    const qty = dec(l.qty);
    if (!qty.isInteger() || qty.lte(0)) throw new CoreError("INVALID_QUANTITY", "Quantity must be a positive integer");
    const unit = dec(l.unitPriceSdg);
    if (unit.lte(0)) throw new CoreError("INVALID_AMOUNT", "Unit price must be > 0");
    return { key: l.key, qty, unitPriceSdg: unit, lineTotalSdg: qty.mul(unit) };
  });
  const totalSdg = out.reduce((a, l) => a.plus(l.lineTotalSdg), dec(0));
  return { lines: out, subtotalSdg: totalSdg, totalSdg };
}
