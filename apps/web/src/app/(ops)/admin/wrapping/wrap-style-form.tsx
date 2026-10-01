"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { saveWrapStyleAction, type FormState } from "./actions";

const field = "flex min-w-0 flex-col gap-1";

export interface WrapStyleFormValue {
  id: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
  priceSdg: string;
  isActive: boolean;
  materials: { variantId: string; qty: string }[];
}

/** نمط تغليف: الاسم والوصف بالعربي والإنجليزي، سعر الخدمة، التفعيل، ووصفة المواد. */
export function WrapStyleForm({
  initial,
  materialOptions,
}: {
  initial: WrapStyleFormValue;
  materialOptions: { value: string; label: string }[];
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveWrapStyleAction, {});
  const [rows, setRows] = useState(initial.materials);

  return (
    <form action={action} className="flex flex-col gap-3">
      {state.error ? <Alert variant="destructive">{state.error}</Alert> : null}
      {state.success ? <Alert>{state.success}</Alert> : null}
      <input type="hidden" name="id" value={initial.id} />
      <input type="hidden" name="materials" value={JSON.stringify(rows.filter((r) => r.variantId && r.qty))} readOnly />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={field}>
          <span className="text-sm font-semibold">الاسم بالعربي</span>
          <Input name="nameAr" defaultValue={initial.nameAr} required maxLength={40} />
        </label>
        <label className={field}>
          <span className="text-sm font-semibold">الاسم بالإنجليزي</span>
          <Input name="nameEn" defaultValue={initial.nameEn} required maxLength={40} dir="ltr" />
        </label>
        <label className={field}>
          <span className="text-sm font-semibold">الوصف بالعربي</span>
          <Input name="descriptionAr" defaultValue={initial.descriptionAr} maxLength={160} />
        </label>
        <label className={field}>
          <span className="text-sm font-semibold">الوصف بالإنجليزي</span>
          <Input name="descriptionEn" defaultValue={initial.descriptionEn} maxLength={160} dir="ltr" />
        </label>
        <label className={field}>
          <span className="text-sm font-semibold">سعر الخدمة (ج.س)</span>
          <Input
            name="priceSdg"
            defaultValue={initial.priceSdg === "0" ? "" : initial.priceSdg}
            inputMode="numeric"
            dir="ltr"
          />
        </label>
        <label className="flex min-h-11 items-center gap-2 self-end">
          <input type="checkbox" name="isActive" defaultChecked={initial.isActive} className="size-5 accent-forest" />
          <span className="font-semibold">يظهر في المتجر</span>
        </label>
      </div>

      <fieldset className="flex flex-col gap-2 rounded-xl border border-border p-3">
        <legend className="px-1 text-sm font-semibold">المواد المستهلكة لكل هدية</legend>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا مواد بعد — التكلفة تُحسب من المواد المسجلة هنا.</p>
        ) : null}
        {rows.map((r, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <NativeSelect
              aria-label="المادة"
              value={r.variantId}
              onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, variantId: e.target.value } : x)))}
              className="min-w-48 flex-1"
            >
              <option value="">اختاري مادة…</option>
              {materialOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </NativeSelect>
            <Input
              aria-label="الكمية"
              value={r.qty}
              onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))}
              inputMode="decimal"
              dir="ltr"
              className="w-24"
            />
            <Button type="button" variant="outline" size="sm" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
              حذف
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          disabled={materialOptions.length === 0}
          onClick={() => setRows([...rows, { variantId: "", qty: "1" }])}
        >
          إضافة مادة
        </Button>
        {materialOptions.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            سجّلي مواد التغليف أولاً من «المنتجات» بنوع «مادة تغليف» واستلميها في شحنة.
          </p>
        ) : null}
      </fieldset>

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "جارٍ الحفظ…" : "حفظ"}
      </Button>
    </form>
  );
}
