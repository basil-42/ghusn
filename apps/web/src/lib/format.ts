import { SHOP_TIME_ZONE } from "@ghusn/core";

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
export const formatDay = (d: Date) => dayFormat.format(d);
