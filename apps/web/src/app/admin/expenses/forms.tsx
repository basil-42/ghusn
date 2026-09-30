"use client";

import { useActionState, useRef } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { createExpenseAction, voidExpenseAction, type FormState } from "./actions";

type Option = { value: string; label: string };
const field = "flex min-w-0 flex-col gap-1";

/**
 * تسجيل مصروف. الموظفة: أقسامها فقط، من درج الوردية، بتاريخ اليوم (D-83).
 * صورة الفاتورة اختيارية — على الجوال تفتح الكاميرا مباشرة.
 */
export function ExpenseForm({
  categories,
  wallets,
  full,
  today,
  limitSdg,
}: {
  categories: Option[];
  wallets: Option[];
  full: boolean;
  today: string;
  limitSdg: number;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<FormState, FormData>(async (prev, data) => {
    const result = await createExpenseAction(prev, data);
    if (result.success) formRef.current?.reset();
    return result;
  }, {});
  return (
    <form ref={formRef} action={action} className="flex flex-col gap-4">
      {state.error ? <Alert variant="destructive">{state.error}</Alert> : null}
      {state.success ? <Alert variant="success">{state.success}</Alert> : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className={field}>
          <span className="font-semibold">القسم</span>
          <NativeSelect name="categoryId" defaultValue="" required>
            <option value="" disabled>
              اختاري القسم
            </option>
            {categories.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className={field}>
          <span className="font-semibold">المبلغ{full ? " (بعملة المحفظة)" : " (ج.س)"}</span>
          <Input name="amount" inputMode="decimal" dir="ltr" required />
          {!full ? (
            <span className="text-xs text-muted-foreground">
              من درج الوردية، حتى {limitSdg.toLocaleString("en-US")} ج.س للمصروف.
            </span>
          ) : null}
        </label>
        {full ? (
          <>
            <label className={field}>
              <span className="font-semibold">دُفع من</span>
              <NativeSelect name="walletId" defaultValue="" required>
                <option value="" disabled>
                  اختاري المحفظة
                </option>
                {wallets.map((w) => (
                  <option key={w.value} value={w.value}>
                    {w.label}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <label className={field}>
              <span className="font-semibold">التاريخ</span>
              <Input name="spentAt" type="date" defaultValue={today} max={today} dir="ltr" />
            </label>
          </>
        ) : null}
      </div>
      <label className={field}>
        <span className="font-semibold">ملاحظة</span>
        <Input name="note" maxLength={300} placeholder="مثال: إيجار أكتوبر، ترحيل طلب…" />
      </label>
      <label className={field}>
        <span className="font-semibold">صورة الفاتورة (اختيارية)</span>
        <input
          name="attachment"
          type="file"
          accept="image/*"
          capture="environment"
          className="min-h-11 rounded-xl border border-input bg-card p-2 text-sm"
        />
      </label>
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "جارٍ الحفظ…" : "تسجيل المصروف"}
      </Button>
    </form>
  );
}

export function VoidExpenseForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(voidExpenseAction, {});
  return (
    <form
      action={action}
      className="flex items-center gap-2"
      onSubmit={(e) => {
        if (!window.confirm("إلغاء هذا المصروف؟")) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <Input name="reason" placeholder="سبب الإلغاء" aria-label="سبب الإلغاء" className="w-40" required minLength={3} />
      <Button type="submit" size="sm" variant="ghost" className="text-destructive" disabled={pending}>
        إلغاء
      </Button>
      {state.error ? <span className="text-sm text-destructive">{state.error}</span> : null}
    </form>
  );
}
