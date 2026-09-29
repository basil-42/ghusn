import DecimalBase from "decimal.js";

/**
 * نسخة Decimal خاصة بغصن: دقة 40 رقماً معنوياً وتقريب نصف للأعلى.
 * كل حسابات المال في النظام تمر عبرها — لا تُستخدم أرقام JavaScript العادية للمال.
 */
export const Decimal = DecimalBase.clone({ precision: 40, rounding: DecimalBase.ROUND_HALF_UP });
export type Decimal = InstanceType<typeof Decimal>;

/** أي قيمة تقبلها Decimal: نص، رقم صحيح، أو Decimal. يُفضَّل النص للمبالغ القادمة من قاعدة البيانات. */
export type DecimalInput = string | number | Decimal;

export const dec = (value: DecimalInput): Decimal => new Decimal(value);

/** D-28: المبالغ والإجماليات بخانتين. */
export const MONEY_DP = 2;
/** D-28: تكلفة الوحدة والمتوسطات وأسعار الصرف بست خانات. */
export const UNIT_COST_DP = 6;

export const roundMoney = (value: DecimalInput): Decimal => dec(value).toDecimalPlaces(MONEY_DP);
export const roundUnitCost = (value: DecimalInput): Decimal => dec(value).toDecimalPlaces(UNIT_COST_DP);

export const sum = (values: readonly DecimalInput[]): Decimal =>
  values.reduce<Decimal>((acc, v) => acc.plus(v), dec(0));

/**
 * رقم بصيغته المختصرة للعرض والنماذج: «20.000» ← «20»، «0.3500» ← «0.35»، «2500» يبقى «2500».
 * لا تستخدم تعبيرات نمطية لحذف الأصفار — تحذف أصفار الأعداد الصحيحة («20» ← «2»).
 */
export const plainNumber = (value: DecimalInput): string => dec(value).toFixed();
