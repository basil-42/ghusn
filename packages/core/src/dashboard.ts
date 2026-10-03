import { dec, type Decimal, type DecimalInput } from "./decimal";

/**
 * لوحة المتابعة (D-94): مقارنة فترتين، وتنبيه «قارب على النفاد».
 */

/** التغيّر بين فترتين كنسبة (0.25 = +25%)، أو null إن لم تكن هناك فترة سابقة للمقارنة. */
export function percentChange(current: DecimalInput, previous: DecimalInput): Decimal | null {
  const prev = dec(previous);
  if (prev.lte(0)) return null;
  return dec(current).minus(prev).div(prev);
}

/** الحد الفعّال: حد المنتج إن وُجد، وإلا الحد العام. الصنف قارب على النفاد إن كان رصيده ≤ الحد. */
export function isLowStock(
  qty: DecimalInput,
  productThreshold: DecimalInput | null,
  globalThreshold: DecimalInput,
): boolean {
  return dec(qty).lte(dec(productThreshold ?? globalThreshold));
}
