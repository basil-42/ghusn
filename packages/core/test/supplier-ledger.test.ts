import { describe, expect, it } from "vitest";
import { replaySupplierLedger, shopMomentForDate, toUsdExact, type LedgerMovement } from "../src";

// حركة بسعر صرف: المبلغ بعملة المورد، والدولار = المبلغ ÷ السعر (بدقة كاملة)
const at = (amount: number, rate: string | number): LedgerMovement => ({ amount, usd: toUsdExact(amount, rate) });
const f = (d: { toFixed(n: number): string }) => d.toFixed(2);
function line<T>(r: { lines: T[] }, i: number): T {
  const l = r.lines[i];
  if (!l) throw new Error(`no line ${i}`);
  return l;
}

describe("supplier ledger — cash and installments", () => {
  it("installments at the same (pegged) rate leave no FX difference", () => {
    const r = replaySupplierLedger([at(3300, "3.64"), at(-1000, "3.64"), at(-1300, "3.64"), at(-1000, "3.64")]);
    expect(r.lines.map((l) => l.balance.toString())).toEqual(["3300", "2300", "1000", "0"]);
    expect(f(r.balanceUsd)).toBe("0.00");
    expect(f(r.realizedFxUsd)).toBe("0.00");
  });

  it("option A: cost stays at the purchase-day rate; paying later at a weaker SDG is an FX gain", () => {
    // شراء 1,000,000 ج @2500 = 400$؛ سداد بعد شهر @2800 = 357.14$
    const r = replaySupplierLedger([at(1_000_000, 2500), at(-1_000_000, 2800)]);
    expect(r.balance.toString()).toBe("0");
    expect(f(r.realizedFxUsd)).toBe("42.86");
  });

  it("partial payments settle at the weighted book rate of the outstanding balance", () => {
    // شحنتان بسعرين: 1,000,000 @2500 (400$) + 1,000,000 @2800 (357.14$) ← متوسط 0.00037857$/ج
    const r = replaySupplierLedger([at(1_000_000, 2500), at(1_000_000, 2800), at(-500_000, 3000)]);
    const pay = line(r, 2);
    // الدفتري لـ 500,000 = 189.29$، المدفوع فعلاً 166.67$ ← ربح 22.62$
    expect(f(pay.realizedFxUsd)).toBe("22.62");
    expect(pay.balance.toString()).toBe("1500000");
    expect(f(pay.balanceUsd)).toBe("567.86");
  });
});

describe("supplier ledger — advances and overpayments", () => {
  it("an advance consumed by a later purchase realizes the rate difference", () => {
    // عربون 500,000 ج @2500 = 200$، ثم شحنة 1,000,000 @2800
    const r = replaySupplierLedger([at(-500_000, 2500), at(1_000_000, 2800)]);
    expect(line(r, 0).balance.toString()).toBe("-500000"); // لنا عند المورد
    // البضاعة المقابلة للعربون قيمتها 178.57$ بسعر الشراء، ودفعنا 200$ ← خسارة 21.43$
    expect(f(line(r, 1).realizedFxUsd)).toBe("-21.43");
    expect(r.balance.toString()).toBe("500000");
    expect(f(r.balanceUsd)).toBe("178.57");
  });

  it("overpaying flips the balance into a credit at the payment's rate", () => {
    const r = replaySupplierLedger([at(1000, "3.64"), at(-1500, "3.64")]);
    expect(r.balance.toString()).toBe("-500");
    expect(f(r.balanceUsd)).toBe("-137.36");
    expect(f(r.realizedFxUsd)).toBe("0.00");
  });

  it("a negative opening balance means the supplier owes us", () => {
    const r = replaySupplierLedger([at(-200, 1), at(500, 1)]);
    expect(r.balance.toString()).toBe("300");
  });
});

describe("supplier ledger — paying in another currency", () => {
  it("uses what actually left the wallet as the payment's USD", () => {
    // مورد صيني: شحنة 7,200 يوان @7.2 = 1,000$؛ السداد من حساب قطر 3,700 ريال @3.64 = 1,016.48$
    const r = replaySupplierLedger([at(7200, "7.2"), { amount: -7200, usd: toUsdExact(-3700, "3.64") }]);
    expect(r.balance.toString()).toBe("0");
    expect(f(r.realizedFxUsd)).toBe("-16.48");
  });
});

describe("shopMomentForDate", () => {
  const now = new Date("2026-09-29T12:00:00Z"); // 14:00 بالخرطوم
  it("today is now; past days end at 23:59:59 Khartoum", () => {
    expect(shopMomentForDate("2026-09-29", now)).toBe(now);
    expect(shopMomentForDate("2026-09-20", now)?.toISOString()).toBe("2026-09-20T21:59:59.000Z");
  });
  it("rejects future and malformed dates", () => {
    expect(shopMomentForDate("2026-09-30", now)).toBeNull();
    expect(shopMomentForDate("2026-02-30", now)).toBeNull();
    expect(shopMomentForDate("29/09/2026", now)).toBeNull();
  });
});
