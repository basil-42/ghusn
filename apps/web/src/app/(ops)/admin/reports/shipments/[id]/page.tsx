import { dec } from "@ghusn/core";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { PrintButton } from "@/components/admin/print-button";
import { PrintHeader } from "@/components/admin/print-header";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/session";
import { daysLabel, leadDaysLabel, formatAmount, formatMargin, formatMonthYear, formatShortDate } from "@/lib/format";
import { shipmentProfitDetail } from "@/lib/purchasing-report";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "ربحية شحنة | غصن" };

const usd = (v: string, dp = 0) => `${formatAmount(v, dp)} $`;
const pct = (v: string | null) => (v === null ? "—" : formatMargin(v));
const qty = (v: string) => formatAmount(v, dec(v).isInteger() ? 0 : 2);

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <Card className="flex flex-col gap-1 p-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      <b className="text-xl tabular-nums">{value}</b>
      {sub ? <span className="text-xs text-muted-foreground">{sub}</span> : null}
    </Card>
  );
}

export default async function ShipmentProfitPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission({ report: ["read"], cost: ["read"] });
  const { id } = await params;
  const d = await shipmentProfitDetail(id);
  if (!d) notFound();
  const s = d.shipment;

  return (
    <div className="print-report flex flex-col gap-6">
      <PrintHeader
        title={`ربحية الشحنة ${s.number}`}
        period={`${s.supplierName} · استُلمت ${formatShortDate(s.receivedAt)}`}
        issuedBy={session.user.name}
      />
      <PageHeader
        title={`ربحية ${s.number}`}
        back={{ href: "/admin/reports/shipments", label: "ربحية الشحنات" }}
        description={
          <>
            {s.supplierName} · اشتُريت {formatShortDate(s.purchasedAt)} · استُلمت {formatShortDate(s.receivedAt)} (
            {s.leadDays > 0 ? `بعد ${daysLabel(s.leadDays)}` : "في نفس اليوم"}) ·{" "}
            <Link href={`/admin/shipments/${s.id}`} className="font-semibold underline underline-offset-4">
              صفحة الشحنة
            </Link>
          </>
        }
        actions={<PrintButton />}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="التكلفة واصلة" value={<bdi dir="ltr">{usd(s.totals.costUsd)}</bdi>} />
        <Stat
          label="تكاليف إضافية"
          value={pct(s.extraRatio)}
          sub={
            <>
              <bdi dir="ltr">{usd(s.extraUsd)}</bdi> على شراء <bdi dir="ltr">{usd(s.purchaseUsd)}</bdi>
            </>
          }
        />
        <Stat
          label="بيع منها"
          value={pct(s.totals.sellThrough)}
          sub={`${qty(s.totals.soldQty)} من ${qty(s.totals.receivedQty)} خلال ${daysLabel(s.ageDays)}`}
        />
        <Stat
          label="ربح تقديري"
          value={
            <>
              <bdi dir="ltr">{usd(s.totals.profitUsd)}</bdi>
              {s.totals.unpricedLines ? <sup>*</sup> : null}
            </>
          }
          sub={
            s.totals.unpricedLines
              ? `هامش ${pct(s.totals.margin)} · * بلا الأصناف التي لا مبيعات مسجّلة لها`
              : `هامش ${pct(s.totals.margin)}`
          }
        />
        <Stat
          label="المتبقي"
          value={<bdi dir="ltr">{usd(s.totals.remainingUsd)}</bdi>}
          sub={
            dec(s.totals.lostUsd).gt(0) ? (
              <>
                تالف/مفقود <bdi dir="ltr">{usd(s.totals.lostUsd)}</bdi>
              </>
            ) : undefined
          }
        />
      </div>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>الأصناف</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm tabular-nums print:min-w-0">
            <thead className="bg-muted text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-start font-semibold">الصنف</th>
                <th className="px-3 py-3 text-end font-semibold">المستلم</th>
                <th className="px-3 py-3 text-end font-semibold">المباع</th>
                <th className="px-3 py-3 text-end font-semibold">تالف</th>
                <th className="px-3 py-3 text-end font-semibold">المتبقي</th>
                <th className="px-3 py-3 text-end font-semibold">التكلفة $</th>
                <th className="px-3 py-3 text-end font-semibold">متوسط البيع $</th>
                <th className="px-3 py-3 text-end font-semibold">الربح $</th>
                <th className="px-4 py-3 text-end font-semibold">الهامش</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {s.lines.map((l, i) => (
                <tr key={`${l.variantId}-${i}`}>
                  <td className="px-4 py-2.5">
                    <span className="font-semibold">{l.label}</span>
                    <span className="block text-xs text-muted-foreground">{l.sku}</span>
                  </td>
                  <td className="px-3 py-2.5 text-end">{qty(l.receivedQty)}</td>
                  <td className="px-3 py-2.5 text-end">{qty(l.soldQty)}</td>
                  <td className={cn("px-3 py-2.5 text-end", dec(l.lostQty).gt(0) && "text-danger")}>
                    {dec(l.lostQty).gt(0) ? qty(l.lostQty) : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-end">{qty(l.remainingQty)}</td>
                  <td className="px-3 py-2.5 text-end">{formatAmount(l.landedUnitUsd)}</td>
                  <td className="px-3 py-2.5 text-end">{l.avgPriceUsd ? formatAmount(l.avgPriceUsd) : "—"}</td>
                  <td
                    className={cn(
                      "px-3 py-2.5 text-end font-semibold",
                      l.profitUsd && dec(l.profitUsd).lt(0) && "text-danger",
                    )}
                  >
                    {l.profitUsd ? (
                      <bdi dir="ltr">{formatAmount(l.profitUsd, 0)}</bdi>
                    ) : dec(l.soldQty).gt(0) ? (
                      <span className="text-xs font-normal text-muted-foreground">بلا مبيعات مسجّلة</span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-end">{pct(l.margin)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>نفس الأصناف من موردين آخرين</CardTitle>
          <CardDescription>
            آخر تكلفة واصلة للقطعة لكل مورد (شاملة الشحن والجمارك) — رقم دقيق من الدفعات، لا تقدير.
          </CardDescription>
        </CardHeader>
        {d.comparisons.length === 0 ? (
          <p className="text-sm text-muted-foreground">لم يُشترَ أي صنف من هذه الشحنة من مورد آخر.</p>
        ) : (
          <div className="flex flex-col gap-5">
            {d.comparisons.map((c) => {
              const cheapest = c.suppliers[0];
              return (
                <section key={c.variantId} className="flex flex-col gap-2">
                  <h3 className="font-bold">{c.label}</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[520px] text-sm tabular-nums print:min-w-0">
                      <thead className="text-xs text-muted-foreground">
                        <tr className="border-b border-border">
                          <th className="py-2 text-start font-semibold">المورد</th>
                          <th className="py-2 text-end font-semibold">تكلفة القطعة واصلة</th>
                          <th className="py-2 text-end font-semibold">مدة الوصول</th>
                          <th className="py-2 text-end font-semibold">آخر شراء</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {c.suppliers.map((x) => {
                          const diff =
                            cheapest && x !== cheapest && dec(cheapest.landedUnitUsd).gt(0)
                              ? dec(x.landedUnitUsd).minus(cheapest.landedUnitUsd).div(cheapest.landedUnitUsd)
                              : null;
                          const current = x.shipmentId === s.id;
                          return (
                            <tr key={x.supplierId} className={cn(current && "bg-muted/60")}>
                              <td className="py-2">
                                <span className="font-semibold">{x.supplierName}</span>
                                {x === cheapest ? <span className="ms-2 text-xs text-forest">الأرخص</span> : null}
                                {current ? (
                                  <span className="ms-2 text-xs text-muted-foreground">(هذه الشحنة)</span>
                                ) : (
                                  <Link
                                    href={`/admin/reports/shipments/${x.shipmentId}`}
                                    className="ms-2 text-xs text-muted-foreground underline-offset-4 hover:underline"
                                  >
                                    {x.shipmentNumber}
                                  </Link>
                                )}
                              </td>
                              <td className="py-2 text-end">
                                <bdi dir="ltr">{formatAmount(x.landedUnitUsd)} $</bdi>
                                {diff && diff.gt(0) ? (
                                  <span className="ms-1.5 text-xs text-danger">
                                    <bdi dir="ltr">+{formatMargin(diff)}</bdi>
                                  </span>
                                ) : null}
                              </td>
                              <td className="py-2 text-end">{leadDaysLabel(x.leadDays)}</td>
                              <td className="py-2 text-end">{formatMonthYear(x.receivedAt)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
