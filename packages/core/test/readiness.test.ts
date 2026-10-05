import { describe, expect, it } from "vitest";
import { storeReadiness } from "../src";

const ready = {
  hasPrice: true,
  imageCount: 2,
  nameEn: "Rose bouquet",
  descriptionAr: "باقة ورد",
  descriptionEn: "A rose bouquet",
  occasionCount: 1,
};

describe("storeReadiness (D-106)", () => {
  it("returns nothing for a complete product", () => {
    expect(storeReadiness(ready)).toEqual([]);
  });

  it("lists every missing item in display order", () => {
    expect(
      storeReadiness({
        hasPrice: false,
        imageCount: 0,
        nameEn: null,
        descriptionAr: null,
        descriptionEn: null,
        occasionCount: 0,
      }),
    ).toEqual(["price", "image", "nameEn", "descriptionAr", "descriptionEn", "occasion"]);
  });

  it("treats whitespace-only text as missing", () => {
    expect(storeReadiness({ ...ready, descriptionEn: "   ", nameEn: "" })).toEqual(["nameEn", "descriptionEn"]);
  });

  it("flags only the English description when the Arabic one exists", () => {
    expect(storeReadiness({ ...ready, descriptionEn: null })).toEqual(["descriptionEn"]);
  });
});
