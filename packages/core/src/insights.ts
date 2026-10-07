import { dec, type Decimal, type DecimalInput } from "./decimal";

/**
 * التحليلات (D-118): المخزون الراكد واقتراحات إعادة الطلب — دوال صافية بلا قاعدة بيانات.
 */

const DAY_MS = 86_400_000;

export interface ReorderInput {
  /** الكمية المباعة في نافذة البيع (فواتير + طلبات مسلّمة) */
  soldQty: DecimalInput;
  /** طول نافذة البيع بالأيام (60) */
  windowDays: number;
  stockQty: DecimalInput;
  /** كميات في شحنات لم تُستلم بعد */
  inboundQty: DecimalInput;
  /** مدة وصول الشحنة (30) */
  leadDays: number;
  /** مدة التغطية بعد الوصول (60) */
  coverDays: number;
  /** أقل كمية مباعة في النافذة حتى يُقترح الصنف (3) */
  minSold: DecimalInput;
}

export interface ReorderSuggestion {
  perDay: Decimal;
  /** أيام يكفيها الرصيد الحالي (بلا الشحنات القادمة)، أو null إن لم يُبع شيء */
  daysLeft: Decimal | null;
  /** الكمية المقترحة — عدد صحيح مقرّب للأعلى، 0 إن كان المتاح يكفي */
  suggestQty: Decimal;
  /** ينفد قبل أن تصل شحنة تُطلب اليوم */
  urgent: boolean;
}

/**
 * المعدل = المباع ÷ أيام النافذة؛ المقترح = المعدل × (الوصول + التغطية) − الرصيد − القادم.
 * الصنف الذي بيع منه أقل من الحد الأدنى لا يُقترح (null).
 */
export function reorderSuggestion(input: ReorderInput): ReorderSuggestion | null {
  const sold = dec(input.soldQty);
  if (sold.lte(0) || sold.lt(input.minSold) || input.windowDays <= 0) return null;
  const perDay = sold.div(input.windowDays);
  const stock = dec(input.stockQty);
  const available = (stock.gt(0) ? stock : dec(0)).plus(input.inboundQty);
  const need = perDay.mul(input.leadDays + input.coverDays).minus(available);
  const daysLeft = stock.gt(0) ? stock.div(perDay) : dec(0);
  return {
    perDay,
    daysLeft,
    suggestQty: need.gt(0) ? need.ceil() : dec(0),
    urgent: daysLeft.lt(input.leadDays),
  };
}

/**
 * راكد: له رصيد، ولم يُبع منه شيء منذ N يوماً، وآخر استلام له أقدم من N يوماً
 * (الصنف المستلم حديثاً يُمهَل المدة كاملة من تاريخ استلامه).
 */
export function isDeadStock(input: {
  qty: DecimalInput;
  lastSaleAt: Date | null;
  lastReceivedAt: Date | null;
  now: Date;
  days: number;
}): boolean {
  if (dec(input.qty).lte(0)) return false;
  const cutoff = input.now.getTime() - input.days * DAY_MS;
  if (input.lastSaleAt && input.lastSaleAt.getTime() > cutoff) return false;
  if (input.lastReceivedAt && input.lastReceivedAt.getTime() > cutoff) return false;
  return true;
}

/** الهامش من سعر البيع: الربح ÷ الإيراد، أو null بلا إيراد. */
export function marginOf(revenue: DecimalInput, profit: DecimalInput): Decimal | null {
  const r = dec(revenue);
  return r.gt(0) ? dec(profit).div(r) : null;
}
