import { describe, expect, it } from "vitest";
import { formatSku, slugify, validateVariants, variantLabel } from "../src";

describe("validateVariants", () => {
  it("allows a single variant without options", () => {
    expect(validateVariants([{}])).toEqual([]);
  });
  it("requires options when there are several variants", () => {
    expect(validateVariants([{ size: "S" }, { size: "  " }])).toEqual([{ code: "MISSING_OPTIONS", index: 1 }]);
  });
  it("detects duplicate combinations after normalization", () => {
    expect(
      validateVariants([
        { color: "أحمر", size: "L" },
        { color: "احمر ", size: "L" },
      ]),
    ).toEqual([{ code: "DUPLICATE_OPTIONS", index: 1, duplicateOf: 0 }]);
    expect(
      validateVariants([
        { color: "أحمر", size: "L" },
        { color: "أحمر", size: "M" },
      ]),
    ).toEqual([]);
  });
  it("detects duplicate barcodes within the product", () => {
    expect(
      validateVariants([
        { size: "S", barcode: "123456" },
        { size: "M", barcode: " 123456" },
      ]),
    ).toEqual([{ code: "DUPLICATE_BARCODE", index: 1, duplicateOf: 0 }]);
  });
  it("rejects empty and oversized lists", () => {
    expect(validateVariants([])).toEqual([{ code: "NO_VARIANTS" }]);
    const many = Array.from({ length: 51 }, (_, i) => ({ size: String(i) }));
    expect(validateVariants(many)).toEqual([{ code: "TOO_MANY_VARIANTS", max: 50 }]);
  });
});

describe("helpers", () => {
  it("labels variants", () => {
    expect(variantLabel({ volume: "100ml", color: " أحمر ", size: null })).toBe("100ml · أحمر");
    expect(variantLabel({})).toBe("");
  });
  it("formats SKUs and slugs", () => {
    expect(formatSku(7)).toBe("GH-00007");
    expect(formatSku(123456)).toBe("GH-123456");
    expect(slugify("Women's Perfumes!")).toBe("women-s-perfumes");
    expect(slugify("Café Gifts")).toBe("cafe-gifts");
  });
});
