import { dec, type ShipmentNote } from "@ghusn/core";
import type { Metadata } from "next";
import Link from "next/link";
import { ExportLink } from "@/components/admin/export-button";
import { PageHeader } from "@/components/admin/page-header";
import { PrintButton } from "@/components/admin/print-button";
import { PrintHeader } from "@/components/admin/print-header";
import { ChipNav, RatioBar, ReportNotes } from "@/components/admin/report-bits";
import { Card } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/session";
import { daysLabel, formatAmount, formatMargin, leadDaysLabel } from "@/lib/format";
import {
  SHIPMENT_PERIODS,
  SHIPMENT_PERIOD_LABELS,
  shipmentReport,
  type ShipmentPeriod,
  type SupplierView,
} from "@/lib/purchasing-report";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "ربحية الشحنات | غصن" };

const usd = (v: string) => `${formatAmount(v, 0)} $`;
const pct = (v: string | null) => (v === null ? "—" : formatMargin(v));
const UNPRICED = "أصناف خرج منها شيء بلا مبيعات مسجّلة بعد وصولها (تسوية أو جرد) — لا تدخل في الربح.";

function noteText(n: ShipmentNote): React.ReactNode {
  const link = (
    <Link href={`/admin/reports/shipments/${n.id}`} className="font-semibold underline underline-offset-4">
      {n.number}
    </Link>
  );
  switch (n.kind) {
    case "slow":
      return (
        <>
          {link}: بيع {pct(n.sellThrough)} فقط بعد {daysLabel(n.ageDays)} — <bdi dir="ltr">{usd(n.remainingUsd)}</bdi>{" "}
          ما زالت في المخزون.
        </>
      );
    case "best_margin":
      return (
        <>
          أعلى هامش: {link} من {n.supplierName} ({pct(n.margin)}).
        </>
      );
    case "low_margin":
      return (
        <>
          أقل هامش: {link} من {n.supplierName} ({pct(n.margin)}) — راجعي أسعار أصنافها.
        </>
      );
  }
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-end font-semibold">{children}</dd>
    </div>
  );
}

function SupplierCard({ s, period }: { s: SupplierView; period: ShipmentPeriod }) {
  return (
    <Card className="flex flex-col gap-2 p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-bold">
          {s.name} <span className="text-sm font-normal text-muted-foreground">({s.currencyCode})</span>
        </h2>
        <b
          className={cn(
            "text-lg tabular-nums",
            s.totals.margin !== null && dec(s.totals.margin).lt(0) ? "text-danger" : "text-forest",
          )}
        >
          {pct(s.totals.margin)}
        </b>
      </div>
      <dl className="divide-y divide-border text-sm tabular-nums">
        <Row label="اشترينا">
          <bdi dir="ltr">{usd(s.purchaseUsd)}</bdi> · {s.shipments === 1 ? "شحنة واحدة" : `${s.shipments} شحنات`}
        </Row>
        <Row label="تكاليف إضافية">{s.extraRatio === null ? "—" : `${pct(s.extraRatio)} من الشراء`}</Row>
        <Row label="مدة الوصول">{s.leadDays === null ? "—" : leadDaysLabel(s.leadDays)}</Row>
        <Row label="بيع منها">
          {pct(s.totals.sellThrough)} · ربح <bdi dir="ltr">{usd(s.totals.profitUsd)}</bdi>
        </Row>
        <Row label="المتبقي في المخزون">
          <bdi dir="ltr">{usd(s.totals.remainingUsd)}</bdi>
        </Row>
        <Row label="نُدين له">
          <bdi dir="ltr">{dec(s.balance).gt(0) ? `${formatAmount(s.balance, s.decimals)} ${s.symbol}` : "0"}</bdi>
        </Row>
      </dl>
      <Link
        href={`/admin/reports/shipments?p=${period}&supplier=${s.id}`}
        className="text-sm font-semibold text-muted-foreground underline-offset-4 hover:underline print:hidden"
      >
        شحناته
      </Link>
    </Card>
  );
}

