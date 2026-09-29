import { dec, roundUnitCost, type Decimal, type DecimalInput } from "./decimal";
import { CoreError } from "./errors";

export interface WeightedAverageInput {
  /** الرصيد قبل الاستلام (قد يكون سالباً بعد بيع دون اتصال — D-63). */
  oldQty: DecimalInput;
  oldAvgUsd: DecimalInput;
  inQty: DecimalInput;
  inUnitUsd: DecimalInput;
}

/**
 * متوسط التكلفة المرجّح بالدولار بعد استلام دفعة (D-26، currency-and-costing §4.6):
 *   newAvgUsd = (oldQty × oldAvgUsd + inQty × inUnitUsd) ÷ (oldQty + inQty)
 *
 * إن كان الرصيد السابق صفراً أو سالباً، فالمتوسط الجديد = تكلفة الدفعة الواردة،
 * لأن الكمية السالبة لا تحمل تكلفة حقيقية يمكن مزجها.
 */
export function weightedAverageCost(input: WeightedAverageInput): Decimal {
  const oldQty = dec(input.oldQty);
  const inQty = dec(input.inQty);
  const inUnit = dec(input.inUnitUsd);
  if (inQty.lte(0)) {
    throw new CoreError("INVALID_QUANTITY", "Incoming quantity must be > 0");
  }
  if (oldQty.lte(0)) {
    return roundUnitCost(inUnit);
  }
  const total = oldQty.mul(input.oldAvgUsd).plus(inQty.mul(inUnit));
  return roundUnitCost(total.div(oldQty.plus(inQty)));
}
