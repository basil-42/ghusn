import { dec, trendNotes, type TrendNote } from "@ghusn/core";
import { Lightbulb } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ExportLink } from "@/components/admin/export-button";
import { PageHeader } from "@/components/admin/page-header";
import { PrintButton } from "@/components/admin/print-button";
import { PrintHeader } from "@/components/admin/print-header";
import { TrendChart } from "@/components/admin/trend-chart";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/session";
import { formatAmount, formatMargin, formatMonthKey, formatPercent } from "@/lib/format";
import { currentShopMonth, monthlyTrend, reportMonths, type TrendRow } from "@/lib/reports";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "الاتجاه | غصن" };

const METRICS = [
  { key: "net", label: "صافي الربح", field: "netProfitUsd" },
  { key: "revenue", label: "المبيعات", field: "revenueUsd" },
  { key: "gross", label: "مجمل الربح", field: "grossProfitUsd" },
  { key: "expenses", label: "المصاريف", field: "expensesUsd" },
  { key: "margin", label: "الهامش", field: "margin" },
] as const;
type Metric = (typeof METRICS)[number];

const usd = (v: string) => `${formatAmount(v, 0)} $`;
/** نسبة بلا إشارة (النص يقول نمت/تراجعت). */
const pctAbs = (v: { toString(): string }) => formatMargin(dec(v.toString()).abs());
const value = (r: TrendRow, m: Metric) => (m.field === "margin" ? (r.margin ?? "0") : r[m.field]);

/** تغيّر الشهر عن الذي قبله: نسبة للمبالغ، ونقاط للهامش. */
function change(cur: TrendRow, prev: TrendRow | undefined, m: Metric): { text: string; up: boolean } | null {
  if (!prev) return null;
  if (m.field === "margin") {
    if (cur.margin === null || prev.margin === null) return null;
    const pts = dec(cur.margin).minus(prev.margin).mul(100);
    if (pts.isZero()) return null;
    return { text: `${pts.gt(0) ? "+" : "−"}${pts.abs().toFixed(1)} نقطة`, up: pts.gt(0) };
  }
  const a = dec(value(cur, m));
  const b = dec(value(prev, m));
  const diff = a.minus(b);
  if (diff.isZero()) return null;
  // النسبة مفهومة فقط من أساس موجب؛ من خسارة أو أساس صغير جداً نعرض الفرق بالدولار
  const pct = b.gt(0) && a.gte(0) ? diff.div(b) : null;
  if (pct && pct.abs().lt(10)) return { text: formatPercent(pct.toFixed(4)), up: diff.gt(0) };
  return { text: `${diff.gt(0) ? "+" : "−"}${formatAmount(diff.abs(), 0)} $`, up: diff.gt(0) };
}

function noteText(n: TrendNote): string {
  switch (n.kind) {
    case "margin_down":
      return `الهامش نزل ${n.months} أشهر متتالية (${formatMargin(n.from)} ← ${formatMargin(n.to)}) — راجعي الأسعار وتكلفة الشحنات الأخيرة.`;
    case "expenses_outpace": {
      const rev = dec(n.revenueGrowth);
      const sales = rev.gte(0) ? `${rev.isZero() ? "ثبتت" : `نمت ${pctAbs(rev)}`}` : `تراجعت ${pctAbs(rev)}`;
      return `المصاريف نمت ${pctAbs(n.expensesGrowth)} في آخر 3 أشهر بينما المبيعات ${sales}.`;
    }
    case "best":
      return `أفضل شهر: ${formatMonthKey(n.month)} بصافي ربح ${usd(n.netProfitUsd)}.`;
    case "worst":
      return dec(n.netProfitUsd).lt(0)
        ? `أضعف شهر: ${formatMonthKey(n.month)} بخسارة ${usd(dec(n.netProfitUsd).abs().toFixed(2))}.`
        : `أضعف شهر: ${formatMonthKey(n.month)} بصافي ربح ${usd(n.netProfitUsd)}.`;
  }
}

