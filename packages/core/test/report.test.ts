import { describe, expect, it } from "vitest";
import { capitalRecovery, monthProfit, shiftDifference, totalsByCurrency } from "../src";

const s = (d: { toString(): string } | null) => (d === null ? null : d.toString());

describe("monthProfit", () => {
  it("reference scenario week 1: 624.00 revenue − 374.05 cost = 249.95", () => {
    const p = monthProfit({
      revenueUsd: "624.00",
      refundUsd: 0,
      cogsUsd: "374.05",
      restockCostUsd: 0,
      expensesUsd: 0,
      stockLossUsd: 0,
      cashDifferenceUsd: 0,
    });
    expect(s(p.grossProfitUsd)).toBe("249.95");
    expect(p.grossMargin?.mul(100).toFixed(1)).toBe("40.1");
  });
  it("returns reverse revenue and restocked cost; expenses and losses reduce net profit", () => {
    const p = monthProfit({
      revenueUsd: 1000,
      refundUsd: 100,
      cogsUsd: 600,
      restockCostUsd: 55,
      expensesUsd: 150,
      stockLossUsd: 20,
      cashDifferenceUsd: 0,
    });
    expect(s(p.netRevenueUsd)).toBe("900");
    expect(s(p.netCogsUsd)).toBe("545");
    expect(s(p.grossProfitUsd)).toBe("355");
    expect(s(p.netProfitUsd)).toBe("185");
  });
});

describe("capitalRecovery (D-83)", () => {
  it("all profit repays capital first — nothing distributed", () => {
    const r = capitalRecovery({ capitalUsd: 10_000, profitBeforeUsd: 2_000, monthProfitUsd: 1_500 });
    expect([s(r.recoveredUsd), s(r.remainingUsd), s(r.toCapitalThisMonthUsd), s(r.distributableUsd)]).toEqual([
      "3500",
      "6500",
      "1500",
      "0",
    ]);
    expect(r.fullyRecovered).toBe(false);
  });
  it("the month that finishes recovery splits only the excess, 25% each", () => {
    const r = capitalRecovery({ capitalUsd: 10_000, profitBeforeUsd: 9_600, monthProfitUsd: 1_000 });
    expect(s(r.toCapitalThisMonthUsd)).toBe("400");
    expect(s(r.distributableUsd)).toBe("600");
    expect(s(r.perPartnerUsd)).toBe("150");
    expect(r.fullyRecovered).toBe(true);
  });
  it("after recovery everything is distributable", () => {
    const r = capitalRecovery({ capitalUsd: 10_000, profitBeforeUsd: 12_000, monthProfitUsd: 800 });
    expect(s(r.distributableUsd)).toBe("800");
    expect(s(r.perPartnerUsd)).toBe("200");
  });
  it("a losing month raises what is left to recover and distributes nothing", () => {
    const r = capitalRecovery({ capitalUsd: 10_000, profitBeforeUsd: 3_000, monthProfitUsd: -500 });
    expect(s(r.remainingUsd)).toBe("7500");
    expect(s(r.toCapitalThisMonthUsd)).toBe("-500");
    expect(s(r.distributableUsd)).toBe("0");
  });
});

describe("totalsByCurrency", () => {
  it("groups original amounts", () => {
    const t = totalsByCurrency([
      { currencyCode: "SDG", amount: 150_000 },
      { currencyCode: "QAR", amount: 300 },
      { currencyCode: "SDG", amount: 15_000 },
    ]);
    expect(t.map((x) => `${x.currencyCode}:${s(x.amount)}`)).toEqual(["SDG:165000", "QAR:300"]);
  });
});

describe("cash differences (D-87)", () => {
  it("net shift differences change net profit by their sign", () => {
    const base = { revenueUsd: 1000, refundUsd: 0, cogsUsd: 600, restockCostUsd: 0, expensesUsd: 100, stockLossUsd: 0 };
    expect(s(monthProfit({ ...base, cashDifferenceUsd: 0 }).netProfitUsd)).toBe("300");
    expect(s(monthProfit({ ...base, cashDifferenceUsd: "-12.50" }).netProfitUsd)).toBe("287.5");
    expect(s(monthProfit({ ...base, cashDifferenceUsd: "2" }).netProfitUsd)).toBe("302");
  });
  it("shift difference in USD at the close rate: 10,000 SDG short @2,500 = −4.00 $", () => {
    const d = shiftDifference({ expectedSdg: "155000", countedSdg: "145000", sdgPerUsd: "2500" });
    expect(s(d.differenceSdg)).toBe("-10000");
    expect(s(d.differenceUsd)).toBe("-4");
    expect(s(shiftDifference({ expectedSdg: "1000", countedSdg: "1000", sdgPerUsd: "2500" }).differenceUsd)).toBe("0");
  });
});
