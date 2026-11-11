import type { BannerTextSide } from "@ghusn/db";

/**
 * جهة كلام البانر (D-155) مادية — يمين أو يسار الصورة — لأن الصورة لا تنعكس مع اللغة.
 * تُرجع هل تلك الجهة هي «بداية» السطر في اتجاه الصفحة، لنختار بين خصائص start و end.
 */
export function textAtStart(side: BannerTextSide, rtl: boolean): boolean {
  return (side === "RIGHT") === rtl;
}
