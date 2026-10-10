import { toLatinDigits } from "./phone";

const TASHKEEL = /[ؐ-ًؚ-ٰٟۖ-ۭ]/g;
const TATWEEL = /ـ/g;

/**
 * توحيد النص العربي للبحث (system-design §13.2): يتجاهل التشكيل والتطويل،
 * ويوحّد الهمزات (أ إ آ ٱ ← ا)، والتاء المربوطة (ة ← ه)، والألف المقصورة (ى ← ي)،
 * ويحوّل الأرقام العربية إلى لاتينية والحروف اللاتينية إلى صغيرة.
 * «عطر ورد طائفي» = «عطر ورد طايفي» = «عطر وَرد طائفى».
 */
export function normalizeArabic(text: string): string {
  return toLatinDigits(text)
    .normalize("NFKC")
    .replace(TASHKEEL, "")
    .replace(TATWEEL, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** نص البحث المخزّن مع المنتج: كل الحقول موحّدة في سطر واحد. */
export function buildSearchText(parts: readonly (string | null | undefined)[]): string {
  return normalizeArabic(parts.filter(Boolean).join(" "));
}

/** كلمات البحث بعد التوحيد — المنتج يطابق إن احتوى نصه على كل الكلمات. */
export function searchTerms(query: string): string[] {
  return normalizeArabic(query)
    .split(" ")
    .filter((t) => t.length > 0)
    .slice(0, 8);
}

/**
 * أرقام الاستعلام إن كان رقماً فقط (هاتف، رقم مستند، باركود): «0912 345-678» ← «0912345678».
 * أقل من 3 أرقام أو نص مختلط ← null.
 */
export function numericQuery(query: string): string | null {
  const latin = toLatinDigits(query).trim();
  if (!/^[\d\s+\-()]+$/.test(latin)) return null;
  const digits = latin.replace(/\D/g, "");
  return digits.length >= 3 ? digits : null;
}

/**
 * مواضع كلمات البحث في النص الأصلي لتظليلها — المطابقة على النص الموحّد («مسك» تظلّل «المسك» و«مِسك»)،
 * والمواضع بأحرف النص الأصلي. تُدمج المواضع المتداخلة.
 */
export function matchRanges(text: string, terms: readonly string[]): [number, number][] {
  // كل حرف أصلي ← ما يصبح عليه بعد التوحيد (قد يكون فارغاً: تشكيل/تطويل)
  let norm = "";
  const origin: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const n = normalizeArabic(text[i] ?? "") || (/\s/.test(text[i] ?? "") ? " " : "");
    for (const ch of n) {
      norm += ch;
      origin.push(i);
    }
  }
  const ranges: [number, number][] = [];
  for (const term of terms) {
    if (!term) continue;
    let from = 0;
    for (;;) {
      const at = norm.indexOf(term, from);
      if (at < 0) break;
      const start = origin[at] ?? 0;
      const end = (origin[at + term.length - 1] ?? start) + 1;
      ranges.push([start, end]);
      from = at + term.length;
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  return merged;
}

/** «العطر» ← «عطر» لتطابق «عطر مسك» و«العطر» معاً (المطابقة جزئية فـ«عطر» تجد «العطر» أصلاً). */
export function stripArticle(term: string): string {
  return term.length >= 4 && term.startsWith("ال") ? term.slice(2) : term;
}
