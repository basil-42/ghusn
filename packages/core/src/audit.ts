/**
 * أدوات سجل التدقيق (D-114): فروق الإعدادات (قبل ← بعد)، وإخفاء الرقم، ووصف الجهاز للعرض.
 */

const show = (v: unknown): string =>
  v === null || v === undefined || v === "" ? "—" : typeof v === "boolean" ? (v ? "نعم" : "لا") : String(v);

/** الفروق بين قيمتين لكائن إعدادات — لكل حقل تغيّر: اسمه وقبله وبعده. */
export function diffFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  labels: Record<string, string> = {},
): { field: string; before: string; after: string }[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const out: { field: string; before: string; after: string }[] = [];
  for (const k of keys) {
    if (JSON.stringify(before[k] ?? null) === JSON.stringify(after[k] ?? null)) continue;
    out.push({ field: labels[k] ?? k, before: show(before[k]), after: show(after[k]) });
  }
  return out;
}

/** ملخص سطر واحد من الفروق: «حد الخصم 10 ← 15 · مدة المرتجع 7 ← 5». */
export const changesLine = (changes: { field: string; before: string; after: string }[], max = 4) =>
  changes
    .slice(0, max)
    .map((c) => `${c.field}: ${c.before} ← ${c.after}`)
    .join(" · ") + (changes.length > max ? ` · و${changes.length - max} أخرى` : "");

/** «+2499****5678» — الرقم الكامل لا يُخزَّن لمن ليس مستخدماً. */
export function maskPhone(phone: string): string {
  return phone.length > 8 ? `${phone.slice(0, 5)}****${phone.slice(-4)}` : "****";
}

/** «Safari · آيفون» من User-Agent — للعرض فقط. */
export function deviceLabel(ua: string | null): string | null {
  if (!ua) return null;
  const os = /iPhone/.test(ua)
    ? "آيفون"
    : /iPad/.test(ua)
      ? "آيباد"
      : /Android/.test(ua)
        ? "أندرويد"
        : /Mac OS X/.test(ua)
          ? "ماك"
          : /Windows/.test(ua)
            ? "ويندوز"
            : null;
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /CriOS|Chrome\//.test(ua)
      ? "Chrome"
      : /FxiOS|Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
          : null;
  return [browser, os].filter(Boolean).join(" · ") || null;
}
