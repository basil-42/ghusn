import { dec, type Decimal, type DecimalInput } from "./decimal";

/**
 * المنصرفات في الرئيسية (D-137): مصاريف التشغيل (تُخصم من الربح) ومشتريات البضاعة (دفعات الموردين
 * وتكاليف الشحنات — تصير مخزوناً). كل حركة تُعرض بالجنيه بسعر يوم دفعها.
 */

export type SpendKind = "OPERATING" | "PURCHASE";

export interface SpendItem {
  kind: SpendKind;
  /** البند: قسم المصروف، أو «دفعات الموردين» / «تكاليف الشحنات». */
  group: string;
  currencyCode: string;
  amount: DecimalInput;
  amountUsd: DecimalInput;
  /** سعر الجنيه يوم الدفع (جنيه لكل دولار)، أو null إن لم يُسجَّل سعر. */
  sdgPerUsd: DecimalInput | null;
  /** مفتاح عمود الرسم (يوم أو شهر). */
  key: string;
}

/** قيمة الحركة بالجنيه: مبلغها إن كانت بالجنيه، وإلا قيمتها بالدولار × سعر الجنيه يوم دفعها. */
export function sdgValue(item: Pick<SpendItem, "currencyCode" | "amount" | "amountUsd" | "sdgPerUsd">): Decimal {
  if (item.currencyCode === "SDG") return dec(item.amount).abs();
  if (item.sdgPerUsd === null) return dec(0);
  return dec(item.amountUsd).abs().times(item.sdgPerUsd).toDecimalPlaces(0);
}

export interface SpendGroup {
  kind: SpendKind;
  group: string;
  sdg: Decimal;
  /** حصة البند من مجموع نوعه (0–1). */
  share: Decimal;
}

export interface SpendSummary {
  totalSdg: Decimal;
  operatingSdg: Decimal;
  purchaseSdg: Decimal;
  /** المجموع ÷ الأيام المنقضية من الفترة. */
  perDaySdg: Decimal;
  /** البنود مرتبة: التشغيل ثم المشتريات، والأكبر أولاً في كل نوع. */
  groups: SpendGroup[];
  /** حركات بعملة أجنبية بلا سعر جنيه يومها — لم تُحسب. */
  unpriced: number;
}

export function summarizeSpending(items: SpendItem[], days: number): SpendSummary {
  const by = new Map<string, { kind: SpendKind; group: string; sdg: Decimal }>();
  let operating = dec(0);
  let purchase = dec(0);
  let unpriced = 0;
  for (const item of items) {
    if (item.currencyCode !== "SDG" && item.sdgPerUsd === null) unpriced++;
    const v = sdgValue(item);
    if (item.kind === "OPERATING") operating = operating.plus(v);
    else purchase = purchase.plus(v);
    const id = `${item.kind}:${item.group}`;
    const g = by.get(id) ?? { kind: item.kind, group: item.group, sdg: dec(0) };
    g.sdg = g.sdg.plus(v);
    by.set(id, g);
  }
  const total = operating.plus(purchase);
  const share = (kind: SpendKind, v: Decimal) => {
    const base = kind === "OPERATING" ? operating : purchase;
    return base.gt(0) ? v.div(base) : dec(0);
  };
  const groups = [...by.values()]
    .filter((g) => g.sdg.gt(0))
    .map((g) => ({ ...g, share: share(g.kind, g.sdg) }))
    .sort((a, b) => (a.kind === b.kind ? b.sdg.comparedTo(a.sdg) : a.kind === "OPERATING" ? -1 : 1));
  return {
    totalSdg: total,
    operatingSdg: operating,
    purchaseSdg: purchase,
    perDaySdg: total.div(Math.max(days, 1)).toDecimalPlaces(0),
    groups,
    unpriced,
  };
}

/** المنصرف لكل عمود: التشغيل والمشتريات بالجنيه. */
export function spendingByKey(
  items: SpendItem[],
  keys: string[],
): { key: string; operating: Decimal; purchase: Decimal }[] {
  const rows = new Map(keys.map((k) => [k, { key: k, operating: dec(0), purchase: dec(0) }]));
  for (const item of items) {
    const row = rows.get(item.key);
    if (!row) continue;
    const v = sdgValue(item);
    if (item.kind === "OPERATING") row.operating = row.operating.plus(v);
    else row.purchase = row.purchase.plus(v);
  }
  return [...rows.values()];
}
