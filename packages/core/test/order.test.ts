import { describe, expect, it } from "vitest";
import {
  assertTransition,
  availableQty,
  canTransition,
  isReserving,
  isStockOut,
  nextStatuses,
  orderTotals,
} from "../src";

describe("order state machine", () => {
  it("follows the approved lifecycle (customer-journey §2)", () => {
    expect(canTransition("NEW", "CONFIRMED")).toBe(true);
    expect(canTransition("CONFIRMED", "PREPARING")).toBe(true);
    expect(canTransition("PREPARING", "READY")).toBe(true);
    expect(canTransition("READY", "OUT_FOR_DELIVERY")).toBe(true);
    expect(canTransition("OUT_FOR_DELIVERY", "DELIVERED")).toBe(true);
    expect(canTransition("NEW", "PREPARING")).toBe(false);
    expect(canTransition("CONFIRMED", "DELIVERED")).toBe(false);
  });
  it("terminal states go nowhere", () => {
    expect(nextStatuses("DELIVERED")).toEqual([]);
    expect(nextStatuses("CANCELLED")).toEqual([]);
  });
  it("delivery goes through the courier; pickup is handed over from READY", () => {
    expect(() => assertTransition("READY", "OUT_FOR_DELIVERY", "DELIVERY")).not.toThrow();
    expect(() => assertTransition("READY", "OUT_FOR_DELIVERY", "PICKUP")).toThrow();
    expect(() => assertTransition("READY", "DELIVERED", "PICKUP")).not.toThrow();
    expect(() => assertTransition("READY", "DELIVERED", "DELIVERY")).toThrow();
    expect(() => assertTransition("OUT_FOR_DELIVERY", "READY", "DELIVERY")).not.toThrow();
  });
  it("reservation until preparing; stock is out from preparing to handover", () => {
    expect(isReserving("NEW")).toBe(true);
    expect(isReserving("CONFIRMED")).toBe(true);
    expect(isReserving("PREPARING")).toBe(false);
    expect(isStockOut("PREPARING")).toBe(true);
    expect(isStockOut("OUT_FOR_DELIVERY")).toBe(true);
    expect(isStockOut("DELIVERED")).toBe(false);
    expect(isStockOut("CANCELLED")).toBe(false);
  });
});

describe("availability and totals", () => {
  it("available = stock − reserved, never negative", () => {
    expect(availableQty("5", "2").toString()).toBe("3");
    expect(availableQty("2", "3").toString()).toBe("0");
  });
  it("totals from server prices; rejects empty carts, fractional or zero qty", () => {
    const t = orderTotals([
      { key: "a", qty: 2, unitPriceSdg: "45000" },
      { key: "b", qty: 1, unitPriceSdg: "120000" },
    ]);
    expect(t.totalSdg.toString()).toBe("210000");
    expect(t.lines[0]?.lineTotalSdg.toString()).toBe("90000");
    expect(() => orderTotals([])).toThrow();
    expect(() => orderTotals([{ key: "a", qty: "1.5", unitPriceSdg: 1 }])).toThrow();
    expect(() => orderTotals([{ key: "a", qty: 0, unitPriceSdg: 1 }])).toThrow();
  });
});
