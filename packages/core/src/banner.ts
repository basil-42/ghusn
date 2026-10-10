/**
 * بانرات الرئيسية (D-101): حتى 3 تظهر بالترتيب، ولكل بانر مدة اختيارية بأيام المحل (توقيت الخرطوم).
 * الأيام نصوص «YYYY-MM-DD» فتُقارن كنصوص.
 */

export const MAX_HOME_BANNERS = 3;

export type BannerWindow = "live" | "scheduled" | "ended";

/** حالة البانر اليوم: قبل البداية «مجدول»، بعد النهاية «منتهٍ»، وغير ذلك «يظهر». الحدّان شاملان. */
export function bannerWindow(today: string, start: string | null, end: string | null): BannerWindow {
  if (start && today < start) return "scheduled";
  if (end && today > end) return "ended";
  return "live";
}

/** مدة غير صحيحة: النهاية قبل البداية. */
export function isValidBannerWindow(start: string | null, end: string | null): boolean {
  return !start || !end || start <= end;
}

export type BannerPeriod =
  | { kind: "always" }
  | { kind: "until"; end: string; daysLeft: number }
  | { kind: "starts"; start: string; daysUntil: number }
  | { kind: "ended"; end: string };

const dayNumber = (day: string) => Date.parse(`${day}T00:00:00Z`) / 86_400_000;

/** وصف المدة لقائمة البانرات: «دائم»، «باقي N يوماً» (اليوم الأخير = 0)، «يبدأ بعد N»، «انتهى». */
export function bannerPeriod(today: string, start: string | null, end: string | null): BannerPeriod {
  const w = bannerWindow(today, start, end);
  if (w === "scheduled" && start) return { kind: "starts", start, daysUntil: dayNumber(start) - dayNumber(today) };
  if (w === "ended" && end) return { kind: "ended", end };
  if (end) return { kind: "until", end, daysLeft: dayNumber(end) - dayNumber(today) };
  return { kind: "always" };
}
