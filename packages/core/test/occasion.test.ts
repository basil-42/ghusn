import { describe, expect, it } from "vitest";
import { isBannerDay, occasionSlug } from "../src";

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
