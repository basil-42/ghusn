"use client";

import { Banknote } from "lucide-react";
import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, useConfirmForm } from "@/components/ui/confirm-dialog";
import { withToast } from "@/components/ui/toast";
import { cashOutCreditAction, type FormState } from "../../actions";

// النموذج يختفي بعد الرد (لم يبقَ رصيد)، فالرسالة تُعرض فور وصولها
const cashOut = withToast(cashOutCreditAction);

export function CashOutForm({ returnId, amount }: { returnId: string; amount: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(cashOut, {});
  const confirm = useConfirmForm(action, state, pending);
  return (
    <form action={action} onSubmit={confirm.onSubmit} className="flex flex-col gap-2">
      {state.error ? <Alert variant="destructive">{state.error}</Alert> : null}

      <input type="hidden" name="returnId" value={returnId} />
      <Button type="submit" variant="outline" disabled={pending}>
        رد الرصيد نقداً
      </Button>
      <ConfirmDialog
        {...confirm.dialog}
        tone="danger"
        icon={Banknote}
        title={`رد ${amount} ج.س نقداً؟`}
        description="يخرج المبلغ من درج ورديتك للعميل بدل الاستبدال، ويُقفل رصيد الاستبدال."
        summary={[{ label: "رصيد الاستبدال المتبقي", value: `${amount} ج.س`, total: true }]}
        confirmLabel={`رد ${amount} نقداً`}
        pendingLabel="جارٍ التسجيل…"
      />
    </form>
  );
}
