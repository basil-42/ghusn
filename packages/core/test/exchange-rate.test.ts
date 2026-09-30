import { describe, expect, it } from "vitest";
import { effectiveRate, isSuspiciousRateChange, rateChange, shopDay, shopMonthRange, type RateEntry } from "../src";

// الخرطوم = UTC+2
const at = (iso: string) => new Date(iso);
const sdg = (unitsPerUsd: string, source: RateEntry["source"], iso: string): RateEntry => ({
  currencyCode: "SDG",
  unitsPerUsd,
  source,
  effectiveAt: at(iso),
});

const rates = [
  sdg("2500", "PARALLEL_MARKET", "2026-09-28T07:00:00Z"),
  sdg("2550", "PARALLEL_MARKET", "2026-09-29T07:00:00Z"),
  sdg("2530", "ACTUAL_TRANSFER", "2026-09-29T10:00:00Z"),
  sdg("2600", "PARALLEL_MARKET", "2026-09-29T15:00:00Z"),
  {
    currencyCode: "QAR",
    unitsPerUsd: "3.64",
    source: "FIXED_PEG",
    effectiveAt: at("2026-01-01T00:00:00Z"),
  } as RateEntry,
];

describe("effectiveRate", () => {
  it("returns null before the first rate", () => {
    expect(effectiveRate(rates, "SDG", at("2026-09-27T00:00:00Z"))).toBeNull();
  });
  it("picks the latest rate on or before the moment", () => {
    expect(effectiveRate(rates, "SDG", at("2026-09-28T20:00:00Z"))?.unitsPerUsd).toBe("2500");
    expect(effectiveRate(rates, "SDG", at("2026-09-29T08:00:00Z"))?.unitsPerUsd).toBe("2550");
  });
  it("prefers a same-day actual transfer over later table rates", () => {
    expect(effectiveRate(rates, "SDG", at("2026-09-29T11:00:00Z"))?.unitsPerUsd).toBe("2530");
    expect(effectiveRate(rates, "SDG", at("2026-09-29T16:00:00Z"))?.unitsPerUsd).toBe("2530");
  });
  it("drops the transfer priority the next shop day (Khartoum time)", () => {
    // 22:30Z يوم 29 = 00:30 يوم 30 بتوقيت الخرطوم
    expect(effectiveRate(rates, "SDG", at("2026-09-29T22:30:00Z"))?.unitsPerUsd).toBe("2600");
  });
  it("filters by currency", () => {
    expect(effectiveRate(rates, "QAR", at("2026-09-29T12:00:00Z"))?.unitsPerUsd).toBe("3.64");
    expect(effectiveRate(rates, "CNY", at("2026-09-29T12:00:00Z"))).toBeNull();
  });
});

describe("shopDay", () => {
  it("uses Khartoum time", () => {
    expect(shopDay(at("2026-09-29T21:59:00Z"))).toBe("2026-09-29");
    expect(shopDay(at("2026-09-29T22:00:00Z"))).toBe("2026-09-30");
  });
});

describe("rate change", () => {
  it("computes relative change", () => {
    expect(rateChange(2500, 2800).toString()).toBe("0.12");
    expect(rateChange(2500, 2250).toString()).toBe("-0.1");
  });
  it("flags likely typos beyond 20%", () => {
    expect(isSuspiciousRateChange(2500, 25000)).toBe(true);
    expect(isSuspiciousRateChange(2500, 250)).toBe(true);
    expect(isSuspiciousRateChange(2500, 3000)).toBe(false); // 20% بالضبط
  });
});

describe("shop month range", () => {
  it("October 2026 in Khartoum (UTC+2)", () => {
    const { start, end } = shopMonthRange("2026-10");
    expect(start.toISOString()).toBe("2026-09-30T22:00:00.000Z");
    expect(end.toISOString()).toBe("2026-10-31T22:00:00.000Z");
    expect(shopMonthRange("2026-12").end.toISOString()).toBe("2026-12-31T22:00:00.000Z");
  });
});
