import { normalizeArabic } from "./search";

export interface VariantOptions {
  size?: string | null;
  color?: string | null;
  volume?: string | null;
}

export type VariantIssue =
  | { code: "NO_VARIANTS" }
  | { code: "TOO_MANY_VARIANTS"; max: number }
  | { code: "MISSING_OPTIONS"; index: number }
  | { code: "DUPLICATE_OPTIONS"; index: number; duplicateOf: number }
  | { code: "DUPLICATE_BARCODE"; index: number; duplicateOf: number };

export const MAX_VARIANTS = 50;

const clean = (v?: string | null) => v?.trim().replace(/\s+/g, " ") || null;

/** يوحّد خيارات المتغيّر (مسافات زائدة ← لا شيء، فارغ ← null). */
export function cleanOptions<T extends VariantOptions>(v: T): T {
  return { ...v, size: clean(v.size), color: clean(v.color), volume: clean(v.volume) };
}

/** اسم المتغيّر للعرض: «100ml · أحمر · L». فارغ للمتغيّر الوحيد بلا خيارات. */
export function variantLabel(v: VariantOptions): string {
  return [v.volume, v.color, v.size].map(clean).filter(Boolean).join(" · ");
}

/**
 * قواعد المتغيرات:
 * - متغيّر واحد على الأقل، و50 كحد أقصى.
 * - إن وُجد أكثر من متغيّر: لكل واحد مقاس أو لون أو حجم، ولا تتكرر التركيبة (بعد توحيد النص).
 * - لا يتكرر الباركود داخل نفس المنتج (التفرّد بين المنتجات تفحصه قاعدة البيانات).
 */
export function validateVariants(variants: readonly (VariantOptions & { barcode?: string | null })[]): VariantIssue[] {
  if (variants.length === 0) return [{ code: "NO_VARIANTS" }];
  if (variants.length > MAX_VARIANTS) return [{ code: "TOO_MANY_VARIANTS", max: MAX_VARIANTS }];

  const issues: VariantIssue[] = [];
  const seenOptions = new Map<string, number>();
  const seenBarcodes = new Map<string, number>();

  variants.forEach((raw, index) => {
    const v = cleanOptions(raw);
    if (variants.length > 1) {
      if (!v.size && !v.color && !v.volume) {
        issues.push({ code: "MISSING_OPTIONS", index });
      } else {
        const key = [v.size, v.color, v.volume].map((x) => normalizeArabic(x ?? "")).join("|");
        const first = seenOptions.get(key);
        if (first !== undefined) issues.push({ code: "DUPLICATE_OPTIONS", index, duplicateOf: first });
        else seenOptions.set(key, index);
      }
    }
    const barcode = raw.barcode?.trim();
    if (barcode) {
      const first = seenBarcodes.get(barcode);
      if (first !== undefined) issues.push({ code: "DUPLICATE_BARCODE", index, duplicateOf: first });
      else seenBarcodes.set(barcode, index);
    }
  });
  return issues;
}

/** SKU مقروء من رقم تسلسلي: GH-00001. */
export function formatSku(sequence: number | bigint): string {
  return `GH-${sequence.toString().padStart(5, "0")}`;
}

/** رابط مختصر للقسم من اسمه الإنجليزي (حروف صغيرة وشرطات). */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** ما ينقص منتجاً ظاهراً في المتجر (D-106) — بترتيب العرض في لوحة التحكم. */
export const STORE_READINESS_ITEMS = [
  "price",
  "image",
  "nameEn",
  "descriptionAr",
  "descriptionEn",
  "occasion",
] as const;
export type StoreReadinessItem = (typeof STORE_READINESS_ITEMS)[number];

export interface StoreReadinessInput {
  /** متغيّر نشط واحد على الأقل مسعّر — بدونه لا يظهر المنتج في المتجر أصلاً. */
  hasPrice: boolean;
  imageCount: number;
  nameEn: string | null;
  descriptionAr: string | null;
  descriptionEn: string | null;
  occasionCount: number;
}

/** النواقص فقط؛ قائمة فارغة = جاهز. النص الفارغ أو المسافات تُعدّ ناقصة. */
export function storeReadiness(p: StoreReadinessInput): StoreReadinessItem[] {
  const blank = (s: string | null) => !s?.trim();
  const missing: Record<StoreReadinessItem, boolean> = {
    price: !p.hasPrice,
    image: p.imageCount === 0,
    nameEn: blank(p.nameEn),
    descriptionAr: blank(p.descriptionAr),
    descriptionEn: blank(p.descriptionEn),
    occasion: p.occasionCount === 0,
  };
  return STORE_READINESS_ITEMS.filter((k) => missing[k]);
}
