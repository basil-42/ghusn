"use client";

import { useActionToast, withToast } from "@/components/ui/toast";
import { useActionState, useRef, useState } from "react";
import { OVER_BALANCE, exceedsAvailable } from "@/lib/wallet-hint";
import type { WalletPick } from "@/lib/wallets";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { createExpenseAction, voidExpenseAction, type FormState } from "./actions";
import { ImageInput } from "@/components/image-input";
import { ConfirmDialog, useConfirmForm } from "@/components/ui/confirm-dialog";
import { ReceiptText } from "lucide-react";

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
  wallets: WalletPick[];
  full: boolean;
  today: string;
  limitSdg: number;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [walletId, setWalletId] = useState("");
  const [amount, setAmount] = useState("");
  const [state, action, pending] = useActionState<FormState, FormData>(async (prev, data) => {
    const result = await createExpenseAction(prev, data);
    if (result.success) {
      formRef.current?.reset();
      setWalletId("");
      setAmount("");
    }
    return result;
  }, {});
  useActionToast(state);
  const exceeds = full && exceedsAvailable(amount, wallets.find((w) => w.value === walletId)?.available);
  return (
    <form ref={formRef} action={action} className="flex flex-col gap-4">
      {state.error ? <Alert variant="destructive">{state.error}</Alert> : null}

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
          <Input
            name="amount"
            inputMode="decimal"
            dir="ltr"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-invalid={exceeds || undefined}
          />
          {exceeds ? <span className="text-xs font-semibold text-destructive">{OVER_BALANCE}</span> : null}
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
              <NativeSelect name="walletId" value={walletId} onChange={(e) => setWalletId(e.target.value)} required>
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
        <ImageInput
          name="attachment"
          accept="image/*"
          capture="environment"
          className="min-h-11 rounded-xl border border-input bg-card p-2 text-sm"
        />
      </label>
      <Button type="submit" disabled={pending || exceeds} className="self-start">
        {pending ? "جارٍ الحفظ…" : "تسجيل المصروف"}
      </Button>
    </form>
  );
}

// النموذج يختفي بعد الإلغاء، فالرسالة تُعرض فور وصولها
const voidExpense = withToast(voidExpenseAction);

export function VoidExpenseForm({
  id,
  number,
  category,
  amount,
  wallet,
}: {
  id: string;
  number: string;
  category: string;
  /** المبلغ منسّقاً بعملته. */
  amount: string;
  wallet: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(voidExpense, {});
  const confirm = useConfirmForm(action, state, pending);
  return (
    <form action={action} className="flex items-center gap-2" onSubmit={confirm.onSubmit}>
      <input type="hidden" name="id" value={id} />
      <Input name="reason" placeholder="سبب الإلغاء" aria-label="سبب الإلغاء" className="w-40" required minLength={3} />
      <Button type="submit" size="sm" variant="ghost" className="text-destructive" disabled={pending}>
        إلغاء
      </Button>
      {state.error ? <span className="text-sm text-destructive">{state.error}</span> : null}
      <ConfirmDialog
        {...confirm.dialog}
        tone="danger"
        icon={ReceiptText}
        title={
          <>
            إلغاء المصروف <bdi dir="ltr">{number}</bdi>؟
          </>
        }
        description="يعود المبلغ إلى المحفظة، ويبقى المصروف في السجل ملغى بسببه."
        summary={[
          { label: category, value: <bdi dir="ltr">{amount}</bdi> },
          { label: "يعود إلى", value: wallet },
        ]}
        confirmLabel="إلغاء المصروف"
        pendingLabel="جارٍ الإلغاء…"
      />
    </form>
  );
}
