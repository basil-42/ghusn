import { dec, shopMonthRange } from "@ghusn/core";
import { ArrowLeftRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ExportLink } from "@/components/admin/export-button";
import { PageHeader } from "@/components/admin/page-header";
import { PrintButton } from "@/components/admin/print-button";
import { PrintHeader } from "@/components/admin/print-header";
import { Card } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/session";
import { formatAmount, formatMonthKey } from "@/lib/format";
import { currentShopMonth, reportMonths } from "@/lib/reports";
import { cn } from "@/lib/utils";
import { INTERNAL_KINDS, walletFlows, type WalletFlow } from "@/lib/wallets";

export const metadata: Metadata = { title: "التدفق النقدي | غصن" };

const money = (w: WalletFlow, v: string) => `${formatAmount(v, w.decimals)} ${w.symbol}`;
const signed = (w: WalletFlow, v: string) =>
  `${dec(v).gt(0) ? "+" : dec(v).lt(0) ? "−" : ""} ${money(w, dec(v).abs().toString())}`;

function Total({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <Card className="flex flex-col gap-1 p-5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <b className={cn("text-2xl tabular-nums", tone === "good" && "text-forest", tone === "bad" && "text-danger")}>
        <bdi dir="ltr">≈ {value}</bdi>
      </b>
    </Card>
  );
}

export default async function CashFlowPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const session = await requirePermission({ report: ["read"], wallet: ["update"] });
  const { month: m } = await searchParams;
  const months = await reportMonths();
  const month = m && months.includes(m) ? m : currentShopMonth();
  const flows = await walletFlows(shopMonthRange(month));

  const sum = (pick: (w: WalletFlow) => string | null) => flows.reduce((a, w) => a.plus(pick(w) ?? 0), dec(0));
  const inUsd = sum((w) => w.inflowUsd);
  const outUsd = sum((w) => w.outflowUsd);
  const netUsd = inUsd.minus(outUsd);
  const missingRate = flows.some((w) => w.inflowUsd === null && (!dec(w.inflow).isZero() || !dec(w.outflow).isZero()));

  return (
    <div className="print-report flex flex-col gap-6">
      <PrintHeader title="التدفق النقدي" period={formatMonthKey(month)} issuedBy={session.user.name} />
      <PageHeader
        title="التدفق النقدي"
        description="من أين دخل المال وأين خرج، لكل محفظة بعملتها — نفس حركات كشف المحفظة."
        actions={
          <>
            <form className="flex items-center gap-2">
              <select
                name="month"
                defaultValue={month}
                className="min-h-11 flex-1 rounded-xl border border-input bg-card px-3"
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
            <ExportLink href={`/admin/export/cash?month=${month}`} />
            <PrintButton />
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Total label="دخل" value={`${formatAmount(inUsd, 0)} $`} />
        <Total label="خرج" value={`${formatAmount(outUsd, 0)} $`} />
        <Total
          label="الصافي"
          value={`${netUsd.lt(0) ? "−" : "+"} ${formatAmount(netUsd.abs(), 0)} $`}
          tone={netUsd.lt(0) ? "bad" : "good"}
        />
      </div>
      <p className="-mt-3 text-xs text-muted-foreground">
        الدولار تقريبي بسعر اليوم للمقارنة فقط (الأرقام الدقيقة بعملة كل محفظة أدناه). التحويلات بين المحافظ لا تُحسب
        دخلاً ولا خرجاً.{missingRate ? " محفظة بلا سعر صرف مسجّل لم تدخل في المجموع." : ""}
      </p>

      {flows.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">لا محافظ بعد.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {flows.map((w) => (
            <Card key={w.id} className="flex flex-col gap-3 p-5">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-bold">
                  {w.name} <span className="text-sm font-normal text-muted-foreground">({w.currencyCode})</span>
                  {w.isActive ? null : <span className="ms-2 text-xs text-muted-foreground">موقوفة</span>}
                </h2>
                <Link
                  href={`/admin/wallets/${w.id}`}
                  className="text-sm font-semibold text-muted-foreground underline-offset-4 hover:underline print:hidden"
                >
                  الكشف
                </Link>
              </div>
              <dl className="flex flex-col divide-y divide-border text-sm tabular-nums">
                <div className="flex justify-between gap-3 py-2 text-muted-foreground">
                  <dt>رصيد أول الشهر</dt>
                  <dd>
                    <bdi dir="ltr">{money(w, w.opening)}</bdi>
                  </dd>
                </div>
                {w.lines.length === 0 ? (
                  <div className="py-2 text-muted-foreground">لا حركة هذا الشهر.</div>
                ) : (
                  w.lines.map((l) => {
                    const internal = INTERNAL_KINDS.includes(l.kind);
                    return (
                      <div key={l.kind} className="flex justify-between gap-3 py-2">
                        <dt className={cn("flex items-center gap-1.5", internal && "text-muted-foreground")}>
                          {internal ? <ArrowLeftRight aria-hidden className="size-3.5" /> : null}
                          <Link
                            href={`/admin/wallets/${w.id}?kind=${l.kind}&month=${month}`}
                            className="underline-offset-4 hover:underline"
                          >
                            {l.label}
                          </Link>
                        </dt>
                        <dd
                          className={cn(
                            "font-semibold",
                            internal ? "text-muted-foreground" : dec(l.amount).lt(0) ? "text-danger" : "text-forest",
                          )}
                        >
                          <bdi dir="ltr">{signed(w, l.amount)}</bdi>
                        </dd>
                      </div>
                    );
                  })
                )}
                <div className="flex justify-between gap-3 py-2 text-base font-bold">
                  <dt>رصيد آخر الشهر</dt>
                  <dd>
                    <bdi dir="ltr">{money(w, w.closing)}</bdi>
                  </dd>
                </div>
              </dl>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
