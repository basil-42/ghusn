import { describe, expect, it } from "vitest";
import {
  CoreError,
  adjustmentDirection,
  adjustmentNoteRequired,
  canApproveAdjustment,
  countDifference,
  estimateAdjustmentUsd,
  fullCountDue,
  qtyAfterCount,
  summarizeCount,
  weeklySection,
  planAdjustment,
  signedAdjustmentQty,
} from "../src";

describe("signedAdjustmentQty", () => {
  it("makes losses negative and found stock positive", () => {
    expect(signedAdjustmentQty("DAMAGED", "1").toFixed()).toBe("-1");
    expect(signedAdjustmentQty("EXPIRED", "2").toFixed()).toBe("-2");
    expect(signedAdjustmentQty("LOST", "3").toFixed()).toBe("-3");
    expect(signedAdjustmentQty("INTERNAL_USE", "0.5").toFixed()).toBe("-0.5");
    expect(signedAdjustmentQty("FOUND", "1").toFixed()).toBe("1");
  });

  it("keeps a count difference signed as given", () => {
    expect(signedAdjustmentQty("COUNT", "-2").toFixed()).toBe("-2");
    expect(signedAdjustmentQty("COUNT", "4").toFixed()).toBe("4");
    expect(() => signedAdjustmentQty("COUNT", "0")).toThrow(CoreError);
  });

  it("rejects zero or negative input for manual reasons", () => {
    expect(() => signedAdjustmentQty("DAMAGED", "0")).toThrow(CoreError);
    expect(() => signedAdjustmentQty("FOUND", "-1")).toThrow(CoreError);
  });

  it("knows direction and which reasons need a note", () => {
    expect(adjustmentDirection("FOUND")).toBe(1);
    expect(adjustmentDirection("DAMAGED")).toBe(-1);
    expect(adjustmentDirection("COUNT")).toBe(0);
    expect(adjustmentNoteRequired("LOST")).toBe(true);
    expect(adjustmentNoteRequired("FOUND")).toBe(true);
    expect(adjustmentNoteRequired("DAMAGED")).toBe(false);
  });
});

describe("canApproveAdjustment — المديرة حتى الحد، والمالك بلا حد", () => {
  const limitUsd = "50";
  it("manager approves up to and including the limit", () => {
    expect(canApproveAdjustment({ valueUsd: "6.80", limitUsd, canApprove: true, unlimited: false })).toBe(true);
    expect(canApproveAdjustment({ valueUsd: "-50.00", limitUsd, canApprove: true, unlimited: false })).toBe(true);
    expect(canApproveAdjustment({ valueUsd: "-67.50", limitUsd, canApprove: true, unlimited: false })).toBe(false);
  });
  it("owner approves anything, staff nothing", () => {
    expect(canApproveAdjustment({ valueUsd: "-9999", limitUsd, canApprove: true, unlimited: true })).toBe(true);
    expect(canApproveAdjustment({ valueUsd: "1", limitUsd, canApprove: false, unlimited: false })).toBe(false);
  });
});

describe("estimateAdjustmentUsd", () => {
  it("uses the average cost, or the entered cost when there is none", () => {
    expect(estimateAdjustmentUsd("-3", "22.5").toFixed(2)).toBe("67.50");
    expect(estimateAdjustmentUsd("2", "0", "4.10").toFixed(2)).toBe("8.20");
    expect(estimateAdjustmentUsd("2", "0").toFixed(2)).toBe("0.00");
  });
});

