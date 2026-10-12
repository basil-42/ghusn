import { describe, expect, it } from "vitest";
import { discountNotes, returnNotes } from "../src";

describe("discountNotes", () => {
  it("reports the overall rate and flags a cashier well above it", () => {
    const notes = discountNotes([
      { name: "هبة", invoices: 20, grossSdg: 1_000_000, discountSdg: 20_000 },
      { name: "سارة", invoices: 10, grossSdg: 500_000, discountSdg: 50_000 },
      { name: "منى", invoices: 2, grossSdg: 100_000, discountSdg: 30_000 },
    ]);
    expect(notes[0]).toEqual({ kind: "overall", rate: "0.0625" });
    expect(notes.slice(1)).toEqual([{ kind: "staff_high", name: "سارة", rate: "0.1000", average: "0.0625" }]);
  });
  it("no discounts → no notes", () => {
    expect(discountNotes([{ name: "هبة", invoices: 9, grossSdg: 10, discountSdg: 0 }])).toEqual([]);
  });
});

describe("returnNotes", () => {
  it("flags a dominant reason and products returned often", () => {
    const notes = returnNotes(
      [
        { code: "SIZE", count: 4 },
        { code: "DEFECT", count: 2 },
        { code: null, count: 10 },
      ],
      [
        { label: "فستان", returnedQty: 3, soldQty: 10 },
        { label: "عطر", returnedQty: 2, soldQty: 4 },
        { label: "ساعة", returnedQty: 3, soldQty: 30 },
      ],
    );
    expect(notes).toEqual([
      { kind: "top_reason", code: "SIZE", share: "0.6667" },
      { kind: "product_rate", label: "فستان", returnedQty: "3", soldQty: "10", rate: "0.3000" },
    ]);
  });
  it("needs at least 3 coded returns for a reason note", () => {
    expect(returnNotes([{ code: "SIZE", count: 2 }], [])).toEqual([]);
  });
});
