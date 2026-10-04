"use client";

import { useActionState, useState } from "react";
import { ImageInput } from "@/components/image-input";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import type { AdminBanner } from "@/lib/banners";
import { saveBannerAction, type FormState } from "./actions";

const field = "flex min-w-0 flex-col gap-1";
const label = "text-sm font-semibold";
const hint = "text-xs text-muted-foreground";
const fileClass =
  "text-sm file:me-3 file:min-h-11 file:rounded-xl file:border-0 file:bg-muted file:px-4 file:font-semibold";

type LinkType = AdminBanner["linkType"];
type Option = { value: string; label: string };
export interface LinkOptions {
  categories: Option[];
  occasions: Option[];
  products: Option[];
}

const LINK_LABELS: Record<LinkType, string> = {
  PRODUCTS: "كل المنتجات",
  CATEGORY: "قسم",
  OCCASION: "مناسبة",
  PRODUCT: "منتج",
  GIFT: "صمّم هديتك",
};

/** بانر واحد (D-101): الصور، النصوص بالعربي والإنجليزي، الزر ووجهته، الشارة، المدة، والتفعيل. */
export function BannerForm({ initial, links }: { initial: AdminBanner | null; links: LinkOptions }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveBannerAction, {});
  const [linkType, setLinkType] = useState<LinkType>(initial?.linkType ?? "PRODUCTS");
  const targets: Partial<Record<LinkType, Option[]>> = {
    CATEGORY: links.categories,
    OCCASION: links.occasions,
    PRODUCT: links.products,
  };

  return (
    <form action={action} className="flex flex-col gap-3">
      {state.error ? <Alert variant="destructive">{state.error}</Alert> : null}
      {state.success ? <Alert>{state.success}</Alert> : null}
      {initial ? <input type="hidden" name="id" value={initial.id} /> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className={field}>
          <span className={label}>صورة الكمبيوتر{initial ? "" : " *"}</span>
          {initial ? (
            // eslint-disable-next-line @next/next/no-img-element -- معاينة صغيرة
            <img src={initial.imageUrl} alt="" className="h-20 w-36 rounded-lg object-cover" />
          ) : null}
          <ImageInput name="image" required={!initial} accept="image/jpeg,image/png,image/webp" className={fileClass} />
          <span className={hint}>عريضة، 1600×800 أو أكبر. {initial ? "اختاري صورة لاستبدالها." : ""}</span>
        </div>
        <div className={field}>
          <span className={label}>صورة الجوال (اختيارية)</span>
          {initial?.mobileImageUrl ? (
            <span className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- معاينة صغيرة */}
              <img src={initial.mobileImageUrl} alt="" className="h-20 w-16 rounded-lg object-cover" />
              <span className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="removeMobileImage" className="size-5 accent-forest" /> حذفها
              </span>
            </span>
          ) : null}
          <ImageInput name="mobileImage" accept="image/jpeg,image/png,image/webp" className={fileClass} />
          <span className={hint}>طولية 800×1000. بدونها تُستخدم صورة الكمبيوتر.</span>
        </div>

        <label className={field}>
          <span className={label}>العنوان بالعربي</span>
          <Input name="titleAr" defaultValue={initial?.titleAr} required maxLength={60} />
        </label>
        <label className={field}>
          <span className={label}>العنوان بالإنجليزي</span>
          <Input name="titleEn" defaultValue={initial?.titleEn} required maxLength={60} dir="ltr" />
        </label>
        <label className={field}>
          <span className={label}>النص بالعربي (اختياري)</span>
          <Input name="textAr" defaultValue={initial?.textAr} maxLength={160} />
        </label>
        <label className={field}>
          <span className={label}>النص بالإنجليزي (اختياري)</span>
          <Input name="textEn" defaultValue={initial?.textEn} maxLength={160} dir="ltr" />
        </label>
        <label className={field}>
          <span className={label}>نص الزر بالعربي</span>
          <Input name="ctaAr" defaultValue={initial?.ctaAr ?? "تسوّق الآن"} required maxLength={30} />
        </label>
        <label className={field}>
          <span className={label}>نص الزر بالإنجليزي</span>
          <Input name="ctaEn" defaultValue={initial?.ctaEn ?? "Shop now"} required maxLength={30} dir="ltr" />
        </label>

        <label className={field}>
          <span className={label}>الزر يفتح</span>
          <NativeSelect name="linkType" value={linkType} onChange={(e) => setLinkType(e.target.value as LinkType)}>
            {(Object.keys(LINK_LABELS) as LinkType[]).map((k) => (
              <option key={k} value={k}>
                {LINK_LABELS[k]}
              </option>
            ))}
          </NativeSelect>
        </label>
        {/* قائمة لكل نوع، والظاهرة فقط تُرسل (الخادم يقرأ target_<النوع>) */}
        {(["CATEGORY", "OCCASION", "PRODUCT"] as const).map((k) =>
          linkType === k ? (
            <label key={k} className={field}>
              <span className={label}>{LINK_LABELS[k]}</span>
              <NativeSelect
                name={`target_${k}`}
                required
                defaultValue={initial?.linkType === k ? initial.linkTarget : ""}
              >
                <option value="">اختاري…</option>
                {(targets[k] ?? []).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </NativeSelect>
            </label>
          ) : null,
        )}

        <label className={field}>
          <span className={label}>شارة بالعربي (اختيارية)</span>
          <Input name="badgeAr" defaultValue={initial?.badgeAr} maxLength={30} placeholder="مثال: جديد، حتى 21 مارس" />
        </label>
        <label className={field}>
          <span className={label}>شارة بالإنجليزي (اختيارية)</span>
          <Input name="badgeEn" defaultValue={initial?.badgeEn} maxLength={30} dir="ltr" placeholder="e.g. New" />
        </label>
        <label className={field}>
          <span className={label}>يظهر من (اختياري)</span>
          <Input type="date" name="startsOn" defaultValue={initial?.startsOn} dir="ltr" />
        </label>
        <label className={field}>
          <span className={label}>حتى (اختياري)</span>
          <Input type="date" name="endsOn" defaultValue={initial?.endsOn} dir="ltr" />
        </label>
      </div>

      <label className="flex min-h-11 items-center gap-2">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={initial?.isActive ?? true}
          className="size-5 accent-forest"
        />
        <span className="font-semibold">مفعّل</span>
      </label>
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "جارٍ الحفظ…" : initial ? "حفظ" : "إضافة البانر"}
      </Button>
    </form>
  );
}