describe("planAdjustment", () => {
  it("damaged teddy: stock 9 → 8, average unchanged, loss 6.80", () => {
    const p = planAdjustment({ qty: "-1", levelQty: "9", avgCostUsd: "6.800000" });
    expect(p.qtyAfter.toFixed()).toBe("8");
    expect(p.avgAfterUsd.toFixed(6)).toBe("6.800000");
    expect(p.valueUsd.toFixed(2)).toBe("-6.80");
    expect(p.expenseUsd.toFixed(2)).toBe("6.80");
    expect(p.costEntered).toBe(false);
  });

  it("cannot remove more than is on hand, or anything from negative stock", () => {
    expect(() => planAdjustment({ qty: "-4", levelQty: "3", avgCostUsd: "1" })).toThrow(
      expect.objectContaining({ code: "INSUFFICIENT_STOCK" }),
    );
    expect(() => planAdjustment({ qty: "-1", levelQty: "-1", avgCostUsd: "1" })).toThrow(
      expect.objectContaining({ code: "INSUFFICIENT_STOCK" }),
    );
    expect(planAdjustment({ qty: "-3", levelQty: "3", avgCostUsd: "1" }).qtyAfter.toFixed()).toBe("0");
  });

  it("found stock enters at the current average and counts as a gain", () => {
    const p = planAdjustment({ qty: "1", levelQty: "10", avgCostUsd: "4.100000", enteredUnitCostUsd: "99" });
    expect(p.qtyAfter.toFixed()).toBe("11");
    expect(p.unitCostUsd.toFixed(6)).toBe("4.100000");
    expect(p.avgAfterUsd.toFixed(6)).toBe("4.100000");
    expect(p.valueUsd.toFixed(2)).toBe("4.10");
    expect(p.expenseUsd.toFixed(2)).toBe("-4.10");
    expect(p.costEntered).toBe(false);
  });

  it("an item without cost needs an entered unit cost (no free stock)", () => {
    expect(() => planAdjustment({ qty: "2", levelQty: "0", avgCostUsd: "0" })).toThrow(
      expect.objectContaining({ code: "COST_REQUIRED" }),
    );
    expect(() => planAdjustment({ qty: "2", levelQty: "0", avgCostUsd: "0", enteredUnitCostUsd: "0" })).toThrow(
      expect.objectContaining({ code: "COST_REQUIRED" }),
    );
    const p = planAdjustment({ qty: "2", levelQty: "0", avgCostUsd: "0", enteredUnitCostUsd: "4.10" });
    expect(p.avgAfterUsd.toFixed(6)).toBe("4.100000");
    expect(p.valueUsd.toFixed(2)).toBe("8.20");
    expect(p.costEntered).toBe(true);
  });

  it("a count surplus fixes negative stock from offline sales", () => {
    const p = planAdjustment({ qty: "4", levelQty: "-1", avgCostUsd: "2.900000" });
    expect(p.qtyAfter.toFixed()).toBe("3");
    expect(p.avgAfterUsd.toFixed(6)).toBe("2.900000");
    expect(p.valueUsd.toFixed(2)).toBe("11.60");
  });

  it("rejects a zero quantity", () => {
    expect(() => planAdjustment({ qty: "0", levelQty: "5", avgCostUsd: "1" })).toThrow(CoreError);
  });
});

describe("stock count (D-112)", () => {
  it("compares with system stock at the moment of counting, applied to current stock", () => {
    // عُدّ 13 والنظام 14 وقتها، ثم بيعت قطعة (النظام 13 الآن) ← النتيجة 12
    const diff = countDifference("13", "14");
    expect(diff.toFixed()).toBe("-1");
    expect(qtyAfterCount("13", diff).toFixed()).toBe("12");
    // المقارنة بالرصيد الحالي كانت ستُخفي القطعة الضائعة
    expect(countDifference("13", "13").toFixed()).toBe("0");
  });

  it("summarizes shortages, surpluses and the net value", () => {
    const s = summarizeCount([
      { difference: "-1", unitCostUsd: "14.2" },
      { difference: "-2", unitCostUsd: "5.8" },
      { difference: "-1", unitCostUsd: "3.2" },
      { difference: "4", unitCostUsd: "2.9" },
      { difference: "0", unitCostUsd: "18" },
    ]);
    expect(s.matched).toBe(1);
    expect(s.shortageLines).toBe(3);
    expect(s.surplusLines).toBe(1);
    expect(s.shortageUsd.toFixed(2)).toBe("29.00");
    expect(s.surplusUsd.toFixed(2)).toBe("11.60");
    expect(s.netUsd.toFixed(2)).toBe("-17.40");
  });

  it("a count shortage may take stock below zero (sold after counting)", () => {
    expect(() => planAdjustment({ qty: "-2", levelQty: "1", avgCostUsd: "5" })).toThrow(CoreError);
    const p = planAdjustment({ qty: "-2", levelQty: "1", avgCostUsd: "5", allowNegative: true });
    expect(p.qtyAfter.toFixed()).toBe("-1");
    expect(p.expenseUsd.toFixed(2)).toBe("10.00");
  });

  it("knows when a full count is due", () => {
    const now = new Date("2026-10-06T08:00:00Z");
    expect(fullCountDue(null, now)).toBe(true);
    expect(fullCountDue(new Date("2026-08-01T08:00:00Z"), now)).toBe(false);
    expect(fullCountDue(new Date("2026-07-08T08:00:00Z"), now)).toBe(true);
  });

  it("rotates the weekly section: never counted first, then the oldest", () => {
    const a = { id: "a", lastCountedAt: new Date("2026-09-01") };
    const b = { id: "b", lastCountedAt: new Date("2026-08-01") };
    const c = { id: "c", lastCountedAt: null };
    expect(weeklySection([a, b, c])?.id).toBe("c");
    expect(weeklySection([a, b])?.id).toBe("b");
    expect(weeklySection([])).toBeNull();
  });
});
