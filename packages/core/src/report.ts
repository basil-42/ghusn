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
 * استرداد رأس المال (D-83): الربح يذهب كله لاسترداد تمويل باسل أولاً، ولا يُوزَّع شيء حتى
 * يكتمل. بعدها يُوزَّع الربح بالتساوي (4 شركاء × 25% — D-06). الخسارة تُعيد المتبقي للارتفاع.
 *   المسترد حتى نهاية الشهر = min(رأس المال، max(0، الربح التراكمي))
 *   القابل للتوزيع هذا الشهر = max(0، تراكمي النهاية − رأس المال) − max(0، تراكمي البداية − رأس المال)
 */
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

export function capitalRecovery(input: {
  capitalUsd: DecimalInput;
  /** مجموع صافي الربح من البداية حتى قبل هذا الشهر. */
  profitBeforeUsd: DecimalInput;
  monthProfitUsd: DecimalInput;
  partners?: number;
}) {
  const capital = dec(input.capitalUsd);
  const before = dec(input.profitBeforeUsd);
  const after = before.plus(input.monthProfitUsd);
  const over = (x: Decimal) => Decimal.max(0, x.minus(capital));
  const recovered = Decimal.min(capital, Decimal.max(0, after));
  const distributable = over(after).minus(over(before));
  const partners = input.partners ?? 4;
  return {
    recoveredUsd: roundMoney(recovered),
    remainingUsd: roundMoney(capital.minus(recovered)),
    /** ما ذهب لاسترداد رأس المال من ربح هذا الشهر (سالب إن خسر الشهر). */
    toCapitalThisMonthUsd: roundMoney(recovered.minus(Decimal.min(capital, Decimal.max(0, before)))),
    distributableUsd: roundMoney(distributable),
    perPartnerUsd: roundMoney(distributable.div(partners)),
    fullyRecovered: capital.gt(0) ? after.gte(capital) : true,
  };
}

/** مجموع مبالغ بعملاتها الأصلية: { SDG: 150000, QAR: 300 } — للعرض بجانب الدولار. */
export function totalsByCurrency(rows: readonly { currencyCode: string; amount: DecimalInput }[]) {
  const out = new Map<string, Decimal>();
  for (const r of rows) out.set(r.currencyCode, (out.get(r.currencyCode) ?? dec(0)).plus(r.amount));
  return [...out.entries()].map(([currencyCode, amount]) => ({ currencyCode, amount }));
}

export const sumUsd = (values: readonly DecimalInput[]) => roundMoney(sum(values));
