import { dec, type DiscountNote, type ReturnNote } from "@ghusn/core";
import type { Metadata } from "next";
import Link from "next/link";
import { ExportLink } from "@/components/admin/export-button";
import { PageHeader } from "@/components/admin/page-header";
import { PrintButton } from "@/components/admin/print-button";
import { PrintHeader } from "@/components/admin/print-header";
import { ChipNav, ReportNotes } from "@/components/admin/report-bits";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { roleCan } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { cancellationReport, discountReport, returnReport } from "@/lib/discounts-report";
import { daysLabel, formatAmount, formatDateTime, formatMargin, leadDaysLabel } from "@/lib/format";
import { parsePeriod } from "@/lib/insights";
import { reasonLabel } from "@/lib/return-reasons";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "الخصومات والمرتجعات | غصن" };

type Params = { p?: string; from?: string; to?: string; view?: string };
const VIEWS = [
  { key: "discounts", label: "الخصومات" },
  { key: "returns", label: "المرتجعات" },
  { key: "cancellations", label: "إلغاءات المتجر" },
] as const;
type View = (typeof VIEWS)[number]["key"];

const sdg = (v: string) => `${formatAmount(v, 0)} ج.س`;
const pct = (v: string | null) => (v === null ? "—" : formatMargin(v));
const qty = (v: string) => formatAmount(v, dec(v).isInteger() ? 0 : 2);

function query(params: Params, patch: Partial<Params>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...params, ...patch })) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `?${s}` : "";
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "bad" }) {
  return (
    <Card className="flex flex-col gap-1 p-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      <b className={cn("text-xl tabular-nums", tone === "bad" && "text-danger")}>
        <bdi dir="ltr">{value}</bdi>
      </b>
      {sub ? <span className="text-xs text-muted-foreground">{sub}</span> : null}
    </Card>
  );
}

