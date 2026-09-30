"use client";

import { useActionState, useState } from "react";
import { Field, SelectField } from "@/components/form-field";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  createSupplierAction,
  recordPaymentAction,
  updateSupplierAction,
  voidEntryAction,
  type FormState,
} from "./actions";

type Option = { value: string; label: string };

function Messages({ state }: { state: FormState }) {
  return (
    <>
      {state.error ? <Alert variant="destructive">{state.error}</Alert> : null}
      {state.success ? <Alert variant="success">{state.success}</Alert> : null}
    </>
  );
}

export function NewSupplierForm({
  countries,
  currencies,
  today,
}: {
  countries: Option[];
  currencies: Option[];
  today: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(createSupplierAction, {});
  const [hasOpening, setHasOpening] = useState(false);
  return (
    <form action={action} className="flex flex-col gap-5">
      <Messages state={state} />
      <div className="grid grid-cols-1 gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2">
        <Field label="اسم المورد" name="name" required />
        <SelectField label="الدولة" name="country" defaultValue="QA">
          {countries.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </SelectField>
        <SelectField label="عملة الحساب" name="currencyCode" defaultValue="QAR">
          {currencies.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </SelectField>
        <Field label="الهاتف أو واتساب (اختياري)" name="phone" type="tel" dir="ltr" />
        <div className="sm:col-span-2">
          <Field label="ملاحظات (اختياري)" name="notes" />
        </div>
        <p className="text-sm text-muted-foreground sm:col-span-2">عملة الحساب لا تتغير بعد أول حركة.</p>
      </div>

      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
        <label className="flex min-h-11 items-center gap-3">
          <input
            type="checkbox"
            checked={hasOpening}
            onChange={(e) => setHasOpening(e.target.checked)}
            className="size-5 accent-forest"
          />
          <span className="font-semibold">له رصيد قائم قبل بدء النظام</span>
        </label>
        {hasOpening ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="المبلغ بعملة الحساب" name="openingAmount" inputMode="decimal" dir="ltr" required />
            <SelectField label="الاتجاه" name="openingDirection" defaultValue="OWE">
              <option value="OWE">علينا للمورد</option>
              <option value="CREDIT">لنا عند المورد (عربون)</option>
            </SelectField>
            <Field label="بتاريخ" name="openingDate" type="date" defaultValue={today} max={today} dir="ltr" required />
          </div>
        ) : null}
      </div>

      <div>
        <Button type="submit" disabled={pending} className="w-full sm:w-auto">
          {pending ? "جارٍ الحفظ…" : "إضافة المورد"}
        </Button>
      </div>
    </form>
  );
}

export function PaymentForm({
  supplierId,
  supplierCurrency,
  wallets,
  today,
}: {
  supplierId: string;
  supplierCurrency: string;
  wallets: (Option & { currency: string })[];
  today: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(recordPaymentAction, {});
  const [walletId, setWalletId] = useState(
    wallets.find((w) => w.currency === supplierCurrency)?.value ?? wallets[0]?.value ?? "",
  );
  const walletCurrency = wallets.find((w) => w.value === walletId)?.currency;
  const crossCurrency = walletCurrency && walletCurrency !== supplierCurrency;

  return (
    <form action={action} key={state.success} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-3 sm:col-span-2">
        <Messages state={state} />
      </div>
      <input type="hidden" name="supplierId" value={supplierId} />
      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor="walletId">من محفظة</Label>
        <select
          id="walletId"
          name="walletId"
          value={walletId}
          onChange={(e) => setWalletId(e.target.value)}
          className="min-h-12 w-full min-w-0 rounded-xl border border-input bg-card px-4 text-base"
        >
          {wallets.map((w) => (
            <option key={w.value} value={w.value}>
              {w.label}
            </option>
          ))}
        </select>
      </div>
      <Field label="التاريخ" name="date" type="date" defaultValue={today} max={today} dir="ltr" required />
      <Field
        label={`المبلغ المدفوع${walletCurrency ? ` (${walletCurrency})` : ""}`}
        name="paidAmount"
        inputMode="decimal"
        dir="ltr"
        required
      />
      {crossCurrency ? (
        <Field
          label={`المخصوم من حساب المورد (${supplierCurrency})`}
          name="supplierAmount"
          inputMode="decimal"
          dir="ltr"
          hint="المحفظة بعملة غير عملة المورد — اكتبي ما وصل للمورد"
          required
        />
      ) : null}
      <Field label="رقم التحويل أو الإيصال (اختياري)" name="reference" dir="ltr" />
      <Field label="ملاحظة (اختياري)" name="note" />
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending} className="w-full sm:w-auto">
          {pending ? "جارٍ التسجيل…" : "تسجيل الدفعة"}
        </Button>
      </div>
    </form>
  );
}

export function VoidEntryForm({ supplierId, entryId }: { supplierId: string; entryId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(voidEntryAction, {});
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => setOpen(true)}>
        إلغاء
      </Button>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="supplierId" value={supplierId} />
      <input type="hidden" name="entryId" value={entryId} />
      <input
        name="reason"
        required
        minLength={3}
        placeholder="سبب الإلغاء"
        aria-label="سبب الإلغاء"
        className="min-h-11 min-w-0 rounded-xl border border-input bg-card px-3"
      />
      <div className="flex gap-2">
        <Button type="submit" variant="outline" size="sm" className="text-destructive" disabled={pending}>
          تأكيد الإلغاء
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          تراجع
        </Button>
      </div>
      {state.error ? <span className="text-sm text-destructive">{state.error}</span> : null}
    </form>
  );
}

export function EditSupplierForm({
  supplier,
  countries,
}: {
  supplier: {
    id: string;
    name: string;
    country: string;
    phone: string | null;
    notes: string | null;
    isActive: boolean;
  };
  countries: Option[];
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateSupplierAction, {});
  return (
    <form action={action} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-3 sm:col-span-2">
        <Messages state={state} />
      </div>
      <input type="hidden" name="id" value={supplier.id} />
      <Field label="اسم المورد" name="name" id="edit-name" defaultValue={supplier.name} required />
      <SelectField label="الدولة" name="country" id="edit-country" defaultValue={supplier.country}>
        {countries.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </SelectField>
      <Field
        label="الهاتف أو واتساب"
        name="phone"
        id="edit-phone"
        type="tel"
        dir="ltr"
        defaultValue={supplier.phone ?? ""}
      />
      <Field label="ملاحظات" name="notes" id="edit-notes" defaultValue={supplier.notes ?? ""} />
      <label className="flex min-h-11 items-center gap-3 sm:col-span-2">
        <input type="checkbox" name="isActive" defaultChecked={supplier.isActive} className="size-5 accent-forest" />
        <span>نشط</span>
      </label>
      <div className="sm:col-span-2">
        <Button type="submit" variant="outline" disabled={pending}>
          حفظ البيانات
        </Button>
      </div>
    </form>
  );
}
