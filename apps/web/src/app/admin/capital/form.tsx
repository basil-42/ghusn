"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { addContributionAction, type FormState } from "./actions";

export function ContributionForm({
  currencies,
  wallets,
  today,
}: {
  currencies: string[];
  wallets: { id: string; name: string; currencyCode: string }[];
  today: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(addContributionAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      {state.error ? <Alert variant="destructive">{state.error}</Alert> : null}
      {state.success ? <Alert variant="success">{state.success}</Alert> : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="font-semibold">الشريك</span>
          <Input name="partnerName" defaultValue="باسل" required />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-semibold">التاريخ</span>
          <Input name="contributedAt" type="date" defaultValue={today} max={today} dir="ltr" required />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-semibold">المبلغ</span>
          <Input name="amount" inputMode="decimal" dir="ltr" required />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-semibold">العملة</span>
          <NativeSelect name="currencyCode" defaultValue="QAR">
            {currencies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </NativeSelect>
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className="font-semibold">دخل إلى محفظة (اختياري)</span>
        <NativeSelect name="walletId" defaultValue="">
          <option value="">لا — دُفع مباشرة (لمورد أو مصروف خارج المحافظ)</option>
          {wallets.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name} ({w.currencyCode})
            </option>
          ))}
        </NativeSelect>
        <span className="text-xs text-muted-foreground">إن اخترت محفظة يزيد رصيدها، وتكون العملة عملتها.</span>
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-semibold">ملاحظة</span>
        <Input name="note" maxLength={200} placeholder="مثال: تحويل لشراء شحنة الصين" />
      </label>
      <Button type="submit" disabled={pending} className="self-start">
        تسجيل التمويل
      </Button>
    </form>
  );
}
