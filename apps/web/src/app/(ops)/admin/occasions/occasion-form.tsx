"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveOccasionAction, type FormState } from "./actions";
import { ImageInput } from "@/components/image-input";

const field = "flex min-w-0 flex-col gap-1";
const fileClass =
  "text-sm file:me-3 file:min-h-11 file:rounded-xl file:border-0 file:bg-muted file:px-4 file:font-semibold";

export interface OccasionFormValue {
  id: string | null;
  slug: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
  isActive: boolean;
  sortOrder: number;
  bannerStart: string;
  bannerEnd: string;
  imageUrl: string | null;
  coverUrl: string | null;
}

/** مناسبة: الاسم والوصف، الرابط، الصورة، الترتيب، التفعيل، وفترة بانر الموسم. */
export function OccasionForm({ initial }: { initial: OccasionFormValue }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveOccasionAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      {state.error ? <Alert variant="destructive">{state.error}</Alert> : null}
      {state.success ? <Alert>{state.success}</Alert> : null}
      {initial.id ? <input type="hidden" name="id" value={initial.id} /> : null}
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
          <span className="text-sm font-semibold">وصف قصير بالعربي (للبانر والصفحة)</span>
          <Input name="descriptionAr" defaultValue={initial.descriptionAr} maxLength={200} />
        </label>
        <label className={field}>
          <span className="text-sm font-semibold">وصف قصير بالإنجليزي</span>
          <Input name="descriptionEn" defaultValue={initial.descriptionEn} maxLength={200} dir="ltr" />
        </label>
        <label className={field}>
          <span className="text-sm font-semibold">الرابط</span>
          <Input name="slug" defaultValue={initial.slug} required maxLength={60} dir="ltr" placeholder="mothers-day" />
          <span className="text-xs text-muted-foreground">يظهر في عنوان الصفحة: /occasion/…</span>
        </label>
        <label className={field}>
          <span className="text-sm font-semibold">الترتيب</span>
          <Input name="sortOrder" defaultValue={String(initial.sortOrder)} inputMode="numeric" dir="ltr" />
        </label>
        <label className={field}>
          <span className="text-sm font-semibold">بانر الموسم: من</span>
          <Input type="date" name="bannerStart" defaultValue={initial.bannerStart} dir="ltr" />
        </label>
        <label className={field}>
          <span className="text-sm font-semibold">إلى</span>
          <Input type="date" name="bannerEnd" defaultValue={initial.bannerEnd} dir="ltr" />
        </label>
        <div className={`${field} sm:col-span-2`}>
          <span className="text-sm font-semibold">الأيقونة (دائرية، اختيارية)</span>
          <span className="flex flex-wrap items-center gap-3">
            <ImageInput
              name="image"
              accept="image/jpeg,image/png,image/webp"
              preview={{ shape: "circle", current: initial.imageUrl }}
              className={fileClass}
            />
            {initial.imageUrl ? (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="removeImage" className="size-5 accent-forest" /> حذفها
              </label>
            ) : null}
          </span>
          <span className="text-xs text-muted-foreground">
            صورة مربعة 600×600، الهدية في الوسط وبلا كتابة. تظهر في «تسوّق حسب المناسبة». بدونها تُستخدم صورة أول منتج.
          </span>
        </div>
        <div className={`${field} sm:col-span-2`}>
          <span className="text-sm font-semibold">الغلاف (عريض، اختياري)</span>
          <span className="flex flex-wrap items-center gap-3">
            <ImageInput
              name="cover"
              accept="image/jpeg,image/png,image/webp"
              preview={{ shape: "wide", current: initial.coverUrl }}
              className={fileClass}
            />
            {initial.coverUrl ? (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="removeCover" className="size-5 accent-forest" /> حذفه
              </label>
            ) : null}
          </span>
          <span className="text-xs text-muted-foreground">
            1200×600، اتركي جهة النص (اليمين) هادئة. يظهر في بطاقة «هدايا الموسم» بالرئيسية وأعلى صفحة المناسبة. بدونه
            تظهر البطاقة بلون الهوية.
          </span>
        </div>
        <label className="flex min-h-11 items-center gap-2">
          <input type="checkbox" name="isActive" defaultChecked={initial.isActive} className="size-5 accent-forest" />
          <span className="font-semibold">تظهر في المتجر</span>
        </label>
      </div>
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "جارٍ الحفظ…" : initial.id ? "حفظ" : "إضافة المناسبة"}
      </Button>
    </form>
  );
}
