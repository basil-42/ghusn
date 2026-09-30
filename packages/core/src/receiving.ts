import { dec, roundMoney, roundUnitCost, sum, type Decimal, type DecimalInput } from "./decimal";
import { CoreError } from "./errors";
import { allocateLandedCost, type ShipmentCostInput } from "./landed-cost";
import { toUsdExact } from "./money";

/** عنصر بفهرس مضمون (المصفوفتان من نفس الطول) — بدل «!» المحظورة. */
function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`index ${index} out of range`);
  return item;
}

export interface ReceiptLineInput<K extends string = string> {
  key: K;
  /** الكمية المشتراة (المدفوع ثمنها). */
  qty: DecimalInput;
  unitPrice: DecimalInput;
  /** سعر صرف عملة المورد يوم الشراء (D-75). */
  rateUsed: DecimalInput;
  /** السليم الذي دخل المخزون. */
  receivedQty: DecimalInput;
  /** التالف (للتقارير) — الباقي حتى الكمية المشتراة = ناقص. */
  damagedQty: DecimalInput;
}

export interface ReceiptLine<K extends string = string> {
  key: K;
  receivedQty: Decimal;
  damagedQty: Decimal;
  missingQty: Decimal;
  /** null إن لم يصل شيء سليم من البند. */
  landedUnitUsd: Decimal | null;
  /** قيمة البند كاملة (بضاعة + نصيبه من التكاليف) — دقة كاملة. */
  totalUsd: Decimal;
  /** بند لم يصل منه شيء سليم: قيمته كلها خسارة (لا وحدات تُحمَّل عليها). */
  lossUsd: Decimal;
}

/**
 * خطة الاستلام (currency-and-costing §4.5، D-78): التكلفة توزَّع حسب القيمة على البنود،
 * وتكلفة التالف والناقص تُحمَّل على السليم من نفس البند (القسمة على الكمية المستلمة).
 * البند الذي لم يصل منه شيء سليم تصبح قيمته خسارة للشحنة.
 */
export function planReceipt<K extends string>(
  lines: readonly ReceiptLineInput<K>[],
  costs: readonly ShipmentCostInput[],
): ReceiptLine<K>[] {
  const parsed = lines.map((line) => {
    const qty = dec(line.qty);
    const receivedQty = dec(line.receivedQty);
    const damagedQty = dec(line.damagedQty);
    if (receivedQty.lt(0) || damagedQty.lt(0)) {
      throw new CoreError("INVALID_QUANTITY", `Line ${line.key}: quantities must be >= 0`);
    }
    if (receivedQty.plus(damagedQty).gt(qty)) {
      throw new CoreError("INVALID_QUANTITY", `Line ${line.key}: received + damaged exceeds purchased`);
    }
    return { line, qty, receivedQty, damagedQty };
  });
  if (!parsed.some((p) => p.receivedQty.gt(0))) {
    throw new CoreError("INVALID_QUANTITY", "Nothing received");
  }

  // التوزيع لا يعتمد على الكمية المستلمة؛ نمرّر الكمية المشتراة للبند الذي لم يصل منه شيء
  const allocation = allocateLandedCost(
    parsed.map(({ line, qty, receivedQty }) => ({
      key: line.key,
      qty,
      unitPrice: line.unitPrice,
      rateUsed: line.rateUsed,
      receivedQty: receivedQty.gt(0) ? receivedQty : qty,
    })),
    costs,
  );

  return parsed.map(({ line, qty, receivedQty, damagedQty }, i) => {
    const allocated = at(allocation.lines, i);
    const totalUsd = allocated.lineValueUsd.plus(allocated.extraUsd);
    const received = receivedQty.gt(0);
    return {
      key: line.key,
      receivedQty,
      damagedQty,
      missingQty: qty.minus(receivedQty).minus(damagedQty),
      landedUnitUsd: received ? allocated.landedUnitUsd : null,
      totalUsd,
      lossUsd: received ? dec(0) : totalUsd,
    };
  });
}

