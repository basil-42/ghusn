"use client";

import { dec, planTransfer, rateChange, toLatinDigits, type TransferPlan } from "@ghusn/core";
import { useActionState, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { formatAmount, formatPercent, formatRate } from "@/lib/format";
import {
  adjustmentAction,
  createWalletAction,
  openingAction,
  toggleWalletAction,
  transferAction,
  type FormState,
} from "./actions";

export type WalletOption = { id: string; name: string; currencyCode: string; symbol: string; balance: string };
type RateSides = Record<string, { currentRate: string; anchored: boolean }>;

const field = "flex min-w-0 flex-col gap-1";

/** نفس تنظيف الخادم (amountField): أرقام عربية وفواصل آلاف. null إن لم يكن رقماً صالحاً. */
function parseAmount(v: string): string | null {
  const clean = toLatinDigits(v)
    .replace(/[,\s٬]/g, "")
    .replace("٫", ".");
  return /^\d{1,13}(\.\d{1,2})?$/.test(clean) && dec(clean).gt(0) ? clean : null;
}

function Messages({ state }: { state: FormState }) {
  return (
    <>
      {state.error ? <Alert variant="destructive">{state.error}</Alert> : null}
      {state.success ? <Alert variant="success">{state.success}</Alert> : null}
    </>
  );
}

/**
 * تحويل بين محفظتين (D-86): الخارج شامل العمولة والواصل. المعاينة تعرض السعر الفعلي
 * قبل الحفظ؛ الخادم يعيد الحساب ولا يثق بها.
 */
export function TransferForm({ wallets, rates, today }: { wallets: WalletOption[]; rates: RateSides; today: string }) {
  const empty = { fromWalletId: "", toWalletId: "", fromAmount: "", toAmount: "", feeAmount: "", at: today };
  const [v, setV] = useState(empty);
  const [state, action, pending] = useActionState<FormState, FormData>(async (prev, data) => {
    const result = await transferAction(prev, data);
    if (result.success) setV(empty);
    return result;
  }, {});
  const set = (k: keyof typeof empty) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });

  const from = wallets.find((w) => w.id === v.fromWalletId);
  const to = wallets.find((w) => w.id === v.toWalletId);
  const fromAmount = parseAmount(v.fromAmount);
  const toAmount = parseAmount(v.toAmount);
  let plan: TransferPlan | null = null;
  let planError: string | null = null;
  if (from && to && fromAmount && toAmount && from.id !== to.id) {
    const fr = rates[from.currencyCode];
    const tr = rates[to.currencyCode];
    if (!fr || !tr) planError = "لا يوجد سعر صرف لإحدى العملتين.";
    else {
      try {
        plan = planTransfer({
          from: { currencyCode: from.currencyCode, amount: fromAmount, ...fr },
          to: { currencyCode: to.currencyCode, amount: toAmount, ...tr },
        });
      } catch {
        planError = "نفس العملة: الخارج يجب أن يساوي الواصل (سجّل العمولة مصروفاً).";
      }
    }
  }
  const derived = plan?.derived ?? null;
  const overdraw = from && fromAmount && dec(fromAmount).gt(from.balance);

  return (
    <form action={action} className="flex flex-col gap-4">
      <Messages state={state} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className={field}>
          <span className="font-semibold">من محفظة</span>
          <NativeSelect name="fromWalletId" value={v.fromWalletId} onChange={set("fromWalletId")} required>
            <option value="" disabled>
              اختر
            </option>
            {wallets.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} ({w.currencyCode})
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className={field}>
          <span className="font-semibold">إلى محفظة</span>
          <NativeSelect name="toWalletId" value={v.toWalletId} onChange={set("toWalletId")} required>
            <option value="" disabled>
              اختر
            </option>
            {wallets
              .filter((w) => w.id !== v.fromWalletId)
              .map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.currencyCode})
                </option>
              ))}
          </NativeSelect>
        </label>
        <label className={field}>
          <span className="font-semibold">الخارج شامل العمولة{from ? ` (${from.symbol})` : ""}</span>
          <Input
            name="fromAmount"
            value={v.fromAmount}
            onChange={set("fromAmount")}
            inputMode="decimal"
            dir="ltr"
            required
          />
          {from ? (
            <span className={`text-xs ${overdraw ? "font-semibold text-destructive" : "text-muted-foreground"}`}>
              الرصيد {formatAmount(from.balance)} {from.symbol}
              {overdraw ? " — أقل من المبلغ، سيصبح سالباً" : ""}
            </span>
          ) : null}
        </label>
        <label className={field}>
          <span className="font-semibold">الواصل فعلاً{to ? ` (${to.symbol})` : ""}</span>
          <Input name="toAmount" value={v.toAmount} onChange={set("toAmount")} inputMode="decimal" dir="ltr" required />
        </label>
        <label className={field}>
          <span className="font-semibold">منها عمولة (اختياري)</span>
          <Input name="feeAmount" value={v.feeAmount} onChange={set("feeAmount")} inputMode="decimal" dir="ltr" />
          <span className="text-xs text-muted-foreground">للمعلومة — هي ضمن الخارج وتدخل في السعر الفعلي.</span>
        </label>
        <label className={field}>
          <span className="font-semibold">التاريخ</span>
          <Input name="at" type="date" value={v.at} onChange={set("at")} max={today} dir="ltr" required />
        </label>
        <label className={field}>
          <span className="font-semibold">رقم العملية (اختياري)</span>
          <Input name="reference" maxLength={60} dir="ltr" />
        </label>
        <label className={field}>
          <span className="font-semibold">ملاحظة</span>
          <Input name="note" maxLength={200} placeholder="مثال: عبر الوسيط فلان" />
        </label>
      </div>

      {planError ? <Alert variant="destructive">{planError}</Alert> : null}
      {plan && from && to ? (
        <div className="flex flex-col gap-1 rounded-xl border border-border bg-muted/40 p-3 text-sm">
          <p>
            قيمة التحويل:{" "}
            <bdi dir="ltr" className="font-bold tabular-nums">
              {formatAmount(plan.fromAmountUsd)} $
            </bdi>
            {plan.toAmountUsd.eq(plan.fromAmountUsd) ? null : (
              <>
                {" "}
                ← وصل{" "}
                <bdi dir="ltr" className="font-bold tabular-nums">
                  {formatAmount(plan.toAmountUsd)} $
                </bdi>
              </>
            )}
          </p>
          {derived ? (
            <>
              <p>
                السعر الفعلي:{" "}
                <bdi dir="ltr" className="font-bold tabular-nums">
                  1 $ = {formatRate(derived.unitsPerUsd.toFixed())} {derived.currencyCode}
                </bdi>{" "}
                <span className="text-muted-foreground">
                  (الساري {formatRate(derived.previous.toFixed())}،{" "}
                  <bdi dir="ltr">{formatPercent(rateChange(derived.previous, derived.unitsPerUsd))}</bdi>)
                </span>
              </p>
              <p className="text-muted-foreground">
                {v.at === today
                  ? `يُسجَّل «تحويل فعلي» ويصبح سعر ${derived.currencyCode} الساري لبقية اليوم.`
                  : "تاريخ سابق: يُحفظ السعر مع التحويل فقط ولا يغيّر السعر الساري (لا أسعار بأثر رجعي)."}
              </p>
            </>
          ) : null}
          {derived?.suspicious ? (
            <label className={field}>
              <span className="font-semibold text-destructive">
                السعر يبتعد أكثر من 20% عن الساري — راجع المبلغين، أو اكتب السعر{" "}
                <bdi dir="ltr">{derived.unitsPerUsd.toFixed()}</bdi> للتأكيد
              </span>
              <Input name="confirmRate" dir="ltr" inputMode="decimal" />
            </label>
          ) : null}
        </div>
      ) : null}

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "جارٍ الحفظ…" : "تسجيل التحويل"}
      </Button>
    </form>
  );
}

