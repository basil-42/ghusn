import { dec, sum, type Decimal, type DecimalInput } from "./decimal";
import { CoreError } from "./errors";

/**
 * حسابات فاتورة نقطة البيع بالجنيه (عملة البيع — D-20). الجنيه بلا كسور: كل مبلغ في الفاتورة
 * عدد صحيح، والخصم بالنسبة يُقرَّب للأسفل (لصالح المحل وبلا كسور).
 */

export interface CartLineInput<K extends string = string> {
  key: K;
  qty: DecimalInput;
  unitPriceSdg: DecimalInput;
  /** خصم على السطر كله بالجنيه. */
  lineDiscountSdg: DecimalInput;
}

export interface SaleLine<K extends string = string> {
  key: K;
  grossSdg: Decimal;
  lineDiscountSdg: Decimal;
  /** نصيب السطر من خصم الفاتورة (للمرتجع بالسعر الفعلي لاحقاً). */
  invoiceDiscountSdg: Decimal;
  netSdg: Decimal;
}

export interface SaleTotals<K extends string = string> {
  lines: SaleLine<K>[];
  subtotalSdg: Decimal;
  lineDiscountSdg: Decimal;
  invoiceDiscountSdg: Decimal;
  discountSdg: Decimal;
  totalSdg: Decimal;
}

const wholeSdg = (value: DecimalInput, what: string): Decimal => {
  const v = dec(value);
  if (!v.isInteger() || v.lt(0)) throw new CoreError("INVALID_AMOUNT", `${what} must be a whole SDG amount >= 0`);
  return v;
};

/** خصم بنسبة ← مبلغ بالجنيه، مقرّب للأسفل. */
export function percentOf(baseSdg: DecimalInput, percent: DecimalInput): Decimal {
  const p = dec(percent);
  if (p.lt(0) || p.gt(100)) throw new CoreError("INVALID_AMOUNT", "Percent must be within 0..100");
  return dec(baseSdg).mul(p).div(100).floor();
}

/**
 * توزيع مبلغ صحيح على أسطر حسب أوزانها بطريقة «أكبر باقٍ»: المجموع يساوي المبلغ بالضبط
 * وكل نصيب عدد صحيح.
 */
export function allocateWhole(amount: DecimalInput, weights: readonly DecimalInput[]): Decimal[] {
  const total = wholeSdg(amount, "Amount");
  const w = weights.map((x) => dec(x));
  const weightSum = sum(w);
  if (total.isZero()) return w.map(() => dec(0));
  if (weightSum.lte(0)) throw new CoreError("INVALID_AMOUNT", "Cannot allocate over zero weights");
  const exact = w.map((x) => total.mul(x).div(weightSum));
  const floors = exact.map((x) => x.floor());
  let left = total.minus(sum(floors)).toNumber();
  const order = exact
    .map((x, i) => ({ i, rest: x.minus(x.floor()) }))
    .sort((a, b) => b.rest.comparedTo(a.rest) || a.i - b.i);
  const result = [...floors];
  for (const { i } of order) {
    if (left <= 0) break;
    const current = result[i];
    if (current === undefined) continue;
    result[i] = current.plus(1);
    left -= 1;
  }
  return result;
}

/** إجماليات الفاتورة: السطر = الكمية × السعر − خصمه، ثم خصم الفاتورة موزّعاً على الأسطر. */
export function computeSale<K extends string>(
  lines: readonly CartLineInput<K>[],
  invoiceDiscountSdg: DecimalInput = 0,
): SaleTotals<K> {
  if (lines.length === 0) throw new CoreError("EMPTY_CART", "Cart is empty");
  const base = lines.map((l) => {
    const qty = dec(l.qty);
    if (qty.lte(0)) throw new CoreError("INVALID_QUANTITY", `Line ${l.key}: qty must be > 0`);
    const price = wholeSdg(l.unitPriceSdg, "Unit price");
    const grossSdg = qty.mul(price).toDecimalPlaces(0);
    const lineDiscountSdg = wholeSdg(l.lineDiscountSdg, "Line discount");
    if (lineDiscountSdg.gt(grossSdg))
      throw new CoreError("INVALID_AMOUNT", `Line ${l.key}: discount exceeds line total`);
    return { key: l.key, grossSdg, lineDiscountSdg, afterLine: grossSdg.minus(lineDiscountSdg) };
  });
  const afterLines = sum(base.map((b) => b.afterLine));
  const invoiceDiscount = wholeSdg(invoiceDiscountSdg, "Invoice discount");
  if (invoiceDiscount.gt(afterLines)) throw new CoreError("INVALID_AMOUNT", "Invoice discount exceeds the total");
  const shares = allocateWhole(
    invoiceDiscount,
    base.map((b) => b.afterLine),
  );

  const out = base.map((b, i) => {
    const share = shares[i] ?? dec(0);
    return {
      key: b.key,
      grossSdg: b.grossSdg,
      lineDiscountSdg: b.lineDiscountSdg,
      invoiceDiscountSdg: share,
      netSdg: b.afterLine.minus(share),
    };
  });
  const subtotalSdg = sum(out.map((l) => l.grossSdg));
  const lineDiscountSdg = sum(out.map((l) => l.lineDiscountSdg));
  return {
    lines: out,
    subtotalSdg,
    lineDiscountSdg,
    invoiceDiscountSdg: invoiceDiscount,
    discountSdg: lineDiscountSdg.plus(invoiceDiscount),
    totalSdg: subtotalSdg.minus(lineDiscountSdg).minus(invoiceDiscount),
  };
}

