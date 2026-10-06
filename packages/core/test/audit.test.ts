import { describe, expect, it } from "vitest";
import { changesLine, deviceLabel, diffFields, maskPhone } from "../src";

describe("audit helpers", () => {
  it("lists only changed fields with labels, before and after", () => {
    const d = diffFields(
      { maxDiscountPercent: 10, returnDays: 7, showLogo: true, address: "" },
      { maxDiscountPercent: 15, returnDays: 7, showLogo: false, address: "الخرطوم" },
      { maxDiscountPercent: "حد الخصم %", showLogo: "الشعار", address: "العنوان" },
    );
    expect(d).toEqual([
      { field: "حد الخصم %", before: "10", after: "15" },
      { field: "الشعار", before: "نعم", after: "لا" },
      { field: "العنوان", before: "—", after: "الخرطوم" },
    ]);
    expect(diffFields({ a: 1 }, { a: 1 })).toEqual([]);
  });

  it("summarizes changes in one line, capped", () => {
    const c = [1, 2, 3, 4, 5].map((n) => ({ field: `ح${n}`, before: "0", after: String(n) }));
    expect(changesLine(c.slice(0, 2))).toBe("ح1: 0 ← 1 · ح2: 0 ← 2");
    expect(changesLine(c)).toBe("ح1: 0 ← 1 · ح2: 0 ← 2 · ح3: 0 ← 3 · ح4: 0 ← 4 · و1 أخرى");
  });

  it("masks phone numbers that are not users", () => {
    expect(maskPhone("+249912345678")).toBe("+2499****5678");
    expect(maskPhone("123")).toBe("****");
  });

  it("describes the device from the user agent", () => {
    expect(
      deviceLabel(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
      ),
    ).toBe("Safari · آيفون");
    expect(
      deviceLabel(
        "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36",
      ),
    ).toBe("Chrome · أندرويد");
    expect(deviceLabel(null)).toBeNull();
  });
});