export default async function TrendPage({ searchParams }: { searchParams: Promise<{ m?: string; end?: string }> }) {
  const session = await requirePermission({ report: ["read"] });
  const params = await searchParams;
  const metric = METRICS.find((x) => x.key === params.m) ?? METRICS[0];
  const months = await reportMonths();
  const end = params.end && months.includes(params.end) ? params.end : currentShopMonth();
  const rows = await monthlyTrend(end, 12);
  const notes = trendNotes(rows.filter((r) => r.complete));
  const period = rows.length
    ? `${formatMonthKey(rows[0]?.month ?? end)} – ${formatMonthKey(rows[rows.length - 1]?.month ?? end)}`
    : formatMonthKey(end);
  const query = (m: string) => `?m=${m}${params.end ? `&end=${end}` : ""}`;

  return (
    <div className="print-report flex flex-col gap-6">
      <PrintHeader title={`الاتجاه — ${metric.label}`} period={period} issuedBy={session.user.name} />
      <PageHeader
        title="الاتجاه"
        description="آخر 12 شهراً بنفس أرقام التقرير الشهري — الشهر الجاري جزئي حتى اليوم ولا يدخل في الملاحظات."
        actions={
          <>
            <form className="flex items-center gap-2">
              <input type="hidden" name="m" value={metric.key} />
              <select
                name="end"
                defaultValue={end}
                className="min-h-11 flex-1 rounded-xl border border-input bg-card px-3"
                aria-label="حتى شهر"
              >
                {months.map((x) => (
                  <option key={x} value={x}>
                    حتى {x}
                  </option>
                ))}
              </select>
              <button type="submit" className="min-h-11 rounded-xl border border-border px-4 font-semibold">
                عرض
              </button>
            </form>
            <ExportLink href={`/admin/export/trend?end=${end}`} />
            <PrintButton />
          </>
        }
      />

      <nav aria-label="المؤشر" className="flex flex-wrap gap-2 print:hidden">
        {METRICS.map((x) => (
          <Link
            key={x.key}
            href={query(x.key)}
            aria-current={x.key === metric.key ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold",
              x.key === metric.key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card",
            )}
          >
            {x.label}
          </Link>
        ))}
      </nav>

      <Card>
        <CardHeader>
          <CardTitle>{metric.label} شهرياً</CardTitle>
        </CardHeader>
        <div className="px-4 pb-4">
          {rows.length ? (
            <TrendChart
              bars={rows.map((r) => ({ month: r.month, value: value(r, metric), partial: !r.complete }))}
              format={(v) => (metric.field === "margin" ? formatMargin(v) : formatAmount(v, 0))}
            />
          ) : (
            <p className="py-8 text-center text-muted-foreground">لا نشاط بعد.</p>
          )}
        </div>
      </Card>

      <section aria-labelledby="notes" className="rounded-2xl border border-gold/40 bg-gold/10 p-5">
        <h2 id="notes" className="mb-3 flex items-center gap-2 font-bold">
          <Lightbulb aria-hidden className="size-5 text-warning" /> ملاحظات
        </h2>
        {notes.length ? (
          <ul className="flex list-disc flex-col gap-1.5 ps-5 text-sm">
            {notes.map((n) => (
              <li key={n.kind}>{noteText(n)}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">لا ملاحظات بعد — تظهر حين تكتمل أشهر أكثر.</p>
        )}
      </section>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm tabular-nums print:min-w-0">
            <thead className="bg-muted text-start text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-start font-semibold">الشهر</th>
                <th className="px-3 py-3 text-end font-semibold">صافي المبيعات</th>
                <th className="px-3 py-3 text-end font-semibold">المبيعات $</th>
                <th className="px-3 py-3 text-end font-semibold">مجمل الربح $</th>
                <th className="px-3 py-3 text-end font-semibold">الهامش</th>
                <th className="px-3 py-3 text-end font-semibold">المصاريف $</th>
                <th className="px-3 py-3 text-end font-semibold">صافي الربح $</th>
                <th className="px-4 py-3 text-end font-semibold">تغيّر {metric.label}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {[...rows].reverse().map((r) => {
                const i = rows.indexOf(r);
                const c = change(r, rows[i - 1], metric);
                // صعود المصاريف سيئ، وصعود البقية جيد
                const good = c ? (metric.field === "expensesUsd" ? !c.up : c.up) : true;
                return (
                  <tr key={r.month} className={cn(!r.complete && "text-muted-foreground")}>
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/admin/reports?month=${r.month}`}
                        className="font-semibold underline-offset-4 hover:underline"
                      >
                        {formatMonthKey(r.month)}
                      </Link>
                      {r.complete ? null : <span className="ms-1 text-xs">(جزئي)</span>}
                    </td>
                    <td className="px-3 py-2.5 text-end">
                      <bdi dir="ltr">{formatAmount(r.netSalesSdg, 0)} ج.س</bdi>
                    </td>
                    <td className="px-3 py-2.5 text-end">{formatAmount(r.revenueUsd, 0)}</td>
                    <td className="px-3 py-2.5 text-end">{formatAmount(r.grossProfitUsd, 0)}</td>
                    <td className="px-3 py-2.5 text-end">{r.margin === null ? "—" : formatMargin(r.margin)}</td>
                    <td className="px-3 py-2.5 text-end">{formatAmount(r.expensesUsd, 0)}</td>
                    <td className={cn("px-3 py-2.5 text-end font-bold", dec(r.netProfitUsd).lt(0) && "text-danger")}>
                      <bdi dir="ltr">{formatAmount(r.netProfitUsd, 0)}</bdi>
                    </td>
                    <td
                      className={cn(
                        "px-4 py-2.5 text-end text-xs font-semibold",
                        c && (good ? "text-forest" : "text-danger"),
                      )}
                    >
                      {c ? <bdi dir="ltr">{c.text}</bdi> : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="text-xs text-muted-foreground">
        المبالغ بالدولار (عملة الأساس) بسعر يوم كل عملية. اضغطي على أي شهر لفتح تقريره الشهري الكامل.
      </p>
    </div>
  );
}
