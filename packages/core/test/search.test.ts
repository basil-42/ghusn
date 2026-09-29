import { describe, expect, it } from "vitest";
import { buildSearchText, normalizeArabic, searchTerms } from "../src";

describe("normalizeArabic", () => {
  it("ignores hamza, ta marbuta, alef maqsura and tashkeel", () => {
    expect(normalizeArabic("عطر ورد طائفي")).toBe(normalizeArabic("عطر ورد طايفى"));
    expect(normalizeArabic("وَرْدَة")).toBe("ورده");
    expect(normalizeArabic("إسوارة أنيقة")).toBe("اسواره انيقه");
    expect(normalizeArabic("مـــسك")).toBe("مسك");
  });
  it("lowercases latin and converts Arabic digits", () => {
    expect(normalizeArabic("Oud  ROYAL ١٠٠ml")).toBe("oud royal 100ml");
  });
});

describe("search", () => {
  it("builds one line from parts and splits queries into terms", () => {
    expect(buildSearchText(["عطر عود", null, "Royal Oud", "GH-00001"])).toBe("عطر عود royal oud gh-00001");
    expect(searchTerms("  عطر   العود ")).toEqual(["عطر", "العود"]);
    expect(searchTerms("")).toEqual([]);
  });
});
