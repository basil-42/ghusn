import { dec, plainNumber } from "@ghusn/core";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { roleCan } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { formatAmount, formatDateTime } from "@/lib/format";
import { stockCard } from "@/lib/stock";
import { REASON_LABELS } from "@/lib/stock-adjustments";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "كارت الصنف | غصن" };

const UNIT_LABEL: Record<string, string> = { PIECE: "حبة", METER: "متر", SHEET: "ورقة" };
type Filter = "all" | "in" | "out" | "adjust";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "كل الحركات" },
  { key: "in", label: "الداخل" },
  { key: "out", label: "الخارج" },
  { key: "adjust", label: "التسويات" },
];

/**
 * كارت الصنف (D-111): كل حركات المخزون للصنف من الدفتر الذي لا يُعدَّل — يجيب عن «أين ذهبت هذه
 * القطعة؟». الموظفة تراه بلا التكلفة.
 */
export default async function StockCardPage({
  params,
  searchParams,
}: {
  params: Promise<{ variantId: string }>;
  searchParams: Promise<{ f?: string }>;
}) {
  const session = await requirePermission({ stock: ["read"] });
  const { variantId } = await params;
  const { f } = await searchParams;
  const filter: Filter = FILTERS.some((x) => x.key === f) ? (f as Filter) : "all";
  const withCost = roleCan(session.user.role, { cost: ["read"] });
  const card = await stockCard(variantId, withCost);
  if (!card) notFound();
  const unit = UNIT_LABEL[card.unit] ?? card.unit;
  const rows = card.movements.filter((m) =>
    filter === "in"
      ? dec(m.qty).gt(0)
      : filter === "out"
        ? dec(m.qty).lt(0)
        : filter === "adjust"
          ? m.kind === "ADJUSTMENT"
          : true,
  );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Link href="/admin/stock" className="text-sm text-muted-foreground hover:underline">
            المخزون ›
          </Link>
          <h1 className="font-display text-3xl font-bold">{card.label}</h1>
          <p className="text-muted-foreground">
            <bdi dir="ltr">{card.sku}</bdi> · الرصيد{" "}
            <b className={cn("tabular-nums", dec(card.qty).lt(0) ? "text-destructive" : "text-foreground")}>
              <bdi dir="ltr">{plainNumber(card.qty)}</bdi> {unit}
            </b>
            {card.avgCostUsd ? ` · متوسط التكلفة ${formatAmount(card.avgCostUsd)} $` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href={`/admin/products/${card.productId}`}>المنتج</Link>
          </Button>
          {roleCan(session.user.role, { stock: ["adjust"] }) ? (
            <Button asChild>
              <Link href={`/admin/stock/adjustments/new?variant=${card.variantId}`}>تسوية</Link>
            </Button>
          ) : null}
        </div>
      </header>

      <nav className="flex flex-wrap gap-2" aria-label="تصفية الحركات">
        {FILTERS.map((x) => (
          <Link
            key={x.key}
            href={x.key === "all" ? `/admin/stock/${card.variantId}` : `/admin/stock/${card.variantId}?f=${x.key}`}
            aria-current={filter === x.key ? "page" : undefined}
            className={cn(
              "inline-flex min-h-10 items-center rounded-full border px-4 text-sm font-semibold",
              filter === x.key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card",
            )}
          >
            {x.label}
          </Link>
        ))}
      </nav>

      <Card className="p-0">
        {rows.length === 0 ? (
          <p className="p-6 text-center text-muted-foreground">لا توجد حركات.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-muted-foreground">
                <tr>
                  <th className="p-3 text-start font-semibold">التاريخ</th>
                  <th className="p-3 text-start font-semibold">الحركة</th>
                  <th className="p-3 text-start font-semibold">المرجع</th>
                  <th className="p-3 text-start font-semibold">الكمية</th>
                  <th className="p-3 text-start font-semibold">بعدها</th>
                  {withCost ? <th className="p-3 text-start font-semibold">متوسط التكلفة $</th> : null}
                  <th className="p-3 text-start font-semibold">بواسطة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((m) => {
                  const q = dec(m.qty);
                  return (
                    <tr key={m.id}>
                      <td className="p-3 whitespace-nowrap">{formatDateTime(m.at)}</td>
                      <td className="p-3">
                        <span className={cn("font-semibold", m.kind === "ADJUSTMENT" && q.lt(0) && "text-destructive")}>
                          {m.adjustmentReason ? REASON_LABELS[m.adjustmentReason] : m.kindLabel}
                        </span>
                        {m.override ? <span className="block text-xs text-warning">تجاوز الرصيد</span> : null}
                      </td>
                      <td className="p-3">
                        {m.ref ? (
                          m.ref.href ? (
                            <Link href={m.ref.href} className="hover:underline">
                              <bdi dir="ltr">{m.ref.label}</bdi>
                            </Link>
                          ) : (
                            <bdi dir="ltr">{m.ref.label}</bdi>
                          )
                        ) : (
                          "—"
                        )}
                        {m.note ? <span className="block text-xs text-muted-foreground">«{m.note}»</span> : null}
                        {m.expiresOn ? (
                          <span className="block text-xs text-muted-foreground">تنتهي {m.expiresOn}</span>
                        ) : null}
                      </td>
                      <td className={cn("p-3 font-bold tabular-nums", q.lt(0) && "text-destructive")}>
                        <bdi dir="ltr">{q.gt(0) ? `+${q.toFixed()}` : q.toFixed()}</bdi>
                      </td>
                      <td className="p-3 tabular-nums">
                        <bdi dir="ltr">{plainNumber(m.qtyAfter)}</bdi>
                      </td>
                      {withCost ? (
                        <td className="p-3 tabular-nums">{m.avgCostAfterUsd ? formatAmount(m.avgCostAfterUsd) : ""}</td>
                      ) : null}
                      <td className="p-3">{m.by ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {card.movements.length >= 200 ? <p className="text-sm text-muted-foreground">تظهر آخر 200 حركة.</p> : null}
    </div>
  );
}
