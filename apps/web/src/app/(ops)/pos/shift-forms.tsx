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

/**
 * فتح الوردية (D-146): تبدأ من رصيد الخزنة في النظام — زر واحد. «عددتُ الدرج ووجدت غير ذلك» يفتح
 * خانتي المعدود والسبب، والفرق يُسجَّل.
 */
export function OpenShiftForm({ systemSdg }: { systemSdg: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(openShiftAction, {});
  const negative = dec(systemSdg).lt(0);
  const [counting, setCounting] = useState(negative);
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error ? <Alert variant="destructive">{state.error}</Alert> : null}
      <div className="rounded-xl border border-border bg-muted/40 p-4">
        <p className="text-sm text-muted-foreground">في الخزنة حسب النظام</p>
        <p className="text-2xl font-bold tabular-nums">
          <bdi dir="ltr">{formatAmount(systemSdg, 0)}</bdi> ج.س
        </p>
      </div>
      {counting ? (
        <>
          <label className="flex flex-col gap-1">
            <span className="font-semibold">المعدود في الدرج (ج.س)</span>
            <Input name="countedCash" inputMode="numeric" dir="ltr" required autoFocus placeholder="0" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-semibold">سبب الفرق</span>
            <Input name="note" maxLength={300} placeholder="مثال: أخذت 20,000 للترحيل ولم تُسجَّل" />
          </label>
          {!negative ? (
            <button
              type="button"
              className="self-start text-sm text-muted-foreground underline"
              onClick={() => setCounting(false)}
            >
              المبلغ مطابق — افتحي بدون عدّ
            </button>
          ) : null}
        </>
      ) : (
        <button type="button" className="self-start text-sm font-semibold underline" onClick={() => setCounting(true)}>
          عددتُ الدرج ووجدت غير ذلك
        </button>
      )}
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
  /** للنافذة: بداية الوردية، المقبوض نقداً، ما دخل غير البيع، وما خرج من الخزنة (D-143) */
  breakdown: { opening: string; cashIn: string; otherIn: string; out: string };
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(closeShiftAction, {});
  const confirm = useConfirmForm(action, state, pending);
  // D-147: الافتراضي إقرار «عددتُ الدرج — المبلغ مطابق» بضغطة؛ الكتابة عند وجود فرق فقط
  const [counting, setCounting] = useState(false);
  // حقول محكومة: React يفرّغ النموذج بعد كل إرسال، ولا نريد إعادة العدّ بعد رسالة خطأ
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");
  // للعرض في النافذة فقط — الخادم يعيد حساب الفرق
  const countedValue = /^\d+$/.test(toLatinDigits(counted).replace(/[,\s٬]/g, ""))
    ? toLatinDigits(counted).replace(/[,\s٬]/g, "")
    : "";
  const difference = !counting ? "" : countedValue ? dec(countedValue).minus(expectedCash).toFixed(0) : "";
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
      <div className="rounded-xl border border-border bg-muted/40 p-4">
        <p className="text-sm text-muted-foreground">النقد المتوقع في الدرج</p>
        <p className="text-2xl font-bold tabular-nums">
          <bdi dir="ltr">{formatAmount(expectedCash, 0)}</bdi> ج.س
        </p>
      </div>
      {counting ? (
        <>
          <label className="flex flex-col gap-1">
            <span className="font-semibold">النقد المعدود في الدرج (ج.س)</span>
            <Input
              name="countedCash"
              value={counted}
              onChange={(e) => setCounted(e.target.value)}
              inputMode="numeric"
              dir="ltr"
              required
              autoFocus
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-semibold">سبب الفرق</span>
            <Input name="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
          </label>
          <Button type="submit" variant="outline" disabled={pending || unsent > 0}>
            {pending ? "جارٍ الإغلاق…" : "إغلاق الوردية"}
          </Button>
          <button
            type="button"
            className="self-start text-sm text-muted-foreground underline"
            onClick={() => setCounting(false)}
          >
            المبلغ مطابق — رجوع
          </button>
        </>
      ) : (
        <>
          <input type="hidden" name="matched" value="1" />
          <input type="hidden" name="expectedSeen" value={expectedCash} />
          <Button type="submit" disabled={pending || unsent > 0}>
            {pending ? "جارٍ الإغلاق…" : "✓ عددتُ الدرج — المبلغ مطابق"}
          </Button>
          <button
            type="button"
            className="self-start text-sm font-semibold underline"
            onClick={() => setCounting(true)}
          >
            عددتُ ووجدت غير ذلك
          </button>
        </>
      )}
      <ConfirmDialog
        {...confirm.dialog}
        icon={Clock}
        title="إغلاق الوردية؟"
        description={
          counting
            ? "لا يمكن البيع عليها بعد الإغلاق."
            : `تُقرّين أنك عددتِ الدرج ووجدتِ فيه ${formatAmount(expectedCash, 0)} ج.س بالضبط. لا يمكن البيع عليها بعد الإغلاق.`
        }
        summary={[
          { label: "بداية الوردية", value: sdg(breakdown.opening) },
          { label: "المقبوض نقداً", value: sdg(breakdown.cashIn) },
          ...(breakdown.otherIn !== "0" ? [{ label: "دخل الخزنة غير البيع", value: sdg(breakdown.otherIn) }] : []),
          { label: "خرج من الخزنة", value: sdg(breakdown.out) },
          { label: "النقد المتوقع", value: sdg(expectedCash), total: true },
          {
            label: "المعدود",
            value: !counting ? `${sdg(expectedCash)} (مطابق)` : countedValue ? sdg(countedValue) : "—",
          },
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
        confirmLabel={counting ? "إغلاق الوردية" : "نعم، عددتُ — إغلاق"}
        pendingLabel="جارٍ الإغلاق…"
      />
    </form>
  );
}
