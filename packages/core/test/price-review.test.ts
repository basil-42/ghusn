import { describe, expect, it } from "vitest";
import { effectiveMargins, reviewPrice } from "../src";

// السيناريو المرجعي: تكلفة الورد الواصلة 28.77$، هامش مستهدف 40% وحد أدنى 35%
const base = { avgCostUsd: "28.77", targetMargin: "0.40", minMargin: "0.35" };
const pct = (d: { mul(n: number): { toFixed(dp: number): string } } | null) => (d ? d.mul(100).toFixed(1) : null);

describe("reviewPrice", () => {
  it("no cost yet → no suggestion", () => {
    const r = reviewPrice({ ...base, avgCostUsd: 0, priceSdg: null, sdgPerUsd: 2500 });
    expect(r.kind).toBe("NO_COST");
    expect(r.suggestedSdg).toBeNull();
  });

  it("received but unpriced → suggests 120,000 at 2,500", () => {
    const r = reviewPrice({ ...base, priceSdg: null, sdgPerUsd: 2500 });
    expect(r.kind).toBe("NEEDS_PRICE");
    expect(r.suggestedSdg?.toString()).toBe("120000");
    expect(pct(r.suggestedMargin)).toBe("40.1");
  });

  it("current price at the same rate is fine", () => {
    expect(reviewPrice({ ...base, priceSdg: 120_000, sdgPerUsd: 2500 }).kind).toBe("OK");
  });

  it("rate rises to 2,800 → margin 32.9% < 35% → raise to 135,000", () => {
    const r = reviewPrice({ ...base, priceSdg: 120_000, sdgPerUsd: 2800 });
    expect(r.kind).toBe("LOW");
    expect(pct(r.margin)).toBe("32.9");
    expect(r.suggestedSdg?.toString()).toBe("135000");
  });

  it("pound strengthens to 1,800 → margin 56.8% > 50% → lower to 87,000 (D-79)", () => {
    const r = reviewPrice({ ...base, priceSdg: 120_000, sdgPerUsd: 1800 });
    expect(r.kind).toBe("HIGH");
    expect(pct(r.margin)).toBe("56.8");
    expect(r.suggestedSdg?.toString()).toBe("87000");
  });

  it("slightly above target is not flagged (no churn on small moves)", () => {
    // 2,200: الهامش 47.7% — فوق 40% لكن تحت 50%
    expect(reviewPrice({ ...base, priceSdg: 120_000, sdgPerUsd: 2200 }).kind).toBe("OK");
  });
});

describe("effectiveMargins", () => {
  const category = { targetMargin: "0.40", minMargin: "0.35" };
  it("falls back to the category", () => {
    const m = effectiveMargins(category, { targetMargin: null, minMargin: null });
    expect(m.targetMargin.toString()).toBe("0.4");
    expect(m.minMargin.toString()).toBe("0.35");
  });
  it("product override wins", () => {
    const m = effectiveMargins(category, { targetMargin: "0.5", minMargin: null });
    expect(m.targetMargin.toString()).toBe("0.5");
    expect(m.minMargin.toString()).toBe("0.35");
  });
  it("rejects a minimum above the target, or margins outside [0, 1)", () => {
    expect(() => effectiveMargins(category, { targetMargin: "0.30", minMargin: null })).toThrow();
    expect(() => effectiveMargins(category, { targetMargin: "1", minMargin: null })).toThrow();
  });
});
