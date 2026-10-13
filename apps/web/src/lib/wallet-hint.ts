import { dec, toLatinDigits } from "@ghusn/core";

/**
 * تنبيه «أكبر من المتاح» في نماذج الصرف (D-132) — للمالك فقط حين يُعرف رصيد المحفظة.
 * للتسهيل فقط: الخادم يرفض المبلغ في كل الأحوال.
 */
export const OVER_BALANCE = "أكبر من رصيد المحفظة — سجّلي تمويلاً أو تحويلاً للمحفظة أولاً.";

/** هل المبلغ المكتوب (أرقام عربية أو لاتينية وفواصل) أكبر من المتاح؟ مبلغ غير مكتمل لا يُعدّ تجاوزاً. */
export function exceedsAvailable(amount: string, available: string | null | undefined): boolean {
  if (available == null) return false;
  const clean = toLatinDigits(amount)
    .replace(/[,\s٬]/g, "")
    .replace("٫", ".");
  if (!/^\d{1,13}(\.\d{1,2})?$/.test(clean)) return false;
  return dec(clean).gt(available);
}
