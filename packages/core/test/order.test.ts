import { describe, expect, it } from "vitest";
import {
  assertTransition,
  availableQty,
  canTransition,
  isReserving,
  isStockOut,
  nextStatuses,
  orderTotals,
  paymentDueAfterRejection,
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
    expect(() =>
      assertTransition("READY", "OUT_FOR_DELIVERY", { fulfillment: "DELIVERY", payment: "COD" }),
    ).not.toThrow();
    expect(() =>
      assertTransition("READY", "OUT_FOR_DELIVERY", { fulfillment: "PICKUP", payment: "IN_SHOP" }),
    ).toThrow();
    expect(() => assertTransition("READY", "DELIVERED", { fulfillment: "PICKUP", payment: "IN_SHOP" })).not.toThrow();
    expect(() => assertTransition("READY", "DELIVERED", { fulfillment: "DELIVERY", payment: "COD" })).toThrow();
    expect(() =>
      assertTransition("OUT_FOR_DELIVERY", "READY", { fulfillment: "DELIVERY", payment: "COD" }),
    ).not.toThrow();
  });
  it("bankak orders are confirmed only through proof review (D-90)", () => {
    expect(() => assertTransition("NEW", "CONFIRMED", { fulfillment: "DELIVERY", payment: "BANKAK" })).toThrow();
    expect(() =>
      assertTransition("AWAITING_PAYMENT", "PAYMENT_REVIEW", {
        fulfillment: "DELIVERY",
        payment: "BANKAK",
      }),
    ).not.toThrow();
    expect(() =>
      assertTransition("PAYMENT_REVIEW", "CONFIRMED", { fulfillment: "PICKUP", payment: "BANKAK" }),
    ).not.toThrow();
    expect(() =>
      assertTransition("PAYMENT_REVIEW", "AWAITING_PAYMENT", {
        fulfillment: "PICKUP",
        payment: "BANKAK",
      }),
    ).not.toThrow();
    expect(() =>
      assertTransition("AWAITING_PAYMENT", "CONFIRMED", { fulfillment: "PICKUP", payment: "BANKAK" }),
    ).toThrow();
    expect(() => assertTransition("NEW", "AWAITING_PAYMENT", { fulfillment: "DELIVERY", payment: "COD" })).toThrow();
    expect(() => assertTransition("NEW", "CONFIRMED", { fulfillment: "PICKUP", payment: "IN_SHOP" })).not.toThrow();
  });
  it("no photo approval step: a wrapped gift goes straight to ready (D-99)", () => {
    const order = { fulfillment: "DELIVERY", payment: "COD" } as const;
    expect(() => assertTransition("PREPARING", "READY", order)).not.toThrow();
    expect(() => assertTransition("PREPARING", "AWAITING_PHOTO_APPROVAL", order)).toThrow();
    // طلب قديم عالق في الحالة الملغاة يمكن إكماله أو إلغاؤه فقط
    expect(() => assertTransition("AWAITING_PHOTO_APPROVAL", "READY", order)).not.toThrow();
    expect(() => assertTransition("AWAITING_PHOTO_APPROVAL", "CANCELLED", order)).not.toThrow();
    expect(() => assertTransition("AWAITING_PHOTO_APPROVAL", "PREPARING", order)).toThrow();
  });
  it("adds the wrap service to the total", () => {
    const t = orderTotals([{ key: "a", qty: 2, unitPriceSdg: "45000" }], "15000");
    expect(t.subtotalSdg.toFixed(0)).toBe("90000");
    expect(t.wrapPriceSdg.toFixed(0)).toBe("15000");
    expect(t.totalSdg.toFixed(0)).toBe("105000");
    expect(orderTotals([{ key: "a", qty: 1, unitPriceSdg: "500" }]).totalSdg.toFixed(0)).toBe("500");
  });
  it("a rejected proof leaves at least 12 hours to pay", () => {
    const now = new Date("2026-10-01T10:00:00Z");
    expect(paymentDueAfterRejection(new Date("2026-10-01T12:00:00Z"), now).toISOString()).toBe(
      "2026-10-01T22:00:00.000Z",
    );
    expect(paymentDueAfterRejection(new Date("2026-10-02T08:00:00Z"), now).toISOString()).toBe(
      "2026-10-02T08:00:00.000Z",
    );
    expect(paymentDueAfterRejection(null, now).toISOString()).toBe("2026-10-01T22:00:00.000Z");
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
