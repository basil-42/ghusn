import { dec, type Decimal, type DecimalInput } from "./decimal";
import { shopDay, shopDayStart, shopMonthRange } from "./exchange-rate";
import { addDays } from "./occasion";

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

export const DASHBOARD_PERIODS = [
  "today",
  "this-week",
  "last-week",
  "this-month",
  "last-month",
  "this-year",
  "last-year",
] as const;
export type DashboardPeriod = (typeof DASHBOARD_PERIODS)[number];

/** يوم بداية الأسبوع (0 = الأحد … 6 = السبت)، من الضبط — الافتراضي السبت (D-133). */
export type WeekStart = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export const DEFAULT_WEEK_START: WeekStart = 6;
/** أسماء الأيام بترتيب getUTCDay (0 = الأحد). */
export const WEEK_DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"] as const;

/** وحدة عمود الرسم: يوم (اليوم والأسبوع والشهر)، شهر للسنة (D-134). */
export type DashboardBucket = "day" | "month";

export interface DashboardRange {
  /** الفترة المعروضة: [start, end) — end هي «الآن» للفترة الجارية. */
  start: Date;
  end: Date;
  /** نهاية الفترة الكاملة (للرسم: الأيام الباقية تظهر فارغة). */
  periodEnd: Date;
  /** فترة المقارنة: نفس الطول من الفترة السابقة للجارية، والسابقة كاملة للمكتملة. */
  prevStart: Date;
  prevEnd: Date;
  /** بداية الرسم: بداية الفترة، و«اليوم» آخر 7 أيام ليظهر في سياقه (D-134). */
  chartStart: Date;
  bucket: DashboardBucket;
  /** الفترة انتهت (الأسبوع/الشهر/السنة السابقة). */
  complete: boolean;
}

/** أول يوم في أسبوع اليوم المعطى، حسب يوم البداية. */
export function weekStartDay(day: string, weekStartsOn: WeekStart): string {
  const dow = new Date(`${day}T12:00:00Z`).getUTCDay();
  return addDays(day, -((dow - weekStartsOn + 7) % 7));
}

/** الجارية تُقارن بنفس طولها من السابقة، دون تجاوز نهايتها. */
function sameSpan(start: Date, now: Date, prevStart: Date, prevPeriodEnd: Date): Date {
  return new Date(Math.min(prevStart.getTime() + (now.getTime() - start.getTime()), prevPeriodEnd.getTime()));
}

/**
 * فترة أرقام الرئيسية ومقارنتها العادلة بأيام المحل (D-120، D-133):
 * الفترة الجارية (اليوم، هذا الأسبوع/الشهر/السنة) حتى الآن ← نفس المدة من بداية السابقة؛
 * الفترة المكتملة (الأسبوع/الشهر/السنة السابقة) ← التي قبلها كاملة.
 */
export function dashboardRange(
  period: DashboardPeriod,
  now: Date,
  weekStartsOn: WeekStart = DEFAULT_WEEK_START,
): DashboardRange {
  const today = shopDay(now);
  const at = shopDayStart;
  if (period === "today") {
    const start = at(today);
    const prevStart = at(addDays(today, -1));
    return {
      start,
      end: now,
      periodEnd: at(addDays(today, 1)),
      prevStart,
      prevEnd: sameSpan(start, now, prevStart, start),
      chartStart: at(addDays(today, -6)),
      bucket: "day",
      complete: false,
    };
  }
  if (period === "this-week" || period === "last-week") {
    const thisWeek = weekStartDay(today, weekStartsOn);
    const first = period === "this-week" ? thisWeek : addDays(thisWeek, -7);
    const start = at(first);
    const periodEnd = at(addDays(first, 7));
    const prevStart = at(addDays(first, -7));
    const complete = period === "last-week";
    return {
      start,
      end: complete ? periodEnd : now,
      periodEnd,
      prevStart,
      prevEnd: complete ? start : sameSpan(start, now, prevStart, start),
      chartStart: start,
      bucket: "day",
      complete,
    };
  }
  if (period === "this-month" || period === "last-month") {
    const thisMonth = today.slice(0, 7);
    const month = period === "this-month" ? thisMonth : previousMonth(thisMonth);
    const { start, end: periodEnd } = shopMonthRange(month);
    const prevStart = shopMonthRange(previousMonth(month)).start;
    const complete = period === "last-month";
    return {
      start,
      end: complete ? periodEnd : now,
      periodEnd,
      prevStart,
      prevEnd: complete ? start : sameSpan(start, now, prevStart, start),
      chartStart: start,
      bucket: "day",
      complete,
    };
  }
  const year = Number(today.slice(0, 4)) - (period === "last-year" ? 1 : 0);
  const start = at(`${year}-01-01`);
  const periodEnd = at(`${year + 1}-01-01`);
  const prevStart = at(`${year - 1}-01-01`);
  const complete = period === "last-year";
  return {
    start,
    end: complete ? periodEnd : now,
    periodEnd,
    prevStart,
    prevEnd: complete ? start : sameSpan(start, now, prevStart, start),
    chartStart: start,
    bucket: "month",
    complete,
  };
}

function previousMonth(month: string): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/**
 * أعمدة رسم المبيعات (D-134): مفاتيح الفترة كاملة بتوقيت المحل — يوم `YYYY-MM-DD` أو شهر `YYYY-MM`
 * (نفس صيغة to_char في الاستعلام)، والباقي من الفترة يظهر فارغاً.
 */
export function dashboardBuckets(range: DashboardRange): string[] {
  const keys: string[] = [];
  if (range.bucket === "day") {
    for (let d = shopDay(range.chartStart); shopDayStart(d) < range.periodEnd; d = addDays(d, 1)) keys.push(d);
    return keys;
  }
  for (let m = shopDay(range.chartStart).slice(0, 7); shopMonthRange(m).start < range.periodEnd; m = nextMonth(m)) {
    keys.push(m);
  }
  return keys;
}

function nextMonth(month: string): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}
