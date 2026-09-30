import { plainNumber } from "@ghusn/core";
import { Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { roleCan } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { formatAmount } from "@/lib/format";
import { listStock } from "@/lib/stock";

export const metadata: Metadata = { title: "المخزون | غصن" };

const UNIT_LABEL: Record<string, string> = { PIECE: "حبة", METER: "متر", SHEET: "ورقة" };

export default async function StockPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const session = await requirePermission({ stock: ["read"] });
  const { q = "" } = await searchParams;
  // التكلفة والقيمة للمالك والمديرة فقط — لا تُرسل للموظفة أصلاً
  const withCost = roleCan(session.user.role, { cost: ["read"] });
  const { rows, totalValueUsd } = await listStock(q, withCost);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-3xl font-bold">المخزون</h1>
        {totalValueUsd !== null ? (
          <p className="text-muted-foreground">
            قيمة المخزون بالتكلفة:{" "}
            <bdi dir="ltr" className="font-bold text-foreground tabular-nums">
              {formatAmount(totalValueUsd)} $
            </bdi>
          </p>
        ) : null}
      </header>

      <form className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]" role="search">
        <Input name="q" defaultValue={q} placeholder="ابحثي بالاسم أو الباركود أو SKU" aria-label="بحث" />
        <Button type="submit" variant="outline">
          <Search aria-hidden /> بحث
        </Button>
      </form>

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
                {withCost ? (
                  <>
                    <TableHead>متوسط التكلفة $</TableHead>
                    <TableHead>القيمة $</TableHead>
                  </>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.variantId}>
                  <TableCell>
                    <Link href={`/admin/products/${r.productId}`} className="hover:underline">
                      {r.label}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <bdi dir="ltr" className="text-sm text-muted-foreground">
                      {r.sku}
                    </bdi>
                  </TableCell>
                  <TableCell
                    className={`tabular-nums ${Number(r.qty) <= 0 ? "text-muted-foreground" : "font-semibold"}`}
                  >
                    {plainNumber(r.qty)} {UNIT_LABEL[r.unit] ?? r.unit}
                  </TableCell>
                  {withCost ? (
                    <>
                      <TableCell className="tabular-nums">{r.avgCostUsd ? formatAmount(r.avgCostUsd) : ""}</TableCell>
                      <TableCell className="tabular-nums">{r.valueUsd ? formatAmount(r.valueUsd) : ""}</TableCell>
                    </>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
