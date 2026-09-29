import { describe, expect, it } from "vitest";
import {
  allocateLandedCost,
  ceilToStep,
  CoreError,
  moneyRecord,
  priceStepFor,
  rateChangeExceeds,
  suggestedPriceSdg,
  suggestedPriceUsd,
  toUsdExact,
  weightedAverageCost,
} from "../src";

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof CoreError ? e.code : "OTHER";
  }
  return "NONE";
};

describe("money", () => {
  it("avoids float drift (0.1 + 0.2)", () => {
    expect(moneyRecord({ amount: "0.3", currencyCode: "USD", rateUsed: 1 }).amountUsd.toString()).toBe("0.3");
  });
  it("rejects zero or negative rates", () => {
    expect(code(() => toUsdExact(100, 0))).toBe("INVALID_RATE");
    expect(code(() => toUsdExact(100, -2))).toBe("INVALID_RATE");
  });
  it("rounds half up to 2 dp", () => {
    expect(moneyRecord({ amount: "0.125", currencyCode: "USD", rateUsed: 1 }).amountUsd.toFixed(2)).toBe("0.13");
  });
});

describe("pricing steps", () => {
  it("picks the step by the raw price band", () => {
    expect(priceStepFor(49_999).toString()).toBe("500");
    expect(priceStepFor(50_000).toString()).toBe("1000");
    expect(priceStepFor(99_999).toString()).toBe("1000");
    expect(priceStepFor(100_000).toString()).toBe("5000");
  });
  it("always rounds up and keeps exact multiples", () => {
    expect(ceilToStep(12_001, 500).toString()).toBe("12500");
    expect(ceilToStep(12_500, 500).toString()).toBe("12500");
  });
  it("crosses a band boundary upward", () => {
    // 99,500 → خطوة 1,000 → 100,000
    expect(suggestedPriceSdg({ avgCostUsd: "23.88", targetMargin: "0.4", sdgPerUsd: 2500 }).priceSdg.toString()).toBe(
      "100000",
    );
  });
  it("uses margin on selling price, not markup", () => {
    expect(suggestedPriceUsd(60, "0.4").toString()).toBe("100");
  });
  it("rejects margins outside [0, 1)", () => {
    expect(code(() => suggestedPriceUsd(10, 1))).toBe("INVALID_MARGIN");
    expect(code(() => suggestedPriceUsd(10, -0.1))).toBe("INVALID_MARGIN");
  });
  it("detects exchange-rate moves beyond 5%", () => {
    expect(rateChangeExceeds(2500, 2625)).toBe(false); // 5% بالضبط
    expect(rateChangeExceeds(2500, 2626)).toBe(true);
    expect(rateChangeExceeds(2500, 2370)).toBe(true); // نزول 5.2%
  });
});

describe("landed cost", () => {
  it("spreads lost units' cost over received units", () => {
    const r = allocateLandedCost([{ key: "a", qty: 10, unitPrice: 10, rateUsed: 1, receivedQty: 8 }], []);
    expect(r.lines[0]?.landedUnitUsd.toString()).toBe("12.5");
  });
  it("mixes currencies per line", () => {
    const r = allocateLandedCost(
      [
        { key: "qar", qty: 1, unitPrice: "3.64", rateUsed: "3.64", receivedQty: 1 },
        { key: "cny", qty: 1, unitPrice: "7.2", rateUsed: "7.2", receivedQty: 1 },
      ],
      [{ amount: 2, rateUsed: 1 }],
    );
    expect(r.lines.map((l) => l.landedUnitUsd.toString())).toEqual(["2", "2"]);
  });
  it("rejects empty shipments and zero received quantities", () => {
    expect(code(() => allocateLandedCost([], []))).toBe("EMPTY_SHIPMENT");
    expect(code(() => allocateLandedCost([{ key: "a", qty: 1, unitPrice: 1, rateUsed: 1, receivedQty: 0 }], []))).toBe(
      "INVALID_QUANTITY",
    );
  });
});

describe("weighted average cost", () => {
  it("blends a second batch", () => {
    // 5 × 28.773 + 20 × 31 = 763.865 ÷ 25 = 30.5546
    expect(weightedAverageCost({ oldQty: 5, oldAvgUsd: "28.773", inQty: 20, inUnitUsd: 31 }).toString()).toBe(
      "30.5546",
    );
  });
  it("resets to the incoming cost after negative stock (D-63)", () => {
    expect(weightedAverageCost({ oldQty: -2, oldAvgUsd: 20, inQty: 10, inUnitUsd: 25 }).toString()).toBe("25");
  });
});
