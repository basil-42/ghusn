import { checkBarcode } from "./barcode";
import { dec } from "./decimal";
import { normalizeArabic } from "./search";
import { toLatinDigits } from "./phone";

/**
 * استيراد بنود شحنة من Excel (D-85). كل صف = متغيّر وكمية وسعر شراء. الصف يطابق متغيّراً
 * موجوداً بباركود المصنع، أو بالاسم والقسم والخيارات؛ وإلا يُنشأ منتج جديد (صفوف نفس الاسم
 * والقسم = منتج واحد بعدة متغيّرات). لا شيء يُكتب إن كان في الملف أي خطأ.
 */

export const IMPORT_COLUMNS = [
  "الاسم",
  "القسم",
  "النوع",
  "الوحدة",
  "الحجم",
  "المقاس",
  "اللون",
  "باركود المصنع",
  "صلاحية",
  "الكمية",
  "سعر الوحدة",
] as const;
export const MAX_IMPORT_ROWS = 500;

const TYPES: Record<string, "STOCK" | "MATERIAL"> = {
  بضاعه: "STOCK",
  "": "STOCK",
  ماده: "MATERIAL",
  مواد: "MATERIAL",
  "ماده تغليف": "MATERIAL",
};
const UNITS: Record<string, "PIECE" | "METER" | "SHEET"> = { حبه: "PIECE", "": "PIECE", متر: "METER", ورقه: "SHEET" };
const YES = new Set(["نعم", "اي", "ايوه", "1", "yes", "y", "true"]);

export interface ImportCategory {
  id: string;
  name: string;
}

export interface ExistingVariant {
  variantId: string;
  productName: string;
  categoryId: string;
  size: string | null;
  color: string | null;
  volume: string | null;
  barcode: string;
}

export interface ImportLine {
  row: number;
  /** متغيّر موجود، أو مفتاح متغيّر جديد «منتج#خيارات». */
  variantId: string | null;
  newKey: string | null;
  label: string;
  qty: string;
  unitPrice: string;
}

export interface NewProduct {
  key: string;
  nameAr: string;
  categoryId: string;
  type: "STOCK" | "MATERIAL";
  unit: "PIECE" | "METER" | "SHEET";
  trackExpiry: boolean;
  variants: { key: string; size: string | null; color: string | null; volume: string | null; barcode: string | null }[];
}

export interface ImportPlan {
  lines: ImportLine[];
  newProducts: NewProduct[];
  errors: { row: number; message: string }[];
}

const clean = (v: unknown) => String(v ?? "").trim();
const norm = (v: string | null) => normalizeArabic(v ?? "");
const optionsKey = (o: { size: string | null; color: string | null; volume: string | null }) =>
  [o.size, o.color, o.volume].map(norm).join("|");
const number = (v: string) =>
  toLatinDigits(v)
    .replace(/[,\s٬]/g, "")
    .replace("٫", ".");