/** جدول بسيط يتمرر أفقياً على الجوال. أول عمود نص والبقية أرقام. */
function Table({ head, rows, minWidth = 560 }: { head: string[]; rows: React.ReactNode[][]; minWidth?: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm tabular-nums print:min-w-0" style={{ minWidth }}>
        <thead className="bg-muted text-xs text-muted-foreground">
          <tr>
            {head.map((h, i) => (
              <th key={h} className={cn("px-3 py-2.5 font-semibold", i === 0 ? "text-start" : "text-end")}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className={cn("px-3 py-2.5", j === 0 ? "text-start" : "text-end")}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Section({ title, children, empty }: { title: string; children: React.ReactNode; empty?: boolean }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      {empty ? <p className="px-6 pb-6 text-sm text-muted-foreground">لا شيء في هذه الفترة.</p> : children}
    </Card>
  );
}

function discountNote(n: DiscountNote): string {
  return n.kind === "overall"
    ? `الخصومات ${pct(n.rate)} من مبيعات المحل قبل الخصم في هذه الفترة.`
    : `نسبة خصم ${n.name} ${pct(n.rate)} مقابل متوسط ${pct(n.average)} — راجعي معها سبب الخصومات.`;
}

function returnNote(n: ReturnNote): string {
  return n.kind === "top_reason"
    ? `أكثر سبب للمرتجعات: «${reasonLabel(n.code)}» (${pct(n.share)} من المرتجعات ذات السبب).`
    : `${n.label}: أُرجع ${qty(n.returnedQty)} من ${qty(n.soldQty)} بيعت (${pct(n.rate)}) — راجعي الجودة أو المقاسات.`;
}

export default async function DiscountsReportPage({ searchParams }: { searchParams: Promise<Params> }) {
  const session = await requirePermission({ report: ["read"] });
  const params = await searchParams;
  const view: View = VIEWS.find((v) => v.key === params.view)?.key ?? "discounts";
  const range = parsePeriod(params);
  const periodParams: Params = range.period ? { p: range.period } : { from: range.fromDay, to: range.toDay };
  const seesCost = roleCan(session.user.role, { cost: ["read"] });
  const periodLabel = range.period ? `آخر ${daysLabel(range.period)}` : `${range.fromDay} ← ${range.toDay}`;
  const title = VIEWS.find((v) => v.key === view)?.label ?? "";

  const [d, r, c] = await Promise.all([
    view === "discounts" ? discountReport(range) : null,
    view === "returns" ? returnReport(range) : null,
    view === "cancellations" ? cancellationReport(range) : null,
  ]);

  const chip = (active: boolean) =>
    cn(
      "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold",
      active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card",
    );

  return (
    <div className="print-report flex flex-col gap-6">
      <PrintHeader title={title} period={periodLabel} issuedBy={session.user.name} />
      <PageHeader
        title="الخصومات والمرتجعات"
        description="ما يُخصم من الأسعار، وما يعود من المبيعات، وما يُلغى من طلبات المتجر — لمعرفة أين يتسرّب المال."
        actions={
          <>
            <ExportLink href={`/admin/export/discounts${query(periodParams, {})}`} />
            <PrintButton />
          </>
        }
      />

      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <ChipNav
          label="العرض"
          items={VIEWS.map((v) => ({
            href: query(periodParams, { view: v.key }),
            label: v.label,
            active: v.key === view,
          }))}
        />
        <div className="flex flex-wrap items-end gap-2">
          {(["7", "30", "90"] as const).map((p) => (
            <Link key={p} href={query({ view }, { p })} className={chip(range.period === p)}>
              {daysLabel(p)}
            </Link>
          ))}
          <form className="flex flex-wrap items-end gap-2" aria-label="فترة مخصصة">
            <input type="hidden" name="view" value={view} />
            <input
              type="date"
              name="from"
              defaultValue={range.fromDay}
              aria-label="من"
              className="min-h-11 min-w-0 flex-1 rounded-xl border border-input bg-card px-2"
            />
            <input
              type="date"
              name="to"
              defaultValue={range.toDay}
              aria-label="إلى"
              className="min-h-11 min-w-0 flex-1 rounded-xl border border-input bg-card px-2"
            />
            <button type="submit" className={chip(range.period === null)}>
              عرض
            </button>
          </form>
        </div>
      </div>

      {d ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="الخصومات" value={sdg(d.discountSdg)} sub={`≈ ${formatAmount(d.discountUsd, 0)} $`} />
            <Stat label="من المبيعات قبل الخصم" value={pct(d.rate)} sub={sdg(d.grossSdg)} />
            <Stat
              label="فواتير بخصم"
              value={`${d.discountedInvoices} من ${d.invoices}`}
              sub={d.invoices ? pct(dec(d.discountedInvoices).div(d.invoices).toFixed(4)) : undefined}
            />
            <Stat
              label="على الصنف · على الفاتورة"
              value={`${formatAmount(d.lineDiscountSdg, 0)} · ${formatAmount(d.invoiceDiscountSdg, 0)}`}
              sub="ج.س"
            />
          </div>
          <ReportNotes notes={d.notes.map(discountNote)} empty="لا خصومات في هذه الفترة." />
          <Section title="حسب الموظفة" empty={d.staff.length === 0}>
            <Table
              head={["الموظفة", "الفواتير", "بخصم", "بموافقة", "قبل الخصم", "الخصم", "النسبة"]}
              rows={d.staff.map((s) => [
                <b key="n">{s.name}</b>,
                s.invoices,
                s.discountedInvoices,
                s.approvedInvoices || "—",
                formatAmount(s.grossSdg, 0),
                formatAmount(s.discountSdg, 0),
                pct(s.rate),
              ])}
            />
          </Section>
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Section title="أكثر الأصناف خصماً" empty={d.products.length === 0}>
              <Table
                head={["الصنف", "الكمية", "قبل الخصم", "الخصم", "النسبة"]}
                rows={d.products.map((p) => [
                  p.label,
                  qty(p.qty),
                  formatAmount(p.grossSdg, 0),
                  formatAmount(p.discountSdg, 0),
                  pct(p.rate),
                ])}
              />
            </Section>
            <Section title="أكبر الفواتير خصماً" empty={d.largest.length === 0}>
              <Table
                head={["الفاتورة", "الموظفة", "الخصم", "النسبة"]}
                rows={d.largest.map((i) => [
                  <span key="n" className="flex flex-col">
                    <Link href={`/pos/receipt/${i.id}`} className="font-semibold underline-offset-4 hover:underline">
                      <bdi dir="ltr">{i.number}</bdi>
                    </Link>
                    <span className="text-xs text-muted-foreground">{formatDateTime(i.createdAt)}</span>
                  </span>,
                  i.approvedBy ? `${i.cashier} · بموافقة ${i.approvedBy}` : i.cashier,
                  formatAmount(i.discountSdg, 0),
                  pct(i.rate),
                ])}
              />
            </Section>
          </div>
          <p className="text-xs text-muted-foreground">
            فواتير المحل فقط — المتجر الإلكتروني بلا خصومات حالياً. «بموافقة»: خصم فوق الحد المسموح وافقت عليه مديرة.
          </p>
        </>
      ) : null}

      {r ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat
              label="المرتجعات"
              value={String(r.count)}
              sub={r.exchanges ? `منها ${r.exchanges} استبدال` : undefined}
            />
            <Stat label="المسترد" value={sdg(r.refundSdg)} sub={`≈ ${formatAmount(r.refundUsd, 0)} $`} />
            <Stat label="نسبة الإرجاع" value={pct(r.rate)} sub="من مبيعات المحل في الفترة" />
            {seesCost ? (
              <Stat
                label="تكلفة التالف"
                value={`${formatAmount(r.damagedCostUsd, 0)} $`}
                tone={dec(r.damagedCostUsd).gt(0) ? "bad" : undefined}
                sub={r.avgDaysAfterSale === null ? undefined : `متوسط ${leadDaysLabel(r.avgDaysAfterSale)} بعد البيع`}
              />
            ) : (
              <Stat
                label="بعد البيع"
                value={r.avgDaysAfterSale === null ? "—" : leadDaysLabel(r.avgDaysAfterSale)}
                sub="متوسط"
              />
            )}
          </div>
          <ReportNotes notes={r.notes.map(returnNote)} empty="لا ملاحظات — تظهر مع 3 مرتجعات بسبب محدد على الأقل." />
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Section title="حسب السبب" empty={r.reasons.length === 0}>
              <Table
                minWidth={360}
                head={["السبب", "العدد", "المسترد"]}
                rows={r.reasons.map((x) => [reasonLabel(x.code), x.count, formatAmount(x.refundSdg, 0)])}
              />
            </Section>
            <Section title="أكثر الأصناف إرجاعاً" empty={r.products.length === 0}>
              <Table
                head={["الصنف", "أُرجع", "تالف", "بيع في الفترة", "المسترد"]}
                rows={r.products.map((p) => [
                  p.label,
                  qty(p.returnedQty),
                  dec(p.damagedQty).gt(0) ? qty(p.damagedQty) : "—",
                  qty(p.soldQty),
                  formatAmount(p.refundSdg, 0),
                ])}
              />
            </Section>
            <Section title="من نفّذ" empty={r.staff.length === 0}>
              <Table
                minWidth={360}
                head={["الموظفة", "المرتجعات", "بموافقة", "المسترد"]}
                rows={r.staff.map((s) => [s.name, s.count, s.approved || "—", formatAmount(s.refundSdg, 0)])}
              />
            </Section>
            <Section title="من أين رُدّ المبلغ" empty={r.wallets.length === 0}>
              <Table
                minWidth={320}
                head={["المحفظة", "المبلغ"]}
                rows={r.wallets.map((w) => [w.label, formatAmount(w.amountSdg, 0)])}
              />
            </Section>
          </div>
          <Section title="آخر المرتجعات" empty={r.recent.length === 0}>
            <Table
              minWidth={720}
              head={["المرتجع", "الفاتورة", "السبب", "الموظفة", "بعد البيع", "المسترد"]}
              rows={r.recent.map((x) => [
                <span key="n" className="flex flex-col">
                  <Link href={`/pos/returns/${x.id}`} className="font-semibold underline-offset-4 hover:underline">
                    <bdi dir="ltr">{x.number}</bdi>
                  </Link>
                  <span className="text-xs text-muted-foreground">{formatDateTime(x.createdAt)}</span>
                </span>,
                <bdi key="s" dir="ltr">
                  {x.saleNumber}
                </bdi>,
                <span key="r">
                  {reasonLabel(x.reasonCode)}
                  {x.reason ? <span className="block text-xs text-muted-foreground">{x.reason}</span> : null}
                </span>,
                x.approvedBy ? `${x.cashier} · بموافقة ${x.approvedBy}` : x.cashier,
                leadDaysLabel(x.daysAfterSale),
                `${formatAmount(x.refundSdg, 0)}${x.isExchange ? " (استبدال)" : ""}`,
              ])}
            />
          </Section>
        </>
      ) : null}

      {c ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="طلبات ملغاة" value={String(c.count)} />
            <Stat label="قيمتها" value={sdg(c.totalSdg)} />
            <Stat label="أُلغيت بعد الدفع" value={String(c.afterPayment)} tone={c.afterPayment ? "bad" : undefined} />
            <Stat label="رُدّ للعملاء" value={sdg(c.refundedSdg)} />
          </div>
          <Section title="الأسباب" empty={c.reasons.length === 0}>
            <Table minWidth={320} head={["السبب", "العدد"]} rows={c.reasons.map((x) => [x.reason, x.count])} />
          </Section>
          <p className="text-xs text-muted-foreground">
            تشمل الإلغاء التلقائي لطلبات بنكك غير المدفوعة خلال 24 ساعة. السبب كما كُتب عند الإلغاء.
          </p>
        </>
      ) : null}
    </div>
  );
}
