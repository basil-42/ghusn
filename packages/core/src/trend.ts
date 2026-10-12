import { dec, type DecimalInput } from "./decimal";

/**
 * اتجاه الأشهر (D-127): ملاحظات تلقائية بقواعد ثابتة وواضحة على الأشهر المكتملة فقط (الشهر الجاري
 * جزئي فلا يُقارن بغيره).
 */

export interface TrendMonth {
  /** YYYY-MM */
  month: string;
  revenueUsd: DecimalInput;
  grossProfitUsd: DecimalInput;
  expensesUsd: DecimalInput;
  netProfitUsd: DecimalInput;
  /** هامش مجمل الربح (0–1) أو null بلا مبيعات */
  margin: DecimalInput | null;
}

export type TrendNote =
  | { kind: "margin_down"; months: number; from: string; to: string }
  | { kind: "expenses_outpace"; expensesGrowth: string; revenueGrowth: string }
  | { kind: "best"; month: string; netProfitUsd: string }
  | { kind: "worst"; month: string; netProfitUsd: string };

/** نمو مجموع آخر 3 أشهر عن الثلاثة قبلها (null إن كان الأساس صفراً). */
function growth(values: DecimalInput[]): string | null {
  if (values.length < 6) return null;
  const sum = (xs: DecimalInput[]) => xs.reduce<ReturnType<typeof dec>>((a, b) => a.plus(b), dec(0));
  const prev = sum(values.slice(-6, -3));
  const last = sum(values.slice(-3));
  return prev.gt(0) ? last.minus(prev).div(prev).toFixed(4) : null;
}

/**
 * - الهامش نزل 3 أشهر متتالية أو أكثر (حتى آخر شهر مكتمل).
 * - المصاريف نمت أسرع من المبيعات بفارق 5 نقاط أو أكثر (آخر 3 أشهر مقابل الثلاثة قبلها).
 * - أفضل وأسوأ شهر بصافي الربح (شهران بمبيعات على الأقل).
 * @param months مرتبة من الأقدم للأحدث، أشهر مكتملة فقط
 */
export function trendNotes(months: readonly TrendMonth[]): TrendNote[] {
  const notes: TrendNote[] = [];
  const margins = months.flatMap((m) => (m.margin === null ? [] : [dec(m.margin)]));
  let declines = 0;
  for (let i = margins.length - 1; i > 0; i--) {
    const cur = margins[i];
    const prev = margins[i - 1];
    if (cur && prev && cur.lt(prev)) declines++;
    else break;
  }
  const from = margins[margins.length - 1 - declines];
  const to = margins[margins.length - 1];
  if (declines >= 3 && from && to) {
    notes.push({ kind: "margin_down", months: declines, from: from.toFixed(4), to: to.toFixed(4) });
  }

  const expensesGrowth = growth(months.map((m) => m.expensesUsd));
  const revenueGrowth = growth(months.map((m) => m.revenueUsd));
  if (
    expensesGrowth !== null &&
    revenueGrowth !== null &&
    dec(expensesGrowth).gt(0) &&
    dec(expensesGrowth).minus(revenueGrowth).gte("0.05")
  ) {
    notes.push({ kind: "expenses_outpace", expensesGrowth, revenueGrowth });
  }

  const active = months.filter((m) => dec(m.revenueUsd).gt(0));
  if (active.length >= 2) {
    const best = active.reduce((a, b) => (dec(b.netProfitUsd).gt(a.netProfitUsd) ? b : a));
    const worst = active.reduce((a, b) => (dec(b.netProfitUsd).lt(a.netProfitUsd) ? b : a));
    notes.push({ kind: "best", month: best.month, netProfitUsd: dec(best.netProfitUsd).toFixed(2) });
    if (worst.month !== best.month) {
      notes.push({ kind: "worst", month: worst.month, netProfitUsd: dec(worst.netProfitUsd).toFixed(2) });
    }
  }
  return notes;
}

/** الأشهر YYYY-MM من الأقدم للأحدث تنتهي بـ end. */
export function monthsEndingAt(end: string, count: number): string[] {
  const [y, m] = end.split("-").map(Number) as [number, number];
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}
