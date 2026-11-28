"use client";

import { useActionToast } from "@/components/ui/toast";
import { useActionState } from "react";
import { ImageInput } from "@/components/image-input";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { archiveCardDesignAction, saveCardDesignAction, type FormState } from "./actions";

const field = "flex min-w-0 flex-col gap-1";

export interface CardDesignFormValue {
  id: string | null;
  nameAr: string;
  nameEn: string;
  textColor: "FOREST" | "IVORY" | "GOLD";
  isActive: boolean;
  sortOrder: number;
  imageUrl: string | null;
}

/** شكل بطاقة إهداء (D-165): صورة الخلفية 10×15، ولون النص، والترتيب، والتفعيل. */
export function CardDesignForm({ initial }: { initial: CardDesignFormValue }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveCardDesignAction, {});
  const [archived, archive, archiving] = useActionState<FormState, FormData>(archiveCardDesignAction, {});
  useActionToast(state);
  useActionToast(archived);
  const isNew = !initial.id;

  return (
    <div className="flex flex-col gap-3">
      <form action={action} className="flex flex-col gap-3">
        {state.error ? <Alert variant="destructive">{state.error}</Alert> : null}
        <input type="hidden" name="id" value={initial.id ?? ""} />
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
            <span className="text-sm font-semibold">لون نص العميل</span>
            <NativeSelect name="textColor" defaultValue={initial.textColor}>
              <option value="FOREST">أخضر غامق (على خلفية فاتحة)</option>
              <option value="IVORY">عاجي (على خلفية غامقة)</option>
              <option value="GOLD">ذهبي</option>
            </NativeSelect>
          </label>
          <label className={field}>
            <span className="text-sm font-semibold">الترتيب</span>
            <Input name="sortOrder" defaultValue={String(initial.sortOrder)} inputMode="numeric" dir="ltr" />
          </label>
          <label className={`${field} sm:col-span-2`}>
            <span className="text-sm font-semibold">
              صورة البطاقة (10×15 طولية){isNew ? "" : " — اتركيها لإبقاء الحالية"}
            </span>
            <ImageInput
              name="image"
              accept="image/jpeg,image/png,image/webp"
              required={isNew}
              preview={{ shape: "card", current: initial.imageUrl }}
              className="text-sm file:me-3 file:min-h-11 file:rounded-xl file:border-0 file:bg-muted file:px-4 file:font-semibold"
            />
            <span className="text-xs text-muted-foreground">
              800×1200 أو أكبر بنفس النسبة، مع مساحة فارغة في الوسط لرسالة العميل.
            </span>
          </label>
          <label className="flex min-h-11 items-center gap-2">
            <input type="checkbox" name="isActive" defaultChecked={initial.isActive} className="size-5 accent-forest" />
            <span className="font-semibold">يظهر للعملاء</span>
          </label>
        </div>
        <Button type="submit" disabled={pending} className="self-start">
          {pending ? "جارٍ الحفظ…" : isNew ? "إضافة الشكل" : "حفظ"}
        </Button>
      </form>
      {initial.id ? (
        <form
          action={archive}
          onSubmit={(e) => {
            if (!window.confirm(`حذف شكل «${initial.nameAr}»؟ الطلبات السابقة تبقى تُطبع به.`)) e.preventDefault();
          }}
        >
          <input type="hidden" name="id" value={initial.id} />
          <Button type="submit" variant="outline" size="sm" disabled={archiving}>
            حذف الشكل
          </Button>
        </form>
      ) : null}
    </div>
  );
}
