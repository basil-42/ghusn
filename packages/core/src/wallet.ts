import { dec, roundMoney, roundUnitCost, type Decimal, type DecimalInput } from "./decimal";
import { CoreError } from "./errors";
import { isSuspiciousRateChange } from "./exchange-rate";
import { toUsdExact } from "./money";

/**
 * التحويل بين محفظتين (currency-and-costing §3، D-86). يُسجَّل بطرفيه: ما خرج (شامل العمولة)
 * وما وصل. العمولة داخل السعر: السعر الفعلي = الواصل ÷ الخارج بالدولار.
 */

export interface TransferSide {
  currencyCode: string;
  /** المبلغ بعملة المحفظة: الخارج شامل العمولة، أو الواصل. */
  amount: DecimalInput;
  /** السعر الساري لعملة المحفظة (وحدات لكل 1$). */
  currentRate: DecimalInput;
  /** سعر ثابت لا يُشتق من التحويل: الدولار، أو عملة مربوطة (الريال القطري). */
  anchored: boolean;
}

export interface TransferPlan {
  fromRate: Decimal;
  fromAmountUsd: Decimal;
  toRate: Decimal;
  toAmountUsd: Decimal;
  /** السعر الفعلي المشتق لعملة غير ثابتة — يُسجَّل «تحويل فعلي» (ACTUAL_TRANSFER). */
  derived: { currencyCode: string; unitsPerUsd: Decimal; previous: Decimal; suspicious: boolean } | null;
}

/**
 * - نفس العملة: المبلغان متساويان (العمولة بنفس العملة تُسجَّل مصروفاً) ولا سعر جديد.
 * - عملتان: قيمة التحويل بالدولار من الطرف الثابت (الدولار/المربوطة)، وإلا من طرف الخروج بسعره
 *   الساري؛ والطرف الآخر يأخذ السعر الفعلي = مبلغه ÷ تلك القيمة.
 * - الطرفان ثابتان (ريال ← دولار): لا سعر جديد، ولكل طرف قيمته بسعره.
 */
export function planTransfer(input: { from: TransferSide; to: TransferSide }): TransferPlan {
  const { from, to } = input;
  const fromAmount = dec(from.amount);
  const toAmount = dec(to.amount);
  if (!fromAmount.isFinite() || fromAmount.lte(0) || !toAmount.isFinite() || toAmount.lte(0)) {
    throw new CoreError("INVALID_AMOUNT", "Transfer amounts must be > 0");
  }
  const fromRate = dec(from.currentRate);
  const toRate = dec(to.currentRate);

  if (from.currencyCode === to.currencyCode) {
    if (!fromAmount.eq(toAmount)) {
      throw new CoreError("INVALID_AMOUNT", "Same-currency transfer amounts must match");
    }
    const usd = roundMoney(toUsdExact(fromAmount, fromRate));
    return { fromRate, fromAmountUsd: usd, toRate, toAmountUsd: usd, derived: null };
  }

  if (from.anchored && to.anchored) {
    return {
      fromRate,
      fromAmountUsd: roundMoney(toUsdExact(fromAmount, fromRate)),
      toRate,
      toAmountUsd: roundMoney(toUsdExact(toAmount, toRate)),
      derived: null,
    };
  }

  // الطرف المرجعي: الثابت إن وُجد، وإلا الخارج
  const anchorIsFrom = from.anchored || !to.anchored;
  const anchor = anchorIsFrom ? { amount: fromAmount, rate: fromRate } : { amount: toAmount, rate: toRate };
  const other = anchorIsFrom ? { side: to, amount: toAmount } : { side: from, amount: fromAmount };
  const usdExact = toUsdExact(anchor.amount, anchor.rate);
  const derivedRate = roundUnitCost(other.amount.div(usdExact));
  if (derivedRate.lte(0)) throw new CoreError("INVALID_RATE", "Derived rate must be > 0");
  const previous = dec(other.side.currentRate);
  const usd = roundMoney(usdExact);

  return {
    fromRate: anchorIsFrom ? fromRate : derivedRate,
    fromAmountUsd: usd,
    toRate: anchorIsFrom ? derivedRate : toRate,
    toAmountUsd: usd,
    derived: {
      currencyCode: other.side.currencyCode,
      unitsPerUsd: derivedRate,
      previous,
      suspicious: isSuspiciousRateChange(previous, derivedRate),
    },
  };
}
