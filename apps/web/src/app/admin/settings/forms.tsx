"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import type { PosSettings, ReceiptSettings } from "@/lib/settings";
import { savePosSettingsAction, saveReceiptSettingsAction, type FormState } from "./actions";

function Messages({ state }: { state: FormState }) {
  return (
    <>
      {state.error ? <Alert variant="destructive">{state.error}</Alert> : null}
      {state.success ? <Alert variant="success">{state.success}</Alert> : null}
    </>
  );
}

const field = "flex min-w-0 flex-col gap-1";

export function PosSettingsForm({
  initial,
  wallets,
}: {
  initial: PosSettings;
  wallets: { value: string; label: string }[];
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(savePosSettingsAction, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <Messages state={state} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className={field}>
          <span className="font-semibold">حد خصم الموظفة %</span>
          <Input
            name="maxDiscountPercent"
            defaultValue={String(initial.maxDiscountPercent)}
            inputMode="decimal"
            dir="ltr"
          />
          <span className="text-xs text-muted-foreground">فوقه، أو البيع تحت التكلفة، يحتاج موافقة المديرة.</span>
        </label>
        <label className={field}>
          <span className="font-semibold">مدة المرتجع (أيام)</span>
          <Input name="returnDays" defaultValue={String(initial.returnDays)} inputMode="numeric" dir="ltr" />
        </label>
        <label className={field}>
          <span className="font-semibold">محفظة النقد</span>
          <NativeSelect name="cashWalletId" defaultValue={initial.cashWalletId ?? ""}>
            <option value="">صندوق المحل (افتراضي)</option>
            {wallets.map((w) => (
              <option key={w.value} value={w.value}>
                {w.label}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className={field}>
          <span className="font-semibold">محفظة بنكك</span>
          <NativeSelect name="bankakWalletId" defaultValue={initial.bankakWalletId ?? ""}>
            <option value="">بنكك (افتراضي)</option>
            {wallets.map((w) => (
              <option key={w.value} value={w.value}>
                {w.label}
              </option>
            ))}
          </NativeSelect>
        </label>
      </div>
      <Button type="submit" disabled={pending} className="self-start">
        حفظ
      </Button>
    </form>
  );
}

export function ReceiptSettingsForm({ initial }: { initial: ReceiptSettings }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveReceiptSettingsAction, {});
  const check = (name: keyof ReceiptSettings, label: string) => (
    <label className="flex min-h-11 items-center gap-2">
      <input type="checkbox" name={name} defaultChecked={initial[name] as boolean} className="size-5 accent-primary" />
      <span>{label}</span>
    </label>
  );
  return (
    <form action={action} className="flex flex-col gap-4">
      <Messages state={state} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className={field}>
          <span className="font-semibold">العبارة تحت الشعار</span>
          <Input name="tagline" defaultValue={initial.tagline} maxLength={80} />
        </label>
        <label className={field}>
          <span className="font-semibold">العنوان</span>
          <Input name="address" defaultValue={initial.address} maxLength={160} />
        </label>
        <label className={field}>
          <span className="font-semibold">الهاتف</span>
          <Input name="phone" defaultValue={initial.phone} maxLength={40} dir="ltr" />
        </label>
        <label className={field}>
          <span className="font-semibold">واتساب</span>
          <Input name="whatsapp" defaultValue={initial.whatsapp} maxLength={40} dir="ltr" />
        </label>
        <label className={field}>
          <span className="font-semibold">إنستغرام</span>
          <Input name="instagram" defaultValue={initial.instagram} maxLength={60} dir="ltr" />
        </label>
      </div>
      <label className={field}>
        <span className="font-semibold">نص أسفل الإيصال (سياسة الاسترجاع، شكر…)</span>
        <textarea
          name="footer"
          defaultValue={initial.footer}
          maxLength={300}
          rows={3}
          className="rounded-xl border border-input bg-card p-3"
        />
      </label>
      <div className="flex flex-wrap gap-x-6">
        {check("showLogo", "إظهار الشعار")}
        {check("showCashier", "اسم البائعة")}
        {check("showCustomerPhone", "هاتف العميل")}
      </div>
      <Button type="submit" disabled={pending} className="self-start">
        حفظ الإيصال
      </Button>
    </form>
  );
}
