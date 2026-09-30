import { dec, plainNumber } from "@ghusn/core";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/app/(ops)/print/labels/print-button";
import { Button } from "@/components/ui/button";
import { roleCan } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { formatAmount, formatDateTime } from "@/lib/format";
import { getReturn } from "@/lib/returns";
import { CashOutForm } from "./cash-out";

export const metadata: Metadata = { title: "إيصال مرتجع | غصن" };

const n = (v: string) => formatAmount(v, 0);

export default async function ReturnReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requirePermission({ pos: ["sell"] });
  const { id } = await params;
  const r = await getReturn(id);
  if (!r || (r.cashierId !== user.id && !roleCan(user.role, { sale: ["read"] }))) notFound();
  const creditLeft = dec(r.creditLeftSdg);

  return (
    <div className="flex flex-col items-center gap-4">
      <style>{`@page { size: 80mm auto; margin: 0; } @media print { body * { visibility: hidden; } .receipt, .receipt * { visibility: visible; } .receipt { position: absolute; inset: 0 auto auto 0; } }`}</style>
      <div className="flex flex-wrap justify-center gap-2 print:hidden">
        <PrintButton disabled={false} />
        <Button asChild variant="outline">
          <Link href="/pos">بيع جديد</Link>
        </Button>
      </div>
      {r.isExchange && creditLeft.gt(0) ? (
        <div className="flex w-full max-w-sm flex-col gap-2 rounded-xl border border-gold/40 bg-gold/10 p-4 print:hidden">
          <p className="font-bold">رصيد استبدال متبقٍ: {n(r.creditLeftSdg)} ج.س</p>
          <Button asChild>
            <Link href={`/pos?credit=${r.id}`}>استخدامه في فاتورة جديدة</Link>
          </Button>
          <CashOutForm returnId={r.id} amount={n(r.creditLeftSdg)} />
        </div>
      ) : null}
      <article className="receipt flex w-[72mm] flex-col gap-2 rounded-xl border border-border bg-white p-[3mm] text-xs text-black print:border-0">
        <p className="text-center text-base font-bold">إيصال مرتجع{r.isExchange ? " (استبدال)" : ""}</p>
        <div className="border-y border-dashed border-black py-1">
          <div className="flex justify-between">
            <span>المرتجع</span>
            <bdi dir="ltr" className="font-bold">
              {r.number}
            </bdi>
          </div>
          <div className="flex justify-between">
            <span>من الفاتورة</span>
            <bdi dir="ltr">{r.sale.number}</bdi>
          </div>
          <div className="flex justify-between">
            <span>التاريخ</span>
            <span>{formatDateTime(r.createdAt)}</span>
          </div>
          <div className="flex justify-between">
            <span>البائعة</span>
            <span>
              {r.cashierName}
              {r.approvedBy ? ` · موافقة ${r.approvedBy}` : ""}
            </span>
          </div>
        </div>
        <table className="w-full tabular-nums">
          <tbody>
            {r.lines.map((l) => (
              <tr key={l.id} className="align-top">
                <td className="py-0.5">
                  {l.label}
                  <div>
                    × {plainNumber(l.qty)}
                    {dec(l.damagedQty).gt(0) ? ` (تالف ${plainNumber(l.damagedQty)})` : ""}
                  </div>
                </td>
                <td className="py-0.5 text-end">{n(l.refundSdg)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="border-t border-dashed border-black pt-1 tabular-nums">
          <div className="flex justify-between text-sm font-bold">
            <dt>{r.isExchange ? "رصيد الاستبدال" : "المسترد"}</dt>
            <dd>{n(r.refundSdg)} ج.س</dd>
          </div>
          {r.refunds.map((x, i) => (
            <div key={i} className="flex justify-between">
              <dt>{x.method === "CASH" ? "نقداً" : `بنكك${x.reference ? ` (${x.reference})` : ""}`}</dt>
              <dd>{n(x.amountSdg)}</dd>
            </div>
          ))}
          {r.usedIn.map((u) => (
            <div key={u.saleId} className="flex justify-between">
              <dt>
                استُخدم في <bdi dir="ltr">{u.number}</bdi>
              </dt>
              <dd>{n(u.amountSdg)}</dd>
            </div>
          ))}
        </dl>
        {r.reason ? <p>السبب: {r.reason}</p> : null}
      </article>
    </div>
  );
}
