import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePermission } from "@/lib/auth/session";
import { formatAmount, formatDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { roleCan } from "@/lib/auth/permissions";
import { listDeliveredOrders } from "@/lib/orders";
import { listSales, listSalesToReview } from "@/lib/sales";
import { markReviewedAction } from "./actions";
import { listReturns } from "@/lib/returns";
import { listShifts } from "@/lib/shifts";

export const metadata: Metadata = { title: "المبيعات | غصن" };

const PAYMENT_LABELS = { COD: "عند الاستلام", IN_SHOP: "في المحل", BANKAK: "بنكك مسبقاً" };

export default async function SalesPage() {
  const session = await requirePermission({ sale: ["read"] });
  const [sales, orders, shifts, returns, toReview] = await Promise.all([
    listSales(),
    listDeliveredOrders(),
    listShifts(),
    listReturns(),
    listSalesToReview(),
  ]);
  const canReview = roleCan(session.user.role, { pos: ["approve"] });
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-3xl font-bold">المبيعات</h1>
      {toReview.length ? (
        <Card className="border-gold/40">
          <CardHeader>
            <CardTitle>مبيعات دون اتصال تحتاج مراجعة ({toReview.length})</CardTitle>
          </CardHeader>
          <ul className="flex flex-col gap-2">
            {toReview.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border p-3"
              >
                <div className="min-w-0">
                  <Link href={`/pos/receipt/${s.id}`} className="font-semibold hover:underline">
                    <bdi dir="ltr">{s.number}</bdi>
                  </Link>{" "}
                  <span className="text-sm text-muted-foreground">
                    (<bdi dir="ltr">{s.localNumber}</bdi>) · {s.cashierName} · {formatDateTime(s.createdAt)} ·{" "}
                    {formatAmount(s.totalSdg, 0)} ج.س
                  </span>
                  <p className="text-sm text-destructive">{s.reviewNote}</p>
                </div>
                {canReview ? (
                  <form action={markReviewedAction}>
                    <input type="hidden" name="saleId" value={s.id} />
                    <Button type="submit" size="sm" variant="outline">
                      تمت المراجعة
                    </Button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      <Card className="p-0">
        <CardHeader className="px-5 pt-5">
          <CardTitle>فواتير المحل</CardTitle>
        </CardHeader>
        {sales.length === 0 ? (
          <p className="p-6 text-center text-muted-foreground">لا مبيعات بعد.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الفاتورة</TableHead>
                <TableHead>الوقت</TableHead>
                <TableHead>البائعة</TableHead>
                <TableHead>الإجمالي ج.س</TableHead>
                <TableHead>الخصم</TableHead>
                <TableHead>الربح $</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sales.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <Link href={`/pos/receipt/${s.id}`} className="font-semibold hover:underline">
                      <bdi dir="ltr">{s.number}</bdi>
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm">{formatDateTime(s.createdAt)}</TableCell>
                  <TableCell>
                    {s.cashierName}
                    {s.approvedBy ? (
                      <span className="text-xs text-muted-foreground"> · موافقة {s.approvedBy}</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="tabular-nums">{formatAmount(s.totalSdg, 0)}</TableCell>
                  <TableCell className="tabular-nums">{formatAmount(s.discountSdg, 0)}</TableCell>
                  <TableCell className="tabular-nums">{formatAmount(s.profitUsd)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Card className="p-0">
        <CardHeader className="px-5 pt-5">
          <CardTitle>طلبات المتجر المسلّمة</CardTitle>
        </CardHeader>
        {orders.length === 0 ? (
          <p className="p-6 text-center text-muted-foreground">لا طلبات مسلّمة بعد.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الطلب</TableHead>
                <TableHead>التسليم</TableHead>
                <TableHead>العميل</TableHead>
                <TableHead>الدفع</TableHead>
                <TableHead>الإجمالي ج.س</TableHead>
                <TableHead>الربح $</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((o) => (
                <TableRow key={o.id}>
                  <TableCell>
                    <Link href={`/admin/orders/${o.id}`} className="font-semibold hover:underline">
                      <bdi dir="ltr">{o.number}</bdi>
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm">{formatDateTime(o.deliveredAt)}</TableCell>
                  <TableCell>
                    {o.customerName}
                    <span className="text-xs text-muted-foreground">
                      {" "}
                      · {o.fulfillment === "PICKUP" ? "من المحل" : "توصيل"}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">{PAYMENT_LABELS[o.paymentMethod]}</TableCell>
                  <TableCell className="tabular-nums">{formatAmount(o.totalSdg, 0)}</TableCell>
                  <TableCell className="tabular-nums">{formatAmount(o.profitUsd)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Card className="p-0">
        <CardHeader className="px-5 pt-5">
          <CardTitle>المرتجعات</CardTitle>
        </CardHeader>
        {returns.length === 0 ? (
          <p className="p-6 text-center text-muted-foreground">لا مرتجعات.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>المرتجع</TableHead>
                <TableHead>من الفاتورة</TableHead>
                <TableHead>الوقت</TableHead>
                <TableHead>البائعة</TableHead>
                <TableHead>المسترد ج.س</TableHead>
                <TableHead>تالف $</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {returns.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Link href={`/pos/returns/${r.id}`} className="font-semibold hover:underline">
                      <bdi dir="ltr">{r.number}</bdi>
                    </Link>
                    {r.isExchange ? <span className="text-xs text-muted-foreground"> · استبدال</span> : null}
                  </TableCell>
                  <TableCell>
                    <bdi dir="ltr">{r.saleNumber}</bdi>
                  </TableCell>
                  <TableCell className="text-sm">{formatDateTime(r.createdAt)}</TableCell>
                  <TableCell>
                    {r.cashierName}
                    {r.approvedBy ? (
                      <span className="text-xs text-muted-foreground"> · موافقة {r.approvedBy}</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="tabular-nums">{formatAmount(r.refundSdg, 0)}</TableCell>
                  <TableCell className="tabular-nums">{formatAmount(r.damagedCostUsd)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Card className="p-0">
        <CardHeader className="px-5 pt-5">
          <CardTitle>الورديات</CardTitle>
        </CardHeader>
        {shifts.length === 0 ? (
          <p className="p-6 text-center text-muted-foreground">لا ورديات بعد.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الموظفة</TableHead>
                <TableHead>الفتح</TableHead>
                <TableHead>الإغلاق</TableHead>
                <TableHead>الفواتير</TableHead>
                <TableHead>فرق النقد ج.س</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shifts.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>{s.userName}</TableCell>
                  <TableCell className="text-sm">{formatDateTime(s.openedAt)}</TableCell>
                  <TableCell className="text-sm">{s.closedAt ? formatDateTime(s.closedAt) : "مفتوحة"}</TableCell>
                  <TableCell className="tabular-nums">{s.salesCount}</TableCell>
                  <TableCell className="tabular-nums">
                    {s.differenceSdg ? formatAmount(s.differenceSdg, 0) : "—"}
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
