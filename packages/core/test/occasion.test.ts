import { describe, expect, it } from "vitest";
import { addDays, isBannerDay, occasionSlug, pickSeasonTile } from "../src";

describe("occasions (D-92)", () => {
  it("builds a clean slug or rejects it", () => {
    expect(occasionSlug("Mother's Day")).toBe("mothers-day");
    expect(occasionSlug("  New_Baby  ")).toBe("new-baby");
    expect(occasionSlug("عيد")).toBeNull();
    expect(occasionSlug("a")).toBeNull();
  });
  it("shows the banner on the start and end days inclusive", () => {
    expect(isBannerDay("2027-03-21", "2027-03-14", "2027-03-21")).toBe(true);
    expect(isBannerDay("2027-03-14", "2027-03-14", "2027-03-21")).toBe(true);
    expect(isBannerDay("2027-03-22", "2027-03-14", "2027-03-21")).toBe(false);
    expect(isBannerDay("2027-03-15", null, "2027-03-21")).toBe(false);
    expect(isBannerDay("2027-03-15", "2027-03-21", "2027-03-14")).toBe(false);
  });
});

describe("home season tile (D-102)", () => {
  const mom = { start: "2027-03-14", end: "2027-03-21", hasProducts: true };
  const love = { start: "2027-02-07", end: "2027-02-14", hasProducts: true };
  const baby = { start: null, end: null, hasProducts: true };
  const empty = { start: null, end: null, hasProducts: false };

  it("adds days across months", () => {
    expect(addDays("2027-02-25", 14)).toBe("2027-03-11");
  });
  it("prefers a live season", () => {
    expect(pickSeasonTile("2027-03-15", [baby, love, mom])).toEqual({ index: 2, state: "live" });
  });
  it("shows the nearest season starting within 14 days as soon", () => {
    expect(pickSeasonTile("2027-01-25", [baby, mom, love])).toEqual({ index: 2, state: "soon" });
    expect(pickSeasonTile("2027-02-28", [baby, love, mom])).toEqual({ index: 2, state: "soon" });
    // يبدأ بعد 15 يوماً — ليس «قريباً» بعد
    expect(pickSeasonTile("2027-01-23", [baby, love])).toEqual({ index: 0, state: "default" });
  });
  it("falls back to the first occasion with products", () => {
    expect(pickSeasonTile("2027-06-01", [empty, baby, mom])).toEqual({ index: 1, state: "default" });
    expect(pickSeasonTile("2027-06-01", [empty])).toBeNull();
  });
});
