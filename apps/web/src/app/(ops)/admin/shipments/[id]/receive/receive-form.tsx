"use client";

import { dec, plainNumber, planReceipt, toLatinDigits, type ReceiptLine } from "@ghusn/core";
import { PackageCheck } from "lucide-react";
import { useActionState, useMemo, useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
  number,
  lines,
  purchaseRate,
  costs,
}: {
  id: string;
  number: string;
  lines: ReceiveLine[];
  purchaseRate: string;
  costs: { amount: string; rateUsed: string }[];
}) {
  const [state, action] = useActionState<FormState, unknown>(receiveAction.bind(null, id), {});
  const [pending, startTransition] = useTransition();
  // النافذة تبقى مفتوحة حتى يرد الخادم: الخطأ يظهر داخلها، والنجاح ينقل لصفحة الشحنة (redirect)
  const [confirming, setConfirming] = useState(false);
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

  // ملخص النافذة: مجموع السليم والتالف والناقص (بوحدة واحدة إن اتحدت الوحدات)
  const plan = preview.plan;
  const totals = useMemo(() => {
    if (!plan) return null;
    let received = dec(0);
    let damaged = dec(0);
    let missing = dec(0);
    for (const p of plan.values()) {
      received = received.plus(p.receivedQty);
      damaged = damaged.plus(clean(rows[p.key]!.damagedQty));
      missing = missing.plus(p.missingQty);
    }
    const units = new Set(lines.map((l) => l.unit));
    const unit = units.size === 1 ? ` ${UNIT_LABEL[lines[0]!.unit] ?? ""}` : "";
    const only = lines.length === 1 ? plan.get(lines[0]!.id) : undefined;
    return { received, damaged, missing, unit, unitCost: only?.landedUnitUsd ?? null };
  }, [plan, rows, lines]);

  function submit() {
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
        <ConfirmDialog
          open={confirming}
          onCancel={() => setConfirming(false)}
          onConfirm={submit}
          pending={pending}
          error={state.error}
          icon={PackageCheck}
          title={
            <>
              استلام <bdi dir="ltr">{number}</bdi>؟
            </>
          }
          description="تدخل البضاعة المخزون بتكلفتها الواصلة، وتُغلق الشحنة."
          summary={
            totals
              ? [
                  {
                    label: `سليم يدخل المخزون (${lines.length} ${lines.length === 1 ? "بند" : lines.length <= 10 ? "بنود" : "بنداً"})`,
                    value: `${plainNumber(totals.received)}${totals.unit}`,
                  },
                  { label: "تالف", value: plainNumber(totals.damaged) },
                  ...(totals.missing.gt(0) ? [{ label: "ناقص", value: plainNumber(totals.missing) }] : []),
                  ...(totals.unitCost
                    ? [
                        {
                          label: "التكلفة الواصلة للوحدة",
                          value: <bdi dir="ltr">{formatAmount(totals.unitCost.toString())} $</bdi>,
                          total: true,
                        },
                      ]
                    : []),
                ]
              : undefined
          }
          warning={
            costs.length
              ? undefined
              : "لا توجد تكاليف شحن أو جمارك مسجّلة. إن وصلت فاتورة لاحقاً تُضاف من صفحة الشحنة وتُعدِّل متوسط التكلفة."
          }
          irreversible="لا يمكن التراجع بعد الاستلام."
          confirmLabel="تأكيد الاستلام"
          pendingLabel="جارٍ الاستلام…"
        />
        <Button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={pending || preview.issues.size > 0 || nothingReceived}
        >
          {pending ? "جارٍ الاستلام…" : "تأكيد الاستلام"}
        </Button>
        {nothingReceived ? <span className="text-sm text-destructive">أدخلي الكمية المستلمة.</span> : null}
      </div>
    </div>
  );
}
