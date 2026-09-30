import { dec, shopDay } from "@ghusn/core";
import { prisma } from "@ghusn/db";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { roleCan } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { formatAmount, formatDateTime } from "@/lib/format";
import { COUNTRIES, ENTRY_LABELS, getSupplierStatement } from "@/lib/suppliers";
import { BalanceBadge } from "../balance";
import { EditSupplierForm, PaymentForm, VoidEntryForm } from "../forms";

export const metadata: Metadata = { title: "مورد | غصن" };

export default async function SupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission({ supplier: ["read"] });
  const { id } = await params;
  const data = await getSupplierStatement(id);
  if (!data) notFound();
  const { supplier, lines } = data;
  const cur = supplier.currency;
  const role = session.user.role;
  const canPay = roleCan(role, { supplierPayment: ["create"] });
  const canVoid = roleCan(role, { supplierPayment: ["void"] });
  const wallets = canPay
    ? await prisma.wallet.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true, currencyCode: true },
      })
    : [];
  const money = (v: string) => `${formatAmount(v, cur.decimals)} ${cur.symbol}`;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">{supplier.name}</h1>
          <p className="text-muted-foreground">
            {COUNTRIES[supplier.country] ?? supplier.country} · حساب بـ {cur.nameAr}
            {supplier.phone ? (
              <>
                {" · "}
                <bdi dir="ltr">{supplier.phone}</bdi>
              </>
            ) : null}
          </p>
        </div>
        <BalanceBadge balance={data.balance} symbol={cur.symbol} decimals={cur.decimals} />
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="gap-1">
          <CardDescription>الرصيد</CardDescription>
          <p dir="ltr" className="text-end text-2xl font-bold tabular-nums">
            {money(data.balance)}
          </p>
          <p className="text-xs text-muted-foreground">موجب = علينا للمورد</p>
        </Card>
        <Card className="gap-1">
          <CardDescription>قيمته بالدولار (بسعر يوم الشراء)</CardDescription>
          <p dir="ltr" className="text-end text-2xl font-bold tabular-nums">
            {formatAmount(data.balanceUsd)} $
          </p>
        </Card>
        <Card className="gap-1">
          <CardDescription>فروقات عملة محققة</CardDescription>
          <p dir="ltr" className="text-end text-2xl font-bold tabular-nums">
            {formatAmount(data.realizedFxUsd)} $
          </p>
          <p className="text-xs text-muted-foreground">
            {dec(data.realizedFxUsd).gt(0) ? "ربح" : dec(data.realizedFxUsd).lt(0) ? "خسارة" : "لا فرق"} من سداد بسعر
            صرف غير سعر الشراء
          </p>
        </Card>
      </section>

      {canPay ? (
        <Card>
          <CardHeader>
            <CardTitle>تسجيل دفعة</CardTitle>
            <CardDescription>تُحوَّل للدولار بسعر صرف عملة المحفظة في تاريخ الدفع.</CardDescription>
          </CardHeader>
          <PaymentForm
            supplierId={supplier.id}
            supplierCurrency={cur.code}
            today={shopDay(new Date())}
            wallets={wallets.map((w) => ({
              value: w.id,
              label: `${w.name} (${w.currencyCode})`,
              currency: w.currencyCode,
            }))}
          />
        </Card>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">كشف الحساب</h2>
        {lines.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-6 text-center text-muted-foreground">
            لا توجد حركات بعد.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {lines.map((l) => {
              const owe = dec(l.amount).gt(0);
              return (
                <li
                  key={l.id}
                  className={`flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 ${l.voided ? "opacity-60" : ""}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className={`font-semibold ${l.voided ? "line-through" : ""}`}>
                        {ENTRY_LABELS[l.kind]}
                        {l.walletName ? ` — من ${l.walletName}` : ""}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {formatDateTime(l.occurredAt)}
                        {l.createdBy ? ` · ${l.createdBy}` : ""}
                        {l.reference ? (
                          <>
                            {" · "}
                            <bdi dir="ltr">{l.reference}</bdi>
                          </>
                        ) : null}
                      </p>
                      {l.note ? <p className="text-sm">{l.note}</p> : null}
                      {l.paidAmount && l.paidCurrencyCode && l.paidCurrencyCode !== cur.code ? (
                        <p className="text-sm text-muted-foreground">
                          دُفع من المحفظة:{" "}
                          <bdi dir="ltr">
                            {formatAmount(l.paidAmount)} {l.paidCurrencyCode}
                          </bdi>
                        </p>
                      ) : null}
                    </div>
                    <div className="text-end">
                      <p dir="ltr" className={`font-bold tabular-nums ${l.voided ? "line-through" : ""}`}>
                        {owe ? "+" : "−"} {money(l.amount.replace("-", ""))}
                      </p>
                      <p className="text-xs text-muted-foreground">{owe ? "علينا" : "دفعنا"}</p>
                    </div>
                  </div>
                  {l.voided ? (
                    <p className="text-sm text-destructive">
                      ملغاة {formatDateTime(l.voided.at)}
                      {l.voided.by ? ` · ${l.voided.by}` : ""} — {l.voided.reason}
                    </p>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 text-sm">
                      <span>
                        الرصيد بعدها:{" "}
                        <bdi dir="ltr" className="font-semibold tabular-nums">
                          {l.balance ? money(l.balance) : "—"}
                        </bdi>
                        {l.realizedFxUsd ? (
                          <span className="text-muted-foreground">
                            {" "}
                            · فرق عملة{" "}
                            <bdi dir="ltr" className="tabular-nums">
                              {formatAmount(l.realizedFxUsd)} $
                            </bdi>
                          </span>
                        ) : null}
                      </span>
                      {canVoid && l.kind !== "PURCHASE" ? (
                        <VoidEntryForm supplierId={supplier.id} entryId={l.id} />
                      ) : null}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {roleCan(role, { supplier: ["update"] }) ? (
        <Card>
          <CardHeader>
            <CardTitle>بيانات المورد</CardTitle>
          </CardHeader>
          <EditSupplierForm
            supplier={{
              id: supplier.id,
              name: supplier.name,
              country: supplier.country,
              phone: supplier.phone,
              notes: supplier.notes,
              isActive: supplier.isActive,
            }}
            countries={Object.entries(COUNTRIES).map(([value, label]) => ({ value, label }))}
          />
        </Card>
      ) : null}
    </div>
  );
}
