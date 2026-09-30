import { describe, expect, it } from "vitest";
import {
  allocateLateCost,
  canChangeShipmentCosts,
  canReceiveShipment,
  consumeBatches,
  dec,
  planReceipt,
  revaluedAverage,
  roundMoney,
  stockValueUsd,
  sum,
  weightedAverageCost,
  type ReceiptLine,
} from "../src";

// السيناريو المرجعي (currency-and-costing §10)
const QAR = "3.64";
const SDG = "2500";
const costs = [
  { amount: 300, rateUsed: QAR }, // شحن
  { amount: 150_000, rateUsed: SDG }, // تخليص وجمارك
  { amount: 15_000, rateUsed: SDG }, // نقل
];
const line = (key: string, qty: number, unitPrice: number, receivedQty: number, damagedQty = 0) => ({
  key,
  qty,
  unitPrice,
  rateUsed: QAR,
  receivedQty,
  damagedQty,
});
/** أول عنصرين مع التحقق (noUncheckedIndexedAccess). */
function two<T>(rows: readonly T[]): [T, T] {
  const [a, b] = rows;
  if (a === undefined || b === undefined) throw new Error("expected two rows");
  return [a, b];
}
/** تكلفة وحدة بند وصل منه شيء. */
function unit(row: ReceiptLine) {
  if (!row.landedUnitUsd) throw new Error("line has no landed cost");
  return row.landedUnitUsd;
}
const money = (d: { toString(): string } | null) => (d === null ? null : roundMoney(d.toString()).toFixed(2));

describe("planReceipt", () => {
  it("full receipt matches the reference scenario (28.77 / 47.96)", () => {
    const [rose, oud] = two(planReceipt([line("rose", 20, 90, 20), line("oud", 10, 150, 10)], costs));
    expect(money(rose.landedUnitUsd)).toBe("28.77");
    expect(money(oud.landedUnitUsd)).toBe("47.96");
    expect(money(sum([rose.totalUsd, oud.totalUsd]))).toBe("1055.01");
    expect(rose.lossUsd.isZero()).toBe(true);
  });

  it("loads damaged and missing units onto the received ones of the same line", () => {
    const [rose, oud] = two(planReceipt([line("rose", 20, 90, 17, 2), line("oud", 10, 150, 10)], costs));
    // نفس قيمة البند تُقسم على 17 بدل 20
    expect(rose.missingQty.toString()).toBe("1");
    expect(rose.damagedQty.toString()).toBe("2");
    expect(unit(rose).toString()).toBe(rose.totalUsd.div(17).toDecimalPlaces(6).toString());
    expect(money(rose.landedUnitUsd)).toBe("33.85");
    // البند الآخر لا يتأثر
    expect(money(oud.landedUnitUsd)).toBe("47.96");
  });

  it("a line with nothing received becomes a loss", () => {
    const [rose, oud] = two(planReceipt([line("rose", 20, 90, 20), line("oud", 10, 150, 0, 3)], costs));
    expect(oud.landedUnitUsd).toBeNull();
    expect(money(oud.lossUsd)).toBe(money(oud.totalUsd));
    expect(money(rose.landedUnitUsd)).toBe("28.77");
  });

  it("rejects receiving more than purchased, negatives, or nothing at all", () => {
    expect(() => planReceipt([line("rose", 20, 90, 20, 1)], costs)).toThrow();
    expect(() => planReceipt([line("rose", 20, 90, -1)], costs)).toThrow();
    expect(() => planReceipt([line("rose", 20, 90, 0)], costs)).toThrow();
  });
});

