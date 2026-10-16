"use client";

import { useActionToast } from "@/components/ui/toast";
import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { addContributionAction, type FormState } from "./actions";

/**
 * «مال دخل المحل» (D-144): مال جديد من خارج المحل إلى علبة — يزيد رصيدها بعملتها، وليس دخلاً ولا ربحاً.
 * إلى الخزنة ← على الوردية المفتوحة (D-143). رأس المال واسترداده خارج النظام (D-142).
 */
export function ContributionForm({
  wallets,
  today,
}: {
  wallets: { id: string; name: string; currencyCode: string }[];
  today: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(addContributionAction, {});
  useActionToast(state);
  return (
    <form action={action} key={state.success} className="flex flex-col gap-3">
      {state.error ? <Alert variant="destructive">{state.error}</Alert> : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="font-semibold">إلى أي علبة؟</span>
          <NativeSelect name="walletId" required defaultValue={wallets[0]?.id ?? ""}>
            {wallets.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} ({w.currencyCode})
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-semibold">المبلغ (بعملة العلبة)</span>
          <Input name="amount" inputMode="decimal" dir="ltr" required />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-semibold">من</span>
          <Input name="partnerName" defaultValue="باسل" required />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-semibold">التاريخ</span>
          <Input name="contributedAt" type="date" defaultValue={today} max={today} dir="ltr" required />
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className="font-semibold">ملاحظة</span>
        <Input name="note" maxLength={200} placeholder="مثال: تغطية الإيجار" />
      </label>
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "جارٍ التسجيل…" : "تسجيل المال الداخل"}
      </Button>
    </form>
  );
}
