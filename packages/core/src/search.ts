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
