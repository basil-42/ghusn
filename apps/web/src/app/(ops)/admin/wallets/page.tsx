import { dec, roundMoney, shopDay, shopMonthRange, sum, totalsByCurrency } from "@ghusn/core";
import { prisma } from "@ghusn/db";
import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/session";
import { formatAmount, formatDateTime, formatRate } from "@/lib/format";
import { currentRateSides, listTransfers, listWallets } from "@/lib/wallets";
import { listContributions } from "@/lib/capital";
import { currentShopMonth } from "@/lib/reports";
import { safeStatus } from "@/lib/shifts";
import { voidContributionAction } from "../capital/actions";
import { ContributionForm } from "../capital/form";
import { voidTransferAction } from "./actions";
import { NewWalletForm, OpeningForm, TransferForm } from "./forms";
import { CountForm, MoneyMove } from "./money-move";
import { PageHeader } from "@/components/admin/page-header";

export const metadata: Metadata = { title: "المال | غصن" };

export default async function WalletsPage() {
  await requirePermission({ wallet: ["update"] });
  const [wallets, transfers, rates, currencies, contributions, safe] = await Promise.all([
    listWallets(),
    listTransfers(),
    currentRateSides(),
    prisma.currency.findMany({ where: { isActive: true }, orderBy: { code: "asc" }, select: { code: true } }),
    listContributions(),
    safeStatus(),
  ]);
  const active = wallets.filter((w) => w.isActive);
  const today = shopDay(new Date());
  // قيمة كل المال اليوم بالدولار (D-144): كل علبة بسعر عملتها اليوم — لرؤية أثر انخفاض الجنيه
  const totalUsd = roundMoney(sum(active.map((w) => w.balanceUsd ?? "0")));
  const missingRate = active.some((w) => w.balanceUsd === null && !dec(w.balance).isZero());
  const uncounted = active.filter((w) => !w.opening);
  // «مال دخل المحل» هذا الشهر — لمطابقة دفتر رأس المال خارج النظام (D-142)
  const month = shopMonthRange(currentShopMonth());
  const live = contributions.filter((c) => !c.voided);
  const thisMonth = live.filter((c) => c.contributedAt >= month.start && c.contributedAt < month.end);
  const monthUsd = roundMoney(sum(thisMonth.map((c) => c.amountUsd)));
  const allUsd = roundMoney(sum(live.map((c) => c.amountUsd)));
  const byCurrency = totalsByCurrency(live.map((c) => ({ currencyCode: c.currencyCode, amount: c.amount })));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="المال"
        description="كل علبة بعملتها، ورصيدها من كل حركاتها بعد عدّها الأول. «حركة مال» لما يدخل من خارج المحل أو ينتقل بين العلب أو يُصحَّح بالعدّ."
      />

      {uncounted.length ? (
        <Card className="border-gold/50">
          <CardHeader>
            <CardTitle>عدّ العلب مرة واحدة</CardTitle>
            <CardDescription>
              كم في كل علبة الآن فعلاً؟ يصير رصيدها الافتتاحي، وكل حركة بعده تُضاف إليه.
            </CardDescription>
          </CardHeader>
          <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {uncounted.map((w) => (
              <li key={w.id} className="flex flex-col gap-2 rounded-xl border border-border p-3">
                <b>{w.name}</b>
                <OpeningForm walletId={w.id} symbol={w.symbol} today={today} />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <p className="flex flex-wrap items-baseline gap-x-2 text-sm text-muted-foreground">
        قيمة المال اليوم بالدولار:
        <bdi dir="ltr" className="text-xl font-bold text-foreground tabular-nums">
          {formatAmount(totalUsd.toFixed(2))} $
        </bdi>
        <span>كل علبة بسعر عملتها اليوم{missingRate ? " · علبة بلا سعر اليوم لا تُحسب" : ""}</span>
      </p>

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
                  <bdi dir="ltr">≈ {formatAmount(w.balanceUsd)} $ اليوم · </bdi>
                ) : null}
                {w.id === safe.cashWalletId
                  ? safe.shift
                    ? `مع وردية ${safe.shift.holder}`
                    : "لا وردية مفتوحة"
                  : w.opening
                    ? `من عدّ ${formatDateTime(w.opening.at)}`
                    : "لم تُعدّ بعد"}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <Card id="move">
        <CardHeader>
          <CardTitle>حركة مال</CardTitle>
          <CardDescription>ماذا حدث؟</CardDescription>
        </CardHeader>
        <MoneyMove
          income={
            <ContributionForm
              wallets={active.map(({ id, name, currencyCode }) => ({ id, name, currencyCode }))}
              today={today}
            />
          }
          transfer={
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">
                اكتب ما خرج من العلبة شاملاً العمولة وما وصل فعلاً. السعر الفعلي = الواصل ÷ الخارج، ويصبح سعر العملة
                الساري لبقية اليوم. من الخزنة أو إليها: على الوردية المفتوحة.
              </p>
              <TransferForm
                wallets={active.map(({ id, name, currencyCode, symbol, decimals, balance }) => ({
                  id,
                  name,
                  currencyCode,
                  symbol,
                  decimals,
                  balance,
                }))}
                rates={rates}
                today={today}
              />
            </div>
          }
          count={
            <CountForm
              wallets={active.map((w) => ({ id: w.id, name: w.name, symbol: w.symbol, hasOpening: !!w.opening }))}
              today={today}
            />
          }
        />
      </Card>

      <Card id="money-in">
        <CardHeader>
          <CardTitle>مال دخل المحل</CardTitle>
          <CardDescription>
            هذا الشهر{" "}
            <bdi dir="ltr" className="font-bold text-foreground tabular-nums">
              {formatAmount(monthUsd.toFixed(2))} $
            </bdi>{" "}
            · منذ البداية{" "}
            <bdi dir="ltr" className="font-bold text-foreground tabular-nums">
              {formatAmount(allUsd.toFixed(2))} $
            </bdi>
            {byCurrency.length ? (
              <>
                {" ("}
                {byCurrency.map((c, i) => (
                  <span key={c.currencyCode}>
                    {i ? " + " : ""}
                    <bdi dir="ltr">
                      {formatAmount(c.amount.toFixed(2))} {c.currencyCode}
                    </bdi>
                  </span>
                ))}
                {")"}
              </>
            ) : null}
            . بقيمته بالدولار يوم دخوله — لمطابقة دفتر رأس المال خارج النظام.
          </CardDescription>
        </CardHeader>
        {contributions.length === 0 ? (
          <p className="text-muted-foreground">لم يدخل مال من خارج المحل بعد.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {contributions.map((c) => (
              <li
                key={c.id}
                className={`flex flex-wrap items-start justify-between gap-2 rounded-xl border border-border p-3 ${c.voided ? "opacity-60" : ""}`}
              >
                <div className="min-w-0">
                  <p className={`font-semibold ${c.voided ? "line-through" : ""}`}>
                    من {c.partnerName}
                    {c.wallet ? ` · إلى ${c.wallet}` : ""}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatDateTime(c.contributedAt)}
                    {c.note ? ` · ${c.note}` : ""}
                    {c.voided ? ` · ملغى: ${c.voided.reason}` : ""}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <bdi dir="ltr" className="font-bold tabular-nums">
                    {formatAmount(c.amount)} {c.currencyCode}
                  </bdi>
                  <span dir="ltr" className="text-xs text-muted-foreground tabular-nums">
                    = {formatAmount(c.amountUsd)} $
                  </span>
                  {!c.voided ? (
                    <form action={voidContributionAction} className="flex gap-1">
                      <input type="hidden" name="id" value={c.id} />
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
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>النقل بين العلب</CardTitle>
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

      <details className="rounded-2xl border border-border bg-card p-4">
        <summary className="cursor-pointer font-semibold">علبة جديدة</summary>
        <p className="mt-1 mb-3 text-sm text-muted-foreground">
          مثل وكيل الصين أو مصر، أو احتياطي بالدولار. لكل علبة عملة واحدة.
        </p>
        <NewWalletForm currencies={currencies.map((c) => c.code)} />
      </details>
    </div>
  );
}