/** الرصيد الافتتاحي (جرد) لمحفظة بلا رصيد افتتاحي. */
export function OpeningForm({ walletId, symbol, today }: { walletId: string; symbol: string; today: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(openingAction, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <Messages state={state} />
      <input type="hidden" name="walletId" value={walletId} />
      <div className="grid grid-cols-2 gap-2">
        <label className={field}>
          <span className="text-sm font-semibold">المبلغ الموجود فعلاً ({symbol})</span>
          <Input name="amount" inputMode="decimal" dir="ltr" required />
        </label>
        <label className={field}>
          <span className="text-sm font-semibold">في تاريخ</span>
          <Input name="at" type="date" defaultValue={today} max={today} dir="ltr" required />
        </label>
      </div>
      <Button type="submit" size="sm" disabled={pending} className="self-start">
        حفظ الرصيد الافتتاحي
      </Button>
    </form>
  );
}

/** تسوية يدوية بسبب (زيادة أو نقص). */
export function AdjustmentForm({ walletId, symbol, today }: { walletId: string; symbol: string; today: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<FormState, FormData>(async (prev, data) => {
    const result = await adjustmentAction(prev, data);
    if (result.success) formRef.current?.reset();
    return result;
  }, {});
  return (
    <form ref={formRef} action={action} className="flex flex-col gap-2">
      <Messages state={state} />
      <input type="hidden" name="walletId" value={walletId} />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <label className={field}>
          <span className="text-sm font-semibold">النوع</span>
          <NativeSelect name="direction" defaultValue="OUT">
            <option value="OUT">نقص</option>
            <option value="IN">زيادة</option>
          </NativeSelect>
        </label>
        <label className={field}>
          <span className="text-sm font-semibold">المبلغ ({symbol})</span>
          <Input name="amount" inputMode="decimal" dir="ltr" required />
        </label>
        <label className={field}>
          <span className="text-sm font-semibold">التاريخ</span>
          <Input name="at" type="date" defaultValue={today} max={today} dir="ltr" required />
        </label>
      </div>
      <label className={field}>
        <span className="text-sm font-semibold">السبب</span>
        <Input name="reason" maxLength={200} required placeholder="مثال: فرق جرد، رسوم بنكية" />
      </label>
      <Button type="submit" size="sm" variant="outline" disabled={pending} className="self-start">
        تسجيل التسوية
      </Button>
    </form>
  );
}

export function NewWalletForm({ currencies }: { currencies: string[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<FormState, FormData>(async (prev, data) => {
    const result = await createWalletAction(prev, data);
    if (result.success) formRef.current?.reset();
    return result;
  }, {});
  return (
    <form ref={formRef} action={action} className="flex flex-col gap-2">
      <Messages state={state} />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_8rem]">
        <label className={field}>
          <span className="text-sm font-semibold">الاسم</span>
          <Input name="name" maxLength={60} required placeholder="مثال: وكيل الصين" />
        </label>
        <label className={field}>
          <span className="text-sm font-semibold">العملة</span>
          <NativeSelect name="currencyCode" defaultValue="" required>
            <option value="" disabled>
              اختر
            </option>
            {currencies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </NativeSelect>
        </label>
      </div>
      <Button type="submit" size="sm" disabled={pending} className="self-start">
        إضافة محفظة
      </Button>
    </form>
  );
}

export function ToggleWalletForm({ id, isActive }: { id: string; isActive: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(toggleWalletAction, {});
  return (
    <form action={action} className="flex flex-col gap-1">
      {state.error ? <Alert variant="destructive">{state.error}</Alert> : null}
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="isActive" value={String(!isActive)} />
      <Button type="submit" size="sm" variant="ghost" disabled={pending} className="self-start">
        {isActive ? "إيقاف المحفظة" : "تفعيل المحفظة"}
      </Button>
    </form>
  );
}
