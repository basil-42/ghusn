/**
 * المناسبات (D-92): رابط المناسبة في المتجر، ونافذة بانر الموسم بأيام المحل (توقيت الخرطوم).
 */

/** رابط المناسبة: حروف لاتينية صغيرة وأرقام وشرطات (2–40)، أو null إن لم يصلح. */
export function occasionSlug(input: string): string | null {
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug.length >= 2 && slug.length <= 40 ? slug : null;
}

/** البانر ظاهر اليوم؟ الأيام بصيغة YYYY-MM-DD، شاملة البداية والنهاية؛ بلا تاريخين لا بانر. */
export function isBannerDay(today: string, start: string | null, end: string | null): boolean {
  if (!start || !end || start > end) return false;
  return start <= today && today <= end;
}

/** قبل كم يوم من بداية الموسم تظهر المناسبة في بطاقة الرئيسية بعنوان «قريباً» (D-102). */
export const SEASON_SOON_DAYS = 14;

export type SeasonTileState = "live" | "soon" | "default";

/** اليوم + n أيام (YYYY-MM-DD). */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * أي مناسبة تظهر في بطاقة الموسم بالرئيسية (D-102)، من قائمة مرتبة بترتيب صفحة المناسبات:
 * موسم فعّال اليوم (أولها بالترتيب) ← وإلا أقرب موسم يبدأ خلال SEASON_SOON_DAYS ← وإلا أول مناسبة
 * فيها منتجات. يعيد موضعها في القائمة وحالتها، أو null إن لم تصلح أي مناسبة.
 */
export function pickSeasonTile(
  today: string,
  occasions: readonly { start: string | null; end: string | null; hasProducts: boolean }[],
  soonDays = SEASON_SOON_DAYS,
): { index: number; state: SeasonTileState } | null {
  const live = occasions.findIndex((o) => isBannerDay(today, o.start, o.end));
  if (live >= 0) return { index: live, state: "live" };
  const horizon = addDays(today, soonDays);
  let soon = -1;
  occasions.forEach((o, i) => {
    if (!o.start || !o.end || o.start > o.end || o.start <= today || o.start > horizon) return;
    if (soon < 0 || o.start < occasions[soon]!.start!) soon = i;
  });
  if (soon >= 0) return { index: soon, state: "soon" };
  const first = occasions.findIndex((o) => o.hasProducts);
  return first >= 0 ? { index: first, state: "default" } : null;
}
