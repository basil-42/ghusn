import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { roleCan } from "@/lib/auth/permissions";
import { requireSession } from "@/lib/auth/session";
import { SELLING_CURRENCY, SOURCE_LABELS, getRateBoard } from "@/lib/exchange-rates";
import { formatAmount, formatDateTime, formatDay, formatRate } from "@/lib/format";
import { countPriceReview } from "@/lib/pricing";
import { countSalesToReview } from "@/lib/sales";
import { listDueSoon } from "@/lib/shipments";

export default async function AdminHome() {
  const { user } = await requireSession();
  const canSeeRates = roleCan(user.role, { exchangeRate: ["read"] });
  const sdg = canSeeRates ? (await getRateBoard()).find((c) => c.currency.code === SELLING_CURRENCY) : undefined;
  const due = roleCan(user.role, { supplier: ["read"] }) ? await listDueSoon(7) : [];
  const priceReview = roleCan(user.role, { price: ["approve"] }) ? await countPriceReview() : null;
  const salesReview = roleCan(user.role, { sale: ["read"] }) ? await countSalesToReview() : 0;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <p className="text-muted-foreground">{formatDay(new Date())}</p>
        <h1 className="font-display text-3xl font-bold">أهلاً {user.name}</h1>
      </header>

      {sdg ? (
        <Card className="max-w-md">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>سعر الجنيه اليوم</CardTitle>
              {sdg.isStale ? (
                <Badge variant="warning">لم يُحدَّث اليوم</Badge>
              ) : (
                <Badge variant="success">محدَّث</Badge>
              )}
            </div>
            {sdg.current ? (
              <CardDescription>
                {SOURCE_LABELS[sdg.current.source]} · {formatDateTime(sdg.current.effectiveAt)}
              </CardDescription>
            ) : null}
          </CardHeader>
          <p dir="ltr" className="text-end text-4xl font-bold tabular-nums">
            {sdg.current ? `${formatRate(sdg.current.unitsPerUsd)} ${sdg.currency.symbol}` : "—"}
          </p>
          <p className="text-sm text-muted-foreground">لكل 1 دولار</p>
          <Link href="/admin/exchange-rates" className="flex items-center gap-1 text-sm font-semibold hover:underline">
            كل الأسعار والسجل <ArrowLeft aria-hidden className="size-4" />
          </Link>
        </Card>
      ) : null}

      {roleCan(user.role, { pos: ["sell"] }) ? (
        <Link
          href="/pos"
          className="flex max-w-md min-h-16 items-center justify-between gap-3 rounded-2xl bg-primary p-5 text-lg font-bold text-primary-foreground"
        >
          نقطة البيع
          <ArrowLeft aria-hidden className="size-5" />
        </Link>
      ) : null}

      {salesReview ? (
        <Link
          href="/admin/sales"
          className="flex max-w-md items-center justify-between gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-5"
        >
          <span>
            <span className="block font-bold">{salesReview} فاتورة دون اتصال تحتاج مراجعة</span>
            <span className="text-sm text-muted-foreground">
              رصيد لم يكفِ، أو سعر تغيّر، أو وردية أُغلقت قبل وصولها.
            </span>
          </span>
          <ArrowLeft aria-hidden className="size-5 shrink-0" />
        </Link>
      ) : null}

      {priceReview ? (
        <Link
          href="/admin/pricing"
          className="flex max-w-md items-center justify-between gap-3 rounded-2xl border border-gold/40 bg-gold/10 p-5"
        >
          <span>
            <span className="block font-bold">{priceReview} صنف يحتاج مراجعة سعر</span>
            <span className="text-sm text-muted-foreground">بلا سعر، أو هامشه تغيّر مع سعر الصرف أو التكلفة.</span>
          </span>
          <ArrowLeft aria-hidden className="size-5 shrink-0" />
        </Link>
      ) : null}

      {due.length ? (
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>دفعات للموردين خلال 7 أيام</CardTitle>
            <CardDescription>موعد استحقاق شحنة أو دين، والرصيد ما زال علينا.</CardDescription>
          </CardHeader>
          <ul className="flex flex-col gap-2">
            {due.map((d) => (
              <li key={d.supplierId} className="flex items-center justify-between gap-2">
                <Link href={`/admin/suppliers/${d.supplierId}`} className="font-semibold hover:underline">
                  {d.supplierName}
                </Link>
                <span className="text-sm">
                  {d.overdue ? <Badge variant="destructive">متأخر</Badge> : null}{" "}
                  <bdi dir="ltr" className="tabular-nums">
                    {formatAmount(d.balance)} {d.currencyCode}
                  </bdi>{" "}
                  · {formatDateTime(d.dueDate)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
