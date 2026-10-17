"use client";

import { dec, toLatinDigits } from "@ghusn/core";
import { Calculator, Check, Clock } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { pendingCount } from "@/lib/pos-offline/db";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, useConfirmForm } from "@/components/ui/confirm-dialog";
import { formatAmount } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { closeShiftAction, openShiftAction, type FormState } from "./actions";

/** المعدود كأرقام لاتينية بلا فواصل، أو "" إن لم يكن رقماً صحيحاً. */
const parseCount = (v: string) => {
  const raw = toLatinDigits(v).replace(/[,\s٬]/g, "");
  return /^\d+$/.test(raw) ? raw : "";
};

/**
 * عدّ الدرج (D-146، D-147) — شكل واحد للفتح والإغلاق: المبلغ في النظام، ثم «مطابق» بضغطة أو «مبلغ مختلف»
 * يفتح المعدود مع الفرق لحظياً وسبباً إلزامياً عند الفرق. الحقول محكومة من الأب (الإغلاق يعرضها في النافذة).
 */
function DrawerCount({
  systemLabel,
  systemSdg,
  counting,
  setCounting,
  counted,
  setCounted,
  note,
  setNote,
  matchLabel,
  differentLabel,
  submitLabel,
  pending,
  pendingLabel,
  blocked = false,
  canCancel = true,
}: {
  systemLabel: string;
  systemSdg: string;
  counting: boolean;
  setCounting: (v: boolean) => void;
  counted: string;
  setCounted: (v: string) => void;
  note: string;
  setNote: (v: string) => void;
  matchLabel: string;
  differentLabel: string;
  submitLabel: string;
  pending: boolean;
  pendingLabel: string;
  blocked?: boolean;
  canCancel?: boolean;
}) {
  const value = parseCount(counted);
  const diff = value ? dec(value).minus(systemSdg) : null;
  const needNote = !!diff && !diff.isZero();
  const ready = !!value && (!needNote || !!note.trim());
  return (
    <>
      <div className="rounded-xl border border-border bg-muted/40 p-4">
        <p className="text-sm text-muted-foreground">{systemLabel}</p>
        <p className="text-2xl font-bold tabular-nums">
          <bdi dir="ltr">{formatAmount(systemSdg, 0)}</bdi> ج.س
        </p>
      </div>
      {counting ? (
        <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
          <label className="flex flex-col gap-1">
            <span className="font-semibold">المعدود في الدرج (ج.س)</span>
            <Input
              name="countedCash"
              value={counted}
              onChange={(e) => setCounted(e.target.value)}
              inputMode="numeric"
              dir="ltr"
              required
              autoFocus
              placeholder="0"
              className="text-lg tabular-nums"
            />
          </label>
          {diff ? (
            diff.isZero() ? (
              <p className="rounded-lg bg-muted px-3 py-2 text-sm font-semibold text-muted-foreground">
                المعدود مطابق — لا فرق
              </p>
            ) : (
              <p
                aria-live="polite"
                className={cn(
                  "flex items-center justify-between gap-2 rounded-lg px-3 py-2 font-bold tabular-nums",
                  diff.lt(0) ? "bg-danger/10 text-danger" : "bg-sage/20 text-forest",
                )}
              >
                <span>الفرق {diff.lt(0) ? "(عجز)" : "(زيادة)"}</span>
                <span>
                  <bdi dir="ltr">
                    {diff.lt(0) ? "−" : "+"}
                    {formatAmount(diff.abs().toFixed(0), 0)}
                  </bdi>{" "}
                  ج.س
                </span>
              </p>
            )
          ) : null}
          {needNote ? (
            <label className="flex flex-col gap-1">
              <span className="font-semibold">سبب الفرق</span>
              <Input
                name="note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={300}
                placeholder="مثال: أخذت مبلغاً للترحيل ولم يُسجَّل"
              />
            </label>
          ) : null}
          {needNote && !note.trim() ? (
            <p className="text-xs text-muted-foreground">اكتبي سبب الفرق ليتفعّل الزر.</p>
          ) : null}
          <div className="flex gap-2">
            {canCancel ? (
              <Button
                type="button"
                variant="outline"
                className="basis-1/3"
                onClick={() => {
                  setCounting(false);
                  setCounted("");
                  setNote("");
                }}
              >
                إلغاء
              </Button>
            ) : null}
            <Button type="submit" className="flex-1" disabled={pending || blocked || !ready}>
              {pending ? pendingLabel : submitLabel}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <Button type="submit" disabled={pending || blocked}>
            <Check className="size-4" aria-hidden />
            {pending ? pendingLabel : matchLabel}
          </Button>
          <Button type="button" variant="outline" onClick={() => setCounting(true)}>
            <Calculator className="size-4" aria-hidden />
            {differentLabel}
          </Button>
        </>
      )}
    </>
  );
}

