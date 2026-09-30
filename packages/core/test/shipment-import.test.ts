import { describe, expect, it } from "vitest";
import { planShipmentImport, type ExistingVariant } from "../src";

const categories = [
  { id: "cat-w", name: "عطور نسائية" },
  { id: "cat-f", name: "ورود" },
];
const existing: ExistingVariant[] = [
  {
    variantId: "v-rose",
    productName: "عطر ورد طائفي",
    categoryId: "cat-w",
    size: null,
    color: null,
    volume: "50ml",
    barcode: "2000000000015",
  },
  {
    variantId: "v-oud",
    productName: "عطر عود ملكي",
    categoryId: "cat-w",
    size: null,
    color: null,
    volume: null,
    barcode: "6291234567894",
  },
];
// الأعمدة: الاسم، القسم، النوع، الوحدة، الحجم، المقاس، اللون، باركود المصنع، صلاحية، الكمية، سعر الوحدة
const row = (...cells: (string | number)[]) => cells;
const plan = (rows: (string | number)[][]) => planShipmentImport({ rows, categories, existing });

describe("planShipmentImport (D-85)", () => {
  it("matches existing variants by name+options (Arabic-normalized) or by barcode", () => {
    const p = plan([
      row("عطر ورد طائفى", "عطور نسائيه", "بضاعة", "حبة", "50ml", "", "", "", "نعم", "٢٠", "90"),
      row("اسم مختلف", "عطور نسائية", "بضاعة", "حبة", "", "", "", "6291234567894", "", 10, 150),
    ]);
    expect(p.errors).toEqual([]);
    expect(p.newProducts).toEqual([]);
    expect(p.lines.map((l) => [l.variantId, l.qty, l.unitPrice])).toEqual([
      ["v-rose", "20", "90"],
      ["v-oud", "10", "150"],
    ]);
  });

  it("groups rows of a new product into one product with several variants", () => {
    const p = plan([
      row("مسك أبيض", "عطور نسائية", "", "", "50ml", "", "", "", "نعم", 12, "45.5"),
      row("مسك أبيض", "عطور نسائية", "", "", "100ml", "", "", "", "نعم", 6, 80),
      row("شريط ستان", "ورود", "مادة تغليف", "متر", "", "", "أحمر", "", "", "25.5", "0.35"),
    ]);
    expect(p.errors).toEqual([]);
    expect(p.newProducts.map((n) => [n.nameAr, n.type, n.unit, n.trackExpiry, n.variants.length])).toEqual([
      ["مسك أبيض", "STOCK", "PIECE", true, 2],
      ["شريط ستان", "MATERIAL", "METER", false, 1],
    ]);
    expect(p.lines.every((l) => l.variantId === null && l.newKey)).toBe(true);
    expect(p.lines[2]?.qty).toBe("25.5");
  });

  it("reports every problem with its Excel row number and writes nothing", () => {
    const p = plan([
      row("", "عطور نسائية", "", "", "", "", "", "", "", 1, 1),
      row("شيء", "قسم غير موجود", "", "", "", "", "", "", "", 1, 1),
      row("شيء", "ورود", "", "كيلو", "", "", "", "", "", 1, 1),
      row("شيء", "ورود", "", "", "", "", "", "", "", "1.5", 1),
      row("شيء", "ورود", "", "", "", "", "", "123", "", 1, 1),
      row("عطر ورد طائفي", "عطور نسائية", "", "", "50ml", "", "", "", "", 1, 1),
      row("عطر ورد طائفي", "عطور نسائية", "", "", "50ml", "", "", "", "", 2, 1),
    ]);
    expect(p.errors.map((e) => e.row)).toEqual([2, 3, 4, 5, 6, 8]);
    expect(p.errors[5]?.message).toContain("الصف 7");
  });

  it("a new product with several rows needs an option on each", () => {
    const p = plan([
      row("دبدوب", "ورود", "", "", "", "", "", "", "", 1, 10),
      row("دبدوب", "ورود", "", "", "", "كبير", "", "", "", 1, 20),
    ]);
    expect(p.errors[0]?.message).toContain("عدة صفوف");
  });

  it("skips blank rows and caps the file size", () => {
    expect(plan([row("", "", "", "", "", "", "", "", "", "", "")]).errors[0]?.message).toContain("فارغ");
    const big = Array.from({ length: 501 }, (_, i) => row(`ص${i}`, "ورود", "", "", "", "", "", "", "", 1, 1));
    expect(plan(big).errors[0]?.message).toContain("500");
  });
});
