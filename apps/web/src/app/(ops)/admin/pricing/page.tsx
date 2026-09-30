import { Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { requirePermission } from "@/lib/auth/session";
import { formatRate } from "@/lib/format";
import { listPriceReview } from "@/lib/pricing";
import { PriceTable } from "./price-table";

export const metadata: Metadata = { title: "مراجعة الأسعار | غصن" };

export default async function PricingPage({ searchParams }: { searchParams: Promise<{ q?: string; all?: string }> }) {
  await requirePermission({ price: ["approve"] });
  const { q = "", all } = await searchParams;
  const showAll = all === "1";
  const { rate, rows, counts } = await listPriceReview({ q, all: showAll });

  const chip = (active: boolean) =>
    `inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold ${
      active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"
    }`;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-bold">مراجعة الأسعار</h1>
        <p className="text-muted-foreground">
          السعر لا يتغير تلقائياً: المقترح من متوسط التكلفة وهامش القسم بسعر الجنيه الحالي
          {rate ? (
            <>
              {" "}
              (
              <bdi dir="ltr" className="tabular-nums">
                {formatRate(rate)}
              </bdi>
              )
            </>
          ) : null}
          ، مقرّباً للأعلى. الاعتماد يُسجَّل في سجل الأسعار.
        </p>
      </header>

      {!rate ? (
        <Alert variant="destructive">
          لا يوجد سعر للجنيه بعد.{" "}
          <Link href="/admin/exchange-rates" className="font-semibold underline">
            أدخليه أولاً
          </Link>
          .
        </Alert>
      ) : (
        <>
          <nav className="flex flex-wrap gap-2" aria-label="تصفية">
            <Link href={`/admin/pricing${q ? `?q=${encodeURIComponent(q)}` : ""}`} className={chip(!showAll)}>
              تحتاج مراجعة ({(counts?.LOW ?? 0) + (counts?.NEEDS_PRICE ?? 0) + (counts?.HIGH ?? 0)})
            </Link>
            <Link href={`/admin/pricing?all=1${q ? `&q=${encodeURIComponent(q)}` : ""}`} className={chip(showAll)}>
              كل الأصناف
            </Link>
          </nav>
          {counts ? (
            <p className="text-sm text-muted-foreground">
              هامش منخفض {counts.LOW} · بلا سعر {counts.NEEDS_PRICE} · هامش مرتفع {counts.HIGH}
            </p>
          ) : null}

          <form className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]" role="search">
            {showAll ? <input type="hidden" name="all" value="1" /> : null}
            <Input name="q" defaultValue={q} placeholder="ابحثي بالاسم أو الباركود أو SKU" aria-label="بحث" />
            <Button type="submit" variant="outline">
              <Search aria-hidden /> بحث
            </Button>
          </form>

          <Card>
            <CardHeader>
              <CardTitle>{showAll ? "كل الأصناف" : "أصناف تحتاج قراراً"}</CardTitle>
              <CardDescription>
                «هامش منخفض»: تحت الحد الأدنى ← رفع. «هامش مرتفع»: أعلى من المستهدف بعشر نقاط ← تخفيض (D-79). الأصناف
                التي لم تُستلم بعد لا تكلفة لها فلا اقتراح.
              </CardDescription>
            </CardHeader>
            <PriceTable
              rows={rows}
              rate={rate}
              showProduct
              emptyText={showAll ? "لا توجد أصناف." : "لا شيء يحتاج مراجعة الآن."}
            />
          </Card>
        </>
      )}
    </div>
  );
}
