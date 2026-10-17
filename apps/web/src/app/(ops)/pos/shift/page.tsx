import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/session";
import { Decimal, dec } from "@ghusn/core";
import { roleCan } from "@/lib/auth/permissions";
import { formatAmount, formatDateTime, formatTime } from "@/lib/format";
import { getOpenShift, shiftSummary } from "@/lib/shifts";
import { CloseShiftForm } from "../shift-forms";

export const metadata: Metadata = { title: "الوردية | غصن" };

const sdg = (v: string) => `${formatAmount(v, 0)} ج.س`;

export default async function ShiftPage({ searchParams }: { searchParams: Promise<{ closed?: string }> }) {
  const { user } = await requirePermission({ pos: ["sell"] });
  const { closed } = await searchParams;
  // وردية واحدة للخزنة (D-143): المفتوحة أياً كانت صاحبتها؛ وبعد الإغلاق ملخص ما أُغلق للتو
  const open = await getOpenShift();
  const id = closed ?? open?.id;
  const summary = id ? await shiftSummary(id) : null;
  const approver = roleCan(user.role, { pos: ["approve"] });
  if (!summary || (summary.closedAt && summary.userId !== user.id && !approver)) {
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
  const mine = summary.userId === user.id;
  const n = (v: string) => dec(v);
  // ما دخل الخزنة غير البيع، وما خرج منها — للملخص ونافذة الإغلاق
  const otherIn = n(summary.moneyInSdg).plus(Decimal.max(n(summary.voidedNetSdg), 0));
  const out = n(summary.cashRefundsSdg)
    .plus(summary.expensesSdg)
    .plus(summary.supplierPaymentsSdg)
    .plus(summary.shipmentCostsSdg)
    .plus(summary.transfersOutSdg)
    .plus(Decimal.max(n(summary.voidedNetSdg).neg(), 0));

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>
            {!isOpen ? "ملخص الوردية" : mine ? "ورديتي الحالية" : `وردية ${summary.userName} — الخزنة معها`}
          </CardTitle>
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
            ...(summary.orderCashSdg !== "0" ? [["منها طلبات المتجر نقداً", sdg(summary.orderCashSdg)]] : []),
            ["المرتجعات", String(summary.returnsCount)],
            ["مردود نقداً", sdg(summary.cashRefundsSdg)],
            ["مردود بنكك", sdg(summary.bankakRefundsSdg)],
            ["مصاريف من الدرج", sdg(summary.expensesSdg)],
            ...(summary.supplierPaymentsSdg !== "0" ? [["دفعات موردين", sdg(summary.supplierPaymentsSdg)]] : []),
            ...(summary.shipmentCostsSdg !== "0" ? [["تكاليف شحن", sdg(summary.shipmentCostsSdg)]] : []),
            ...(summary.transfersOutSdg !== "0" ? [["إيداع في محافظ أخرى", sdg(summary.transfersOutSdg)]] : []),
            ...(summary.moneyInSdg !== "0" ? [["مال دخل الخزنة", sdg(summary.moneyInSdg)]] : []),
            ...(summary.voidedNetSdg !== "0" ? [["إلغاءات من ورديات سابقة", sdg(summary.voidedNetSdg)]] : []),
            ["بداية الوردية", sdg(summary.openingCashSdg)],
            ...(summary.openingDiffSdg ? [["فرق عدّ الفتح", sdg(summary.openingDiffSdg)]] : []),
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
        {summary.openingNote ? <p className="text-sm">سبب فرق عدّ الفتح: {summary.openingNote}</p> : null}
        {summary.closeNote ? <p className="text-sm">ملاحظة: {summary.closeNote}</p> : null}
      </Card>

      {summary.moves.length ? (
        <Card>
          <CardHeader>
            <CardTitle>ما دخل الخزنة وخرج منها</CardTitle>
            <CardDescription>غير البيع والمرتجعات — ومن سجّله.</CardDescription>
          </CardHeader>
          <ul className="flex flex-col divide-y divide-border">
            {summary.moves.map((m) => (
              <li key={m.id + m.label} className="flex min-h-11 items-center justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block font-semibold">{m.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatTime(m.at)}
                    {m.by ? ` · ${m.by}` : ""}
                  </span>
                </span>
                <bdi
                  dir="ltr"
                  className={`shrink-0 font-bold tabular-nums ${m.amountSdg.startsWith("-") ? "" : "text-sage"}`}
                >
                  {m.amountSdg.startsWith("-") ? "" : "+"}
                  {formatAmount(m.amountSdg, 0)}
                </bdi>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {isOpen && (mine || approver) ? (
        <Card>
          <CardHeader>
            <CardTitle>إغلاق الوردية</CardTitle>
            <CardDescription>
              عدّي النقد في الدرج. المتوقع = بداية الوردية + كل ما دخل الخزنة − كل ما خرج منها في هذه الوردية.
            </CardDescription>
          </CardHeader>
          <CloseShiftForm
            shiftId={summary.id}
            expectedCash={summary.expectedCashSdg}
            breakdown={{
              opening: summary.openingCashSdg,
              cashIn: summary.cashSdg,
              otherIn: otherIn.toFixed(0),
              out: out.toFixed(0),
            }}
          />
        </Card>
      ) : isOpen ? (
        <p className="text-sm text-muted-foreground">
          تُغلق الوردية صاحبتها {summary.userName} بعدّ النقد، أو المديرة.
        </p>
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
