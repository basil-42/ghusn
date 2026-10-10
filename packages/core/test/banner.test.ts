import { describe, expect, it } from "vitest";
import { bannerPeriod, bannerWindow, isValidBannerWindow } from "../src/banner";

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

describe("bannerPeriod", () => {
  it("describes permanent, running, scheduled and ended banners", () => {
    expect(bannerPeriod("2026-10-10", null, null)).toEqual({ kind: "always" });
    expect(bannerPeriod("2026-10-10", "2026-10-01", null)).toEqual({ kind: "always" });
    expect(bannerPeriod("2026-10-10", null, "2026-10-27")).toEqual({ kind: "until", end: "2026-10-27", daysLeft: 17 });
    expect(bannerPeriod("2026-10-27", null, "2026-10-27")).toEqual({ kind: "until", end: "2026-10-27", daysLeft: 0 });
    expect(bannerPeriod("2026-10-10", "2026-11-01", "2026-11-30")).toEqual({
      kind: "starts",
      start: "2026-11-01",
      daysUntil: 22,
    });
    expect(bannerPeriod("2026-10-10", null, "2026-09-30")).toEqual({ kind: "ended", end: "2026-09-30" });
  });
});
