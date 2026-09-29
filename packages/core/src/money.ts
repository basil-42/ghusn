import { dec, roundMoney, type Decimal, type DecimalInput } from "./decimal";
import { CoreError } from "./errors";

/**
 * مبلغ بعملته الأصلية (القاعدة الذهبية — currency-and-costing §1).
 * `rateUsed` = عدد وحدات العملة لكل 1 دولار لحظة العملية.
 */
export interface MoneyInput {
  amount: DecimalInput;
  currencyCode: string;
  rateUsed: DecimalInput;
}

/** السجل الذي يُحفظ: القيم الأربع، و`amountUsd` مقرّب لخانتين ويُحسب مرة واحدة عند الكتابة. */
export interface MoneyRecord {
  amount: Decimal;
  currencyCode: string;
  rateUsed: Decimal;
  amountUsd: Decimal;
}

function assertRate(rate: Decimal): void {
  if (!rate.isFinite() || rate.lte(0)) {
    throw new CoreError("INVALID_RATE", `Exchange rate must be > 0, got ${rate.toString()}`);
  }
}

/**
 * القيمة الدقيقة بالدولار (دون تقريب): amount ÷ rateUsed.
 * تُستخدم للحسابات الداخلية (مثل التكلفة الواصلة) حتى لا يتراكم خطأ التقريب.
 */
export function toUsdExact(amount: DecimalInput, rateUsed: DecimalInput): Decimal {
  const rate = dec(rateUsed);
  assertRate(rate);
  return dec(amount).div(rate);
}

/** تحويل من الدولار إلى عملة أخرى (دون تقريب). */
export function fromUsdExact(amountUsd: DecimalInput, rateUsed: DecimalInput): Decimal {
  const rate = dec(rateUsed);
  assertRate(rate);
  return dec(amountUsd).mul(rate);
}

/** يبني سجل المبلغ بالقيم الأربع كما يُحفظ في قاعدة البيانات. */
export function moneyRecord(input: MoneyInput): MoneyRecord {
  const amount = dec(input.amount);
  const rateUsed = dec(input.rateUsed);
  return {
    amount,
    currencyCode: input.currencyCode,
    rateUsed,
    amountUsd: roundMoney(toUsdExact(amount, rateUsed)),
  };
}
