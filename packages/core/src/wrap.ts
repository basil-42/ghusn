import { dec, type Decimal, type DecimalInput } from "./decimal";

/**
 * التغليف (D-165): «عادي» أو «فاخر» للطلب كله، وكل قطعة تُغلّف وحدها بسعر حسب حجمها
 * (صغير/وسط/كبير). القطع بحجم NONE (مثل الورود) لا تُغلّف ولا تدخل في السعر.
 */

export const WRAP_SIZES = ["SMALL", "MEDIUM", "LARGE", "NONE"] as const;
export type WrapSize = (typeof WRAP_SIZES)[number];
export type WrappableSize = Exclude<WrapSize, "NONE">;

/** سطر «من» تحت رسالة البطاقة (D-165). */
export const CARD_FROM_MAX = 40;

/** سعر تغليف القطعة الواحدة لكل حجم؛ صفر أو أقل = غير متاح لهذا الحجم. */
export type WrapPrices = Record<WrappableSize, DecimalInput>;

export interface WrapLineInput {
  key: string;
  qty: DecimalInput;
  /** حجم القطعة الفعلي (المنتج أو قسمه). */
  size: WrapSize;
}

export interface WrapQuoteLine {
  key: string;
  size: WrappableSize;
  qty: Decimal;
  unitPriceSdg: Decimal;
  lineTotalSdg: Decimal;
}

export type WrapQuote =
  | { available: true; lines: WrapQuoteLine[]; skipped: string[]; totalSdg: Decimal }
  /** NOTHING_TO_WRAP: كل القطع بلا تغليف. SIZE_UNPRICED: حجم في الطلب بلا سعر لهذا المستوى. */
  | { available: false; reason: "NOTHING_TO_WRAP" | "SIZE_UNPRICED"; skipped: string[] };

/**
 * سعر مستوى تغليف لطلب. المستوى متاح فقط إن كان لكل قطعة قابلة للتغليف سعر لحجمها — لا يُغلّف
 * جزء من الطلب بصمت.
 */
export function quoteWrap(lines: readonly WrapLineInput[], prices: WrapPrices): WrapQuote {
  const skipped = lines.filter((l) => l.size === "NONE").map((l) => l.key);
  const wrappable = lines.filter((l): l is WrapLineInput & { size: WrappableSize } => l.size !== "NONE");
  if (wrappable.length === 0) return { available: false, reason: "NOTHING_TO_WRAP", skipped };
  const out: WrapQuoteLine[] = [];
  for (const l of wrappable) {
    const unit = dec(prices[l.size]);
    if (unit.lte(0)) return { available: false, reason: "SIZE_UNPRICED", skipped };
    const qty = dec(l.qty);
    out.push({ key: l.key, size: l.size, qty, unitPriceSdg: unit, lineTotalSdg: unit.mul(qty) });
  }
  return {
    available: true,
    lines: out,
    skipped,
    totalSdg: out.reduce((a, l) => a.plus(l.lineTotalSdg), dec(0)),
  };
}

/** حجم القطعة الفعلي: حجم المنتج إن حُدّد، وإلا حجم قسمه. */
export function effectiveWrapSize(productSize: WrapSize | null | undefined, categoryDefault: WrapSize): WrapSize {
  return productSize ?? categoryDefault;
}

/** «من» الأسعار لعرض المستوى في المتجر: أقل سعر متاح، أو null إن لم يُسعّر أي حجم. */
export function lowestWrapPrice(prices: WrapPrices): Decimal | null {
  const vals = (["SMALL", "MEDIUM", "LARGE"] as const).map((s) => dec(prices[s])).filter((v) => v.gt(0));
  return vals.length ? vals.reduce((a, b) => (b.lt(a) ? b : a)) : null;
}

/**
 * مواد التغليف لطلب: لكل قطعة مغلّفة، وصفة حجمها × الكمية، مجمّعة حسب المادة (خصم واحد لكل مادة).
 */
export function wrapMaterialNeeds(
  lines: readonly { size: WrappableSize; qty: DecimalInput }[],
  recipe: readonly { size: WrappableSize; variantId: string; qty: DecimalInput }[],
): Map<string, Decimal> {
  const need = new Map<string, Decimal>();
  for (const l of lines) {
    for (const r of recipe) {
      if (r.size !== l.size) continue;
      need.set(r.variantId, (need.get(r.variantId) ?? dec(0)).plus(dec(r.qty).mul(dec(l.qty))));
    }
  }
  return need;
}
