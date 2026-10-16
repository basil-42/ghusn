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
 * آخر سجل effectiveAt ≤ اللحظة أياً كان مصدره — يدوي أو تحويل فعلي (D-145: «آخر سعر أُدخل هو الساري»).
 * يُرجع null إن لم يوجد سعر قبل تلك اللحظة.
 */
export function effectiveRate<T extends RateEntry>(entries: readonly T[], currencyCode: string, at: Date): T | null {
  let latest: T | null = null;
  for (const e of entries) {
    if (e.currencyCode !== currencyCode || e.effectiveAt.getTime() > at.getTime()) continue;
    if (!latest || e.effectiveAt.getTime() > latest.effectiveAt.getTime()) latest = e;
  }
  return latest;
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

const offsetFormat = new Intl.DateTimeFormat("en-US", { timeZone: SHOP_TIME_ZONE, timeZoneName: "shortOffset" });

/** فرق توقيت المحل عن UTC بالدقائق في لحظة ما (الخرطوم: +120). */
function shopOffsetMinutes(at: Date): number {
  const name = offsetFormat.formatToParts(at).find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(name);
  if (!m) return 0;
  const minutes = Number(m[2]) * 60 + Number(m[3] ?? 0);
  return m[1] === "-" ? -minutes : minutes;
}

/**
 * لحظة العملية من تاريخ يُدخل (YYYY-MM-DD) بتوقيت المحل:
 * اليوم ← الآن؛ يوم سابق ← آخر ثانية فيه (يُطبَّق آخر سعر صرف ذلك اليوم)؛ مستقبل أو تاريخ غير صحيح ← null.
 */
export function shopMomentForDate(day: string, now: Date = new Date()): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return null;
  const today = shopDay(now);
  if (day === today) return now;
  if (day > today) return null;
  const guess = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59));
  const moment = new Date(guess.getTime() - shopOffsetMinutes(guess) * 60_000);
  return shopDay(moment) === day ? moment : null;
}

/** بداية يوم بتوقيت المحل (00:00 الخرطوم) للتاريخ YYYY-MM-DD. */
export function shopDayStart(day: string): Date {
  const guess = new Date(`${day}T00:00:00Z`);
  return new Date(guess.getTime() - shopOffsetMinutes(guess) * 60_000);
}

/** حدود شهر بتوقيت المحل: [البداية، البداية التالية) — للتقارير الشهرية. */
export function shopMonthRange(month: string): { start: Date; end: Date } {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) throw new RangeError(`Invalid month ${month}`);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return { start: shopDayStart(`${month}-01`), end: shopDayStart(`${next}-01`) };
}