/** تخطيط الاستيراد: الصفوف بعد صف العناوين، أرقام الصفوف كما في Excel (العناوين = 1). */
export function planShipmentImport(input: {
  rows: readonly (readonly unknown[])[];
  categories: readonly ImportCategory[];
  existing: readonly ExistingVariant[];
}): ImportPlan {
  const errors: ImportPlan["errors"] = [];
  const lines: ImportLine[] = [];
  const products = new Map<string, NewProduct>();
  const seenLine = new Map<string, number>();
  const categoryByName = new Map(input.categories.map((c) => [norm(c.name), c]));
  const byBarcode = new Map(input.existing.map((v) => [v.barcode, v]));
  const byName = new Map(input.existing.map((v) => [`${norm(v.productName)}#${v.categoryId}#${optionsKey(v)}`, v]));

  const rows = input.rows.filter((r) => r.some((c) => clean(c) !== ""));
  if (rows.length === 0) errors.push({ row: 0, message: "الملف فارغ." });
  if (rows.length > MAX_IMPORT_ROWS) {
    errors.push({ row: 0, message: `الحد ${MAX_IMPORT_ROWS} صف في الملف الواحد.` });
    return { lines, newProducts: [], errors };
  }

  input.rows.forEach((r, i) => {
    const row = i + 2;
    const cell = (c: number) => clean(r[c]);
    if (IMPORT_COLUMNS.every((_, c) => cell(c) === "")) return;
    const fail = (message: string) => errors.push({ row, message });

    const nameAr = cell(0);
    if (nameAr.length < 2) return fail("الاسم مطلوب.");
    const category = categoryByName.get(norm(cell(1)));
    if (!category) return fail(`القسم «${cell(1)}» غير موجود.`);
    const type = TYPES[norm(cell(2))];
    if (!type) return fail("النوع: بضاعة أو مادة تغليف.");
    const unit = UNITS[norm(cell(3))];
    if (!unit) return fail("الوحدة: حبة أو متر أو ورقة.");
    const options = { volume: cell(4) || null, size: cell(5) || null, color: cell(6) || null };
    const rawBarcode = cell(7);
    const trackExpiry = YES.has(norm(cell(8)).toLowerCase());
    const qty = number(cell(9));
    const unitPrice = number(cell(10));
    if (!/^\d{1,9}(\.\d{1,3})?$/.test(qty) || dec(qty).lte(0)) return fail("الكمية رقم أكبر من صفر.");
    if (unit === "PIECE" && !dec(qty).isInteger()) return fail("الكمية بالحبة عدد صحيح.");
    if (!/^\d{1,13}(\.\d{1,4})?$/.test(unitPrice)) return fail("سعر الوحدة رقم (حتى 4 خانات عشرية).");

    let barcode: string | null = null;
    if (rawBarcode) {
      const check = checkBarcode(toLatinDigits(rawBarcode));
      if (!check.ok)
        return fail(check.reason === "CHECK_DIGIT" ? "باركود المصنع غير صحيح." : "باركود المصنع: أرقام فقط.");
      barcode = check.value;
    }

    const label = [nameAr, options.volume, options.size, options.color].filter(Boolean).join(" · ");
    const existing =
      (barcode ? byBarcode.get(barcode) : undefined) ??
      byName.get(`${norm(nameAr)}#${category.id}#${optionsKey(options)}`);

    let lineKey: string;
    if (existing) {
      lineKey = existing.variantId;
      lines.push({ row, variantId: existing.variantId, newKey: null, label, qty, unitPrice });
    } else {
      const productKey = `${norm(nameAr)}#${category.id}`;
      const variantKey = `${productKey}#${optionsKey(options)}`;
      const product = products.get(productKey) ?? {
        key: productKey,
        nameAr,
        categoryId: category.id,
        type,
        unit,
        trackExpiry,
        variants: [],
      };
      if (product.type !== type || product.unit !== unit || product.trackExpiry !== trackExpiry) {
        return fail(`«${nameAr}»: النوع والوحدة والصلاحية يجب أن تتطابق في كل صفوفه.`);
      }
      if (barcode && product.variants.some((v) => v.barcode === barcode)) return fail("باركود مكرر في الملف.");
      if (!product.variants.some((v) => v.key === variantKey)) {
        product.variants.push({ key: variantKey, ...options, barcode });
      }
      products.set(productKey, product);
      lineKey = variantKey;
      lines.push({ row, variantId: null, newKey: variantKey, label, qty, unitPrice });
    }
    const first = seenLine.get(lineKey);
    if (first !== undefined) return fail(`نفس الصنف في الصف ${first} — اجمعي الكمية في صف واحد.`);
    seenLine.set(lineKey, row);
  });

  // منتج جديد بعدة متغيّرات: كل متغيّر يحتاج خياراً يميّزه
  for (const p of products.values()) {
    if (p.variants.length > 1 && p.variants.some((v) => !v.size && !v.color && !v.volume)) {
      const row = lines.find((l) => l.newKey?.startsWith(`${p.key}#`))?.row ?? 0;
      errors.push({ row, message: `«${p.nameAr}» له عدة صفوف — اكتبي الحجم أو المقاس أو اللون لكل صف.` });
    }
  }

  return { lines, newProducts: [...products.values()], errors: errors.sort((a, b) => a.row - b.row) };
}
