import { dec } from "@ghusn/core";
import type { Metadata } from "next";
import Link from "next/link";
import { ExportLink } from "@/components/admin/export-button";
import { Card } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/session";
import { daysLabel, formatAmount, formatDaysAgo, formatMargin, formatMonthYear } from "@/lib/format";
import {
  breakdownInsights,
  parsePeriod,
  profitInsights,
  staffInsights,
  stockInsights,
  type Range,
} from "@/lib/insights";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "التحليلات | غصن" };

const TABS = [
  { key: "profit", label: "الأكثر ربحاً" },
  { key: "dead", label: "الراكد" },
  { key: "reorder", label: "إعادة الطلب" },
  { key: "staff", label: "الموظفات" },
  { key: "breakdown", label: "الأقسام والمناسبات" },
] as const;
type Tab = (typeof TABS)[number]["key"];

type Params = { tab?: string; p?: string; from?: string; to?: string };

const usd = (v: string) => formatAmount(v);
const sdg = (v: string) => formatAmount(v, 0);
const pct = (v: string | null) => (v === null ? "—" : formatMargin(v));

function query(params: Params, patch: Partial<Params>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...params, ...patch })) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `?${s}` : "";
}

/** جدول بسيط بأعمدة شبكية يتمرر أفقياً على الجوال. */
function Grid({ cols, head, children }: { cols: string; head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[44rem]">
        <div
          className="grid gap-3 border-y border-border px-5 py-2 text-sm font-semibold text-muted-foreground"
          style={{ gridTemplateColumns: cols }}
        >
          {head.map((h) => (
            <span key={h}>{h}</span>
          ))}
        </div>
        <div className="divide-y divide-border">{children}</div>
      </div>
    </div>
  );
}

function Row({ cols, warm, children }: { cols: string; warm?: boolean; children: React.ReactNode }) {
  return (
    <div
      className={cn("grid items-center gap-3 px-5 py-3 text-sm tabular-nums", warm && "bg-gold/10")}
      style={{ gridTemplateColumns: cols }}
    >
      {children}
    </div>
  );
}

function SectionHead({
  title,
  sub,
  exportHref,
  extra,
}: {
  title: string;
  sub?: string;
  exportHref?: string;
  extra?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-lg font-bold">{title}</h2>
        {sub ? <span className="text-sm text-muted-foreground">{sub}</span> : null}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {extra}
        {exportHref ? <ExportLink href={exportHref} /> : null}
      </div>
    </div>
  );
}

/**
 * التحليلات (D-118) — للمالك والمديرة (`report: read` + `cost: read`).
 * الفترة تخص الربح والموظفات والأقسام؛ الراكد وإعادة الطلب يحسبان بإعدادات الضبط حتى اليوم.
 */
