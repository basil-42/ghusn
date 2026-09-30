"use client";

import { dec, plainNumber, refundForLine, toLatinDigits } from "@ghusn/core";
import { createId } from "@paralleldrive/cuid2";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatAmount, formatDateTime } from "@/lib/format";
import { createReturnAction, findSaleForReturnAction } from "../actions";
import { ApprovalDialog } from "../approval-dialog";

type Found = NonNullable<Awaited<ReturnType<typeof findSaleForReturnAction>>>;
type Pick = { qty: string; damaged: string };

const clean = (v: string) =>
  toLatinDigits(v)
    .replace(/[,\s٬]/g, "")
    .replace("٫", ".");
const num = (v: string) => (/^\d+(\.\d+)?$/.test(clean(v)) ? clean(v) : "0");
const sdg = (v: { toString(): string }) => `${formatAmount(v.toString(), 0)} ج.س`;

/**
 * المرتجع برقم الإيصال (D-81): اختيار الكميات (والتالف منها)، ثم استرداد نقداً/بنكك أو
 * استبدال (رصيد لفاتورة جديدة). المبلغ هنا للعرض بنفس دالة الخادم.
 */
export function ReturnForm({ initialNumber, initialSale }: { initialNumber: string; initialSale: Found | null }) {
  const router = useRouter();
  const [returnId] = useState(() => createId());
  const [number, setNumber] = useState(initialSale?.number ?? initialNumber);
  const [sale, setSale] = useState<Found | null>(initialSale);
  const [picks, setPicks] = useState<Record<string, Pick>>({});
  const [mode, setMode] = useState<"REFUND" | "EXCHANGE">("REFUND");
  const [method, setMethod] = useState<"CASH" | "BANKAK">("CASH");
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [approval, setApproval] = useState<string[] | null>(null);
  const [pending, startTransition] = useTransition();

  function find() {
    setError(null);
    startTransition(async () => {
      const found = await findSaleForReturnAction(number);
      if (!found) {
        setSale(null);
        setError("لا توجد فاتورة بهذا الرقم.");
        return;
      }
      setSale(found);
      setPicks({});
    });
  }

  const pickOf = (id: string): Pick => picks[id] ?? { qty: "", damaged: "" };
  const lineRefund = (l: Found["lines"][number]) => {
    const q = num(pickOf(l.id).qty);
    if (dec(q).lte(0) || dec(q).gt(l.remainingQty)) return null;
    // المرتجعات السابقة: المسترد يُقدَّر نسبةً (الخادم يحسب الدقيق)
    const refunded = dec(l.netSdg).mul(l.returnedQty).div(l.qty).toDecimalPlaces(0);
    return refundForLine({
      qty: l.qty,
      netSdg: l.netSdg,
      returnedQty: l.returnedQty,
      refundedSdg: refunded,
      returnQty: q,
    });
  };
  const issues = sale
    ? sale.lines.flatMap((l) => {
        const p = pickOf(l.id);
        if (!p.qty) return [];
        if (dec(num(p.qty)).gt(l.remainingQty)) return [`${l.label}: المتبقي ${plainNumber(l.remainingQty)} فقط`];
        if (dec(num(p.damaged)).gt(num(p.qty))) return [`${l.label}: التالف أكثر من المُرجع`];
        return [];
      })
    : [];
  const total = sale ? sale.lines.reduce((acc, l) => acc.plus(lineRefund(l) ?? 0), dec(0)) : dec(0);

  function submit(credentials?: { phone: string; password: string }) {
    if (!sale) return;
    startTransition(async () => {
      const result = await createReturnAction({
        id: returnId,
        saleId: sale.id,
        lines: sale.lines
          .filter((l) => dec(num(pickOf(l.id).qty)).gt(0))
          .map((l) => ({ saleLineId: l.id, qty: num(pickOf(l.id).qty), damagedQty: num(pickOf(l.id).damaged) })),
        mode,
        refundMethod: method,
        reference,
        reason,
        approval: credentials ?? null,
      });
      if ("ok" in result) {
        router.push(mode === "EXCHANGE" ? `/pos?credit=${result.id}` : `/pos/returns/${result.id}`);
      } else if ("approvalRequired" in result) {
        setApproval(result.approvalRequired);
      } else {
        setApproval(null);
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <form
        className="grid grid-cols-[1fr_auto] gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          find();
        }}
      >
        <Input
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          placeholder="رقم الإيصال (INV-2026-000012 أو 12)"
          aria-label="رقم الإيصال"
          dir="ltr"
          autoFocus
        />
        <Button type="submit" variant="outline" disabled={pending}>
          <Search aria-hidden /> بحث
        </Button>
      </form>
      {error ? <Alert variant="destructive">{error}</Alert> : null}

      {sale ? (
        <>
          <p className="text-sm text-muted-foreground">
            <bdi dir="ltr" className="font-semibold text-foreground">
              {sale.number}
            </bdi>{" "}
            · {formatDateTime(sale.createdAt)} · منذ {sale.days} يوم
            {sale.previousReturns.length
              ? ` · مرتجعات سابقة: ${sale.previousReturns.map((r) => r.number).join("، ")}`
              : ""}
          </p>
          {sale.lateNeedsApproval ? (
            <Alert variant="destructive">
              تجاوزت الفاتورة مدة المرتجع ({sale.returnDays} أيام) — يحتاج الإرجاع موافقة المديرة.
            </Alert>
          ) : null}

          <ul className="flex flex-col gap-2">
            {sale.lines.map((l) => {
              const p = pickOf(l.id);
              const refund = lineRefund(l);
              const none = dec(l.remainingQty).lte(0);
              return (
                <li
                  key={l.id}
                  className={`flex flex-col gap-2 rounded-xl border border-border p-3 ${none ? "opacity-60" : ""}`}
                >
                  <div className="flex flex-wrap justify-between gap-2">
                    <p className="font-semibold">{l.label}</p>
                    <p className="text-sm text-muted-foreground tabular-nums">
                      المشترى {plainNumber(l.qty)} · المتبقي {plainNumber(l.remainingQty)} · صافي {sdg(l.netSdg)}
                    </p>
                  </div>
                  {none ? (
                    <p className="text-sm">أُرجع بالكامل.</p>
                  ) : (
                    <div className="flex flex-wrap items-end gap-3">
                      <label className="flex flex-col gap-1">
                        <span className="text-xs font-semibold">الكمية المُرجعة</span>
                        <Input
                          value={p.qty}
                          onChange={(e) => setPicks({ ...picks, [l.id]: { ...p, qty: e.target.value } })}
                          inputMode="decimal"
                          dir="ltr"
                          className="w-24"
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs font-semibold">منها تالف</span>
                        <Input
                          value={p.damaged}
                          onChange={(e) => setPicks({ ...picks, [l.id]: { ...p, damaged: e.target.value } })}
                          inputMode="decimal"
                          dir="ltr"
                          className="w-24"
                        />
                      </label>
                      {refund ? <span className="font-bold tabular-nums">يُسترد {sdg(refund)}</span> : null}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {issues.map((i) => (
            <p key={i} className="text-sm text-destructive">
              {i}
            </p>
          ))}

          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="نوع المرتجع">
              {(
                [
                  ["REFUND", "استرداد المبلغ"],
                  ["EXCHANGE", "استبدال بمنتج آخر"],
                ] as const
              ).map(([value, label]) => (
                <Button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={mode === value}
                  variant={mode === value ? "default" : "outline"}
                  onClick={() => setMode(value)}
                >
                  {label}
                </Button>
              ))}
            </div>
            {mode === "REFUND" ? (
              <div className="flex flex-wrap items-end gap-2">
                {(
                  [
                    ["CASH", "نقداً"],
                    ["BANKAK", "بنكك"],
                  ] as const
                ).map(([value, label]) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant={method === value ? "default" : "outline"}
                    onClick={() => setMethod(value)}
                  >
                    {label}
                  </Button>
                ))}
                {method === "BANKAK" ? (
                  <Input
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="رقم عملية بنكك (اختياري)"
                    aria-label="رقم عملية بنكك"
                    dir="ltr"
                    className="w-56"
                  />
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                المبلغ يصبح رصيداً يُخصم من الفاتورة الجديدة، والفائض يُرد نقداً.
              </p>
            )}
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="السبب (اختياري): مقاس، عيب، تغيير رأي…"
              aria-label="سبب المرتجع"
              maxLength={200}
            />
            <Button
              type="button"
              className="min-h-14 text-lg"
              disabled={pending || total.lte(0) || issues.length > 0}
              onClick={() => submit()}
            >
              {mode === "REFUND" ? `استرداد ${sdg(total)}` : `استبدال — رصيد ${sdg(total)}`}
            </Button>
          </div>
        </>
      ) : null}

      {approval ? (
        <ApprovalDialog reasons={approval} pending={pending} onApprove={submit} onCancel={() => setApproval(null)} />
      ) : null}
    </div>
  );
}
