import { describe, expect, it } from "vitest";
import { averageTicket, customerSegment, spendShare, vipCustomers } from "../src";

const rows = (spends: string[]) => spends.map((s, i) => ({ id: `c${i}`, spendUsd: s }));

describe("vipCustomers", () => {
  it("takes the top ceil(10%) of paying customers", () => {
    const r = rows(["100", "90", "80", "70", "60", "50", "40", "30", "20", "10", "5", "0"]);
    // 11 paying → ceil(1.1) = 2
    const v = vipCustomers(r);
    expect([...v.ids].sort()).toEqual(["c0", "c1"]);
    expect(v.thresholdUsd).toBe("90");
  });

  it("includes ties at the threshold", () => {
    const v = vipCustomers(rows(["50", "50", "10", "10", "10"]));
    expect([...v.ids].sort()).toEqual(["c0", "c1"]);
  });

  it("ignores customers with no spending and handles empty", () => {
    expect(vipCustomers(rows(["0", "0"])).ids.size).toBe(0);
    expect(vipCustomers([]).thresholdUsd).toBeNull();
    expect([...vipCustomers(rows(["0", "12.5"])).ids]).toEqual(["c1"]);
  });

  it("compares as decimals, not strings", () => {
    const v = vipCustomers(rows(["9.5", "100.25", "11", "8", "7", "6", "5", "4", "3", "2"]));
    expect([...v.ids]).toEqual(["c1"]);
  });
});

describe("customerSegment", () => {
  it("prefers VIP, then repeat, then new", () => {
    expect(customerSegment(1, true)).toBe("VIP");
    expect(customerSegment(3, false)).toBe("REPEAT");
    expect(customerSegment(1, false)).toBe("NEW");
    expect(customerSegment(2, false)).toBeNull();
    expect(customerSegment(0, false)).toBeNull();
  });
});

describe("spendShare and averageTicket", () => {
  it("computes the share of spending for a group", () => {
    const r = rows(["60", "30", "10"]);
    expect(spendShare(r, new Set(["c0"]))).toBe("0.6");
    expect(spendShare(rows(["0"]), new Set(["c0"]))).toBeNull();
  });

  it("averages the ticket rounded to the pound", () => {
    expect(averageTicket("1640000", 9)).toBe("182222");
    expect(averageTicket("0", 0)).toBeNull();
  });
});
