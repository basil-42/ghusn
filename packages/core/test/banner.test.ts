import { describe, expect, it } from "vitest";
import { bannerWindow, isValidBannerWindow } from "../src/banner";

describe("home banners (D-101)", () => {
  it("is live with no dates", () => {
    expect(bannerWindow("2026-10-04", null, null)).toBe("live");
  });
  it("respects inclusive start and end days", () => {
    expect(bannerWindow("2026-10-31", "2026-11-01", "2026-11-30")).toBe("scheduled");
    expect(bannerWindow("2026-11-01", "2026-11-01", "2026-11-30")).toBe("live");
    expect(bannerWindow("2026-11-30", "2026-11-01", "2026-11-30")).toBe("live");
    expect(bannerWindow("2026-12-01", "2026-11-01", "2026-11-30")).toBe("ended");
  });
  it("supports open-ended windows", () => {
    expect(bannerWindow("2026-10-04", "2026-10-05", null)).toBe("scheduled");
    expect(bannerWindow("2027-01-01", "2026-10-05", null)).toBe("live");
    expect(bannerWindow("2026-10-04", null, "2026-10-03")).toBe("ended");
  });
  it("rejects an end before the start", () => {
    expect(isValidBannerWindow("2026-11-02", "2026-11-01")).toBe(false);
    expect(isValidBannerWindow("2026-11-01", "2026-11-01")).toBe(true);
    expect(isValidBannerWindow(null, "2026-11-01")).toBe(true);
  });
});
