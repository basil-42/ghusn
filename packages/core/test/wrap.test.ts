import { describe, expect, it } from "vitest";
import { effectiveWrapSize, lowestWrapPrice, quoteWrap, wrapMaterialNeeds } from "../src/wrap";

const regular = { SMALL: 5000, MEDIUM: 10000, LARGE: 15000 };

describe("quoteWrap (D-165)", () => {
  it("prices each wrappable piece by its size and skips unwrappable ones", () => {
    const q = quoteWrap(
      [
        { key: "perfume", qty: 1, size: "SMALL" },
        { key: "bear", qty: 2, size: "LARGE" },
        { key: "roses", qty: 1, size: "NONE" },
      ],
      regular,
    );
    expect(q.available).toBe(true);
    if (!q.available) return;
    expect(q.totalSdg.toFixed(0)).toBe("35000");
    expect(q.lines.map((l) => [l.key, l.lineTotalSdg.toFixed(0)])).toEqual([
      ["perfume", "5000"],
      ["bear", "30000"],
    ]);
    expect(q.skipped).toEqual(["roses"]);
  });

  it("is unavailable when nothing in the order can be wrapped", () => {
    const q = quoteWrap([{ key: "roses", qty: 1, size: "NONE" }], regular);
    expect(q).toMatchObject({ available: false, reason: "NOTHING_TO_WRAP" });
  });

  it("is unavailable when a size in the order has no price (no partial wrapping)", () => {
    const q = quoteWrap(
      [
        { key: "perfume", qty: 1, size: "SMALL" },
        { key: "bear", qty: 1, size: "LARGE" },
      ],
      { SMALL: 12000, MEDIUM: 23000, LARGE: 0 },
    );
    expect(q).toMatchObject({ available: false, reason: "SIZE_UNPRICED" });
  });
});

describe("wrap helpers", () => {
  it("uses the product size, else the category default", () => {
    expect(effectiveWrapSize(null, "LARGE")).toBe("LARGE");
    expect(effectiveWrapSize("NONE", "LARGE")).toBe("NONE");
  });

  it("finds the lowest priced size", () => {
    expect(lowestWrapPrice({ SMALL: 0, MEDIUM: "23000", LARGE: 35000 })?.toFixed(0)).toBe("23000");
    expect(lowestWrapPrice({ SMALL: 0, MEDIUM: 0, LARGE: 0 })).toBeNull();
  });

  it("aggregates material needs per variant across pieces", () => {
    const needs = wrapMaterialNeeds(
      [
        { size: "SMALL", qty: 2 },
        { size: "LARGE", qty: 1 },
      ],
      [
        { size: "SMALL", variantId: "paper", qty: 1 },
        { size: "SMALL", variantId: "ribbon", qty: "0.5" },
        { size: "LARGE", variantId: "paper", qty: 3 },
        { size: "MEDIUM", variantId: "paper", qty: 2 },
      ],
    );
    expect(Object.fromEntries([...needs].map(([k, v]) => [k, v.toString()]))).toEqual({ paper: "5", ribbon: "1" });
  });
});
