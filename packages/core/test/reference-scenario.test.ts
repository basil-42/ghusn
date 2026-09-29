/**
 * السيناريو المرجعي — docs/currency-and-costing.md §10.
 * هذا الاختبار هو العقد: أي تغيير في منطق المال يجب أن يبقيه ناجحاً بالسنت.
 */
import { describe, expect, it } from "vitest";
import {
  actualMargin,
  allocateLandedCost,
  fxGainLossUsd,
  moneyRecord,
  needsPriceReview,
  roundMoney,
  saleProfit,
  suggestedPriceSdg,
  sum,
  weightedAverageCost,
} from "../src";

const QAR = "3.64";
const SDG_1 = "2500";
const SDG_2 = "2800";
const TARGET = "0.40";
const MIN = "0.35";

const shipment = allocateLandedCost(
  [
    { key: "rose", qty: 20, unitPrice: 90, rateUsed: QAR, receivedQty: 20 },
    { key: "oud", qty: 10, unitPrice: 150, rateUsed: QAR, receivedQty: 10 },
  ],
  [
    { amount: 300, rateUsed: QAR }, // شحن
    { amount: 150_000, rateUsed: SDG_1 }, // تخليص وجمارك
    { amount: 15_000, rateUsed: SDG_1 }, // نقل
  ],
);
const [rose, oud] = shipment.lines;
if (!rose || !oud) throw new Error("unreachable");

// الرصيد قبل الشحنة صفر → المتوسط = التكلفة الواصلة
const roseAvg = weightedAverageCost({ oldQty: 0, oldAvgUsd: 0, inQty: 20, inUnitUsd: rose.landedUnitUsd });
const oudAvg = weightedAverageCost({ oldQty: 0, oldAvgUsd: 0, inQty: 10, inUnitUsd: oud.landedUnitUsd });

const s = (d: { toFixed(dp: number): string }, dp = 2) => d.toFixed(dp);

describe("reference scenario — shipment", () => {
  it("records each amount with its USD value", () => {
    expect(s(moneyRecord({ amount: 1800, currencyCode: "QAR", rateUsed: QAR }).amountUsd)).toBe("494.51");
    expect(s(moneyRecord({ amount: 1500, currencyCode: "QAR", rateUsed: QAR }).amountUsd)).toBe("412.09");
    expect(s(moneyRecord({ amount: 300, currencyCode: "QAR", rateUsed: QAR }).amountUsd)).toBe("82.42");
    expect(s(moneyRecord({ amount: 150_000, currencyCode: "SDG", rateUsed: SDG_1 }).amountUsd)).toBe("60.00");
    expect(s(moneyRecord({ amount: 15_000, currencyCode: "SDG", rateUsed: SDG_1 }).amountUsd)).toBe("6.00");
  });

  it("totals 1,055.01 USD with 148.42 extra", () => {
    expect(s(shipment.totalUsd)).toBe("1055.01");
    expect(s(shipment.extraUsd)).toBe("148.42");
  });

  it("allocates extra cost by value: rose 80.96 (54.5%), oud 67.46 (45.5%)", () => {
    expect(s(rose.extraUsd)).toBe("80.96");
    expect(s(oud.extraUsd)).toBe("67.46");
    expect(s(rose.share.mul(100), 1)).toBe("54.5");
    expect(s(oud.share.mul(100), 1)).toBe("45.5");
  });

  it("lands rose at 28.77 and oud at 47.96 per unit", () => {
    expect(s(rose.landedUnitUsd)).toBe("28.77");
    expect(s(oud.landedUnitUsd)).toBe("47.96");
    expect(rose.landedUnitUsd.decimalPlaces()).toBeLessThanOrEqual(6);
  });
});

