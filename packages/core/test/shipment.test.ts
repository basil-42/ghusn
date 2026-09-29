import { describe, expect, it } from "vitest";
import {
  allowedShipmentTransitions,
  canTransitionShipment,
  documentNumber,
  isShipmentEditable,
  shipmentGoodsTotal,
} from "../src";

describe("shipment status machine", () => {
  it("draft can only be purchased or cancelled", () => {
    expect(allowedShipmentTransitions("DRAFT")).toEqual(["PURCHASED", "CANCELLED"]);
  });
  it("moves forward, may skip stages, never to RECEIVED directly", () => {
    expect(allowedShipmentTransitions("PURCHASED")).toEqual(["IN_TRANSIT", "IN_CUSTOMS", "ARRIVED", "CANCELLED"]);
    expect(canTransitionShipment("PURCHASED", "ARRIVED")).toBe(true); // مورد محلي بلا جمارك
    expect(canTransitionShipment("ARRIVED", "IN_TRANSIT")).toBe(false);
    expect(canTransitionShipment("ARRIVED", "RECEIVED")).toBe(false); // من شاشة الاستلام فقط
  });
  it("closed shipments cannot change", () => {
    expect(allowedShipmentTransitions("RECEIVED")).toEqual([]);
    expect(allowedShipmentTransitions("CANCELLED")).toEqual([]);
    expect(isShipmentEditable("ARRIVED")).toBe(true);
    expect(isShipmentEditable("RECEIVED")).toBe(false);
  });
});

describe("shipment helpers", () => {
  it("totals goods in the supplier currency (reference scenario: 3,300 QAR)", () => {
    expect(
      shipmentGoodsTotal([
        { qty: 20, unitPrice: 90 },
        { qty: 10, unitPrice: 150 },
      ]).toString(),
    ).toBe("3300");
    expect(shipmentGoodsTotal([{ qty: "2.5", unitPrice: "0.35" }]).toString()).toBe("0.88");
  });
  it("formats document numbers", () => {
    expect(documentNumber("SHP", 2026, 14)).toBe("SHP-2026-014");
    expect(documentNumber("GHS", 2026, 155, 6)).toBe("GHS-2026-000155");
  });
});
