import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { roleCan } from "@/lib/auth/permissions";
import { requireSession } from "@/lib/auth/session";
import { SELLING_CURRENCY, SOURCE_LABELS, getRateBoard } from "@/lib/exchange-rates";
import { formatDateTime, formatDay, formatRate } from "@/lib/format";

export default async function AdminHome() {
  const { user } = await requireSession();
  const canSeeRates = roleCan(user.role, { exchangeRate: ["read"] });
  const sdg = canSeeRates ? (await getRateBoard()).find((c) => c.currency.code === SELLING_CURRENCY) : undefined;

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

      <p className="text-muted-foreground">الشاشات القادمة تُضاف هنا تباعاً: المنتجات، الشحنات، المخزون، نقطة البيع.</p>
    </div>
  );
}
