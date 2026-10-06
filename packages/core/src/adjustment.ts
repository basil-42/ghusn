/**
 * تسويات المخزون (D-111): تالف، منتهي الصلاحية، مفقود، استخدام داخلي، زيادة وُجدت، فرق جرد.
 * الخارج يُقيَّم بمتوسط التكلفة لحظة الاعتماد ويصبح خسارة (expenseUsd موجب)؛ الداخل يرفع قيمة
 * المخزون ويُحسب مكسباً (expenseUsd سالب). صنف بلا تكلفة لا يدخل بقيمة صفر — تُطلب تكلفته.
 */

import { Decimal, dec, roundMoney, type DecimalInput } from "./decimal";
import { CoreError } from "./errors";
import { weightedAverageCost } from "./costing";

export const ADJUSTMENT_REASONS = ["DAMAGED", "EXPIRED", "LOST", "INTERNAL_USE", "FOUND", "COUNT"] as const;
export type AdjustmentReason = (typeof ADJUSTMENT_REASONS)[number];

/** ما تختاره الموظفة يدوياً — «فرق جرد» يأتي من الجرد فقط. */
export const MANUAL_ADJUSTMENT_REASONS = ["DAMAGED", "EXPIRED", "LOST", "INTERNAL_USE", "FOUND"] as const;

/** اتجاه السبب: الزيادة تضيف للرصيد، والباقي ينقصه؛ فرق الجرد بالاتجاهين. */
export function adjustmentDirection(reason: AdjustmentReason): 1 | -1 | 0 {
  if (reason === "FOUND") return 1;
  if (reason === "COUNT") return 0;
  return -1;
}

/** المفقود والزيادة يحتاجان شرحاً مكتوباً — هما الأكثر حاجة للتدقيق. */
export const adjustmentNoteRequired = (reason: AdjustmentReason) => reason === "LOST" || reason === "FOUND";

/**
 * الكمية الموقّعة من السبب والكمية المدخلة (موجبة دائماً في النموذج).
 * فرق الجرد يُمرَّر موقّعاً كما هو.
 */
export function signedAdjustmentQty(reason: AdjustmentReason, qty: DecimalInput): Decimal {
  const q = dec(qty);
  const dir = adjustmentDirection(reason);
  if (dir === 0) {
    if (q.isZero()) throw new CoreError("INVALID_QUANTITY", "Count difference must not be zero");
    return q;
  }
  if (q.lte(0)) throw new CoreError("INVALID_QUANTITY", "Quantity must be > 0");
  return q.mul(dir);
}

/** القيمة التقريبية بالدولار (للحكم على حد الاعتماد قبل التنفيذ): |الكمية| × التكلفة المتاحة. */
export function estimateAdjustmentUsd(
  qty: DecimalInput,
  avgCostUsd: DecimalInput,
  enteredUnitCostUsd?: DecimalInput | null,
): Decimal {
  const avg = dec(avgCostUsd);
  const unit = avg.gt(0) ? avg : dec(enteredUnitCostUsd ?? 0);
  return roundMoney(dec(qty).abs().mul(unit));
}

/**
 * هل تعتمد هذه المستخدمة التسوية؟ من يملك «اعتماد بلا حد» (المالك) دائماً؛ من يملك «اعتماد»
 * (المديرة) حتى الحد بالدولار؛ غيرهما لا.
 */
export function canApproveAdjustment(input: {
  valueUsd: DecimalInput;
  limitUsd: DecimalInput;
  canApprove: boolean;
  unlimited: boolean;
}): boolean {
  if (input.unlimited) return true;
  if (!input.canApprove) return false;
  return dec(input.valueUsd).abs().lte(input.limitUsd);
}

export interface AdjustmentPlanInput {
  /** موقّعة: سالبة = خروج. */
  qty: DecimalInput;
  levelQty: DecimalInput;
  avgCostUsd: DecimalInput;
  /** تكلفة الوحدة المدخلة — تُستخدم فقط لزيادة صنف متوسط تكلفته صفر. */
  enteredUnitCostUsd?: DecimalInput | null;
}

export interface AdjustmentPlan {
  qtyAfter: Decimal;
  avgAfterUsd: Decimal;
  unitCostUsd: Decimal;
  /** التغير في قيمة المخزون (موقّع). */
  valueUsd: Decimal;
  /** الخسارة (موجبة) أو المكسب (سالب) في التقرير — عكس valueUsd. */
  expenseUsd: Decimal;
  /** تكلفة الوحدة أُدخلت يدوياً (صنف بلا تكلفة). */
  costEntered: boolean;
}

/**
 * تنفيذ التسوية على الرصيد والمتوسط. الخروج لا يتجاوز الرصيد الموجب (لا يُفقد ما ليس موجوداً)،
 * والمتوسط لا يتغير. الدخول بمتوسط التكلفة الحالي، أو بالتكلفة المدخلة إن كان المتوسط صفراً.
 */
export function planAdjustment(input: AdjustmentPlanInput): AdjustmentPlan {
  const qty = dec(input.qty);
  const level = dec(input.levelQty);
  const avg = dec(input.avgCostUsd);
  if (qty.isZero()) throw new CoreError("INVALID_QUANTITY", "Adjustment quantity must not be zero");

  if (qty.lt(0)) {
    const out = qty.abs();
    if (out.gt(Decimal.max(level, 0))) {
      throw new CoreError("INSUFFICIENT_STOCK", "Adjustment exceeds stock on hand");
    }
    const value = roundMoney(out.mul(avg)).neg();
    return {
      qtyAfter: level.minus(out),
      avgAfterUsd: avg,
      unitCostUsd: avg,
      valueUsd: value,
      expenseUsd: value.neg(),
      costEntered: false,
    };
  }

  const entered =
    input.enteredUnitCostUsd == null || input.enteredUnitCostUsd === "" ? null : dec(input.enteredUnitCostUsd);
  const costEntered = !avg.gt(0);
  const unit = costEntered ? entered : avg;
  if (!unit || unit.lte(0)) throw new CoreError("COST_REQUIRED", "Unit cost is required for an item without cost");
  const value = roundMoney(qty.mul(unit));
  return {
    qtyAfter: level.plus(qty),
    avgAfterUsd: weightedAverageCost({ oldQty: level, oldAvgUsd: avg, inQty: qty, inUnitUsd: unit }),
    unitCostUsd: unit,
    valueUsd: value,
    expenseUsd: value.neg(),
    costEntered,
  };
}
