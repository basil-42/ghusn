import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/session";
import { formatAmount, formatDateTime } from "@/lib/format";
import { getOpenShift, shiftSummary } from "@/lib/shifts";
import { CloseShiftForm } from "../shift-forms";

export const metadata: Metadata = { title: "الوردية | غصن" };

const sdg = (v: string) => `${formatAmount(v, 0)} ج.س`;

export default async function ShiftPage({ searchParams }: { searchParams: Promise<{ closed?: string }> }) {
  const { user } = await requirePermission({ pos: ["sell"] });
  const { closed } = await searchParams;
  const open = await getOpenShift(user.id);
  const id = open?.id ?? closed;
  const summary = id ? await shiftSummary(id) : null;
  if (!summary || summary.userId !== user.id) {
    return (
      <Card className="mx-auto max-w-md">
        <p>لا توجد وردية مفتوحة.</p>
        <Link href="/pos" className="font-semibold underline">
          فتح وردية
        </Link>
      </Card>
    );
  }
  const isOpen = !summary.closedAt;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      {!isOpen ? <Alert variant="success">أُغلقت الوردية.</Alert> : null}
      <Card>
        <CardHeader>
          <CardTitle>{isOpen ? "ورديتي الحالية" : "ملخص الوردية"}</CardTitle>
          <CardDescription>
            {summary.userName} · من {formatDateTime(summary.openedAt)}
            {summary.closedAt ? ` إلى ${formatDateTime(summary.closedAt)}` : ""}
          </CardDescription>
        </CardHeader>
        <dl className="grid grid-cols-2 gap-3 tabular-nums sm:grid-cols-3">
          {[
            ["عدد الفواتير", String(summary.salesCount)],
            ["المبيعات", sdg(summary.totalSdg)],
            ["الخصومات", sdg(summary.discountsSdg)],
            ["نقداً", sdg(summary.cashSdg)],
            ["بنكك", sdg(summary.bankakSdg)],
            ["المرتجعات", String(summary.returnsCount)],
            ["مردود نقداً", sdg(summary.cashRefundsSdg)],
            ["مردود بنكك", sdg(summary.bankakRefundsSdg)],
            ["العهدة الافتتاحية", sdg(summary.openingCashSdg)],
            ["النقد المتوقع في الدرج", sdg(summary.expectedCashSdg)],
            ...(summary.countedCashSdg ? [["النقد المعدود", sdg(summary.countedCashSdg)]] : []),
            ...(summary.differenceSdg ? [["الفرق", sdg(summary.differenceSdg)]] : []),
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl border border-border p-3">
              <dt className="text-sm text-muted-foreground">{k}</dt>
              <dd className="text-lg font-bold">{v}</dd>
            </div>
          ))}
        </dl>
        {summary.closeNote ? <p className="text-sm">ملاحظة: {summary.closeNote}</p> : null}
      </Card>

      {isOpen ? (
        <Card>
          <CardHeader>
            <CardTitle>إغلاق الوردية</CardTitle>
            <CardDescription>عدّي النقد في الدرج. المتوقع = العهدة + المقبوض نقداً − المردود نقداً.</CardDescription>
          </CardHeader>
          <CloseShiftForm shiftId={summary.id} />
        </Card>
      ) : (
        <Link href="/pos" className="font-semibold underline">
          فتح وردية جديدة
        </Link>
      )}

      {summary.sales.length ? (
        <Card>
          <CardHeader>
            <CardTitle>فواتير الوردية</CardTitle>
          </CardHeader>
          <ul className="flex flex-col divide-y divide-border">
            {summary.sales.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/pos/receipt/${s.id}`}
                  className="flex min-h-11 items-center justify-between gap-2 py-2 hover:underline"
                >
                  <bdi dir="ltr" className="font-semibold">
                    {s.number}
                  </bdi>
                  <span className="text-sm text-muted-foreground">{formatDateTime(s.createdAt)}</span>
                  <span className="font-bold tabular-nums">{sdg(s.totalSdg)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