export default async function ShipmentsReportPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string; view?: string; supplier?: string }>;
}) {
  const session = await requirePermission({ report: ["read"], cost: ["read"] });
  const q = await searchParams;
  const period: ShipmentPeriod = (SHIPMENT_PERIODS as readonly string[]).includes(q.p ?? "")
    ? (q.p as ShipmentPeriod)
    : "12";
  const suppliersView = q.view === "suppliers";
  const r = await shipmentReport(period);
  const shipments = q.supplier ? r.shipments.filter((s) => s.supplierId === q.supplier) : r.shipments;
  const supplierName = q.supplier ? r.suppliers.find((s) => s.id === q.supplier)?.name : null;
  const href = (p: ShipmentPeriod, view: boolean) => `?p=${p}${view ? "&view=suppliers" : ""}`;

  return (
    <div className="print-report flex flex-col gap-6">
      <PrintHeader
        title={suppliersView ? "ربحية الموردين" : "ربحية الشحنات"}
        period={SHIPMENT_PERIOD_LABELS[period]}
        issuedBy={session.user.name}
      />
      <PageHeader
        title={suppliersView ? "ربحية الموردين" : "ربحية الشحنات"}
        description="كم بعنا من كل شحنة وكم ربحت، بتكلفة وصولها الفعلية — تقديري للمقارنة (التقرير الشهري هو الرسمي)."
        actions={
          <>
            <ExportLink href={`/admin/export/shipments?p=${period}`} />
            <PrintButton />
          </>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ChipNav
          label="العرض"
          items={[
            { href: href(period, false), label: "الشحنات", active: !suppliersView },
            { href: href(period, true), label: "الموردون", active: suppliersView },
          ]}
        />
        <ChipNav
          label="الفترة"
          items={SHIPMENT_PERIODS.map((p) => ({
            href: href(p, suppliersView),
            label: SHIPMENT_PERIOD_LABELS[p],
            active: p === period,
          }))}
        />
      </div>

      {suppliersView ? (
        r.suppliers.length ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {r.suppliers.map((s) => (
              <SupplierCard key={s.id} s={s} period={period} />
            ))}
          </div>
        ) : (
          <p className="py-8 text-center text-muted-foreground">لا شحنات مستلمة في هذه الفترة.</p>
        )
      ) : (
        <>
          <ReportNotes
            notes={r.notes.map(noteText)}
            empty="لا ملاحظات — تظهر حين تمر 60 يوماً على شحنة، أو حين تُباع شحنتان على الأقل."
          />
          {supplierName ? (
            <p className="text-sm">
              شحنات <b>{supplierName}</b> فقط —{" "}
              <Link href={href(period, false)} className="font-semibold underline underline-offset-4">
                كل الشحنات
              </Link>
            </p>
          ) : null}
          <Card className="overflow-hidden">
            {shipments.length === 0 ? (
              <p className="p-8 text-center text-muted-foreground">لا شحنات مستلمة في هذه الفترة.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm tabular-nums print:min-w-0">
                  <thead className="bg-muted text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 text-start font-semibold">الشحنة</th>
                      <th className="px-3 py-3 text-end font-semibold">التكلفة $</th>
                      <th className="px-3 py-3 text-start font-semibold">بيع منها</th>
                      <th className="px-3 py-3 text-end font-semibold">ربح تقديري $</th>
                      <th className="px-3 py-3 text-end font-semibold">الهامش</th>
                      <th className="px-3 py-3 text-end font-semibold">تكاليف إضافية</th>
                      <th className="px-4 py-3 text-end font-semibold">المتبقي $</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {shipments.map((s) => {
                      return (
                        <tr key={s.id}>
                          <td className="px-4 py-2.5">
                            <Link
                              href={`/admin/reports/shipments/${s.id}`}
                              className="font-bold underline-offset-4 hover:underline"
                            >
                              {s.number}
                            </Link>
                            <span className="block text-xs text-muted-foreground">
                              {s.supplierName} · قبل {daysLabel(s.ageDays)}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-end">{formatAmount(s.totals.costUsd, 0)}</td>
                          <td className="px-3 py-2.5">
                            <span className="flex items-center gap-2">
                              <RatioBar value={s.totals.sellThrough} /> {pct(s.totals.sellThrough)}
                            </span>
                          </td>
                          <td
                            className={cn(
                              "px-3 py-2.5 text-end font-semibold",
                              dec(s.totals.profitUsd).lt(0) && "text-danger",
                            )}
                          >
                            <bdi dir="ltr">{formatAmount(s.totals.profitUsd, 0)}</bdi>
                            {s.totals.unpricedLines ? <sup title={UNPRICED}>*</sup> : null}
                          </td>
                          <td className="px-3 py-2.5 text-end">{pct(s.totals.margin)}</td>
                          <td className="px-3 py-2.5 text-end">{pct(s.extraRatio)}</td>
                          <td className="px-4 py-2.5 text-end">{formatAmount(s.totals.remainingUsd, 0)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
      {!suppliersView && shipments.some((s) => s.totals.unpricedLines) ? (
        <p className="text-xs text-muted-foreground">* {UNPRICED}</p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        «تقديري»: المخزون يُصرف من الأقدم أولاً، فالمباع من الشحنة = المستلم − المتبقي − التالف المسجّل عليها، والربح =
        المباع × متوسط سعر بيع الصنف منذ وصولها − تكلفة وصولها الفعلية. قد يختلف قليلاً عن التقرير الشهري الذي يستخدم
        متوسط التكلفة.
      </p>
    </div>
  );
}
