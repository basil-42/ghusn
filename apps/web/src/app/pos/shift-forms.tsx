"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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

export function CloseShiftForm({ shiftId }: { shiftId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(closeShiftAction, {});
  // حقول محكومة: React يفرّغ النموذج بعد كل إرسال، ولا نريد إعادة العدّ بعد رسالة خطأ
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");
  return (
    <form
      action={action}
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        if (!window.confirm("إغلاق الوردية؟ لا يمكن البيع عليها بعد الإغلاق.")) e.preventDefault();
      }}
    >
      {state.error ? <Alert variant="destructive">{state.error}</Alert> : null}
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
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "جارٍ الإغلاق…" : "إغلاق الوردية"}
      </Button>
    </form>
  );
}
