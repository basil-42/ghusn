import { dec, type DecimalInput } from "./decimal";

/**
 * ملاحظات تقرير الخصومات والمرتجعات (D-129): قواعد ثابتة وواضحة، للتنبيه لا للحكم.
 */

export interface StaffDiscountInput {
  name: string;
  invoices: number;
  /** قبل الخصم */
  grossSdg: DecimalInput;
  discountSdg: DecimalInput;
}

export type DiscountNote =
  { kind: "overall"; rate: string } | { kind: "staff_high"; name: string; rate: string; average: string };

/** موظفة نسبة خصمها ≥ 1.5 ضعف المتوسط و3 نقاط فوقه على الأقل، من 5 فواتير فأكثر. */
export function discountNotes(staff: readonly StaffDiscountInput[]): DiscountNote[] {
  const gross = staff.reduce((a, s) => a.plus(s.grossSdg), dec(0));
  const discount = staff.reduce((a, s) => a.plus(s.discountSdg), dec(0));
  if (gross.lte(0) || discount.lte(0)) return [];
  const average = discount.div(gross);
  const notes: DiscountNote[] = [{ kind: "overall", rate: average.toFixed(4) }];
  for (const s of staff) {
    if (s.invoices < 5 || dec(s.grossSdg).lte(0)) continue;
    const rate = dec(s.discountSdg).div(s.grossSdg);
    if (rate.gte(average.mul("1.5")) && rate.minus(average).gte("0.03")) {
      notes.push({ kind: "staff_high", name: s.name, rate: rate.toFixed(4), average: average.toFixed(4) });
    }
  }
  return notes;
}

export interface ReturnReasonCount {
  /** null = غير محدد (مرتجعات قبل الأسباب الثابتة) */
  code: string | null;
  count: number;
}

export interface ProductReturnInput {
  label: string;
  returnedQty: DecimalInput;
  soldQty: DecimalInput;
}

export type ReturnNote =
  | { kind: "top_reason"; code: string; share: string }
  | { kind: "product_rate"; label: string; returnedQty: string; soldQty: string; rate: string };

/**
 * - سبب واحد ≥ 40% من المرتجعات ذات السبب (3 على الأقل).
 * - صنف أُرجع منه ≥ 20% مما بيع، و3 قطع على الأقل (حتى 3 أصناف).
 */
export function returnNotes(
  reasons: readonly ReturnReasonCount[],
  products: readonly ProductReturnInput[],
): ReturnNote[] {
  const notes: ReturnNote[] = [];
  const coded = reasons.filter((r): r is { code: string; count: number } => r.code !== null);
  const total = coded.reduce((a, r) => a + r.count, 0);
  if (total >= 3) {
    const top = coded.reduce((a, b) => (b.count > a.count ? b : a));
    const share = dec(top.count).div(total);
    if (share.gte("0.4")) notes.push({ kind: "top_reason", code: top.code, share: share.toFixed(4) });
  }
  const flagged = products
    .filter((p) => dec(p.returnedQty).gte(3) && dec(p.soldQty).gt(0))
    .map((p) => ({ p, rate: dec(p.returnedQty).div(p.soldQty) }))
    .filter((x) => x.rate.gte("0.2"))
    .sort((a, b) => b.rate.comparedTo(a.rate))
    .slice(0, 3);
  for (const { p, rate } of flagged) {
    notes.push({
      kind: "product_rate",
      label: p.label,
      returnedQty: dec(p.returnedQty).toFixed(),
      soldQty: dec(p.soldQty).toFixed(),
      rate: rate.toFixed(4),
    });
  }
  return notes;
}
