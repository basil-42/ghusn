import { describe, expect, it } from "vitest";
import { monthsEndingAt, trendNotes, type TrendMonth } from "../src";

const m = (month: string, revenue: number, expenses: number, net: number, margin: number | null): TrendMonth => ({
  month,
  revenueUsd: revenue,
  grossProfitUsd: margin === null ? 0 : revenue * margin,
  expensesUsd: expenses,
  netProfitUsd: net,
  margin,
});

describe("monthsEndingAt", () => {
  it("walks back across year boundaries", () => {
    expect(monthsEndingAt("2026-02", 4)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(monthsEndingAt("2026-10", 1)).toEqual(["2026-10"]);
  });
});

describe("trendNotes", () => {
  it("flags three straight margin declines", () => {
    const notes = trendNotes([
      m("2026-05", 1000, 100, 300, 0.4),
      m("2026-06", 1000, 100, 300, 0.41),
      m("2026-07", 1000, 100, 300, 0.39),
      m("2026-08", 1000, 100, 300, 0.38),
      m("2026-09", 1000, 100, 300, 0.36),
    ]);
    expect(notes.find((n) => n.kind === "margin_down")).toEqual({
      kind: "margin_down",
      months: 3,
      from: "0.4100",
      to: "0.3600",
    });
  });

  it("does not flag two declines or a recovery", () => {
    const notes = trendNotes([
      m("2026-06", 1000, 100, 300, 0.41),
      m("2026-07", 1000, 100, 300, 0.39),
      m("2026-08", 1000, 100, 300, 0.38),
      m("2026-09", 1000, 100, 300, 0.4),
    ]);
    expect(notes.some((n) => n.kind === "margin_down")).toBe(false);
  });

  it("flags expenses growing 5+ points faster than sales (last 3 vs previous 3)", () => {
    const rows = [
      m("2026-04", 1000, 100, 1, 0.4),
      m("2026-05", 1000, 100, 2, 0.4),
      m("2026-06", 1000, 100, 3, 0.4),
      m("2026-07", 1090, 118, 4, 0.4),
      m("2026-08", 1090, 118, 5, 0.4),
      m("2026-09", 1090, 118, 6, 0.4),
    ];
    expect(trendNotes(rows).find((n) => n.kind === "expenses_outpace")).toEqual({
      kind: "expenses_outpace",
      expensesGrowth: "0.1800",
      revenueGrowth: "0.0900",
    });
    // فارق أقل من 5 نقاط
    rows[3] = m("2026-07", 1100, 112, 4, 0.4);
    rows[4] = m("2026-08", 1100, 112, 5, 0.4);
    rows[5] = m("2026-09", 1100, 112, 6, 0.4);
    expect(trendNotes(rows).some((n) => n.kind === "expenses_outpace")).toBe(false);
  });

  it("names best and worst months among months with sales", () => {
    const notes = trendNotes([
      m("2026-07", 0, 50, -50, null),
      m("2026-08", 900, 100, 120, 0.4),
      m("2026-09", 1200, 100, 260, 0.4),
    ]);
    expect(notes).toContainEqual({ kind: "best", month: "2026-09", netProfitUsd: "260.00" });
    expect(notes).toContainEqual({ kind: "worst", month: "2026-08", netProfitUsd: "120.00" });
    expect(trendNotes([m("2026-09", 1200, 100, 260, 0.4)])).toEqual([]);
  });
});
