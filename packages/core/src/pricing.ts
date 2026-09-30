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

/** هامش فوق المستهدف بهذا القدر ← اقتراح تخفيض (D-79). */
export const HIGH_MARGIN_GAP = "0.10";

export interface MarginSettings {
  targetMargin: DecimalInput;
  minMargin: DecimalInput;
}

/** هوامش المنتج: تجاوزه الخاص إن وُجد، وإلا هوامش القسم (currency-and-costing §5). */
export function effectiveMargins(
  category: MarginSettings,
  product: { targetMargin: DecimalInput | null; minMargin: DecimalInput | null },
): { targetMargin: Decimal; minMargin: Decimal } {
  const targetMargin = dec(product.targetMargin ?? category.targetMargin);
  const minMargin = dec(product.minMargin ?? category.minMargin);
  assertMargin(targetMargin);
  assertMargin(minMargin);
  if (minMargin.gt(targetMargin)) {
    throw new CoreError("INVALID_MARGIN", "Minimum margin cannot exceed the target");
  }
  return { targetMargin, minMargin };
}

export type PriceReviewKind =
  /** لا تكلفة بعد (لم يُستلم) — لا اقتراح. */
  | "NO_COST"
  /** له تكلفة ولا سعر له. */
  | "NEEDS_PRICE"
  /** الهامش الفعلي تحت الحد الأدنى ← رفع. */
  | "LOW"
  /** الهامش فوق المستهدف + HIGH_MARGIN_GAP ← تخفيض (D-79). */
  | "HIGH"
  | "OK";

export interface PriceReviewInput extends MarginSettings {
  priceSdg: DecimalInput | null;
  avgCostUsd: DecimalInput;
  sdgPerUsd: DecimalInput;
  steps?: readonly PriceStep[];
}

export interface PriceReview {
  kind: PriceReviewKind;
  /** الهامش الفعلي بالسعر الحالي وسعر اليوم (null بلا سعر أو بلا تكلفة). */
  margin: Decimal | null;
  /** السعر المقترح المقرّب (null بلا تكلفة). */
  suggestedSdg: Decimal | null;
  /** هامش السعر المقترح. */
  suggestedMargin: Decimal | null;
}

/** تصنيف متغيّر في لوحة «منتجات تحتاج مراجعة سعر». */
export function reviewPrice(input: PriceReviewInput): PriceReview {
  const cost = dec(input.avgCostUsd);
  if (cost.lte(0)) {
    return { kind: "NO_COST", margin: null, suggestedSdg: null, suggestedMargin: null };
  }
  const { priceSdg: suggestedSdg } = suggestedPriceSdg({
    avgCostUsd: cost,
    targetMargin: input.targetMargin,
    sdgPerUsd: input.sdgPerUsd,
    steps: input.steps,
  });
  const suggestedMargin = actualMargin({ priceSdg: suggestedSdg, sdgPerUsd: input.sdgPerUsd, avgCostUsd: cost });
  if (input.priceSdg === null || dec(input.priceSdg).lte(0)) {
    return { kind: "NEEDS_PRICE", margin: null, suggestedSdg, suggestedMargin };
  }
  const margin = actualMargin({ priceSdg: input.priceSdg, sdgPerUsd: input.sdgPerUsd, avgCostUsd: cost });
  const kind: PriceReviewKind = needsPriceReview(margin, input.minMargin)
    ? "LOW"
    : margin.gt(dec(input.targetMargin).plus(HIGH_MARGIN_GAP)) && dec(input.priceSdg).gt(suggestedSdg)
      ? "HIGH"
      : "OK";
  return { kind, margin, suggestedSdg, suggestedMargin };
}
