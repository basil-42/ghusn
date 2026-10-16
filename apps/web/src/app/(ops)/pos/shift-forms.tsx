"use client";

import { dec, toLatinDigits } from "@ghusn/core";
import { Clock } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { pendingCount } from "@/lib/pos-offline/db";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, useConfirmForm } from "@/components/ui/confirm-dialog";
import { formatAmount } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { closeShiftAction, openShiftAction, type FormState } from "./actions";

export function OpenShiftForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(openShiftAction, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error ? <Alert variant="destructive">{state.error}</Alert> : null}
      <label className="flex flex-col gap-1">
        <span className="font-semibold">النقد في الدرج الآن (ج.س)</span>
        <Input name="openingCash" inputMode="numeric" dir="ltr" required autoFocus placeholder="0" />
      </label>
      <Button type="submit" disabled={pending}>
        {pending ? "جارٍ الفتح…" : "فتح الوردية"}
      </Button>
    </form>
  );
}

const sdg = (v: string) => `${formatAmount(v, 0)} ج.س`;

export function CloseShiftForm({
  shiftId,
  expectedCash,
  breakdown,
}: {
  shiftId: string;
  expectedCash: string;
  /** للنافذة: العهدة، المقبوض نقداً، ما دخل غير البيع، وما خرج من الخزنة (D-143) */
  breakdown: { opening: string; cashIn: string; otherIn: string; out: string };
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(closeShiftAction, {});
  const confirm = useConfirmForm(action, state, pending);
  // حقول محكومة: React يفرّغ النموذج بعد كل إرسال، ولا نريد إعادة العدّ بعد رسالة خطأ
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");
  // للعرض في النافذة فقط — الخادم يعيد حساب الفرق
  const countedValue = /^\d+$/.test(toLatinDigits(counted).replace(/[,\s٬]/g, ""))
    ? toLatinDigits(counted).replace(/[,\s٬]/g, "")
    : "";
  const difference = countedValue ? dec(countedValue).minus(expectedCash).toFixed(0) : "";
  // فواتير دون اتصال لم تُرسل بعد: إغلاق الوردية قبلها يُفسد مطابقة النقد (D-82)
  const [unsent, setUnsent] = useState(0);
  useEffect(() => {
    void pendingCount()
      .then(setUnsent)
      .catch(() => setUnsent(0));
  }, []);
  return (
    <form action={action} className="flex flex-col gap-4" onSubmit={confirm.onSubmit}>
      {state.error ? <Alert variant="destructive">{state.error}</Alert> : null}
      {unsent ? (
        <Alert variant="destructive">
          {unsent} فاتورة دون اتصال لم تُرسل بعد — افتحي نقطة البيع مع الاتصال لإرسالها قبل الإغلاق.
        </Alert>
      ) : null}
      <input type="hidden" name="shiftId" value={shiftId} />
      <label className="flex flex-col gap-1">
        <span className="font-semibold">النقد المعدود في الدرج (ج.س)</span>
        <Input
          name="countedCash"
          value={counted}
          onChange={(e) => setCounted(e.target.value)}
          inputMode="numeric"
          dir="ltr"
          required
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-semibold">ملاحظة (مطلوبة إن وُجد فرق)</span>
        <Input name="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
      </label>
      <Button type="submit" variant="outline" disabled={pending || unsent > 0}>
        {pending ? "جارٍ الإغلاق…" : "إغلاق الوردية"}
      </Button>
      <ConfirmDialog
        {...confirm.dialog}
        icon={Clock}
        title="إغلاق الوردية؟"
        description="لا يمكن البيع عليها بعد الإغلاق."
        summary={[
          { label: "العهدة الافتتاحية", value: sdg(breakdown.opening) },
          { label: "المقبوض نقداً", value: sdg(breakdown.cashIn) },
          ...(breakdown.otherIn !== "0" ? [{ label: "دخل الخزنة غير البيع", value: sdg(breakdown.otherIn) }] : []),
          { label: "خرج من الخزنة", value: sdg(breakdown.out) },
          { label: "النقد المتوقع", value: sdg(expectedCash), total: true },
          { label: "المعدود", value: countedValue ? sdg(countedValue) : "—" },
          ...(difference
            ? [
                {
                  label: "الفرق",
                  value: (
                    <>
                      <bdi dir="ltr">{formatAmount(difference, 0)}</bdi> ج.س
                    </>
                  ),
                  total: true,
                },
              ]
            : []),
        ]}
        warning={
          difference && difference !== "0"
            ? note.trim()
              ? `يوجد فرق، وكتبتِ ملاحظة: «${note.trim()}».`
              : "يوجد فرق — ارجعي واكتبي ملاحظة تشرح سببه."
            : undefined
        }
        confirmLabel="إغلاق الوردية"
        pendingLabel="جارٍ الإغلاق…"
      />
    </form>
  );
}
