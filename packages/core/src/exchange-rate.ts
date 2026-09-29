import { dec, type Decimal, type DecimalInput } from "./decimal";
import { CoreError } from "./errors";

export type RateSource = "PARALLEL_MARKET" | "BANK" | "ACTUAL_TRANSFER" | "FIXED_PEG";

export interface RateEntry {
  currencyCode: string;
  unitsPerUsd: DecimalInput;
  source: RateSource;
  effectiveAt: Date;
}

/** المنطقة الزمنية للمحل — «نفس اليوم» يُحسب بتوقيت الخرطوم. */
export const SHOP_TIME_ZONE = "Africa/Khartoum";

const dayKey = new Intl.DateTimeFormat("en-CA", {
  timeZone: SHOP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** يوم التقويم (YYYY-MM-DD) بتوقيت المحل. */
export function shopDay(at: Date): string {
  return dayKey.format(at);
}

/**
 * سعر الصرف الساري لعملة في لحظة ما (currency-and-costing §2):
 * - آخر سجل effectiveAt ≤ اللحظة.
 * - الأولوية: سعر تحويل فعلي (ACTUAL_TRANSFER) في نفس اليوم يتقدّم على سعر الجدول اليومي.
 * يُرجع null إن لم يوجد سعر قبل تلك اللحظة.
 */
export function effectiveRate<T extends RateEntry>(entries: readonly T[], currencyCode: string, at: Date): T | null {
  const candidates = entries
    .filter((e) => e.currencyCode === currencyCode && e.effectiveAt.getTime() <= at.getTime())
    .sort((a, b) => b.effectiveAt.getTime() - a.effectiveAt.getTime());

  const today = shopDay(at);
  const transferToday = candidates.find((e) => e.source === "ACTUAL_TRANSFER" && shopDay(e.effectiveAt) === today);
  return transferToday ?? candidates[0] ?? null;
}

/** نسبة التغيّر بين سعرين: (الجديد − القديم) ÷ القديم. موجبة = الجنيه ضعف. */
export function rateChange(previous: DecimalInput, next: DecimalInput): Decimal {
  const base = dec(previous);
  if (base.lte(0)) throw new CoreError("INVALID_RATE", "Previous rate must be > 0");
  return dec(next).minus(base).div(base);
}

/**
 * حماية من أخطاء الإدخال (مثل 25000 بدل 2500): تغيّر أكبر من هذا الحد
 * يحتاج تأكيداً صريحاً قبل الحفظ.
 */
export const SUSPICIOUS_RATE_CHANGE = "0.2";

export function isSuspiciousRateChange(previous: DecimalInput, next: DecimalInput): boolean {
  return rateChange(previous, next).abs().gt(SUSPICIOUS_RATE_CHANGE);
}
