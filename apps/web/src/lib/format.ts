import { SHOP_TIME_ZONE, dec } from "@ghusn/core";

// عربي بأرقام لاتينية وفاصل آلاف: 185,000 ج.س (CLAUDE.md)
const LOCALE = "ar-u-nu-latn";

const rateFormat = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 6 });
const percentFormat = new Intl.NumberFormat(LOCALE, {
  style: "percent",
  maximumFractionDigits: 1,
  signDisplay: "exceptZero",
});
const dateTimeFormat = new Intl.DateTimeFormat(LOCALE, {
  timeZone: SHOP_TIME_ZONE,
  day: "numeric",
  month: "long",
  hour: "numeric",
  minute: "2-digit",
});
const timeFormat = new Intl.DateTimeFormat(LOCALE, { timeZone: SHOP_TIME_ZONE, hour: "numeric", minute: "2-digit" });
const relativeFormat = new Intl.RelativeTimeFormat(LOCALE, { numeric: "always" });
const dayFormat = new Intl.DateTimeFormat(LOCALE, {
  timeZone: SHOP_TIME_ZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
});

/** سعر صرف (حتى 6 خانات، دون أصفار زائدة). يقبل النص حتى لا تمر القيمة بـ float. */
export function formatRate(value: { toString(): string }): string {
  const [int = "0", frac] = value.toString().split(".");
  const grouped = rateFormat.format(BigInt(int.replace("-", ""))).replace(/^/, int.startsWith("-") ? "-" : "");
  const trimmed = frac?.replace(/0+$/, "");
  return trimmed ? `${grouped}.${trimmed}` : grouped;
}

/** نسبة مئوية بإشارة (+12% / -3.5%). المدخل كسر عشري (0.12). */
export function formatPercent(fraction: { toString(): string }): string {
  return percentFormat.format(Number(fraction.toString()));
}

export const formatDateTime = (d: Date) => dateTimeFormat.format(d);
export const formatTime = (d: Date) => timeFormat.format(d);

/** «قبل دقيقتين»، «قبل 3 ساعات» — وأقدم من يوم: التاريخ والوقت. */
export function formatRelative(d: Date, now: Date = new Date()): string {
  const minutes = Math.round((now.getTime() - d.getTime()) / 60_000);
  if (minutes < 1) return "الآن";
  if (minutes < 60) return relativeFormat.format(-minutes, "minute");
  if (minutes < 24 * 60) return relativeFormat.format(-Math.floor(minutes / 60), "hour");
  return formatDateTime(d);
}
export const formatDay = (d: Date) => dayFormat.format(d);

/** مبلغ بعملة معيّنة: تقريب نصف للأعلى بعدد خانات العملة (الجنيه بدون كسور) وفاصل آلاف. */
export function formatAmount(value: { toString(): string }, decimals = 2): string {
  const fixed = dec(value.toString()).toFixed(decimals);
  const negative = fixed.startsWith("-") && /[1-9]/.test(fixed);
  const [int = "0", frac] = fixed.replace("-", "").split(".");
  return `${negative ? "-" : ""}${BigInt(int).toLocaleString("en-US")}${frac ? `.${frac}` : ""}`;
}

/** هامش ربح كنسبة بلا إشارة: 0.401 ← «40.1%». */
export function formatMargin(fraction: { toString(): string }): string {
  return `${dec(fraction.toString()).mul(100).toFixed(1)}%`;
}
