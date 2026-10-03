import { describe, expect, it } from "vitest";
import { isLowStock, percentChange } from "../src";

describe("dashboard (D-94)", () => {
  it("compares two periods as a ratio", () => {
    expect(percentChange("125000", "100000")?.toString()).toBe("0.25");
    expect(percentChange("50000", "100000")?.toString()).toBe("-0.5");
    expect(percentChange("50000", "0")).toBeNull();
  });
  it("uses the product threshold, else the global one", () => {
    expect(isLowStock("3", null, "3")).toBe(true);
    expect(isLowStock("4", null, "3")).toBe(false);
    expect(isLowStock("4", "5", "3")).toBe(true);
    expect(isLowStock("1", "0", "3")).toBe(false);
  });
});
