import { dec, type AdjustmentReason } from "@ghusn/core";
import type { Metadata } from "next";
import Link from "next/link";
import { ExportLink } from "@/components/admin/export-button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { roleCan } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { formatAmount, formatMargin } from "@/lib/format";
import { currentShopMonth, monthlyReport, reportMonths } from "@/lib/reports";
import { REASON_LABELS } from "@/lib/stock-adjustments";

export const metadata: Metadata = { title: "التقرير الشهري | غصن" };

const usd = (v: string) => `${formatAmount(v)} $`;
const sdg = (v: string) => `${formatAmount(v, 0)} ج.س`;
/** خسارة موجبة تُعرض «−»، والمكسب «+». */
const signedUsd = (v: string) => `${dec(v).gt(0) ? "−" : dec(v).lt(0) ? "+" : ""} ${usd(dec(v).abs().toFixed(2))}`;

function Row({ label, value, sub, strong }: { label: string; value: string; sub?: string; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-2 ${strong ? "text-lg font-bold" : ""}`}>
      <dt>{label}</dt>
      <dd className="text-end tabular-nums">
        <bdi dir="ltr">{value}</bdi>
        {sub ? <span className="block text-xs font-normal text-muted-foreground">{sub}</span> : null}
      </dd>
    </div>
  );
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const session = await requirePermission({ report: ["read"] });
  const { month: m } = await searchParams;
  const months = await reportMonths();
  const month = m && /^\d{4}-\d{2}$/.test(m) ? m : currentShopMonth();
  const r = await monthlyReport(month);
  const loss = dec(r.netProfitUsd).lt(0);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">التقرير الشهري</h1>
          <p className="text-muted-foreground">
            الربح بالدولار (عملة الأساس)، والمبالغ الفعلية بالجنيه بجانبه للمعلومة.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form className="flex items-center gap-2">
            <select
              name="month"
              defaultValue={month}
              className="min-h-11 rounded-xl border border-input bg-card px-3"
              aria-label="الشهر"
            >
              {months.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
            <button type="submit" className="min-h-11 rounded-xl border border-border px-4 font-semibold">
              عرض
            </button>
          </form>
          <ExportLink href={`/admin/export/report?month=${month}`} />
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>الربح والخسارة — {month}</CardTitle>
          </CardHeader>
          <dl className="divide-y divide-border">
            <Row
              label={`المبيعات (${r.salesCount} فاتورة${r.ordersCount ? ` + ${r.ordersCount} طلب متجر` : ""})`}
              value={usd(r.revenueUsd)}
              sub={r.ordersCount ? `${sdg(r.salesSdg)} + المتجر ${sdg(r.ordersSdg)}` : sdg(r.salesSdg)}
            />
            <Row label={`المرتجعات (${r.returnsCount})`} value={`− ${usd(r.refundUsd)}`} sub={sdg(r.refundSdg)} />
            <Row label="صافي المبيعات" value={usd(r.netRevenueUsd)} sub={sdg(r.netSalesSdg)} strong />
            <Row
              label="تكلفة البضاعة المباعة"
              value={`− ${usd(r.netCogsUsd)}`}
              sub={`بعد ما عاد للمخزون ${usd(r.restockCostUsd)}`}
            />
            <Row
              label="مجمل الربح"
              value={usd(r.grossProfitUsd)}
              sub={r.grossMargin ? `هامش ${formatMargin(r.grossMargin)}` : undefined}
              strong
            />
            <Row
              label="المصاريف"
              value={`− ${usd(r.expensesUsd)}`}
              sub={r.expensesByCurrency
                .map((x) => `${formatAmount(x.amount, x.currencyCode === "SDG" ? 0 : 2)} ${x.currencyCode}`)
                .join(" + ")}
            />
            {!dec(r.stockLossUsd).isZero() ? (
              <Row
                label={dec(r.stockLossUsd).gt(0) ? "خسائر المخزون" : "مكسب المخزون (صافي)"}
                value={`${dec(r.stockLossUsd).gt(0) ? "−" : "+"} ${usd(dec(r.stockLossUsd).abs().toFixed(2))}`}
                sub="تسويات المخزون، وتكلفة متأخرة لوحدات بيعت، وبنود شحنات لم تصل"
              />
            ) : null}
            {!dec(r.cashDifferenceUsd).isZero() ? (
              <Row
                label={dec(r.cashDifferenceUsd).lt(0) ? "عجز الصندوق (صافي)" : "زيادة الصندوق (صافي)"}
                value={`${dec(r.cashDifferenceUsd).lt(0) ? "−" : "+"} ${usd(dec(r.cashDifferenceUsd).abs().toFixed(2))}`}
                sub={`فروقات عدّ الورديات ${sdg(dec(r.cashDifferenceSdg).abs().toFixed(0))}`}
              />
            ) : null}
            <div
              className={`flex items-baseline justify-between gap-3 py-3 text-2xl font-bold ${loss ? "text-destructive" : ""}`}
            >
              <dt>{loss ? "صافي الخسارة" : "صافي الربح"}</dt>
              <dd dir="ltr" className="tabular-nums">
                {usd(r.netProfitUsd)}
              </dd>
            </div>
          </dl>
          <p className="text-xs text-muted-foreground">
            الخصومات الممنوحة: {sdg(r.discountsSdg)}. التالف من المرتجعات: {usd(r.damagedCostUsd)} (ضمن التكلفة). فروقات
            العملة على حسابات الموردين تُضاف في تقرير لاحق.
          </p>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>رأس المال والتوزيع</CardTitle>
              <CardDescription>
                الربح كله يسترد تمويل باسل أولاً؛ بعد اكتماله يُوزَّع 25% لكل شريك (D-83).
              </CardDescription>
            </CardHeader>
            <dl className="divide-y divide-border">
              <Row label="التمويل الكلي" value={usd(r.capital.totalUsd)} />
              <Row label="لاسترداد رأس المال هذا الشهر" value={usd(r.capital.toCapitalThisMonthUsd)} />
              <Row label="المسترد حتى الآن" value={usd(r.capital.recoveredUsd)} />
              <Row label="المتبقي للاسترداد" value={usd(r.capital.remainingUsd)} strong />
              <Row label="قابل للتوزيع هذا الشهر" value={usd(r.capital.distributableUsd)} strong />
              {dec(r.capital.distributableUsd).gt(0) ? (
                <Row label="لكل شريك (25%)" value={usd(r.capital.perPartnerUsd)} strong />
              ) : null}
            </dl>
            {roleCan(session.user.role, { capital: ["update"] }) ? (
              <Link href="/admin/capital" className="text-sm font-semibold underline">
                سجل التمويل
              </Link>
            ) : null}
          </Card>

          {r.adjustmentsByReason.length ? (
            <Card>
              <CardHeader>
                <CardTitle>خسائر المخزون</CardTitle>
                <CardDescription>
                  بمتوسط التكلفة لحظة اعتماد التسوية (D-111)
                  {dec(r.netCogsUsd).gt(0)
                    ? ` · ${formatMargin(dec(r.stockLossUsd).div(r.netCogsUsd).toString())} من تكلفة المبيعات`
                    : ""}
                </CardDescription>
              </CardHeader>
              <dl className="divide-y divide-border">
                {r.adjustmentsByReason.map((a) => (
                  <Row
                    key={a.reason}
                    label={`${REASON_LABELS[a.reason as AdjustmentReason] ?? a.reason} (${a.count})`}
                    value={signedUsd(a.usd)}
                  />
                ))}
                {!dec(r.stockLossUsd).minus(r.adjustmentsUsd).isZero() ? (
                  <Row
                    label="الشحنات والتكاليف المتأخرة"
                    value={signedUsd(dec(r.stockLossUsd).minus(r.adjustmentsUsd).toFixed(2))}
                  />
                ) : null}
                <Row label="الإجمالي" value={signedUsd(r.stockLossUsd)} strong />
              </dl>
              {r.adjustmentsByUser.length ? (
                <p className="text-sm text-muted-foreground">
                  حسب من سجّلت (دون الجرد):{" "}
                  {r.adjustmentsByUser.map((u) => `${u.name} ${signedUsd(u.usd)} (${u.count})`).join(" · ")}
                </p>
              ) : null}
              <Link href="/admin/stock/adjustments" className="text-sm font-semibold underline">
                سجل التسويات
              </Link>
            </Card>
          ) : null}

          {r.cashDifferenceByCashier.length ? (
            <Card>
              <CardHeader>
                <CardTitle>فروقات الصندوق حسب الموظفة</CardTitle>
                <CardDescription>
                  الورديات التي اختلف فيها المعدود عن المتوقع — لمتابعة النمط المتكرر (D-87).
                </CardDescription>
              </CardHeader>
              <dl className="divide-y divide-border">
                {r.cashDifferenceByCashier.map((c) => (
                  <Row
                    key={c.name}
                    label={`${c.name} (${c.shifts} وردية)`}
                    value={usd(c.usd)}
                    sub={`عجز ${sdg(c.shortSdg)} · زيادة ${sdg(c.overSdg)}`}
                  />
                ))}
              </dl>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>المصاريف حسب القسم</CardTitle>
            </CardHeader>
            {r.expensesByCategory.length ? (
              <dl className="divide-y divide-border">
                {r.expensesByCategory.map((c) => (
                  <Row
                    key={c.name}
                    label={c.name}
                    value={usd(c.usd)}
                    sub={c.original
                      .map((x) => `${formatAmount(x.amount, x.currencyCode === "SDG" ? 0 : 2)} ${x.currencyCode}`)
                      .join(" + ")}
                  />
                ))}
              </dl>
            ) : (
              <p className="text-muted-foreground">لا مصاريف.</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
