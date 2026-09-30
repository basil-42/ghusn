import { capitalRecovery, dec, monthProfit, shopDay, shopMonthRange, sumUsd, totalsByCurrency } from "@ghusn/core";
import { prisma } from "@ghusn/db";
import { totalCapitalUsd } from "./capital";

/** الشهر الحالي بتوقيت المحل: YYYY-MM. */
export const currentShopMonth = () => shopDay(new Date()).slice(0, 7);

/** الأرقام الخام لفترة (بالدولار، وبالجنيه للمعلومة). */
async function figures(range: { start: Date; end: Date }) {
  const within = { gte: range.start, lt: range.end };
  const [sales, returns, expenses, lateCostLoss, shipmentLoss] = await Promise.all([
    prisma.sale.aggregate({
      where: { createdAt: within },
      _count: true,
      _sum: { totalSdg: true, revenueUsd: true, cogsUsd: true, lineDiscountSdg: true, invoiceDiscountSdg: true },
    }),
    prisma.saleReturn.aggregate({
      where: { createdAt: within },
      _count: true,
      _sum: { refundSdg: true, refundUsd: true, restockCostUsd: true, damagedCostUsd: true },
    }),
    prisma.expense.findMany({
      where: { spentAt: within, voidedAt: null },
      select: { amount: true, currencyCode: true, amountUsd: true, category: { select: { name: true } } },
    }),
    // تكلفة متأخرة تخص وحدات خرجت (D-78)
    prisma.stockMovement.aggregate({ where: { createdAt: within }, _sum: { expenseUsd: true } }),
    // بنود شحنات لم يصل منها شيء سليم (D-78) — بتاريخ الاستلام
    prisma.shipmentLine.aggregate({ where: { shipment: { receivedAt: within } }, _sum: { lossUsd: true } }),
  ]);
  const s = (v: { toString(): string } | null | undefined) => v?.toString() ?? "0";
  const byCategory = new Map<string, { usd: string[]; rows: { currencyCode: string; amount: string }[] }>();
  for (const e of expenses) {
    const c = byCategory.get(e.category.name) ?? { usd: [], rows: [] };
    c.usd.push(e.amountUsd.toString());
    c.rows.push({ currencyCode: e.currencyCode, amount: e.amount.toString() });
    byCategory.set(e.category.name, c);
  }
  return {
    salesCount: sales._count,
    salesSdg: s(sales._sum.totalSdg),
    discountsSdg: dec(s(sales._sum.lineDiscountSdg)).plus(s(sales._sum.invoiceDiscountSdg)).toString(),
    revenueUsd: s(sales._sum.revenueUsd),
    cogsUsd: s(sales._sum.cogsUsd),
    returnsCount: returns._count,
    refundSdg: s(returns._sum.refundSdg),
    refundUsd: s(returns._sum.refundUsd),
    restockCostUsd: s(returns._sum.restockCostUsd),
    damagedCostUsd: s(returns._sum.damagedCostUsd),
    expensesUsd: sumUsd(expenses.map((e) => e.amountUsd.toString())).toFixed(2),
    expensesByCurrency: totalsByCurrency(
      expenses.map((e) => ({ currencyCode: e.currencyCode, amount: e.amount.toString() })),
    ).map((x) => ({ currencyCode: x.currencyCode, amount: x.amount.toFixed(2) })),
    expensesByCategory: [...byCategory.entries()]
      .map(([name, c]) => ({
        name,
        usd: sumUsd(c.usd).toFixed(2),
        original: totalsByCurrency(c.rows).map((x) => ({ currencyCode: x.currencyCode, amount: x.amount.toFixed(2) })),
      }))
      .sort((a, b) => dec(b.usd).comparedTo(a.usd)),
    stockLossUsd: dec(s(lateCostLoss._sum.expenseUsd)).plus(s(shipmentLoss._sum.lossUsd)).toFixed(2),
  };
}

/** أول شهر فيه نشاط — بداية حساب الربح التراكمي لاسترداد رأس المال. */
async function firstActivity(): Promise<Date | null> {
  const [sale, expense] = await Promise.all([
    prisma.sale.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    prisma.expense.findFirst({ where: { voidedAt: null }, orderBy: { spentAt: "asc" }, select: { spentAt: true } }),
  ]);
  const dates = [sale?.createdAt, expense?.spentAt].filter((d): d is Date => !!d);
  return dates.length ? new Date(Math.min(...dates.map((d) => d.getTime()))) : null;
}

/**
 * التقرير الشهري (D-83): الربح بالدولار (عملة الأساس — D-20) والمبالغ الفعلية بالجنيه بجانبه،
 * ثم استرداد رأس المال: الربح كله يسترد التمويل أولاً، وبعد اكتماله يُوزَّع 25% لكل شريك.
 */
export async function monthlyReport(month: string) {
  const range = shopMonthRange(month);
  const f = await figures(range);
  const profit = monthProfit({
    revenueUsd: f.revenueUsd,
    refundUsd: f.refundUsd,
    cogsUsd: f.cogsUsd,
    restockCostUsd: f.restockCostUsd,
    expensesUsd: f.expensesUsd,
    stockLossUsd: f.stockLossUsd,
  });

  // الربح التراكمي قبل هذا الشهر
  const first = await firstActivity();
  let profitBefore = dec(0);
  if (first && first < range.start) {
    const before = await figures({ start: first, end: range.start });
    profitBefore = monthProfit({
      revenueUsd: before.revenueUsd,
      refundUsd: before.refundUsd,
      cogsUsd: before.cogsUsd,
      restockCostUsd: before.restockCostUsd,
      expensesUsd: before.expensesUsd,
      stockLossUsd: before.stockLossUsd,
    }).netProfitUsd;
  }
  const capitalUsd = await totalCapitalUsd(range.end);
  const capital = capitalRecovery({ capitalUsd, profitBeforeUsd: profitBefore, monthProfitUsd: profit.netProfitUsd });

  return {
    month,
    ...f,
    netRevenueUsd: profit.netRevenueUsd.toFixed(2),
    netCogsUsd: profit.netCogsUsd.toFixed(2),
    grossProfitUsd: profit.grossProfitUsd.toFixed(2),
    grossMargin: profit.grossMargin?.toString() ?? null,
    netProfitUsd: profit.netProfitUsd.toFixed(2),
    netSalesSdg: dec(f.salesSdg).minus(f.refundSdg).toFixed(0),
    capital: {
      totalUsd: capitalUsd,
      profitBeforeUsd: profitBefore.toFixed(2),
      recoveredUsd: capital.recoveredUsd.toFixed(2),
      remainingUsd: capital.remainingUsd.toFixed(2),
      toCapitalThisMonthUsd: capital.toCapitalThisMonthUsd.toFixed(2),
      distributableUsd: capital.distributableUsd.toFixed(2),
      perPartnerUsd: capital.perPartnerUsd.toFixed(2),
      fullyRecovered: capital.fullyRecovered,
    },
  };
}

/** قائمة الأشهر المتاحة (من أول نشاط حتى الآن). */
export async function reportMonths(): Promise<string[]> {
  const first = await firstActivity();
  const now = currentShopMonth();
  if (!first) return [now];
  const months: string[] = [];
  let [y, m] = shopDay(first).slice(0, 7).split("-").map(Number) as [number, number];
  for (;;) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    months.push(key);
    if (key >= now || months.length > 120) break;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return months.reverse();
}
