import { describe, expect, it } from "vitest";
import { isDeadStock, marginOf, reorderSuggestion } from "../src";

const base = { windowDays: 60, leadDays: 30, coverDays: 60, minSold: 3, inboundQty: 0 };

function suggest(input: Partial<Parameters<typeof reorderSuggestion>[0]> & { soldQty: number; stockQty: number }) {
  const s = reorderSuggestion({ ...base, ...input });
  if (!s) throw new Error("expected a suggestion");
  return s;
}

describe("reorderSuggestion", () => {
  it("suggests rate × (lead + cover) − stock − inbound, rounded up", () => {
    // 31 in 60 days → 0.51666/day × 90 = 46.5 − 4 = 42.5 → 43
    const s = suggest({ soldQty: 31, stockQty: 4 });
    expect(s.suggestQty.toNumber()).toBe(43);
    expect(s.daysLeft?.toFixed(1)).toBe("7.7");
    expect(s.urgent).toBe(true);
  });

  it("subtracts goods already on the way", () => {
    const s = suggest({ soldQty: 27, stockQty: 5, inboundQty: 10 });
    // 0.45 × 90 = 40.5 − 15 = 25.5 → 26
    expect(s.suggestQty.toNumber()).toBe(26);
  });

  it("suggests nothing when stock already covers, and is not urgent", () => {
    const s = suggest({ soldQty: 6, stockQty: 20 });
    expect(s.suggestQty.toNumber()).toBe(0);
    expect(s.urgent).toBe(false);
  });

  it("skips slow movers below the minimum and items never sold", () => {
    expect(reorderSuggestion({ ...base, soldQty: 2, stockQty: 0 })).toBeNull();
    expect(reorderSuggestion({ ...base, soldQty: 0, stockQty: 5 })).toBeNull();
  });

  it("treats negative stock as zero available and urgent", () => {
    const s = suggest({ soldQty: 6, stockQty: -2 });
    expect(s.suggestQty.toNumber()).toBe(9);
    expect(s.daysLeft?.toNumber()).toBe(0);
    expect(s.urgent).toBe(true);
  });
});

describe("isDeadStock", () => {
  const now = new Date("2026-10-07T12:00:00Z");
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);
  const dead = (qty: number, sale: number | null, received: number | null) =>
    isDeadStock({
      qty,
      lastSaleAt: sale === null ? null : daysAgo(sale),
      lastReceivedAt: received === null ? null : daysAgo(received),
      now,
      days: 60,
    });

  it("flags stock with no sale in 60 days and an old receipt", () => {
    expect(dead(6, 94, 120)).toBe(true);
    expect(dead(12, null, 90)).toBe(true);
  });

  it("gives recent receipts and recent sales time", () => {
    expect(dead(12, null, 20)).toBe(false);
    expect(dead(3, 10, 120)).toBe(false);
  });

  it("ignores items without stock", () => {
    expect(dead(0, null, 200)).toBe(false);
  });
});

describe("marginOf", () => {
  it("is profit over revenue", () => {
    expect(marginOf("100", "40")?.toNumber()).toBe(0.4);
    expect(marginOf("0", "0")).toBeNull();
  });
});
