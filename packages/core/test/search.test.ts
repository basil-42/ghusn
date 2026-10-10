import { describe, expect, it } from "vitest";
import { buildSearchText, matchRanges, normalizeArabic, numericQuery, searchTerms, stripArticle } from "../src";

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

describe("numericQuery", () => {
  it("returns digits for phone and document-number queries only", () => {
    expect(numericQuery("0912 345-678")).toBe("0912345678");
    expect(numericQuery("+249 912 345 678")).toBe("249912345678");
    expect(numericQuery("١٥٥")).toBe("155");
    expect(numericQuery("12")).toBeNull();
    expect(numericQuery("عطر 50")).toBeNull();
    expect(numericQuery("GHS-155")).toBeNull();
  });
});

describe("matchRanges", () => {
  it("finds normalized terms at their original positions", () => {
    expect(matchRanges("عطر المسك", searchTerms("مسك"))).toEqual([[6, 9]]);
    // التشكيل داخل الكلمة يبقى ضمن التظليل
    expect(matchRanges("مِسك", searchTerms("مسك"))).toEqual([[0, 4]]);
    expect(matchRanges("أحمد", searchTerms("احمد"))).toEqual([[0, 4]]);
  });
  it("merges overlapping ranges and handles several terms", () => {
    expect(matchRanges("Royal Oud", searchTerms("oud roy"))).toEqual([
      [0, 3],
      [6, 9],
    ]);
    expect(matchRanges("aaa", ["aa"])).toEqual([[0, 2]]);
    expect(matchRanges("abc", [])).toEqual([]);
  });
});

describe("stripArticle", () => {
  it("drops the definite article from longer terms only", () => {
    expect(stripArticle("العطر")).toBe("عطر");
    expect(stripArticle("الورد")).toBe("ورد");
    expect(stripArticle("الف")).toBe("الف");
    expect(stripArticle("عطر")).toBe("عطر");
  });
});