/** فتح الوردية (D-146): تبدأ من رصيد الخزنة في النظام؛ المعدود اختياري، والرصيد السالب يُلزم بالعدّ. */
export function OpenShiftForm({ systemSdg }: { systemSdg: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(openShiftAction, {});
  const negative = dec(systemSdg).lt(0);
  const [counting, setCounting] = useState(negative);
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");
  return (
    <form action={action} className="flex flex-col gap-3">
      {state.error ? <Alert variant="destructive">{state.error}</Alert> : null}
      <DrawerCount
        systemLabel="في الخزنة حسب النظام"
        systemSdg={systemSdg}
        counting={counting}
        setCounting={setCounting}
        counted={counted}
        setCounted={setCounted}
        note={note}
        setNote={setNote}
        matchLabel="فتح الوردية — المبلغ مطابق"
        differentLabel="عددتُ الدرج ووجدت مبلغاً مختلفاً"
        submitLabel="فتح الوردية بالمعدود"
        pending={pending}
        pendingLabel="جارٍ الفتح…"
        canCancel={!negative}
      />
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
  const countedValue = parseCount(counted);
  const difference = !counting ? "" : countedValue ? dec(countedValue).minus(expectedCash).toFixed(0) : "";
  // فواتير دون اتصال لم تُرسل بعد: إغلاق الوردية قبلها يُفسد مطابقة النقد (D-82)
  const [unsent, setUnsent] = useState(0);
  useEffect(() => {
    void pendingCount()
      .then(setUnsent)
      .catch(() => setUnsent(0));
  }, []);
  return (
    <form action={action} className="flex flex-col gap-3" onSubmit={confirm.onSubmit}>
      {state.error ? <Alert variant="destructive">{state.error}</Alert> : null}
      {unsent ? (
        <Alert variant="destructive">
          {unsent} فاتورة دون اتصال لم تُرسل بعد — افتحي نقطة البيع مع الاتصال لإرسالها قبل الإغلاق.
        </Alert>
      ) : null}
      <input type="hidden" name="shiftId" value={shiftId} />
      {counting ? null : (
        <>
          <input type="hidden" name="matched" value="1" />
          <input type="hidden" name="expectedSeen" value={expectedCash} />
        </>
      )}
      <DrawerCount
        systemLabel="النقد المتوقع في الدرج"
        systemSdg={expectedCash}
        counting={counting}
        setCounting={setCounting}
        counted={counted}
        setCounted={setCounted}
        note={note}
        setNote={setNote}
        matchLabel="عددتُ الدرج — المبلغ مطابق"
        differentLabel="عددتُ ووجدت مبلغاً مختلفاً"
        submitLabel="إغلاق الوردية بالمعدود"
        pending={pending}
        pendingLabel="جارٍ الإغلاق…"
        blocked={unsent > 0}
      />
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
              ? `يوجد فرق، والسبب: «${note.trim()}».`
              : "يوجد فرق — ارجعي واكتبي سببه."
            : undefined
        }
        confirmLabel={counting ? "إغلاق الوردية" : "نعم، عددتُ — إغلاق"}
        pendingLabel="جارٍ الإغلاق…"
      />
    </form>
  );
}
