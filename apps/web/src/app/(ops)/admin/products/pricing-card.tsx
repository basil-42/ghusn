import { dec } from "@ghusn/core";
import { prisma } from "@ghusn/db";
import Link from "next/link";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { roleCan } from "@/lib/auth/permissions";
import { formatAmount, formatDateTime, formatMargin } from "@/lib/format";
import { REASON_LABELS, getProductPricing } from "@/lib/pricing";
import { PriceTable } from "../pricing/price-table";
import { MarginsForm } from "./margins-form";

const pct = (v: { toString(): string }) => dec(v.toString()).mul(100).toFixed();

/** بطاقة الأسعار في صفحة المنتج: الأسعار للجميع؛ التكلفة والاعتماد والسجل لمن يملك الصلاحية. */
export async function PricingCard({ productId, role }: { productId: string; role: string | null | undefined }) {
  const product = await prisma.product.findUniqueOrThrow({
    where: { id: productId },
    select: {
      type: true,
      targetMargin: true,
      minMargin: true,
      category: { select: { targetMargin: true, minMargin: true } },
    },
  });
  if (product.type !== "STOCK") return null; // مواد التغليف لا تُباع
  const canApprove = roleCan(role, { price: ["approve"] });
  const canMargins = roleCan(role, { margin: ["update"] });
  const pricing = await getProductPricing(productId, canApprove);

  return (
    <Card>
      <CardHeader>
        <CardTitle>الأسعار</CardTitle>
        <CardDescription>
          {canApprove
            ? "السعر يتغير بالاعتماد فقط ويُسجَّل. المقترح من متوسط التكلفة والهامش بسعر الجنيه الحالي."
            : "سعر البيع بالجنيه لكل متغيّر."}
        </CardDescription>
      </CardHeader>

      {canApprove && pricing.rows && pricing.rate ? (
        <PriceTable rows={pricing.rows} rate={pricing.rate} showProduct={false} />
      ) : (
        <ul className="flex flex-col gap-2">
          {pricing.prices.map((p) => (
            <li
              key={p.variantId}
              className="flex items-center justify-between gap-2 rounded-xl border border-border p-3"
            >
              <span>{p.label}</span>
              <span className="font-bold tabular-nums">
                {p.priceSdg ? `${formatAmount(p.priceSdg, 0)} ج.س` : "بلا سعر"}
              </span>
            </li>
          ))}
          {canApprove && !pricing.rate ? (
            <li className="text-sm text-destructive">
              لا يوجد سعر للجنيه —{" "}
              <Link href="/admin/exchange-rates" className="underline">
                أدخليه أولاً
              </Link>
              .
            </li>
          ) : null}
        </ul>
      )}

      {canMargins ? (
        <details className="rounded-xl border border-border p-3">
          <summary className="min-h-11 cursor-pointer content-center font-semibold">هامش خاص بهذا المنتج</summary>
          <div className="pt-3">
            <MarginsForm
              productId={productId}
              targetMargin={product.targetMargin ? pct(product.targetMargin) : ""}
              minMargin={product.minMargin ? pct(product.minMargin) : ""}
              categoryTarget={pct(product.category.targetMargin)}
              categoryMin={pct(product.category.minMargin)}
            />
          </div>
        </details>
      ) : null}

      {pricing.history.length ? (
        <details className="rounded-xl border border-border p-3">
          <summary className="min-h-11 cursor-pointer content-center font-semibold">
            سجل الأسعار ({pricing.history.length})
          </summary>
          <ul className="flex flex-col gap-2 pt-3 text-sm">
            {pricing.history.map((h) => (
              <li key={h.id} className="flex flex-col gap-0.5 border-b border-border pb-2 last:border-0">
                <span className="font-semibold tabular-nums">
                  {h.variant ? `${h.variant}: ` : ""}
                  {h.oldPriceSdg ? `${formatAmount(h.oldPriceSdg, 0)} ← ` : ""}
                  {formatAmount(h.newPriceSdg, 0)} ج.س
                  {h.margin ? ` · هامش ${formatMargin(h.margin)}` : ""}
                </span>
                <span className="text-muted-foreground">
                  {REASON_LABELS[h.reason]} · {h.by} · {formatDateTime(h.at)} · الجنيه{" "}
                  <bdi dir="ltr">{formatAmount(h.sdgPerUsd, 0)}</bdi>
                  {h.note ? ` — ${h.note}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </Card>
  );
}
