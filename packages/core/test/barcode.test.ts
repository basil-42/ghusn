import { describe, expect, it } from "vitest";
import { checkBarcode, gtinCheckDigit, internalBarcode, isInternalBarcode, isValidGtin } from "../src";

describe("GTIN check digit", () => {
  it("matches known barcodes", () => {
    expect(isValidGtin("4006381333931")).toBe(true); // EAN-13 مثال GS1
    expect(isValidGtin("036000291452")).toBe(true); // UPC-A
    expect(isValidGtin("96385074")).toBe(true); // EAN-8
    expect(isValidGtin("4006381333932")).toBe(false);
    expect(gtinCheckDigit("400638133393")).toBe(1);
  });
});

describe("internal barcode", () => {
  it("builds a valid EAN-13 in the 200 range", () => {
    const code = internalBarcode(1);
    expect(code).toBe("2000000000015");
    expect(code).toHaveLength(13);
    expect(isValidGtin(code)).toBe(true);
    expect(isInternalBarcode(code)).toBe(true);
    expect(isInternalBarcode("4006381333931")).toBe(false);
  });
  it("pads large sequences and rejects out-of-range", () => {
    expect(internalBarcode(123456789)).toMatch(/^200123456789\d$/);
    expect(() => internalBarcode(0)).toThrow();
    expect(() => internalBarcode(1_000_000_000)).toThrow();
  });
});

describe("checkBarcode", () => {
  it("accepts manufacturer codes and trims", () => {
    expect(checkBarcode(" 4006381333931 ")).toEqual({ ok: true, value: "4006381333931" });
    expect(checkBarcode("ABC-1234")).toEqual({ ok: true, value: "ABC-1234" });
    expect(checkBarcode("٤٠٠٦٣٨١٣٣٣٩٣١")).toEqual({ ok: true, value: "4006381333931" });
  });
  it("catches typos in standard lengths", () => {
    expect(checkBarcode("4006381333932")).toEqual({ ok: false, reason: "CHECK_DIGIT" });
  });
  it("rejects bad formats", () => {
    expect(checkBarcode("12")).toEqual({ ok: false, reason: "FORMAT" });
    expect(checkBarcode("عطر")).toEqual({ ok: false, reason: "FORMAT" });
  });
});