export default async function InsightsPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requirePermission({ report: ["read"], cost: ["read"] });
  const params = await searchParams;
  const tab: Tab = (TABS.find((t) => t.key === params.tab)?.key ?? "profit") as Tab;
  const range = parsePeriod(params);
  const stock = await stockInsights();
  const periodParams: Params = range.period ? { p: range.period } : { from: range.fromDay, to: range.toDay };
  const exportHref = (t: Tab) => `/admin/export/insights${query({ ...periodParams, tab: t }, {})}`;
  const usesPeriod = tab === "profit" || tab === "staff" || tab === "breakdown";

  const chip = (active: boolean) =>
    cn(
      "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold",
      active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card",
    );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-3xl font-bold">التحليلات</h1>
          <p className="text-muted-foreground">
            الربح والتكلفة بالدولار، والإيراد بالجنيه وبالدولار — فواتير المحل وطلبات المتجر المسلّمة.
          </p>
        </div>
        {usesPeriod ? (
          <div className="flex flex-wrap items-end gap-2">
            {(["7", "30", "90"] as const).map((p) => (
              <Link key={p} href={query({ tab }, { p })} className={chip(range.period === p)}>
                {daysLabel(p)}
              </Link>
            ))}
            <form className="flex items-end gap-2" aria-label="فترة مخصصة">
              <input type="hidden" name="tab" value={tab} />
              <input
                type="date"
                name="from"
                defaultValue={range.fromDay}
                aria-label="من"
                className="min-h-11 rounded-xl border border-input bg-card px-2"
              />
              <input
                type="date"
                name="to"
                defaultValue={range.toDay}
                aria-label="إلى"
                className="min-h-11 rounded-xl border border-input bg-card px-2"
              />
              <button type="submit" className={chip(range.period === null)}>
                عرض
              </button>
            </form>
          </div>
        ) : null}
      </header>

      <nav className="-mx-1 flex gap-1 overflow-x-auto border-b border-border px-1" aria-label="أقسام التحليلات">
        {TABS.map((t) => {
          const badge = t.key === "dead" ? stock.dead.length : t.key === "reorder" ? stock.urgentCount : 0;
          return (
            <Link
              key={t.key}
              href={query(periodParams, { tab: t.key })}
              aria-current={tab === t.key ? "page" : undefined}
              className={cn(
                "flex shrink-0 items-center gap-1.5 border-b-[3px] px-4 py-3 text-sm",
                tab === t.key ? "border-primary font-bold" : "border-transparent font-semibold text-muted-foreground",
              )}
            >
              {t.label}
              {badge ? (
                <span className="rounded-md bg-gold/20 px-1.5 text-xs font-bold text-warning">{badge}</span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      {tab === "profit" ? <ProfitTab range={range} exportHref={exportHref("profit")} /> : null}
      {tab === "staff" ? <StaffTab range={range} exportHref={exportHref("staff")} /> : null}
      {tab === "breakdown" ? <BreakdownTab range={range} exportHref={exportHref("breakdown")} /> : null}

      {tab === "dead" ? (
        <Card className="gap-0 p-0">
          <SectionHead
            title="المخزون الراكد"
            sub={`أصناف لها رصيد ولم يُبع منها شيء منذ ${daysLabel(stock.settings.deadStockDays)} (أو منذ آخر استلام إن كان أحدث)`}
            exportHref={exportHref("dead")}
            extra={
              <span className="flex flex-col rounded-xl bg-gold/15 px-3 py-1.5">
                <span className="text-xs text-warning">قيمة مجمّدة</span>
                <b className="tabular-nums text-warning">{usd(stock.deadValueUsd)} $</b>
              </span>
            }
          />
          {stock.dead.length === 0 ? (
            <p className="border-t border-border p-6 text-center text-muted-foreground">لا مخزون راكد.</p>
          ) : (
            <Grid
              cols="2.2fr 1fr 0.7fr 1fr 1.1fr 1.1fr"
              head={["الصنف", "القسم", "الرصيد", "القيمة $", "آخر بيع", "في المخزون منذ"]}
            >
              {stock.dead.map((d) => (
                <Row key={d.variantId} cols="2.2fr 1fr 0.7fr 1fr 1.1fr 1.1fr">
                  <Link href={`/admin/stock/${d.variantId}`} className="font-semibold hover:underline">
                    {d.label}
                  </Link>
                  <span>{d.category}</span>
                  <bdi dir="ltr">{formatAmount(d.qty, 0)}</bdi>
                  <b>{usd(d.valueUsd)}</b>
                  {d.lastSaleAt ? (
                    <span>{formatDaysAgo(d.lastSaleAt)}</span>
                  ) : (
                    <span className="font-semibold text-warning">لم يُبع أبداً</span>
                  )}
                  <span>{d.since ? formatMonthYear(d.since) : "—"}</span>
                </Row>
              ))}
            </Grid>
          )}
        </Card>
      ) : null}

      {tab === "reorder" ? (
        <Card className="gap-0 p-0">
          <SectionHead
            title="اقتراحات إعادة الطلب"
            sub={`المعدل من مبيعات آخر ${daysLabel(stock.settings.salesWindowDays)} · وصول الشحنة ${daysLabel(stock.settings.leadTimeDays)} · تغطية ${daysLabel(stock.settings.coverDays)} · صنف بيع منه ${stock.settings.reorderMinSold} قطع على الأقل`}
            exportHref={exportHref("reorder")}
          />
          {stock.reorder.length === 0 ? (
            <p className="border-t border-border p-6 text-center text-muted-foreground">
              لا اقتراحات — الرصيد والشحنات القادمة تكفي، أو لا مبيعات كافية بعد.
            </p>
          ) : (
            <>
              <Grid
                cols="2.2fr 0.8fr 0.7fr 0.8fr 1fr 0.8fr 1fr"
                head={["الصنف", "بيع/يوم", "الرصيد", "في الطريق", "يكفي حتى", "اطلبي", "التكلفة التقريبية $"]}
              >
                {stock.reorder.map((r) => (
                  <Row key={r.variantId} cols="2.2fr 0.8fr 0.7fr 0.8fr 1fr 0.8fr 1fr" warm={r.urgent}>
                    <Link href={`/admin/stock/${r.variantId}`} className="font-semibold hover:underline">
                      {r.label}
                    </Link>
                    <span>{r.perDay}</span>
                    <bdi dir="ltr">{formatAmount(r.qty, 0)}</bdi>
                    <span>{formatAmount(r.inboundQty, 0)}</span>
                    <b className={cn(r.urgent && "text-warning")}>
                      {r.daysLeft === "0" ? "نفد" : daysLabel(r.daysLeft ?? 0)}
                    </b>
                    <b className="text-base">{formatAmount(r.suggestQty, 0)}</b>
                    <span>{r.costUsd ? usd(r.costUsd) : "—"}</span>
                  </Row>
                ))}
              </Grid>
              <div className="flex justify-between border-t border-border bg-muted px-5 py-3 font-bold">
                <span>الإجمالي التقريبي للشحنة القادمة</span>
                <span className="tabular-nums">{usd(stock.reorderCostUsd)} $</span>
              </div>
            </>
          )}
          <p className="px-5 py-3 text-sm text-muted-foreground">
            المظلَّل: ينفد قبل أن تصل شحنة تُطلب اليوم. «في الطريق» = شحنات لم تُستلم بعد. التكلفة بمتوسط التكلفة
            الحالي. الإعدادات من الضبط.
          </p>
        </Card>
      ) : null}
    </div>
  );
}

async function ProfitTab({ range, exportHref }: { range: Range; exportHref: string }) {
  const r = await profitInsights(range);
  const cols = "2.2fr 0.7fr 1fr 1fr 1.4fr";
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="gap-1 p-4">
          <span className="text-sm text-muted-foreground">الإيراد (بعد المرتجع)</span>
          <b className="text-xl tabular-nums">{sdg(r.totals.revenueSdg)} ج.س</b>
          <span className="text-xs text-muted-foreground tabular-nums">{usd(r.totals.revenueUsd)} $</span>
        </Card>
        <Card className="gap-1 p-4">
          <span className="text-sm text-muted-foreground">مجمل الربح</span>
          <b className="text-xl tabular-nums">{usd(r.totals.profitUsd)} $</b>
          <span className="text-xs text-muted-foreground">قبل المصاريف</span>
        </Card>
        <Card className="gap-1 p-4">
          <span className="text-sm text-muted-foreground">الهامش</span>
          <b className="text-xl tabular-nums">{pct(r.totals.margin)}</b>
          <span className="text-xs text-muted-foreground">من سعر البيع</span>
        </Card>
        <Card className="gap-1 p-4">
          <span className="text-sm text-muted-foreground">أصناف بيعت</span>
          <b className="text-xl tabular-nums">{r.totals.items}</b>
          <span className="text-xs text-muted-foreground tabular-nums">{formatAmount(r.totals.pieces, 0)} قطعة</span>
        </Card>
      </div>
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1.7fr_1fr]">
        <Card className="gap-0 p-0">
          <SectionHead title="الأكثر ربحاً" exportHref={exportHref} />
          {r.byProfit.length === 0 ? (
            <p className="border-t border-border p-6 text-center text-muted-foreground">لا مبيعات في هذه الفترة.</p>
          ) : (
            <Grid cols={cols} head={["الصنف", "الكمية", "الإيراد $", "الربح $", "الهامش"]}>
              {r.byProfit.map((i) => {
                const width = i.margin ? Math.max(0, Math.min(100, dec(i.margin).mul(100).toNumber())) : 0;
                return (
                  <Row key={i.variantId} cols={cols} warm={i.belowMin}>
                    <span className="flex min-w-0 flex-col">
                      <b className="truncate">{i.label}</b>
                      <span className={cn("text-xs", i.belowMin ? "text-warning" : "text-muted-foreground")}>
                        {i.category}
                        {i.belowMin ? ` · الهامش تحت الحد الأدنى (${formatMargin(i.minMargin)})` : ""}
                      </span>
                    </span>
                    <span>{formatAmount(i.qty, 0)}</span>
                    <span>{usd(i.revenueUsd)}</span>
                    <b>{usd(i.profitUsd)}</b>
                    <span className="flex items-center gap-2">
                      <span className="flex h-2 flex-1 rounded bg-muted" aria-hidden>
                        <span
                          className={cn("rounded", i.belowMin ? "bg-gold" : "bg-sage")}
                          style={{ width: `${width}%` }}
                        />
                      </span>
                      <span className={cn(i.belowMin && "font-bold text-warning")}>{pct(i.margin)}</span>
                    </span>
                  </Row>
                );
              })}
            </Grid>
          )}
        </Card>
        <Card className="gap-2 p-5">
          <h2 className="text-lg font-bold">الأكثر مبيعاً (بالكمية)</h2>
          <p className="text-xs text-muted-foreground">للمقارنة: الأكثر بيعاً ليس دائماً الأكثر ربحاً.</p>
          <ul className="divide-y divide-border">
            {r.byQty.map((i) => (
              <li key={i.variantId} className="flex justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 truncate">{i.label}</span>
                <b className="tabular-nums">{formatAmount(i.qty, 0)}</b>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <p className="text-sm text-muted-foreground">
        الربح = الإيراد بسعر جنيه يوم البيع − التكلفة بالمتوسط المرجّح وقت البيع، بعد طرح المرتجع.
      </p>
    </>
  );
}

async function StaffTab({ range, exportHref }: { range: Range; exportHref: string }) {
  const rows = await staffInsights(range);
  const cols = "1.4fr 0.8fr 1.3fr 1.1fr 1fr 1.1fr 0.9fr";
  return (
    <Card className="gap-0 p-0">
      <SectionHead
        title="مبيعات كل موظفة"
        sub="فواتير المحل في الفترة (طلبات المتجر لا تُنسب لبائعة)"
        exportHref={exportHref}
      />
      {rows.length === 0 ? (
        <p className="border-t border-border p-6 text-center text-muted-foreground">لا فواتير في هذه الفترة.</p>
      ) : (
        <Grid
          cols={cols}
          head={["الموظفة", "الفواتير", "الإجمالي ج.س", "متوسط الفاتورة", "الخصومات", "الربح $", "بموافقة"]}
        >
          {rows.map((r) => (
            <Row key={r.name} cols={cols}>
              <b>{r.name}</b>
              <span>{r.count}</span>
              <b>{sdg(r.totalSdg)}</b>
              <span>{sdg(r.avgSdg)}</span>
              <span>
                {sdg(r.discountSdg)}
                {r.discountRate ? (
                  <span className="text-xs text-muted-foreground"> ({formatMargin(r.discountRate)})</span>
                ) : null}
              </span>
              <span>{usd(r.profitUsd)}</span>
              <span>{r.approvals}</span>
            </Row>
          ))}
        </Grid>
      )}
    </Card>
  );
}

async function BreakdownTab({ range, exportHref }: { range: Range; exportHref: string }) {
  const { categories, occasions } = await breakdownInsights(range);
  const cols = "1.4fr 1.2fr 1fr 0.8fr";
  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
      <Card className="gap-0 p-0">
        <SectionHead title="حسب القسم" exportHref={exportHref} />
        {categories.length === 0 ? (
          <p className="border-t border-border p-6 text-center text-muted-foreground">لا مبيعات في هذه الفترة.</p>
        ) : (
          <Grid cols={cols} head={["القسم", "الإيراد ج.س", "الربح $", "الهامش"]}>
            {categories.map((c) => (
              <Row key={c.label} cols={cols} warm={c.belowMin}>
                <b>{c.label}</b>
                <span>{sdg(c.revenueSdg)}</span>
                <span className={cn(c.belowMin && "font-bold text-warning")}>{usd(c.profitUsd)}</span>
                <span className={cn(c.belowMin && "font-bold text-warning")}>{pct(c.margin)}</span>
              </Row>
            ))}
          </Grid>
        )}
      </Card>
      <Card className="gap-0 p-0">
        <SectionHead title="حسب المناسبة" />
        {occasions.length === 0 ? (
          <p className="border-t border-border p-6 text-center text-muted-foreground">لا مبيعات في هذه الفترة.</p>
        ) : (
          <Grid cols={cols} head={["المناسبة", "الإيراد ج.س", "الربح $", "القطع"]}>
            {occasions.map((o) => (
              <Row key={o.label} cols={cols}>
                <b>{o.label}</b>
                <span>{sdg(o.revenueSdg)}</span>
                <span>{usd(o.profitUsd)}</span>
                <span>{formatAmount(o.qty, 0)}</span>
              </Row>
            ))}
          </Grid>
        )}
        <p className="px-5 py-3 text-xs text-muted-foreground">
          الصنف الذي له أكثر من مناسبة يُحسب في كل مناسباته، لذلك قد يزيد المجموع عن إجمالي المبيعات.
        </p>
      </Card>
    </div>
  );
}
