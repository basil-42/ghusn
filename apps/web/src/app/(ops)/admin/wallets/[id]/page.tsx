import { shopDay } from "@ghusn/core";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/session";
import { formatAmount, formatDateTime } from "@/lib/format";
import { MOVEMENT_LABELS, listWallets, walletStatement, type MovementKind } from "@/lib/wallets";
import { voidAdjustmentAction } from "../actions";
import { AdjustmentForm, OpeningForm, ToggleWalletForm } from "../forms";

export const metadata: Metadata = { title: "كشف محفظة | غصن" };

const LINKS: Partial<Record<MovementKind, (id: string) => string>> = {
  SALE: (id) => `/pos/receipt/${id}`,
  REFUND: (id) => `/pos/returns/${id}`,
  SHIPMENT_COST: (id) => `/admin/shipments/${id}`,
  SUPPLIER_PAYMENT: (id) => `/admin/suppliers/${id}`,
  CAPITAL: () => "/admin/capital",
};

export default async function WalletPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission({ wallet: ["update"] });
  const { id } = await params;
  const wallet = (await listWallets()).find((w) => w.id === id);
  if (!wallet) notFound();
  const rows = await walletStatement(id);
  const today = shopDay(new Date());
  const decimals = wallet.currencyCode === "SDG" ? 0 : 2;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <Link href="/admin/wallets" className="text-sm text-muted-foreground underline">
          المحافظ
        </Link>
        <h1 className="font-display text-3xl font-bold">{wallet.name}</h1>
        <p>
          الرصيد{" "}
          <bdi
            dir="ltr"
            className={`text-xl font-bold tabular-nums ${wallet.balance.startsWith("-") ? "text-destructive" : ""}`}
          >
            {formatAmount(wallet.balance, decimals)} {wallet.symbol}
          </bdi>
          {wallet.balanceUsd && wallet.currencyCode !== "USD" ? (
            <span className="text-sm text-muted-foreground">
              {" "}
              <bdi dir="ltr">≈ {formatAmount(wallet.balanceUsd)} $</bdi> بسعر اليوم
            </span>
          ) : null}
        </p>
      </header>

      {wallet.isActive ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>الرصيد الافتتاحي (جرد)</CardTitle>
              <CardDescription>
                المبلغ الموجود فعلاً في لحظة الجرد. ما قبلها لا يُحسب، وكل حركة بعدها تُضاف أو تُخصم.
              </CardDescription>
            </CardHeader>
            {wallet.opening ? (
              <p className="text-sm">
                <bdi dir="ltr" className="font-bold tabular-nums">
                  {formatAmount(wallet.opening.amount, decimals)} {wallet.symbol}
                </bdi>{" "}
                في {formatDateTime(wallet.opening.at)} — لتغييره ألغه من الكشف أدناه ثم أدخل الجديد.
              </p>
            ) : (
              <OpeningForm walletId={wallet.id} symbol={wallet.symbol} today={today} />
            )}
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>تسوية</CardTitle>
              <CardDescription>فرق جرد أو رسوم أو خطأ قديم — بسبب مكتوب ويظهر في الكشف.</CardDescription>
            </CardHeader>
            <AdjustmentForm walletId={wallet.id} symbol={wallet.symbol} today={today} />
          </Card>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>كشف الحساب</CardTitle>
          <CardDescription>أحدث 200 حركة، والرصيد بعد كل حركة.</CardDescription>
        </CardHeader>
        {rows.length === 0 ? (
          <p className="text-muted-foreground">لا حركات.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-muted-foreground">
                <tr className="border-b border-border text-start">
                  <th className="p-2 text-start font-semibold">التاريخ</th>
                  <th className="p-2 text-start font-semibold">الحركة</th>
                  <th className="p-2 text-end font-semibold">المبلغ</th>
                  <th className="p-2 text-end font-semibold">الرصيد</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const link = LINKS[r.kind]?.(r.refId);
                  const label = [MOVEMENT_LABELS[r.kind], r.ref, r.note].filter(Boolean).join(" · ");
                  return (
                    <tr key={r.rowId} className="border-b border-border last:border-0 align-top">
                      <td className="whitespace-nowrap p-2">{formatDateTime(r.at)}</td>
                      <td className="p-2">
                        {link ? (
                          <Link href={link} prefetch={false} className="underline">
                            {label}
                          </Link>
                        ) : (
                          label
                        )}
                        {r.kind === "OPENING" || r.kind === "MANUAL" ? (
                          <form action={voidAdjustmentAction} className="mt-1 flex gap-1">
                            <input type="hidden" name="id" value={r.refId} />
                            <input
                              name="reason"
                              placeholder="سبب الإلغاء"
                              aria-label="سبب الإلغاء"
                              className="min-h-9 w-28 rounded-lg border border-input bg-card px-2 text-xs"
                            />
                            <Button type="submit" size="sm" variant="ghost" className="text-destructive">
                              إلغاء
                            </Button>
                          </form>
                        ) : null}
                      </td>
                      <td
                        dir="ltr"
                        className={`p-2 text-end tabular-nums ${r.amount.startsWith("-") ? "text-destructive" : "text-primary"}`}
                      >
                        {formatAmount(r.amount, decimals)}
                      </td>
                      <td dir="ltr" className="p-2 text-end font-semibold tabular-nums">
                        {formatAmount(r.balance, decimals)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ToggleWalletForm id={wallet.id} isActive={wallet.isActive} />
    </div>
  );
}
