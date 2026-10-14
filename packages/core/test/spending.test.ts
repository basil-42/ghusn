import { describe, expect, it } from "vitest";
import { sdgValue, spendingByKey, summarizeSpending, type SpendItem } from "../src";

const item = (o: Partial<SpendItem>): SpendItem => ({
  kind: "OPERATING",
  group: "إيجار",
  currencyCode: "SDG",
  amount: "0",
  amountUsd: "0",
  sdgPerUsd: "2500",
  key: "2026-10-01",
  ...o,
});

describe("spending (D-137)", () => {
  it("values SDG items as-is and foreign items at their day's SDG rate", () => {
    expect(sdgValue(item({ amount: "900000", amountUsd: "360" })).toString()).toBe("900000");
    // 100 ر.ق = 27.47 $ يوم الدفع × 2,600 = 71,422
    expect(
      sdgValue(item({ currencyCode: "QAR", amount: "100", amountUsd: "27.47", sdgPerUsd: "2600" })).toString(),
    ).toBe("71422");
    // دفعة المورد مسجّلة بالسالب في الدفتر
    expect(sdgValue(item({ amount: "-500000", amountUsd: "-200" })).toString()).toBe("500000");
    expect(sdgValue(item({ currencyCode: "QAR", amount: "100", amountUsd: "27.47", sdgPerUsd: null })).isZero()).toBe(
      true,
    );
  });

  it("splits operating from purchases, ranks groups and averages per day", () => {
    const s = summarizeSpending(
      [
        item({ group: "إيجار", amount: "900000" }),
        item({ group: "نثريات", amount: "50000" }),
        item({ group: "نثريات", amount: "35000" }),
        item({ kind: "PURCHASE", group: "دفعات الموردين", amount: "-2000000" }),
        item({
          kind: "PURCHASE",
          group: "تكاليف الشحنات",
          currencyCode: "QAR",
          amount: "200",
          amountUsd: "54.95",
          sdgPerUsd: null,
        }),
      ],
      10,
    );
    expect(s.operatingSdg.toString()).toBe("985000");
    expect(s.purchaseSdg.toString()).toBe("2000000");
    expect(s.totalSdg.toString()).toBe("2985000");
    expect(s.perDaySdg.toString()).toBe("298500");
    expect(s.groups.map((g) => g.group)).toEqual(["إيجار", "نثريات", "دفعات الموردين"]);
    expect(s.groups[1]?.share.toFixed(4)).toBe("0.0863");
    expect(s.unpriced).toBe(1);
  });

  it("buckets spending by key, ignoring keys outside the chart", () => {
    const rows = spendingByKey(
      [
        item({ amount: "100", key: "2026-10-01" }),
        item({ kind: "PURCHASE", amount: "-300", key: "2026-10-01" }),
        item({ amount: "50", key: "2026-09-30" }),
      ],
      ["2026-10-01", "2026-10-02"],
    );
    expect(rows[0]?.operating.toString()).toBe("100");
    expect(rows[0]?.purchase.toString()).toBe("300");
    expect(rows[1]?.operating.isZero()).toBe(true);
  });
});
