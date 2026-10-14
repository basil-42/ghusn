"use client";

import { useActionState } from "react";
import { Field } from "@/components/form-field";
import { Alert } from "@/components/ui/alert";
import { ImageInput } from "@/components/image-input";
import { Button } from "@/components/ui/button";
import { createCategory, updateCategory, type CategoryState } from "./actions";

export interface CategoryRow {
  id: string;
  nameAr: string;
  nameEn: string;
  isActive: boolean;
  targetMarginPct: string;
  minMarginPct: string;
  productCount: number;
  /** الصورة المرفوعة، أو null (تُستخدم صورة أحدث منتج). */
  imageUrl: string | null;
  /** ما يظهر في المتجر الآن إن لم تُرفع صورة. */
  fallbackUrl: string | null;
}

const fileClass =
  "text-sm file:me-3 file:min-h-11 file:rounded-xl file:border-0 file:bg-muted file:px-4 file:font-semibold";

export function CategoryForm({ category, canEditMargin }: { category: CategoryRow; canEditMargin: boolean }) {
  const [state, action, pending] = useActionState<CategoryState, FormData>(updateCategory, {});
  return (
    <form
      action={action}
      className="grid grid-cols-1 gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2"
    >
      <input type="hidden" name="id" value={category.id} />
      <p className="text-sm text-muted-foreground sm:col-span-2">{category.productCount} منتج</p>
      <Field label="الاسم بالعربي" name="nameAr" id={`ar-${category.id}`} defaultValue={category.nameAr} required />
      <Field
        label="الاسم بالإنجليزي"
        name="nameEn"
        id={`en-${category.id}`}
        dir="ltr"
        defaultValue={category.nameEn}
        required
      />
      {canEditMargin ? (
        <>
          <Field
            label="الهامش المستهدف %"
            name="targetMargin"
            id={`tm-${category.id}`}
            inputMode="decimal"
            dir="ltr"
            defaultValue={category.targetMarginPct}
            required
          />
          <Field
            label="الحد الأدنى للتنبيه %"
            name="minMargin"
            id={`mm-${category.id}`}
            inputMode="decimal"
            dir="ltr"
            defaultValue={category.minMarginPct}
            required
          />
        </>
      ) : null}
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <span className="text-sm font-semibold">صورة القسم في المتجر (دائرية، اختيارية)</span>
        <span className="flex flex-wrap items-center gap-3">
          <ImageInput
            name="image"
            accept="image/jpeg,image/png,image/webp"
            preview={{ shape: "circle", current: category.imageUrl ?? category.fallbackUrl }}
            className={fileClass}
          />
          {category.imageUrl ? (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="removeImage" className="size-5 accent-forest" /> حذفها
            </label>
          ) : null}
        </span>
        <span className="text-xs text-muted-foreground">
          {category.imageUrl
            ? "صورة مرفوعة — تظهر دائماً في «تسوّق حسب القسم»."
            : "مربعة 600×600 والمنتج في الوسط بلا كتابة. بدونها تُستخدم صورة أحدث منتج في القسم (المعروضة الآن)."}
        </span>
      </div>
      <label className="flex min-h-11 items-center gap-3 sm:col-span-2">
        <input type="checkbox" name="isActive" defaultChecked={category.isActive} className="size-5 accent-forest" />
        <span>نشط (يظهر عند إضافة المنتجات)</span>
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "جارٍ الحفظ…" : "حفظ"}
        </Button>
        {state.error ? <span className="text-sm text-destructive">{state.error}</span> : null}
        {state.success ? <span className="text-sm text-muted-foreground">{state.success}</span> : null}
      </div>
    </form>
  );
}

export function NewCategoryForm() {
  const [state, action, pending] = useActionState<CategoryState, FormData>(createCategory, {});
  return (
    <form
      action={action}
      key={state.success}
      className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
    >
      {state.error ? (
        <Alert variant="destructive" className="sm:col-span-3">
          {state.error}
        </Alert>
      ) : null}
      {state.success ? (
        <Alert variant="success" className="sm:col-span-3">
          {state.success}
        </Alert>
      ) : null}
      <Field label="الاسم بالعربي" name="nameAr" id="new-ar" required />
      <Field label="الاسم بالإنجليزي" name="nameEn" id="new-en" dir="ltr" required />
      <Button type="submit" disabled={pending}>
        إضافة قسم
      </Button>
    </form>
  );
}
