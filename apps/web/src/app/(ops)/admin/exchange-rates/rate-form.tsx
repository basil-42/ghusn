"use client";

import { useActionState } from "react";
import { Field, SelectField } from "@/components/form-field";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { createExchangeRate, type RateFormState } from "./actions";

type Option = { value: string; label: string };

export function RateForm({ currencies, sources }: { currencies: Option[]; sources: Option[] }) {
  const [state, action, pending] = useActionState<RateFormState, FormData>(createExchangeRate, {});
  const v = state.values;

  return (
    // key: يُفرَّغ النموذج بعد الحفظ الناجح
    <form action={action} key={state.success} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {state.error ? (
        <Alert variant={state.needsConfirm ? "warning" : "destructive"} className="sm:col-span-2">
          {state.error}
        </Alert>
      ) : null}
      {state.success ? (
        <Alert variant="success" className="sm:col-span-2">
          {state.success}
        </Alert>
      ) : null}

      <SelectField label="العملة" name="currencyCode" defaultValue={v?.currencyCode ?? currencies[0]?.value}>
        {currencies.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </SelectField>
      <Field
        label="كم وحدة = 1 دولار"
        name="unitsPerUsd"
        inputMode="decimal"
        dir="ltr"
        placeholder="2500"
        defaultValue={v?.unitsPerUsd}
        autoComplete="off"
        required
      />
      <SelectField label="المصدر" name="source" defaultValue={v?.source ?? sources[0]?.value}>
        {sources.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </SelectField>
      <Field label="ملاحظة (اختياري)" name="note" maxLength={200} defaultValue={v?.note} />

      {state.needsConfirm ? (
        <label className="flex min-h-11 items-center gap-3 sm:col-span-2">
          <input type="checkbox" name="confirmedValue" value={v?.unitsPerUsd} className="size-5 accent-forest" />
          <span className="font-semibold">
            نعم، الرقم <bdi dir="ltr">{v?.unitsPerUsd}</bdi> صحيح
          </span>
        </label>
      ) : null}

      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending} className="w-full sm:w-auto">
          {pending ? "جارٍ الحفظ…" : "حفظ السعر"}
        </Button>
      </div>
    </form>
  );
}
