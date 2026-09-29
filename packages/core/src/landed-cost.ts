import { dec, roundUnitCost, sum, type Decimal, type DecimalInput } from "./decimal";
import { CoreError } from "./errors";
import { toUsdExact } from "./money";

export interface ShipmentLineInput<K extends string = string> {
  key: K;
  /** الكمية المدفوع ثمنها (المطلوبة من المورد). */
  qty: DecimalInput;
  /** سعر الوحدة بعملة المورد. */
  unitPrice: DecimalInput;
  /** وحدات عملة المورد لكل 1 دولار يوم الدفع. */
  rateUsed: DecimalInput;
  /** الكمية المستلمة فعلاً؛ التالف والناقص تُحمَّل تكلفته على المستلم (§4.5). */
  receivedQty: DecimalInput;
}

/** تكلفة إضافية للشحنة (شحن، جمارك، تخليص، نقل…) بعملتها وسعر يوم دفعها. */
export interface ShipmentCostInput {
  amount: DecimalInput;
  rateUsed: DecimalInput;
}

export interface LandedLine<K extends string = string> {
  key: K;
  lineValueUsd: Decimal;
  share: Decimal;
  extraUsd: Decimal;
  /** التكلفة الواصلة للوحدة بالدولار — ثابتة للدفعة، 6 خانات (D-28). */
  landedUnitUsd: Decimal;
}

export interface LandedCostResult<K extends string = string> {
  lines: LandedLine<K>[];
  goodsUsd: Decimal;
  extraUsd: Decimal;
  totalUsd: Decimal;
}

/**
 * توزيع تكاليف الشحنة الإضافية حسب القيمة (D-25، currency-and-costing §4):
 *   lineValueUsd_i  = qty_i × unitPrice_i ÷ rate_i
 *   share_i         = lineValueUsd_i ÷ Σ lineValueUsd
 *   extraUsd_i      = totalExtraUsd × share_i
 *   landedUnitUsd_i = (lineValueUsd_i + extraUsd_i) ÷ receivedQty_i
 *
 * الحساب من المبالغ الأصلية وأسعارها (وليس من amountUsd المقرّب) حتى تتطابق
 * الإجماليات مع السيناريو المرجعي بالسنت. الإجماليات المُرجعة غير مقرّبة.
 */
export function allocateLandedCost<K extends string>(
  lines: readonly ShipmentLineInput<K>[],
  extraCosts: readonly ShipmentCostInput[],
): LandedCostResult<K> {
  if (lines.length === 0) {
    throw new CoreError("EMPTY_SHIPMENT", "Shipment has no lines");
  }

  const values = lines.map((line) => {
    const qty = dec(line.qty);
    const receivedQty = dec(line.receivedQty);
    const unitPrice = dec(line.unitPrice);
    if (qty.lte(0) || receivedQty.lte(0)) {
      throw new CoreError("INVALID_QUANTITY", `Line ${line.key}: qty and receivedQty must be > 0`);
    }
    if (unitPrice.lt(0)) {
      throw new CoreError("INVALID_AMOUNT", `Line ${line.key}: unit price must be >= 0`);
    }
    return { line, receivedQty, valueUsd: toUsdExact(qty.mul(unitPrice), line.rateUsed) };
  });

  const goodsUsd = sum(values.map((v) => v.valueUsd));
  if (goodsUsd.lte(0)) {
    throw new CoreError("INVALID_AMOUNT", "Shipment goods value must be > 0");
  }
  const extraUsd = sum(
    extraCosts.map((cost) => {
      if (dec(cost.amount).lt(0)) {
        throw new CoreError("INVALID_AMOUNT", "Shipment cost must be >= 0");
      }
      return toUsdExact(cost.amount, cost.rateUsed);
    }),
  );

  return {
    lines: values.map(({ line, receivedQty, valueUsd }) => {
      const share = valueUsd.div(goodsUsd);
      const lineExtra = extraUsd.mul(share);
      return {
        key: line.key,
        lineValueUsd: valueUsd,
        share,
        extraUsd: lineExtra,
        landedUnitUsd: roundUnitCost(valueUsd.plus(lineExtra).div(receivedQty)),
      };
    }),
    goodsUsd,
    extraUsd,
    totalUsd: goodsUsd.plus(extraUsd),
  };
}
