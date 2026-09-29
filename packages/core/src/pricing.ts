import { dec, type Decimal, type DecimalInput } from "./decimal";
import { CoreError } from "./errors";

/** سلّم التقريب (currency-and-costing §5): أقل من الحد ← الخطوة. آخر عنصر بلا حد. */
export interface PriceStep {
  below: DecimalInput | null;
  step: DecimalInput;
}

export const DEFAULT_SDG_PRICE_STEPS: readonly PriceStep[] = [
  { below: 50_000, step: 500 },
  { below: 100_000, step: 1_000 },
  { below: null, step: 5_000 },
];

export function priceStepFor(value: DecimalInput, steps: readonly PriceStep[] = DEFAULT_SDG_PRICE_STEPS): Decimal {
  const v = dec(value);
  for (const s of steps) {
    if (s.below === null || v.lt(s.below)) return dec(s.step);
  }
  throw new CoreError("INVALID_AMOUNT", "Price steps must end with an open-ended step");
}

/** تقريب للأعلى إلى مضاعف الخطوة — لا ينزل الهامش بسبب التقريب أبداً. */
export function ceilToStep(value: DecimalInput, step: DecimalInput): Decimal {
  const s = dec(step);
  if (s.lte(0)) throw new CoreError("INVALID_AMOUNT", "Step must be > 0");
  return dec(value).div(s).ceil().mul(s);
}

function assertMargin(margin: Decimal): void {
  if (margin.lt(0) || margin.gte(1)) {
    throw new CoreError("INVALID_MARGIN", `Margin must be in [0, 1), got ${margin.toString()}`);
  }
}

/** السعر المقترح بالدولار: الهامش على سعر البيع وليس فوق التكلفة (D-23). غير مقرّب. */
export function suggestedPriceUsd(avgCostUsd: DecimalInput, targetMargin: DecimalInput): Decimal {
  const margin = dec(targetMargin);
  assertMargin(margin);
  return dec(avgCostUsd).div(dec(1).minus(margin));
}

export interface SuggestedPriceInput {
  avgCostUsd: DecimalInput;
  targetMargin: DecimalInput;
  sdgPerUsd: DecimalInput;
  steps?: readonly PriceStep[];
}

export interface SuggestedPrice {
  /** السعر قبل التقريب بالجنيه (للعرض في شاشة المراجعة). */
  rawSdg: Decimal;
  /** السعر المقترح بعد التقريب للأعلى. */
  priceSdg: Decimal;
}

/** السعر المقترح بالجنيه (currency-and-costing §5). لا يُطبَّق تلقائياً — يحتاج موافقة (D-24). */
export function suggestedPriceSdg(input: SuggestedPriceInput): SuggestedPrice {
  const rate = dec(input.sdgPerUsd);
  if (rate.lte(0)) throw new CoreError("INVALID_RATE", "sdgPerUsd must be > 0");
  const rawSdg = suggestedPriceUsd(input.avgCostUsd, input.targetMargin).mul(rate);
  return { rawSdg, priceSdg: ceilToStep(rawSdg, priceStepFor(rawSdg, input.steps)) };
}

export interface ActualMarginInput {
  priceSdg: DecimalInput;
  sdgPerUsd: DecimalInput;
  avgCostUsd: DecimalInput;
}

/** الهامش الفعلي بسعر اليوم: (السعر بالدولار − التكلفة) ÷ السعر بالدولار. غير مقرّب. */
export function actualMargin(input: ActualMarginInput): Decimal {
  const rate = dec(input.sdgPerUsd);
  if (rate.lte(0)) throw new CoreError("INVALID_RATE", "sdgPerUsd must be > 0");
  const priceUsd = dec(input.priceSdg).div(rate);
  if (priceUsd.lte(0)) throw new CoreError("INVALID_AMOUNT", "Price must be > 0");
  return priceUsd.minus(input.avgCostUsd).div(priceUsd);
}

/** المنتج يظهر في لوحة «منتجات تحتاج مراجعة سعر» إن نزل هامشه الفعلي تحت الحد الأدنى. */
export function needsPriceReview(margin: DecimalInput, minMargin: DecimalInput): boolean {
  return dec(margin).lt(minMargin);
}

/** هل تغيّر سعر الصرف منذ آخر مراجعة أكثر من الحد (الافتراضي 5% — §2)؟ */
export function rateChangeExceeds(
  reviewedRate: DecimalInput,
  currentRate: DecimalInput,
  threshold: DecimalInput = "0.05",
): boolean {
  const base = dec(reviewedRate);
  if (base.lte(0)) throw new CoreError("INVALID_RATE", "Reviewed rate must be > 0");
  return dec(currentRate).minus(base).abs().div(base).gt(threshold);
}
