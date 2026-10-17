import { Decimal, dec, roundMoney, sum, type DecimalInput } from "./decimal";
import { CoreError } from "./errors";

/**
 * ربح الشهر بالدولار (currency-and-costing §6–7، D-83):
 *   صافي الإيراد   = إيراد المبيعات − المرتجعات (بسعر يوم البيع)
 *   صافي التكلفة  = تكلفة المبيعات − تكلفة ما عاد سليماً للمخزون
 *   مجمل الربح    = صافي الإيراد − صافي التكلفة
 *   صافي الربح    = مجمل الربح − المصاريف − خسائر المخزون (تكلفة متأخرة لوحدات خرجت، بنود شحنات لم تصل)
 *                   + فروقات الصندوق (صافي زيادة وعجز عدّ الورديات، بإشارته — D-87)
 */
export interface MonthFigures {
  revenueUsd: DecimalInput;
  refundUsd: DecimalInput;
  cogsUsd: DecimalInput;
  restockCostUsd: DecimalInput;
  expensesUsd: DecimalInput;
  stockLossUsd: DecimalInput;
  /** صافي فروقات عدّ الورديات بالدولار: سالب = عجز، موجب = زيادة. */
  cashDifferenceUsd: DecimalInput;
}

export function monthProfit(f: MonthFigures) {
  const netRevenueUsd = dec(f.revenueUsd).minus(f.refundUsd);
  const netCogsUsd = dec(f.cogsUsd).minus(f.restockCostUsd);
  const grossProfitUsd = netRevenueUsd.minus(netCogsUsd);
  const netProfitUsd = grossProfitUsd.minus(f.expensesUsd).minus(f.stockLossUsd).plus(f.cashDifferenceUsd);
  return {
    netRevenueUsd: roundMoney(netRevenueUsd),
    netCogsUsd: roundMoney(netCogsUsd),
    grossProfitUsd: roundMoney(grossProfitUsd),
    netProfitUsd: roundMoney(netProfitUsd),
    /** هامش مجمل الربح من صافي الإيراد (null بلا إيراد). */
    grossMargin: netRevenueUsd.gt(0) ? grossProfitUsd.div(netRevenueUsd) : null,
  };
}

/**
 * فرق عدّ الوردية (D-87): المعدود − المتوقع بالجنيه، وقيمته بالدولار بسعر لحظة الإغلاق
 * (تُحسب مرة واحدة وتُحفظ). سالب = عجز.
 */
export function shiftDifference(input: {
  expectedSdg: DecimalInput;
  countedSdg: DecimalInput;
  sdgPerUsd: DecimalInput;
}) {
  const differenceSdg = dec(input.countedSdg).minus(input.expectedSdg);
  const rate = dec(input.sdgPerUsd);
  if (!rate.isFinite() || rate.lte(0)) throw new CoreError("INVALID_RATE", "Rate must be > 0");
  return { differenceSdg, differenceUsd: roundMoney(differenceSdg.div(rate)) };
}

/**
 * عهدة الوردية عند الفتح (D-146): رصيد الخزنة في النظام، إلا إن عدّت الموظفة الدرج ووجدت غيره —
 * فالعهدة المعدود، والفرق (المعدود − النظام) يُسجَّل كفرق صندوق. الرصيد السالب يحتاج عدّاً.
 */
export function shiftOpening(input: { systemSdg: DecimalInput; countedSdg?: DecimalInput | null }) {
  const system = dec(input.systemSdg);
  if (input.countedSdg === null || input.countedSdg === undefined) {
    if (system.lt(0)) throw new CoreError("COUNT_REQUIRED", "System balance is negative — count the drawer");
    return { openingSdg: system, differenceSdg: dec(0) };
  }
  const counted = dec(input.countedSdg);
  if (!counted.isFinite() || counted.lt(0)) throw new CoreError("INVALID_AMOUNT", "Counted cash must be ≥ 0");
  return { openingSdg: counted, differenceSdg: counted.minus(system) };
}

/** مجموع مبالغ بعملاتها الأصلية: { SDG: 150000, QAR: 300 } — للعرض بجانب الدولار. */
export function totalsByCurrency(rows: readonly { currencyCode: string; amount: DecimalInput }[]) {
  const out = new Map<string, Decimal>();
  for (const r of rows) out.set(r.currencyCode, (out.get(r.currencyCode) ?? dec(0)).plus(r.amount));
  return [...out.entries()].map(([currencyCode, amount]) => ({ currencyCode, amount }));
}

export const sumUsd = (values: readonly DecimalInput[]) => roundMoney(sum(values));
