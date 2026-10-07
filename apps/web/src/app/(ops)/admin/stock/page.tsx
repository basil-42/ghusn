import { plainNumber } from "@ghusn/core";
import { dec } from "@ghusn/core";
import { ClipboardCheck, Plus, ScanBarcode, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ExportLink } from "@/components/admin/export-button";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { roleCan } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { formatAmount } from "@/lib/format";
import { cn } from "@/lib/utils";
import { countNegativeStock, listStock } from "@/lib/stock";
import { countPendingFor, pendingByVariant } from "@/lib/stock-adjustments";
import { COUNT_STATUS_LABELS, activeCount } from "@/lib/stock-counts";

export const metadata: Metadata = { title: "المخزون | غصن" };

const UNIT_LABEL: Record<string, string> = { PIECE: "حبة", METER: "متر", SHEET: "ورقة" };

export default async function StockPage({ searchParams }: { searchParams: Promise<{ q?: string; f?: string }> }) {
  const session = await requirePermission({ stock: ["read"] });
  const { q = "", f } = await searchParams;
  const negativeOnly = f === "negative";
  // التكلفة والقيمة للمالك والمديرة فقط — لا تُرسل للموظفة أصلاً
  const withCost = roleCan(session.user.role, { cost: ["read"] });
  const canAdjust = roleCan(session.user.role, { stock: ["adjust"] });
  const [{ rows, totalValueUsd }, negative, pendingCount, count] = await Promise.all([
    listStock(q, withCost, { negativeOnly }),
    countNegativeStock(),
    canAdjust ? countPendingFor({ id: session.user.id, role: session.user.role }) : 0,
    canAdjust ? activeCount() : null,
  ]);
  const pending = canAdjust ? await pendingByVariant(rows.map((r) => r.variantId)) : new Map<string, string>();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">المخزون</h1>
          {totalValueUsd !== null ? (
            <p className="text-muted-foreground">
              قيمة المخزون بالتكلفة:{" "}
              <bdi dir="ltr" className="font-bold text-foreground tabular-nums">
                {formatAmount(totalValueUsd)} $
              </bdi>
            </p>
          ) : null}
        </div>
        {canAdjust || withCost ? (
          <div className="flex flex-wrap gap-2">
            {withCost ? <ExportLink href="/admin/export/stock" /> : null}
            {canAdjust ? (
              <>
                <Button asChild variant="outline">
                  <Link href="/admin/stock/adjustments">
                    <ClipboardCheck aria-hidden /> التسويات
                    {pendingCount ? (
                      <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-gold px-1.5 text-xs font-bold text-card">
                        {pendingCount}
                      </span>
                    ) : null}
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/admin/stock/counts">
                    <ScanBarcode aria-hidden /> الجرد
                  </Link>
                </Button>
                <Button asChild>
                  <Link href="/admin/stock/adjustments/new">
                    <Plus aria-hidden /> تسوية جديدة
                  </Link>
                </Button>
              </>
            ) : null}
          </div>
        ) : null}
      </header>

      {count ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-sand bg-card p-4">
          <ScanBarcode aria-hidden className="size-5 text-warning" />
          <span className="flex-1 font-semibold">
            {COUNT_STATUS_LABELS[count.status]} · <bdi dir="ltr">{count.number}</bdi>
          </span>
          <Button asChild size="sm">
            <Link href={count.status === "OPEN" ? `/admin/stock/counts/${count.id}/count` : `/admin/stock/counts`}>
              {count.status === "OPEN" ? "متابعة العد" : "فتح"}
            </Link>
          </Button>
        </div>
      ) : null}

      <form className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]" role="search">
        <Input name="q" defaultValue={q} placeholder="ابحثي بالاسم أو الباركود أو SKU" aria-label="بحث" />
        {negativeOnly ? <input type="hidden" name="f" value="negative" /> : null}
        <Button type="submit" variant="outline">
          <Search aria-hidden /> بحث
        </Button>
      </form>
      {negative || negativeOnly ? (
        <nav className="flex flex-wrap gap-2" aria-label="تصفية">
          <Link
            href={q ? `/admin/stock?q=${encodeURIComponent(q)}` : "/admin/stock"}
            aria-current={!negativeOnly ? "page" : undefined}
            className={cn(
              "inline-flex min-h-10 items-center rounded-full border px-4 text-sm font-semibold",
              !negativeOnly ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card",
            )}
          >
            الكل
          </Link>
          <Link
            href="/admin/stock?f=negative"
            aria-current={negativeOnly ? "page" : undefined}
            className={cn(
              "inline-flex min-h-10 items-center rounded-full border px-4 text-sm font-semibold",
              negativeOnly
                ? "border-destructive bg-destructive text-white"
                : "border-destructive/40 bg-card text-destructive",
            )}
          >
            رصيد سالب · {negative}
          </Link>
        </nav>
      ) : null}

      <Card className="p-0">
        {rows.length === 0 ? (
          <p className="p-6 text-center text-muted-foreground">لا توجد منتجات.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>المنتج</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>الرصيد</TableHead>
                <TableHead>السعر</TableHead>
                {withCost ? (
                  <>
                    <TableHead>متوسط التكلفة $</TableHead>
                    <TableHead>القيمة $</TableHead>
                  </>
                ) : null}
                <TableHead>
                  <span className="sr-only">إجراءات</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.variantId}>
                  <TableCell>
                    <Link href={`/admin/stock/${r.variantId}`} className="hover:underline">
                      {r.label}
                    </Link>
                    {pending.has(r.variantId) ? (
                      <span className="block text-xs font-semibold text-warning">
                        تسوية بانتظار الاعتماد:{" "}
                        <bdi dir="ltr">
                          {dec(pending.get(r.variantId)!).gt(0) ? "+" : ""}
                          {dec(pending.get(r.variantId)!).toFixed()}
                        </bdi>
                      </span>
                    ) : null}
                    {dec(r.qty).lt(0) ? (
                      <span className="block text-xs font-semibold text-destructive">
                        رصيد سالب من بيع دون اتصال — يحتاج عدّاً
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <bdi dir="ltr" className="text-sm text-muted-foreground">
                      {r.sku}
                    </bdi>
                  </TableCell>
                  <TableCell
                    className={cn(
                      "tabular-nums",
                      dec(r.qty).lt(0)
                        ? "font-semibold text-destructive"
                        : dec(r.qty).isZero()
                          ? "text-muted-foreground"
                          : "font-semibold",
                    )}
                  >
                    <bdi dir="ltr">{plainNumber(r.qty)}</bdi> {UNIT_LABEL[r.unit] ?? r.unit}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {r.priceSdg ? (
                      `${formatAmount(r.priceSdg, 0)} ج.س`
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  {withCost ? (
                    <>
                      <TableCell className="tabular-nums">{r.avgCostUsd ? formatAmount(r.avgCostUsd) : ""}</TableCell>
                      <TableCell className="tabular-nums">{r.valueUsd ? formatAmount(r.valueUsd) : ""}</TableCell>
                    </>
                  ) : null}
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/admin/stock/${r.variantId}`}>الحركات</Link>
                      </Button>
                      {canAdjust ? (
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/admin/stock/adjustments/new?variant=${r.variantId}`}>تسوية</Link>
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