describe("allocateLateCost", () => {
  const roseLine = { key: "rose", qty: 20, unitPrice: 90, rateUsed: QAR, receivedQty: 20, remainingQty: 12 };
  const oudLine = { key: "oud", qty: 10, unitPrice: 150, rateUsed: QAR, receivedQty: 10, remainingQty: 10 };
  const lines = [roseLine, oudLine];

  it("splits by value, then between remaining stock and units already out", () => {
    const [rose, oud] = two(allocateLateCost(lines, { amount: 150_000, rateUsed: SDG })); // 60$
    expect(money(sum([rose.extraUsd, oud.extraUsd]))).toBe("60.00");
    expect(money(rose.extraUsd)).toBe("32.73"); // 54.5%
    // 12 من 20 باقية ← 60% للمخزون و40% مصروف
    expect(money(rose.inventoryUsd)).toBe("19.64");
    expect(money(rose.expenseUsd)).toBe("13.09");
    expect(rose.inventoryUsd.plus(rose.expenseUsd).eq(rose.extraUsd)).toBe(true);
    // العود كله باقٍ
    expect(oud.expenseUsd.isZero()).toBe(true);
    expect(money(oud.unitDeltaUsd)).toBe("2.73");
  });

  it("voiding is the exact mirror", () => {
    const add = two(allocateLateCost(lines, { amount: 300, rateUsed: QAR }));
    const undo = two(allocateLateCost(lines, { amount: 300, rateUsed: QAR }, -1));
    expect(add[0].extraUsd.plus(undo[0].extraUsd).isZero()).toBe(true);
    expect(add[1].extraUsd.plus(undo[1].extraUsd).isZero()).toBe(true);
  });

  it("a line with nothing received sends its share to expense", () => {
    const [, oud] = two(
      allocateLateCost([roseLine, { ...oudLine, receivedQty: 0, remainingQty: 0 }], {
        amount: 150_000,
        rateUsed: SDG,
      }),
    );
    expect(oud.inventoryUsd.isZero()).toBe(true);
    expect(oud.expenseUsd.eq(oud.extraUsd)).toBe(true);
  });

  it("remaining cannot exceed received", () => {
    expect(() => allocateLateCost([{ ...roseLine, remainingQty: 21 }], { amount: 1, rateUsed: QAR })).toThrow();
  });
});

describe("stock averages", () => {
  it("weighted average after a second batch", () => {
    // 5 ورد باقية @28.77 + 20 جديدة @30
    expect(weightedAverageCost({ oldQty: 5, oldAvgUsd: "28.77", inQty: 20, inUnitUsd: 30 }).toString()).toBe("29.754");
  });

  it("revaluation spreads value over current stock", () => {
    expect(revaluedAverage(12, "28.77", "19.64").toString()).toBe(
      dec("28.77").plus(dec("19.64").div(12)).toDecimalPlaces(6).toString(),
    );
    expect(revaluedAverage(0, "28.77", "10").toString()).toBe("28.77");
    expect(() => revaluedAverage(1, "1", "-5")).toThrow();
  });

  it("stock value in USD", () => {
    // المخزون المتبقي في السيناريو: 5 ورد + 3 عود = 287.73$
    const [rose, oud] = two(planReceipt([line("rose", 20, 90, 20), line("oud", 10, 150, 10)], costs));
    const exact = dec(5)
      .mul(unit(rose))
      .plus(dec(3).mul(unit(oud)));
    expect(roundMoney(exact).toFixed(2)).toBe("287.73");
    expect(stockValueUsd(3, unit(oud)).toFixed(2)).toBe("143.87");
  });
});

describe("shipment receiving rules", () => {
  it("receives from any stage after purchase", () => {
    expect(canReceiveShipment("PURCHASED")).toBe(true);
    expect(canReceiveShipment("ARRIVED")).toBe(true);
    expect(canReceiveShipment("DRAFT")).toBe(false);
    expect(canReceiveShipment("RECEIVED")).toBe(false);
    expect(canReceiveShipment("CANCELLED")).toBe(false);
  });
  it("costs change after purchase, including after receipt (late invoice)", () => {
    expect(canChangeShipmentCosts("RECEIVED")).toBe(true);
    expect(canChangeShipmentCosts("DRAFT")).toBe(false);
    expect(canChangeShipmentCosts("CANCELLED")).toBe(false);
  });
});

describe("consumeBatches (FEFO)", () => {
  const d = (s: string) => new Date(s);
  const batches = [
    { id: "old-no-expiry", qtyRemaining: 5, expiresAt: null, receivedAt: d("2026-01-01") },
    { id: "late-expiry", qtyRemaining: 3, expiresAt: "2027-12-31", receivedAt: d("2026-02-01") },
    { id: "soon", qtyRemaining: 2, expiresAt: "2027-01-31", receivedAt: d("2026-03-01") },
    { id: "empty", qtyRemaining: 0, expiresAt: "2026-12-01", receivedAt: d("2026-01-01") },
  ];
  it("takes the nearest expiry first, then the oldest without expiry", () => {
    const r = consumeBatches(batches, 6);
    expect(r.takes.map((t) => [t.batchId, t.qty.toString()])).toEqual([
      ["soon", "2"],
      ["late-expiry", "3"],
      ["old-no-expiry", "1"],
    ]);
    expect(r.shortQty.isZero()).toBe(true);
  });
  it("reports a shortfall instead of going negative silently", () => {
    expect(consumeBatches(batches, 12).shortQty.toString()).toBe("2");
  });
});
