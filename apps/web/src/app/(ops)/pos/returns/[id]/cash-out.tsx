"use client";

import { useActionToast } from "@/components/ui/toast";
import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cashOutCreditAction, type FormState } from "../../actions";

export function CashOutForm({ returnId, amount }: { returnId: string; amount: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(cashOutCreditAction, {});
  useActionToast(state);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(`رد ${amount} ج.س نقداً للعميل بدل الاستبدال؟`)) e.preventDefault();
      }}
      className="flex flex-col gap-2"
    >
      {state.error ? <Alert variant="destructive">{state.error}</Alert> : null}

      <input type="hidden" name="returnId" value={returnId} />
      <Button type="submit" variant="outline" disabled={pending}>
        رد الرصيد نقداً
      </Button>
    </form>
  );
}
