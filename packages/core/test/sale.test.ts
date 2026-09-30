import { describe, expect, it } from "vitest";
import { allocateWhole, checkDiscount, computeSale, expectedCash, percentOf, settlePayments, sum } from "../src";

const s = (d: { toString(): string }) => d.toString();

describe("computeSale", () => {
  it("totals without discounts (reference prices 120,000 and 200,000)", () => {
    const t = computeSale([
      { key: "rose", qty: 2, unitPriceSdg: 120_000, lineDiscountSdg: 0 },
      { key: "oud", qty: 1, unitPriceSdg: 200_000, lineDiscountSdg: 0 },
    ]);
    expect(s(t.subtotalSdg)).toBe("440000");
    expect(s(t.totalSdg)).toBe("440000");
    expect(s(t.discountSdg)).toBe("0");
  });

  it("applies a line discount then spreads the invoice discount by value, in whole pounds", () => {
    const t = computeSale(
      [
        { key: "a", qty: 1, unitPriceSdg: 10_000, lineDiscountSdg: 1_000 },
        { key: "b", qty: 1, unitPriceSdg: 5_000, lineDiscountSdg: 0 },
        { key: "c", qty: 1, unitPriceSdg: 5_000, lineDiscountSdg: 0 },
      ],
      1_000,
    );
    // بعد خصم السطر: 9,000 + 5,000 + 5,000 = 19,000؛ خصم الفاتورة 1,000 ← 474 + 263 + 263
    expect(t.lines.map((l) => s(l.invoiceDiscountSdg))).toEqual(["474", "263", "263"]);
    expect(s(sum(t.lines.map((l) => l.invoiceDiscountSdg)))).toBe("1000");
    expect(s(t.totalSdg)).toBe("18000");
    expect(s(sum(t.lines.map((l) => l.netSdg)))).toBe("18000");
    expect(s(t.discountSdg)).toBe("2000");
  });

  it("rejects bad input", () => {
    expect(() => computeSale([])).toThrow();
    expect(() => computeSale([{ key: "a", qty: 0, unitPriceSdg: 1_000, lineDiscountSdg: 0 }])).toThrow();
    expect(() => computeSale([{ key: "a", qty: 1, unitPriceSdg: 1_000, lineDiscountSdg: 1_001 }])).toThrow();
    expect(() => computeSale([{ key: "a", qty: 1, unitPriceSdg: 1_000, lineDiscountSdg: 0 }], 1_001)).toThrow();
    expect(() => computeSale([{ key: "a", qty: 1, unitPriceSdg: "999.5", lineDiscountSdg: 0 }])).toThrow();
  });
});

describe("helpers", () => {
  it("percent discounts round down to whole pounds", () => {
    expect(s(percentOf(125_000, 10))).toBe("12500");
    expect(s(percentOf(9_999, 10))).toBe("999");
    expect(() => percentOf(1_000, 101)).toThrow();
  });
  it("largest-remainder allocation always sums exactly", () => {
    const parts = allocateWhole(100, [1, 1, 1]);
    expect(parts.map(s)).toEqual(["34", "33", "33"]);
    expect(s(sum(allocateWhole(7, [3, 3, 3, 1])))).toBe("7");
  });
});

describe("checkDiscount (D-80)", () => {
  const rate = 2500;
  // ورد: تكلفة 28.77$ = 71,925 ج.س @2500
  const line = (netSdg: number) => [{ key: "rose", qty: 1, netSdg, avgCostUsd: "28.77" }];
  it("within 10% and above cost → staff may proceed", () => {
    const c = checkDiscount({
      subtotalSdg: 120_000,
      discountSdg: 12_000,
      maxDiscountPercent: 10,
      sdgPerUsd: rate,
      lines: line(108_000),
    });
    expect(c.needsApproval).toBe(false);
  });
  it("over the limit → approval", () => {
    const c = checkDiscount({
      subtotalSdg: 120_000,
      discountSdg: 12_500,
      maxDiscountPercent: 10,
      sdgPerUsd: rate,
      lines: line(107_500),
    });
    expect(c.overLimit).toBe(true);
    expect(c.needsApproval).toBe(true);
  });
  it("below cost → approval even under the limit", () => {
    const c = checkDiscount({
      subtotalSdg: 80_000,
      discountSdg: 8_000,
      maxDiscountPercent: 10,
      sdgPerUsd: rate,
      lines: line(72_000 - 100),
    });
    expect(c.overLimit).toBe(false);
    expect(c.belowCost).toEqual(["rose"]);
  });
  it("no discount → never flagged as below cost (list price is the pricing board's job)", () => {
    const c = checkDiscount({
      subtotalSdg: 50_000,
      discountSdg: 0,
      maxDiscountPercent: 10,
      sdgPerUsd: rate,
      lines: line(50_000),
    });
    expect(c.needsApproval).toBe(false);
  });
});

describe("payments and shift cash", () => {
  it("split payment must equal the total; change only from cash", () => {
    const p = settlePayments({
      totalSdg: 320_000,
      payments: [
        { method: "CASH", amountSdg: 120_000 },
        { method: "BANKAK", amountSdg: 200_000 },
      ],
      cashTenderedSdg: 150_000,
    });
    expect(s(p.cashSdg)).toBe("120000");
    expect(s(p.bankakSdg)).toBe("200000");
    expect(s(p.changeSdg)).toBe("30000");
  });
  it("rejects short or over payment, and tendered below cash due", () => {
    expect(() => settlePayments({ totalSdg: 1_000, payments: [{ method: "CASH", amountSdg: 900 }] })).toThrow();
    expect(() =>
      settlePayments({ totalSdg: 1_000, payments: [{ method: "CASH", amountSdg: 1_000 }], cashTenderedSdg: 500 }),
    ).toThrow();
  });
  it("expected cash in the drawer", () => {
    expect(s(expectedCash(50_000, 320_000, 20_000))).toBe("350000");
  });
});