export interface LateCostLineInput<K extends string = string> {
  key: K;
  qty: DecimalInput;
  unitPrice: DecimalInput;
  rateUsed: DecimalInput;
  receivedQty: DecimalInput;
  /** ما بقي من دفعة هذا البند في المخزون الآن. */
  remainingQty: DecimalInput;
}

export interface LateCostLine<K extends string = string> {
  key: K;
  /** نصيب البند من التكلفة (موجب للإضافة، سالب للإلغاء). */
  extraUsd: Decimal;
  /** زيادة تكلفة الوحدة في الدفعة. */
  unitDeltaUsd: Decimal;
  /** الجزء الذي يخص الوحدات الباقية ← يدخل قيمة المخزون. */
  inventoryUsd: Decimal;
  /** الجزء الذي يخص وحدات بيعت أو بند لم يصل ← مصروف (تسوية تكلفة المبيعات). */
  expenseUsd: Decimal;
}

/**
 * تكلفة تصل فاتورتها بعد الاستلام (D-78): توزَّع حسب القيمة كالمعتاد، ونصيب كل بند يُقسم
 * بين الوحدات الباقية في المخزون (ترفع متوسط التكلفة) والوحدات التي خرجت (مصروف).
 * الإلغاء بعد الاستلام = نفس الحساب بإشارة سالبة.
 */
export function allocateLateCost<K extends string>(
  lines: readonly LateCostLineInput<K>[],
  cost: ShipmentCostInput,
  sign: 1 | -1 = 1,
): LateCostLine<K>[] {
  if (lines.length === 0) throw new CoreError("EMPTY_SHIPMENT", "Shipment has no lines");
  const values = lines.map((l) => toUsdExact(dec(l.qty).mul(l.unitPrice), l.rateUsed));
  const goodsUsd = sum(values);
  if (goodsUsd.lte(0)) throw new CoreError("INVALID_AMOUNT", "Shipment goods value must be > 0");
  const costUsd = toUsdExact(cost.amount, cost.rateUsed).mul(sign);

  return lines.map((line, i) => {
    const extraUsd = costUsd.mul(at(values, i)).div(goodsUsd);
    const received = dec(line.receivedQty);
    const remaining = dec(line.remainingQty);
    if (remaining.lt(0) || remaining.gt(received)) {
      throw new CoreError("INVALID_QUANTITY", `Line ${line.key}: remaining must be within 0..received`);
    }
    const inventoryUsd = received.gt(0) ? extraUsd.mul(remaining).div(received) : dec(0);
    return {
      key: line.key,
      extraUsd,
      unitDeltaUsd: received.gt(0) ? extraUsd.div(received) : dec(0),
      inventoryUsd,
      expenseUsd: extraUsd.minus(inventoryUsd),
    };
  });
}

/**
 * متوسط التكلفة بعد إعادة تقييم المخزون القائم بقيمة (موجبة أو سالبة) دون تغيير الكمية:
 *   newAvg = avg + valueUsd ÷ stockQty
 * إن لم يوجد رصيد موجب فلا يتغير المتوسط (والقيمة تُعامل مصروفاً عند المستدعي).
 */
export function revaluedAverage(stockQty: DecimalInput, avgUsd: DecimalInput, valueUsd: DecimalInput): Decimal {
  const qty = dec(stockQty);
  if (qty.lte(0)) return roundUnitCost(avgUsd);
  const next = dec(avgUsd).plus(dec(valueUsd).div(qty));
  if (next.lt(0)) throw new CoreError("INVALID_AMOUNT", "Average cost would become negative");
  return roundUnitCost(next);
}

/** قيمة المخزون بالدولار (للعرض والتقارير). */
export function stockValueUsd(qty: DecimalInput, avgUsd: DecimalInput): Decimal {
  return roundMoney(dec(qty).mul(avgUsd));
}
