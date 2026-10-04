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
