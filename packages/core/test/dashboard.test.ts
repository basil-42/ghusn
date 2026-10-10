import { describe, expect, it } from "vitest";
import { dashboardRange, isLowStock, percentChange } from "../src";

describe("dashboard (D-94)", () => {
  it("compares two periods as a ratio", () => {
    expect(percentChange("125000", "100000")?.toString()).toBe("0.25");
    expect(percentChange("50000", "100000")?.toString()).toBe("-0.5");
    expect(percentChange("50000", "0")).toBeNull();
  });
  it("uses the product threshold, else the global one", () => {
    expect(isLowStock("3", null, "3")).toBe(true);
    expect(isLowStock("4", null, "3")).toBe(false);
    expect(isLowStock("4", "5", "3")).toBe(true);
    expect(isLowStock("1", "0", "3")).toBe(false);
  });
});

describe("dashboardRange", () => {
  // 10 أكتوبر 2026، 14:00 بتوقيت الخرطوم (UTC+2)
  const now = new Date("2026-10-10T12:00:00Z");

  it("today: from shop midnight, compared with the same hours yesterday", () => {
    const r = dashboardRange("today", now);
    expect(r.start.toISOString()).toBe("2026-10-09T22:00:00.000Z");
    expect(r.prevStart.toISOString()).toBe("2026-10-08T22:00:00.000Z");
    expect(r.prevEnd.toISOString()).toBe("2026-10-09T12:00:00.000Z");
  });

  it("week: today and the six days before, compared with the seven before", () => {
    const r = dashboardRange("week", now);
    expect(r.start.toISOString()).toBe("2026-10-03T22:00:00.000Z");
    expect(r.prevStart.toISOString()).toBe("2026-09-26T22:00:00.000Z");
    expect(r.prevEnd.toISOString()).toBe("2026-10-03T12:00:00.000Z");
  });

  it("month: month to date, compared with the same span of last month", () => {
    const r = dashboardRange("month", now);
    expect(r.start.toISOString()).toBe("2026-09-30T22:00:00.000Z");
    expect(r.prevStart.toISOString()).toBe("2026-08-31T22:00:00.000Z");
    expect(r.prevEnd.toISOString()).toBe("2026-09-10T12:00:00.000Z");
  });

  it("month: never runs past the end of a shorter previous month", () => {
    const r = dashboardRange("month", new Date("2026-03-31T12:00:00Z"));
    expect(r.prevEnd.getTime()).toBeLessThanOrEqual(new Date("2026-02-28T22:00:00Z").getTime());
  });
});
