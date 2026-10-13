import { describe, expect, it } from "vitest";
import { addDays, dashboardBuckets, dashboardRange, isLowStock, percentChange, weekStartDay } from "../src";

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

describe("week start (D-133)", () => {
  it("finds the first day of the week for any start day", () => {
    // الثلاثاء 13 أكتوبر 2026
    expect(weekStartDay("2026-10-13", 6)).toBe("2026-10-10"); // السبت
    expect(weekStartDay("2026-10-13", 0)).toBe("2026-10-11"); // الأحد
    expect(weekStartDay("2026-10-13", 1)).toBe("2026-10-12"); // الاثنين
    expect(weekStartDay("2026-10-10", 6)).toBe("2026-10-10"); // اليوم نفسه بداية الأسبوع
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("dashboardRange (D-133)", () => {
  // الثلاثاء 13 أكتوبر 2026، 14:00 بتوقيت الخرطوم (UTC+2)
  const now = new Date("2026-10-13T12:00:00Z");
  const iso = (d: Date) => d.toISOString();

  it("today: from shop midnight, compared with the same hours yesterday, by hour", () => {
    const r = dashboardRange("today", now);
    expect(iso(r.start)).toBe("2026-10-12T22:00:00.000Z");
    expect(iso(r.prevStart)).toBe("2026-10-11T22:00:00.000Z");
    expect(iso(r.prevEnd)).toBe("2026-10-12T12:00:00.000Z");
    expect(r.bucket).toBe("hour");
    expect(r.complete).toBe(false);
  });

  it("this week (Saturday start): to date, compared with the same days of last week", () => {
    const r = dashboardRange("this-week", now, 6);
    expect(iso(r.start)).toBe("2026-10-09T22:00:00.000Z");
    expect(iso(r.periodEnd)).toBe("2026-10-16T22:00:00.000Z");
    expect(iso(r.prevStart)).toBe("2026-10-02T22:00:00.000Z");
    expect(iso(r.prevEnd)).toBe("2026-10-06T12:00:00.000Z");
    expect(r.end).toBe(now);
  });

  it("this week follows the configured start day", () => {
    expect(iso(dashboardRange("this-week", now, 0).start)).toBe("2026-10-10T22:00:00.000Z");
    expect(iso(dashboardRange("this-week", now, 1).start)).toBe("2026-10-11T22:00:00.000Z");
  });

  it("last week: the full week, compared with the full week before", () => {
    const r = dashboardRange("last-week", now, 6);
    expect(iso(r.start)).toBe("2026-10-02T22:00:00.000Z");
    expect(iso(r.end)).toBe("2026-10-09T22:00:00.000Z");
    expect(iso(r.prevStart)).toBe("2026-09-25T22:00:00.000Z");
    expect(iso(r.prevEnd)).toBe("2026-10-02T22:00:00.000Z");
    expect(r.complete).toBe(true);
  });

  it("this month: month to date, compared with the same span of last month", () => {
    const r = dashboardRange("this-month", now);
    expect(iso(r.start)).toBe("2026-09-30T22:00:00.000Z");
    expect(iso(r.prevStart)).toBe("2026-08-31T22:00:00.000Z");
    expect(iso(r.prevEnd)).toBe("2026-09-13T12:00:00.000Z");
    expect(iso(r.periodEnd)).toBe("2026-10-31T22:00:00.000Z");
  });

  it("this month never runs past the end of a shorter previous month", () => {
    const r = dashboardRange("this-month", new Date("2026-03-31T12:00:00Z"));
    expect(iso(r.prevEnd)).toBe("2026-02-28T22:00:00.000Z");
  });

  it("last month: September, compared with all of August", () => {
    const r = dashboardRange("last-month", now);
    expect(iso(r.start)).toBe("2026-08-31T22:00:00.000Z");
    expect(iso(r.end)).toBe("2026-09-30T22:00:00.000Z");
    expect(iso(r.prevStart)).toBe("2026-07-31T22:00:00.000Z");
    expect(iso(r.prevEnd)).toBe("2026-08-31T22:00:00.000Z");
  });

  it("last month in January reaches back across the year", () => {
    const r = dashboardRange("last-month", new Date("2027-01-05T12:00:00Z"));
    expect(iso(r.start)).toBe("2026-11-30T22:00:00.000Z");
    expect(iso(r.prevStart)).toBe("2026-10-31T22:00:00.000Z");
  });

  it("this year: to date by month, compared with the same span of last year", () => {
    const r = dashboardRange("this-year", now);
    expect(iso(r.start)).toBe("2025-12-31T22:00:00.000Z");
    expect(iso(r.prevStart)).toBe("2024-12-31T22:00:00.000Z");
    expect(r.prevEnd.getTime() - r.prevStart.getTime()).toBe(now.getTime() - r.start.getTime());
    expect(r.bucket).toBe("month");
  });

  it("last year: all of 2025, compared with all of 2024", () => {
    const r = dashboardRange("last-year", now);
    expect(iso(r.start)).toBe("2024-12-31T22:00:00.000Z");
    expect(iso(r.end)).toBe("2025-12-31T22:00:00.000Z");
    expect(iso(r.prevStart)).toBe("2023-12-31T22:00:00.000Z");
    expect(iso(r.prevEnd)).toBe("2024-12-31T22:00:00.000Z");
  });
});

describe("dashboardBuckets (D-133)", () => {
  const now = new Date("2026-10-13T12:00:00Z");

  it("today: 24 hours against yesterday's", () => {
    const b = dashboardBuckets(dashboardRange("today", now));
    expect(b.current).toHaveLength(24);
    expect(b.current[0]).toBe("2026-10-13T00");
    expect(b.previous[23]).toBe("2026-10-12T23");
  });

  it("this week: 7 days from the start day", () => {
    const b = dashboardBuckets(dashboardRange("this-week", now, 6));
    expect(b.current).toEqual([
      "2026-10-10",
      "2026-10-11",
      "2026-10-12",
      "2026-10-13",
      "2026-10-14",
      "2026-10-15",
      "2026-10-16",
    ]);
    expect(b.previous[0]).toBe("2026-10-03");
  });

  it("this month: every day of October against every day of September", () => {
    const b = dashboardBuckets(dashboardRange("this-month", now));
    expect(b.current).toHaveLength(31);
    expect(b.previous).toHaveLength(30);
    expect(b.previous[0]).toBe("2026-09-01");
  });

  it("this year: 12 months against last year's", () => {
    const b = dashboardBuckets(dashboardRange("this-year", now));
    expect(b.current).toHaveLength(12);
    expect(b.current[11]).toBe("2026-12");
    expect(b.previous[0]).toBe("2025-01");
  });
});
