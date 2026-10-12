import { describe, expect, it } from "vitest";
import { batchEstimate, extraCostRatio, salesTimeNotes, shipmentNotes, sumBatches, type TimeCell } from "../src";

describe("batchEstimate", () => {
  it("same product from two suppliers: oldest batch sold first, each at its own landed cost", () => {
    // 20 من الدوحة بـ 15$، و30 من الصين بـ 11$؛ بيعت 25 بمتوسط 25$
    const doha = batchEstimate({ receivedQty: 20, remainingQty: 0, lostQty: 0, landedUnitUsd: 15, avgPriceUsd: 25 });
    const china = batchEstimate({ receivedQty: 30, remainingQty: 25, lostQty: 0, landedUnitUsd: 11, avgPriceUsd: 25 });
    expect(doha.soldQty.toString()).toBe("20");
    expect(doha.profitUsd?.toString()).toBe("200");
    expect(china.soldQty.toString()).toBe("5");
    expect(china.profitUsd?.toString()).toBe("70");
    expect(china.remainingUsd.toString()).toBe("275");
  });

  it("lost units are not sales: they are charged against the shipment", () => {
    const e = batchEstimate({ receivedQty: 10, remainingQty: 4, lostQty: 1, landedUnitUsd: 10, avgPriceUsd: 20 });
    expect(e.soldQty.toString()).toBe("5");
    expect(e.lostUsd.toString()).toBe("10");
    expect(e.profitUsd?.toString()).toBe("40"); // 5×(20−10) − 10
  });

  it("no price known for sold units → profit unknown; nothing sold → zero revenue", () => {
    expect(
      batchEstimate({ receivedQty: 5, remainingQty: 2, lostQty: 0, landedUnitUsd: 3, avgPriceUsd: null }).profitUsd,
    ).toBeNull();
    const none = batchEstimate({ receivedQty: 5, remainingQty: 5, lostQty: 0, landedUnitUsd: 3, avgPriceUsd: null });
    expect(none.profitUsd?.toString()).toBe("0");
    expect(none.remainingUsd.toString()).toBe("15");
  });

  it("returns that land on a newer batch can push remaining above received: never negative", () => {
    const e = batchEstimate({ receivedQty: 5, remainingQty: 6, lostQty: 0, landedUnitUsd: 2, avgPriceUsd: 4 });
    expect(e.soldQty.toString()).toBe("0");
    expect(e.remainingUsd.toString()).toBe("12");
  });
});

describe("sumBatches", () => {
  it("totals, sell-through and margin skip unpriced lines", () => {
    const t = sumBatches([
      { receivedQty: 20, remainingQty: 0, lostQty: 0, landedUnitUsd: 15, avgPriceUsd: 25 },
      { receivedQty: 10, remainingQty: 5, lostQty: 0, landedUnitUsd: 5, avgPriceUsd: null },
    ]);
    expect(t.costUsd.toString()).toBe("350");
    expect(t.soldQty.toString()).toBe("25");
    expect(t.sellThrough?.toFixed(4)).toBe("0.8333");
    expect(t.revenueUsd.toString()).toBe("500");
    expect(t.margin?.toString()).toBe("0.4");
    expect(t.unpricedLines).toBe(1);
  });
});

describe("shipmentNotes", () => {
  it("flags slow shipments and best/lowest margin", () => {
    const notes = shipmentNotes([
      {
        id: "a",
        number: "SHP-1",
        supplierName: "الصين",
        ageDays: 75,
        sellThrough: "0.34",
        margin: "0.29",
        remainingUsd: "977",
      },
      {
        id: "b",
        number: "SHP-2",
        supplierName: "الدوحة",
        ageDays: 58,
        sellThrough: "0.88",
        margin: "0.41",
        remainingUsd: "258",
      },
      {
        id: "c",
        number: "SHP-3",
        supplierName: "الصين",
        ageDays: 30,
        sellThrough: "0.2",
        margin: null,
        remainingUsd: "900",
      },
    ]);
    expect(notes.map((n) => n.kind)).toEqual(["slow", "best_margin", "low_margin"]);
    expect(notes[0]).toMatchObject({ number: "SHP-1", remainingUsd: "977.00" });
    expect(notes[1]).toMatchObject({ number: "SHP-2" });
  });
});

describe("extraCostRatio", () => {
  it("is extra over purchase value", () => {
    expect(extraCostRatio(1000, 220)?.toString()).toBe("0.22");
    expect(extraCostRatio(0, 10)).toBeNull();
  });
});

describe("salesTimeNotes", () => {
  const c = (day: number, hour: number, count: number): TimeCell => ({ day, hour, count, amount: count * 1000 });
  it("finds the busiest 3-hour window, quietest day and web peak", () => {
    const cells = [
      c(5, 19, 10),
      c(5, 20, 12),
      c(5, 21, 8),
      c(0, 12, 5),
      c(1, 10, 1),
      c(2, 11, 3),
      c(3, 18, 4),
      c(4, 17, 4),
      c(6, 20, 6),
    ];
    const notes = salesTimeNotes(cells, "count", [c(2, 22, 3), c(3, 23, 2), c(1, 13, 1)]);
    expect(notes[0]).toEqual({ kind: "busiest", day: 5, fromHour: 19, toHour: 22, share: (30 / 53).toFixed(4) });
    expect(notes[1]).toMatchObject({ kind: "quietest_day", day: 1 });
    expect(notes[2]).toEqual({ kind: "web_peak", fromHour: 22, toHour: 24 });
  });
  it("trims empty hours at the edges of the busiest window", () => {
    const [n] = salesTimeNotes([c(3, 15, 4)], "count");
    expect(n).toMatchObject({ kind: "busiest", day: 3, fromHour: 15, toHour: 16 });
  });
  it("no data → no notes", () => {
    expect(salesTimeNotes([], "amount")).toEqual([]);
  });
});
