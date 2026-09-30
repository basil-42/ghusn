import { describe, expect, it } from "vitest";
import { planTransfer } from "../src";

const QAR = { currencyCode: "QAR", currentRate: "3.64", anchored: true };
const USD = { currencyCode: "USD", currentRate: "1", anchored: true };
const SDG = { currencyCode: "SDG", currentRate: "2500", anchored: false };
const CNY = { currencyCode: "CNY", currentRate: "7.1", anchored: false };

describe("planTransfer", () => {
  it("QAR → SDG: fee inside the rate — 1,000 QAR out (incl. fee) → 700,000 SDG = 2,548 SDG/$", () => {
    const p = planTransfer({ from: { ...QAR, amount: "1000" }, to: { ...SDG, amount: "700000" } });
    expect(p.fromAmountUsd.toString()).toBe("274.73");
    expect(p.toAmountUsd.toString()).toBe("274.73");
    expect(p.fromRate.toString()).toBe("3.64");
    expect(p.toRate.toString()).toBe("2548");
    expect(p.derived?.currencyCode).toBe("SDG");
    expect(p.derived?.unitsPerUsd.toString()).toBe("2548");
    expect(p.derived?.suspicious).toBe(false);
  });

  it("SDG → USD: the dollar side is the anchor, SDG gets the derived rate", () => {
    const p = planTransfer({ from: { ...SDG, amount: "2550000" }, to: { ...USD, amount: "1000" } });
    expect(p.fromRate.toString()).toBe("2550");
    expect(p.fromAmountUsd.toString()).toBe("1000");
    expect(p.derived?.currencyCode).toBe("SDG");
  });

  it("two floating currencies: the outgoing side's current rate values the transfer", () => {
    const p = planTransfer({ from: { ...SDG, amount: "250000" }, to: { ...CNY, amount: "720" } });
    expect(p.fromAmountUsd.toString()).toBe("100");
    expect(p.derived?.currencyCode).toBe("CNY");
    expect(p.toRate.toString()).toBe("7.2");
  });

  it("flags a derived rate more than 20% away from the current one (typo guard)", () => {
    const p = planTransfer({ from: { ...QAR, amount: "1000" }, to: { ...SDG, amount: "7000000" } });
    expect(p.derived?.unitsPerUsd.toString()).toBe("25480");
    expect(p.derived?.suspicious).toBe(true);
  });

  it("same currency: amounts must match and no rate is derived", () => {
    const p = planTransfer({ from: { ...SDG, amount: "100000" }, to: { ...SDG, amount: "100000" } });
    expect(p.derived).toBeNull();
    expect(p.fromAmountUsd.toString()).toBe("40");
    expect(() => planTransfer({ from: { ...SDG, amount: "100000" }, to: { ...SDG, amount: "99000" } })).toThrow();
  });

  it("both anchored (QAR → USD): no derived rate, each side valued at its own rate", () => {
    const p = planTransfer({ from: { ...QAR, amount: "364" }, to: { ...USD, amount: "98" } });
    expect(p.derived).toBeNull();
    expect(p.fromAmountUsd.toString()).toBe("100");
    expect(p.toAmountUsd.toString()).toBe("98");
  });

  it("rejects zero or negative amounts", () => {
    expect(() => planTransfer({ from: { ...QAR, amount: "0" }, to: { ...SDG, amount: "1" } })).toThrow();
  });
});
