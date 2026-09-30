"use client";

import { dec, plainNumber, planReceipt, toLatinDigits, type ReceiptLine } from "@ghusn/core";
import { useActionState, useMemo, useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatAmount } from "@/lib/format";
import { receiveAction, type FormState } from "../../actions";

export type ReceiveLine = {
  id: string;
  label: string;
  sku: string;
  unit: string;
  trackExpiry: boolean;
  qty: string;
  unitPrice: string;
};

type Row = { receivedQty: string; damagedQty: string; expiresAt: string };

const UNIT_LABEL: Record<string, string> = { PIECE: "حبة", METER: "متر", SHEET: "ورقة" };
const clean = (v: string) =>
  toLatinDigits(v)
    .replace(/[,\s٬]/g, "")
    .replace("٫", ".");
const isQty = (v: string) => /^\d{1,9}(\.\d{1,3})?$/.test(clean(v));

/**
 * شاشة الاستلام: الكمية السليمة والتالفة لكل بند (الباقي ناقص)، وتاريخ الصلاحية للأصناف
 * التي تتبّعها. التكلفة الواصلة تُعاين هنا بنفس دالة الخادم (@ghusn/core)، والخادم يعيد الحساب.
 */
export function ReceiveForm({
  id,
  lines,
  purchaseRate,
  costs,
}: {
  id: string;
  lines: ReceiveLine[];
  purchaseRate: string;
  costs: { amount: string; rateUsed: string }[];
}) {
  const [state, action] = useActionState<FormState, unknown>(receiveAction.bind(null, id), {});
  const [pending, startTransition] = useTransition();
  const [rows, setRows] = useState<Record<string, Row>>(() =>
    Object.fromEntries(lines.map((l) => [l.id, { receivedQty: l.qty, damagedQty: "0", expiresAt: "" }])),
  );

  const update = (lineId: string, patch: Partial<Row>) =>
    setRows((rs) => ({ ...rs, [lineId]: { ...rs[lineId]!, ...patch } }));

  // معاينة حية؛ أي إدخال غير صالح يوقفها ويعرض السبب عند البند
  const preview = useMemo(() => {
    const issues = new Map<string, string>();
    for (const l of lines) {
      const r = rows[l.id]!;
      if (!isQty(r.receivedQty) || !isQty(r.damagedQty)) issues.set(l.id, "أدخلي أرقاماً صحيحة.");
      else if (l.unit === "PIECE" && (!dec(clean(r.receivedQty)).isInteger() || !dec(clean(r.damagedQty)).isInteger()))
        issues.set(l.id, "الكمية بالحبة عدد صحيح.");
      else if (dec(clean(r.receivedQty)).plus(clean(r.damagedQty)).gt(l.qty))
        issues.set(l.id, `السليم + التالف أكثر من المشترى (${plainNumber(l.qty)}).`);
    }
    if (issues.size) return { issues, plan: null as Map<string, ReceiptLine> | null };
    try {
      const plan = planReceipt(
        lines.map((l) => ({
          key: l.id,
          qty: l.qty,
          unitPrice: l.unitPrice,
          rateUsed: purchaseRate,
          receivedQty: clean(rows[l.id]!.receivedQty),
          damagedQty: clean(rows[l.id]!.damagedQty),
        })),
        costs,
      );
      return { issues, plan: new Map(plan.map((p) => [p.key, p])) };
    } catch {
      return { issues, plan: null };
    }
  }, [lines, rows, purchaseRate, costs]);

  const nothingReceived = lines.every(
    (l) => isQty(rows[l.id]!.receivedQty) && dec(clean(rows[l.id]!.receivedQty)).isZero(),
  );

  function submit() {
    if (!window.confirm("تأكيد الاستلام؟ تدخل البضاعة المخزون وتُغلق الشحنة، ولا يمكن التراجع.")) return;
    startTransition(() => {
      action(
        lines.map((l) => ({
          lineId: l.id,
          receivedQty: rows[l.id]!.receivedQty,
          damagedQty: rows[l.id]!.damagedQty,
          expiresAt: l.trackExpiry ? rows[l.id]!.expiresAt : "",
        })),
      );
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {state.error ? <Alert variant="destructive">{state.error}</Alert> : null}
      <ul className="flex flex-col gap-3">
        {lines.map((l) => {
          const r = rows[l.id]!;
          const p = preview.plan?.get(l.id);
          const unit = UNIT_LABEL[l.unit] ?? l.unit;
          return (
            <li key={l.id} className="flex flex-col gap-3 rounded-xl border border-border p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold">{l.label}</p>
                  <bdi dir="ltr" className="text-xs text-muted-foreground">
                    {l.sku}
                  </bdi>
                </div>
                <p className="text-sm text-muted-foreground">
                  المشترى: <span className="font-semibold text-foreground tabular-nums">{plainNumber(l.qty)}</span>{" "}
                  {unit}
                </p>
              </div>
              <div className={`grid grid-cols-2 gap-3 ${l.trackExpiry ? "sm:grid-cols-3" : ""}`}>
                <label className="flex min-w-0 flex-col gap-1">
                  <span className="text-xs font-semibold">السليم المستلم</span>
                  <Input
                    value={r.receivedQty}
                    inputMode="decimal"
                    dir="ltr"
                    onChange={(e) => update(l.id, { receivedQty: e.target.value })}
                  />
                </label>
                <label className="flex min-w-0 flex-col gap-1">
                  <span className="text-xs font-semibold">التالف</span>
                  <Input
                    value={r.damagedQty}
                    inputMode="decimal"
                    dir="ltr"
                    onChange={(e) => update(l.id, { damagedQty: e.target.value })}
                  />
                </label>
                {l.trackExpiry ? (
                  <label className="col-span-2 flex min-w-0 flex-col gap-1 sm:col-span-1">
                    <span className="text-xs font-semibold">تاريخ الصلاحية (اختياري)</span>
                    <Input
                      type="date"
                      value={r.expiresAt}
                      dir="ltr"
                      onChange={(e) => update(l.id, { expiresAt: e.target.value })}
                    />
                  </label>
                ) : null}
              </div>
              {preview.issues.get(l.id) ? (
                <p className="text-sm text-destructive">{preview.issues.get(l.id)}</p>
              ) : p ? (
                <p className="text-sm text-muted-foreground">
                  {p.missingQty.gt(0) ? (
                    <>
                      ناقص <span className="tabular-nums">{plainNumber(p.missingQty)}</span> ·{" "}
                    </>
                  ) : null}
                  {p.landedUnitUsd ? (
                    <>
                      التكلفة الواصلة للوحدة{" "}
                      <bdi dir="ltr" className="font-bold text-foreground tabular-nums">
                        {formatAmount(p.landedUnitUsd.toString())} $
                      </bdi>
                      {p.receivedQty.lt(l.qty) ? " (تكلفة التالف والناقص محمّلة على السليم)" : ""}
                    </>
                  ) : (
                    <span className="text-destructive">
                      لم يصل شيء سليم — قيمة البند خسارة{" "}
                      <bdi dir="ltr" className="tabular-nums">
                        {formatAmount(p.lossUsd.toString())} $
                      </bdi>
                    </span>
                  )}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={submit} disabled={pending || preview.issues.size > 0 || nothingReceived}>
          {pending ? "جارٍ الاستلام…" : "تأكيد الاستلام"}
        </Button>
        {nothingReceived ? <span className="text-sm text-destructive">أدخلي الكمية المستلمة.</span> : null}
      </div>
    </div>
  );
}
