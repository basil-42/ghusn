import { dec, sum, type Decimal, type DecimalInput } from "./decimal";

/**
 * حالات الشحنة (currency-and-costing §4.1 + D-77):
 * مسودة ← مشتراة ← في الطريق ← في الجمارك ← وصلت ← مستلمة (مغلقة)، أو ملغاة.
 * المسودة لا تؤثر على حساب المورد؛ تأكيد الشراء يسجّلها فيه.
 */
export const SHIPMENT_STATUSES = [
  "DRAFT",
  "PURCHASED",
  "IN_TRANSIT",
  "IN_CUSTOMS",
  "ARRIVED",
  "RECEIVED",
  "CANCELLED",
] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

const FLOW: readonly ShipmentStatus[] = ["DRAFT", "PURCHASED", "IN_TRANSIT", "IN_CUSTOMS", "ARRIVED", "RECEIVED"];

/**
 * الانتقالات المسموحة: للأمام فقط (يمكن تخطي مراحل — مورد محلي بلا جمارك)،
 * و«مستلمة» تتم من شاشة الاستلام فقط، والإلغاء قبل الاستلام.
 */
export function allowedShipmentTransitions(from: ShipmentStatus): ShipmentStatus[] {
  if (from === "RECEIVED" || from === "CANCELLED") return [];
  const index = FLOW.indexOf(from);
  const forward = FLOW.slice(index + 1).filter((s) => s !== "RECEIVED");
  // المسودة تنتقل للشراء أولاً (يُسجَّل في حساب المورد) قبل أي مرحلة أخرى
  const next = from === "DRAFT" ? forward.slice(0, 1) : forward;
  return [...next, "CANCELLED"];
}

export function canTransitionShipment(from: ShipmentStatus, to: ShipmentStatus): boolean {
  return allowedShipmentTransitions(from).includes(to);
}

/** البنود والتكاليف قابلة للتعديل حتى الاستلام. */
export function isShipmentEditable(status: ShipmentStatus): boolean {
  return status !== "RECEIVED" && status !== "CANCELLED";
}

/** قيمة البضاعة بعملة المورد = Σ الكمية × سعر الوحدة (مقرّبة لخانتين). */
export function shipmentGoodsTotal(lines: readonly { qty: DecimalInput; unitPrice: DecimalInput }[]): Decimal {
  return sum(lines.map((l) => dec(l.qty).mul(l.unitPrice))).toDecimalPlaces(2);
}

/** رقم مستند مقروء: SHP-2026-001 (CLAUDE.md). */
export function documentNumber(prefix: string, year: number, sequence: number, digits = 3): string {
  return `${prefix}-${year}-${String(sequence).padStart(digits, "0")}`;
}

/**
 * تكاليف الشحنة تُضاف وتُلغى بعد تأكيد الشراء، وحتى بعد الاستلام (فاتورة متأخرة — D-78)،
 * لكن ليس للمسودة ولا للملغاة.
 */
export function canChangeShipmentCosts(status: ShipmentStatus): boolean {
  return status !== "DRAFT" && status !== "CANCELLED";
}

/** الاستلام من أي مرحلة بعد الشراء — قد تصل البضاعة قبل تحديث الحالة. */
export function canReceiveShipment(status: ShipmentStatus): boolean {
  return status === "PURCHASED" || status === "IN_TRANSIT" || status === "IN_CUSTOMS" || status === "ARRIVED";
}
