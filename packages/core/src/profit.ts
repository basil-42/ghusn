import { dec, roundMoney, sum, type Decimal, type DecimalInput } from "./decimal";
import { CoreError } from "./errors";
import { toUsdExact } from "./money";

export interface SaleLineInput {
  qty: DecimalInput;
  unitPriceSdg: DecimalInput;
  /** متوسط التكلفة لحظة البيع — يُنسخ إلى سطر الطلب ولا يتغير بعدها. */
  avgCostUsd: DecimalInput;
}

export interface SaleProfit {
  totalSdg: Decimal;
  revenueUsd: Decimal;
  cogsUsd: Decimal;
  grossProfitUsd: Decimal;
  /** نسبة الربح من الإيراد (غير مقرّبة). */
  margin: Decimal;
}

/**
 * ربح عملية بيع (currency-and-costing §6). المبالغ المُرجعة مقرّبة لخانتين كما تُحفظ:
 *   revenueUsd = totalSdg ÷ sdgPerUsd (يوم البيع)
 *   cogsUsd    = Σ qty × avgCostUsd
 */
export function saleProfit(lines: readonly SaleLineInput[], sdgPerUsd: DecimalInput): SaleProfit {
  for (const line of lines) {
    if (dec(line.qty).lte(0)) throw new CoreError("INVALID_QUANTITY", "Sale quantity must be > 0");
  }
  const totalSdg = sum(lines.map((l) => dec(l.qty).mul(l.unitPriceSdg)));
  const revenueUsd = roundMoney(toUsdExact(totalSdg, sdgPerUsd));
  const cogsUsd = roundMoney(sum(lines.map((l) => dec(l.qty).mul(l.avgCostUsd))));
  const grossProfitUsd = revenueUsd.minus(cogsUsd);
  return {
    totalSdg,
    revenueUsd,
    cogsUsd,
    grossProfitUsd,
    margin: revenueUsd.isZero() ? dec(0) : grossProfitUsd.div(revenueUsd),
  };
}

/**
 * فروقات العملة لرصيد محتفظ به بالجنيه (المرحلة 2 — §7):
 * قيمته اليوم بالدولار − قيمته الدفترية بالدولار. سالب = خسارة.
 */
export function fxGainLossUsd(balance: DecimalInput, bookValueUsd: DecimalInput, currentRate: DecimalInput): Decimal {
  return roundMoney(toUsdExact(balance, currentRate)).minus(roundMoney(bookValueUsd));
}
