"use client";

import { useActionToast } from "@/components/ui/toast";
import { useActionState, useState } from "react";
import { ImageInput } from "@/components/image-input";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { saveWrapTierAction, type FormState } from "./actions";

type Size = "SMALL" | "MEDIUM" | "LARGE";
const SIZES: { key: Size; label: string }[] = [
  { key: "SMALL", label: "صغير" },
  { key: "MEDIUM", label: "وسط" },
  { key: "LARGE", label: "كبير" },
];
const field = "flex min-w-0 flex-col gap-1";

export interface WrapTierFormValue {
  id: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
  prices: Record<Size, string>;
  isActive: boolean;
  imageUrl: string | null;
  materials: { size: Size; variantId: string; qty: string }[];
}

/**
 * مستوى تغليف (D-165): سعر القطعة لكل حجم (فارغ أو صفر = غير متاح لهذا الحجم)، والوصف والصورة والتفعيل،
 * ووصفة المواد لكل حجم — تُخصم لكل قطعة مغلّفة عند بدء التجهيز.
 */
export function WrapTierForm({
  initial,
  materialOptions,
}: {
  initial: WrapTierFormValue;
  materialOptions: { value: string; label: string }[];
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveWrapTierAction, {});
  useActionToast(state);
  const [rows, setRows] = useState(initial.materials);
  const update = (i: number, patch: Partial<(typeof rows)[number]>) =>
    setRows(rows.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error ? <Alert variant="destructive">{state.error}</Alert> : null}
      <input type="hidden" name="id" value={initial.id} />
      <input type="hidden" name="materials" value={JSON.stringify(rows.filter((r) => r.variantId && r.qty))} readOnly />

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold">سعر تغليف القطعة (ج.س)</legend>
        <div className="grid grid-cols-3 gap-2">
          {SIZES.map((s) => (
            <label key={s.key} className={field}>
              <span className="text-xs text-muted-foreground">{s.label}</span>
              <Input
                name={`price${s.key}`}
                defaultValue={initial.prices[s.key] === "0" ? "" : initial.prices[s.key]}
                inputMode="numeric"
                dir="ltr"
                placeholder="—"
                className="tabular-nums"
              />
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          فارغ = غير متاح لهذا الحجم. حجم القطعة من المنتج، أو من قسمه إن لم يُحدَّد.
        </p>
      </fieldset>

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
        <label className={`${field} sm:col-span-2`}>
          <span className="text-sm font-semibold">الصورة (4:3)</span>
          <span className="flex flex-wrap items-center gap-3">
            <ImageInput
              name="image"
              accept="image/jpeg,image/png,image/webp"
              preview={{ shape: "photo", current: initial.imageUrl }}
              className="text-sm file:me-3 file:min-h-11 file:rounded-xl file:border-0 file:bg-muted file:px-4 file:font-semibold"
            />
            {initial.imageUrl ? (
              <span className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="removeImage" className="size-5 accent-forest" /> حذف الصورة
              </span>
            ) : null}
          </span>
          <span className="text-xs text-muted-foreground">
            صورة حقيقية لقطعة مغلّفة بهذا المستوى. تظهر عند اختيار التغليف وفي «صمّم هديتك».
          </span>
        </label>
        <label className="flex min-h-11 items-center gap-2">
          <input type="checkbox" name="isActive" defaultChecked={initial.isActive} className="size-5 accent-forest" />
          <span className="font-semibold">يظهر في المتجر</span>
        </label>
      </div>

      <fieldset className="flex flex-col gap-3 rounded-xl border border-border p-3">
        <legend className="px-1 text-sm font-semibold">المواد المستهلكة لكل قطعة</legend>
        {SIZES.map((s) => {
          const list = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.size === s.key);
          return (
            <div key={s.key} className="flex flex-col gap-2">
              <p className="text-sm font-semibold">{s.label}</p>
              {list.length === 0 ? <p className="text-xs text-muted-foreground">لا مواد لهذا الحجم.</p> : null}
              {list.map(({ r, i }) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <NativeSelect
                    aria-label={`المادة — ${s.label}`}
                    value={r.variantId}
                    onChange={(e) => update(i, { variantId: e.target.value })}
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
                    onChange={(e) => update(i, { qty: e.target.value })}
                    inputMode="decimal"
                    dir="ltr"
                    className="w-24"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setRows(rows.filter((_, j) => j !== i))}
                  >
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
                onClick={() => setRows([...rows, { size: s.key, variantId: "", qty: "1" }])}
              >
                إضافة مادة — {s.label}
              </Button>
            </div>
          );
        })}
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
