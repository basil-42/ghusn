"use client";

import { Pencil } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addNoteAction, renameCustomerAction, type FormState } from "./actions";

/** تعديل الاسم في مكانه — الرقم هو المعرّف ولا يُعدَّل. */
export function RenameCustomer({ customerId, name }: { customerId: string; name: string | null }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(async (prev, formData) => {
    const result = await renameCustomerAction(prev, formData);
    if (result.success) setOpen(false);
    return result;
  }, {});
  if (!open)
    return (
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <Pencil aria-hidden /> تعديل الاسم
      </Button>
    );
  return (
    <form action={action} className="flex flex-wrap items-start gap-2">
      <input type="hidden" name="customerId" value={customerId} />
      <Input name="name" defaultValue={name ?? ""} aria-label="اسم العميل" autoFocus className="w-56" maxLength={80} />
      <Button type="submit" disabled={pending}>
        {pending ? "جارٍ الحفظ…" : "حفظ"}
      </Button>
      <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
        إلغاء
      </Button>
      {state.error ? <span className="w-full text-sm text-destructive">{state.error}</span> : null}
    </form>
  );
}

export function AddNoteForm({ customerId }: { customerId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addNoteAction, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.success) ref.current?.reset();
  }, [state.at, state.success]);
  return (
    <form ref={ref} action={action} className="flex flex-col gap-2">
      <input type="hidden" name="customerId" value={customerId} />
      <div className="flex gap-2">
        <Input
          name="body"
          placeholder="أضيفي ملاحظة… (مثل: تحب الورد الأبيض)"
          aria-label="ملاحظة جديدة"
          maxLength={500}
          required
          className="min-w-0 flex-1"
        />
        <Button type="submit" disabled={pending}>
          {pending ? "…" : "حفظ"}
        </Button>
      </div>
      {state.error ? <Alert variant="destructive">{state.error}</Alert> : null}
    </form>
  );
}
