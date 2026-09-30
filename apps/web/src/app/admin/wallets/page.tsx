import { shopDay } from "@ghusn/core";
import { prisma } from "@ghusn/db";
import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/session";
import { formatAmount, formatDateTime, formatRate } from "@/lib/format";
import { currentRateSides, listTransfers, listWallets } from "@/lib/wallets";
import { voidTransferAction } from "./actions";
import { NewWalletForm, TransferForm } from "./forms";

export const metadata: Metadata = { title: "المحافظ | غصن" };

export default async function WalletsPage() {
  await requirePermission({ wallet: ["update"] });
  const [wallets, transfers, rates, currencies] = await Promise.all([
    listWallets(),
    listTransfers(),
    currentRateSides(),
    prisma.currency.findMany({ where: { isActive: true }, orderBy: { code: "asc" }, select: { code: true } }),
  ]);
  const active = wallets.filter((w) => w.isActive);
  const today = shopDay(new Date());

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-3xl font-bold">المحافظ</h1>
        <p className="text-muted-foreground">
          الرصيد يُحسب من كل الحركات بعد الرصيد الافتتاحي: المبيعات والمرتجعات والمصاريف والشحنات ودفعات الموردين
          والتحويلات وفروقات الورديات (D-86).
        </p>
      </header>

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {wallets.map((w) => (
          <li key={w.id}>
            <Link
              href={`/admin/wallets/${w.id}`}
              className={`flex min-h-24 flex-col gap-1 rounded-xl border border-border bg-card p-4 hover:border-primary ${w.isActive ? "" : "opacity-60"}`}
            >
              <span className="font-semibold">
                {w.name}
                {w.isActive ? null : <span className="ms-2 text-xs text-muted-foreground">(موقوفة)</span>}
              </span>
              <bdi
                dir="ltr"
                className={`text-2xl font-bold tabular-nums ${w.balance.startsWith("-") ? "text-destructive" : ""}`}
              >
                {formatAmount(w.balance, w.currencyCode === "SDG" ? 0 : 2)} {w.symbol}
              </bdi>
              <span className="text-xs text-muted-foreground">
                {w.balanceUsd && w.currencyCode !== "USD" ? (
                  <bdi dir="ltr">≈ {formatAmount(w.balanceUsd)} $ · </bdi>
                ) : null}
                {w.opening ? `من جرد ${formatDateTime(w.opening.at)}` : "بلا رصيد افتتاحي"}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <Card>
        <CardHeader>
          <CardTitle>تحويل بين محفظتين</CardTitle>
          <CardDescription>
            اكتب ما خرج من المحفظة شاملاً العمولة وما وصل فعلاً. السعر الفعلي = الواصل ÷ الخارج، ويصبح سعر العملة الساري
            لبقية اليوم.
          </CardDescription>
        </CardHeader>
        <TransferForm
          wallets={active.map(({ id, name, currencyCode, symbol, balance }) => ({
            id,
            name,
            currencyCode,
            symbol,
            balance,
          }))}
          rates={rates}
          today={today}
        />
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>التحويلات</CardTitle>
        </CardHeader>
        {transfers.length === 0 ? (
          <p className="text-muted-foreground">لا تحويلات بعد.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {transfers.map((t) => (
              <li
                key={t.id}
                className={`flex flex-wrap items-start justify-between gap-2 rounded-xl border border-border p-3 ${t.voided ? "opacity-60" : ""}`}
              >
                <div className="min-w-0">
                  <p className={`font-semibold ${t.voided ? "line-through" : ""}`}>
                    <bdi dir="ltr">{t.number}</bdi> · {t.from} ← {t.to}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatDateTime(t.occurredAt)}
                    {t.createdBy ? ` · ${t.createdBy}` : ""}
                    {t.reference ? ` · ${t.reference}` : ""}
                    {t.note ? ` · ${t.note}` : ""}
                    {t.voided ? ` · ملغى: ${t.voided.reason}` : ""}
                  </p>
                  {t.fromCurrencyCode !== t.toCurrencyCode ? (
                    <p className="text-sm">
                      السعر الفعلي:{" "}
                      <bdi dir="ltr" className="tabular-nums">
                        {[
                          "1 $",
                          ...[
                            [t.fromRate, t.fromCurrencyCode],
                            [t.toRate, t.toCurrencyCode],
                          ]
                            .filter(([, code]) => code !== "USD")
                            .map(([rate = "", code]) => `${formatRate(rate)} ${code}`),
                        ].join(" = ")}
                      </bdi>
                      {t.createdRate ? <span className="ms-1 text-xs text-primary">(سُجّل سعراً سارياً)</span> : null}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <bdi dir="ltr" className="font-bold tabular-nums">
                    {formatAmount(t.fromAmount)} {t.fromCurrencyCode} → {formatAmount(t.toAmount)} {t.toCurrencyCode}
                  </bdi>
                  <span dir="ltr" className="text-xs text-muted-foreground tabular-nums">
                    = {formatAmount(t.amountUsd)} ${t.feeAmount ? ` · fee ${formatAmount(t.feeAmount)}` : ""}
                  </span>
                  {!t.voided ? (
                    <form action={voidTransferAction} className="flex gap-1">
                      <input type="hidden" name="id" value={t.id} />
                      <input
                        name="reason"
                        placeholder="سبب الإلغاء"
                        aria-label="سبب الإلغاء"
                        className="min-h-9 w-32 rounded-lg border border-input bg-card px-2 text-sm"
                      />
                      <Button type="submit" size="sm" variant="ghost" className="text-destructive">
                        إلغاء
                      </Button>
                    </form>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
        {transfers.some((t) => t.createdRate) ? (
          <p className="mt-2 text-xs text-muted-foreground">
            إلغاء تحويل لا يحذف السعر الذي نتج عنه من سجل الأسعار (D-67) — أدخل سعراً جديداً إن لزم.
          </p>
        ) : null}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>محفظة جديدة</CardTitle>
          <CardDescription>مثل وكيل الصين أو مصر، أو احتياطي بالدولار. لكل محفظة عملة واحدة.</CardDescription>
        </CardHeader>
        <NewWalletForm currencies={currencies.map((c) => c.code)} />
      </Card>
    </div>
  );
}