export interface DiscountCheckLine {
  key: string;
  qty: DecimalInput;
  netSdg: DecimalInput;
  avgCostUsd: DecimalInput;
}

export interface DiscountCheck {
  /** نسبة الخصم الكلية من المجموع قبل الخصم (0..1). */
  discountRatio: Decimal;
  overLimit: boolean;
  /** أسطر صافي سعرها بالدولار تحت متوسط التكلفة. */
  belowCost: string[];
  needsApproval: boolean;
}

/**
 * سياسة الخصم (D-80): الموظفة حتى الحد من الضبط، وما فوقه أو البيع تحت التكلفة يحتاج موافقة
 * المديرة أو المالك.
 */
export function checkDiscount(input: {
  subtotalSdg: DecimalInput;
  discountSdg: DecimalInput;
  maxDiscountPercent: DecimalInput;
  sdgPerUsd: DecimalInput;
  lines: readonly DiscountCheckLine[];
}): DiscountCheck {
  const subtotal = dec(input.subtotalSdg);
  const discountRatio = subtotal.gt(0) ? dec(input.discountSdg).div(subtotal) : dec(0);
  const overLimit = discountRatio.gt(dec(input.maxDiscountPercent).div(100));
  const rate = dec(input.sdgPerUsd);
  if (rate.lte(0)) throw new CoreError("INVALID_RATE", "sdgPerUsd must be > 0");
  const belowCost = dec(input.discountSdg).gt(0)
    ? input.lines
        .filter((l) => dec(l.avgCostUsd).gt(0) && dec(l.netSdg).div(rate).lt(dec(l.avgCostUsd).mul(l.qty)))
        .map((l) => l.key)
    : [];
  return { discountRatio, overLimit, belowCost, needsApproval: overLimit || belowCost.length > 0 };
}

export type PaymentMethod = "CASH" | "BANKAK";

export interface PaymentInput {
  method: PaymentMethod;
  amountSdg: DecimalInput;
}

/**
 * الدفع المقسوم: مجموع المدفوع يساوي الإجمالي بالضبط. النقد المستلم قد يزيد ← الباقي للعميل
 * (من النقد فقط).
 */
export function settlePayments(input: {
  totalSdg: DecimalInput;
  payments: readonly PaymentInput[];
  cashTenderedSdg?: DecimalInput | null;
}): { cashSdg: Decimal; bankakSdg: Decimal; changeSdg: Decimal } {
  const total = dec(input.totalSdg);
  let cash = dec(0);
  let bankak = dec(0);
  for (const p of input.payments) {
    const amount = wholeSdg(p.amountSdg, "Payment");
    if (p.method === "CASH") cash = cash.plus(amount);
    else bankak = bankak.plus(amount);
  }
  if (!cash.plus(bankak).eq(total)) {
    throw new CoreError("INVALID_AMOUNT", "Payments must equal the total");
  }
  const tendered = input.cashTenderedSdg == null ? cash : wholeSdg(input.cashTenderedSdg, "Cash tendered");
  if (tendered.lt(cash)) throw new CoreError("INVALID_AMOUNT", "Cash tendered is less than the cash due");
  return { cashSdg: cash, bankakSdg: bankak, changeSdg: tendered.minus(cash) };
}

/** النقد المتوقع في الدرج عند إغلاق الوردية = الافتتاحي + المقبوض نقداً − المردود نقداً. */
export function expectedCash(openingSdg: DecimalInput, cashInSdg: DecimalInput, cashOutSdg: DecimalInput = 0): Decimal {
  return dec(openingSdg).plus(cashInSdg).minus(cashOutSdg);
}
