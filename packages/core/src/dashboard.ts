import { dec, type Decimal, type DecimalInput } from "./decimal";
import { shopDay, shopDayStart, shopMonthRange } from "./exchange-rate";

/**
 * لوحة المتابعة (D-94): مقارنة فترتين، وتنبيه «قارب على النفاد».
 */

/** التغيّر بين فترتين كنسبة (0.25 = +25%)، أو null إن لم تكن هناك فترة سابقة للمقارنة. */
export function percentChange(current: DecimalInput, previous: DecimalInput): Decimal | null {
  const prev = dec(previous);
  if (prev.lte(0)) return null;
  return dec(current).minus(prev).div(prev);
}

/** الحد الفعّال: حد المنتج إن وُجد، وإلا الحد العام. الصنف قارب على النفاد إن كان رصيده ≤ الحد. */
export function isLowStock(
  qty: DecimalInput,
  productThreshold: DecimalInput | null,
  globalThreshold: DecimalInput,
): boolean {
  return dec(qty).lte(dec(productThreshold ?? globalThreshold));
}

export const DASHBOARD_PERIODS = ["today", "week", "month"] as const;
export type DashboardPeriod = (typeof DASHBOARD_PERIODS)[number];

const DAY_MS = 86_400_000;

/**
 * فترة أرقام الرئيسية (D-120) ومقارنتها العادلة، بأيام المحل:
 * اليوم حتى الآن ← نفس الساعات أمس · آخر 7 أيام ← الأيام السبعة قبلها ·
 * الشهر حتى الآن ← نفس المدة من بداية الشهر الماضي (لا تتجاوز نهايته).
 */
export function dashboardRange(
  period: DashboardPeriod,
  now: Date,
): { start: Date; end: Date; prevStart: Date; prevEnd: Date } {
  const today = shopDay(now);
  if (period === "today") {
    const start = shopDayStart(today);
    return {
      start,
      end: now,
      prevStart: new Date(start.getTime() - DAY_MS),
      prevEnd: new Date(now.getTime() - DAY_MS),
    };
  }
  if (period === "week") {
    // اليوم وستة أيام قبله (منتصف النهار يتجنب حدود التوقيت)
    const start = shopDayStart(shopDay(new Date(shopDayStart(today).getTime() - 6 * DAY_MS + DAY_MS / 2)));
    return {
      start,
      end: now,
      prevStart: new Date(start.getTime() - 7 * DAY_MS),
      prevEnd: new Date(now.getTime() - 7 * DAY_MS),
    };
  }
  const month = today.slice(0, 7);
  const { start } = shopMonthRange(month);
  const [y, m] = month.split("-").map(Number) as [number, number];
  const prevMonth = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  const prev = shopMonthRange(prevMonth);
  const prevEnd = new Date(Math.min(prev.start.getTime() + (now.getTime() - start.getTime()), prev.end.getTime()));
  return { start, end: now, prevStart: prev.start, prevEnd };
}
