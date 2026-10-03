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