describe("reference scenario — pricing", () => {
  it("suggests 120,000 and 200,000 SDG at 2,500", () => {
    const r = suggestedPriceSdg({ avgCostUsd: roseAvg, targetMargin: TARGET, sdgPerUsd: SDG_1 });
    const o = suggestedPriceSdg({ avgCostUsd: oudAvg, targetMargin: TARGET, sdgPerUsd: SDG_1 });
    expect(s(r.rawSdg, 0)).toBe("119888");
    expect(r.priceSdg.toString()).toBe("120000");
    expect(s(o.rawSdg, 0)).toBe("199813");
    expect(o.priceSdg.toString()).toBe("200000");
  });

  it("flags old prices at 2,800 (32.9% < 35%) and suggests 135,000 / 225,000 (40.3%)", () => {
    const old = actualMargin({ priceSdg: 120_000, sdgPerUsd: SDG_2, avgCostUsd: roseAvg });
    expect(s(old.mul(100), 1)).toBe("32.9");
    expect(needsPriceReview(old, MIN)).toBe(true);

    const r = suggestedPriceSdg({ avgCostUsd: roseAvg, targetMargin: TARGET, sdgPerUsd: SDG_2 });
    const o = suggestedPriceSdg({ avgCostUsd: oudAvg, targetMargin: TARGET, sdgPerUsd: SDG_2 });
    expect(s(r.rawSdg, 0)).toBe("134274");
    expect(r.priceSdg.toString()).toBe("135000");
    expect(s(o.rawSdg, 0)).toBe("223790");
    expect(o.priceSdg.toString()).toBe("225000");

    const fresh = actualMargin({ priceSdg: r.priceSdg, sdgPerUsd: SDG_2, avgCostUsd: roseAvg });
    expect(s(fresh.mul(100), 1)).toBe("40.3");
    expect(needsPriceReview(fresh, MIN)).toBe(false);
  });
});

describe("reference scenario — sales, FX and inventory", () => {
  const week1 = saleProfit(
    [
      { qty: 8, unitPriceSdg: 120_000, avgCostUsd: roseAvg },
      { qty: 3, unitPriceSdg: 200_000, avgCostUsd: oudAvg },
    ],
    SDG_1,
  );
  const week2 = saleProfit(
    [
      { qty: 7, unitPriceSdg: 135_000, avgCostUsd: roseAvg },
      { qty: 4, unitPriceSdg: 225_000, avgCostUsd: oudAvg },
    ],
    SDG_2,
  );

  it("week 1 @2,500: 1,560,000 SDG = 624.00, cost 374.05, profit 249.95 (40.1%)", () => {
    expect(week1.totalSdg.toString()).toBe("1560000");
    expect(s(week1.revenueUsd)).toBe("624.00");
    expect(s(week1.cogsUsd)).toBe("374.05");
    expect(s(week1.grossProfitUsd)).toBe("249.95");
    expect(s(week1.margin.mul(100), 1)).toBe("40.1");
  });

  it("week 2 @2,800: 1,845,000 SDG = 658.93, cost 393.23, profit 265.70", () => {
    expect(week2.totalSdg.toString()).toBe("1845000");
    expect(s(week2.revenueUsd)).toBe("658.93");
    expect(s(week2.cogsUsd)).toBe("393.23");
    expect(s(week2.grossProfitUsd)).toBe("265.70");
  });

  it("holding week-1 cash until 2,800 loses 66.86 USD", () => {
    expect(s(fxGainLossUsd(week1.totalSdg, week1.revenueUsd, SDG_2))).toBe("-66.86");
  });

  it("remaining stock (5 rose + 3 oud) = 287.73 and everything reconciles to 1,055.01", () => {
    const remaining = roundMoney(sum([roseAvg.mul(5), oudAvg.mul(3)]));
    expect(s(remaining)).toBe("287.73");
    const sold = week1.cogsUsd.plus(week2.cogsUsd);
    expect(s(sold)).toBe("767.28");
    expect(s(sold.plus(remaining))).toBe(s(shipment.totalUsd));
  });
});
