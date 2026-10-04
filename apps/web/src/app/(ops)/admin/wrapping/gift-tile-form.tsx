"use client";

import { useActionState } from "react";
import { ImageInput } from "@/components/image-input";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { saveGiftTileImageAction, type FormState } from "./actions";

/** صورة بطاقة «صمّم هديتك» في الرئيسية — صورة واحدة ثابتة تختارها المديرة (D-102). */
export function GiftTileForm({ imageUrl }: { imageUrl: string | null }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveGiftTileImageAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      {state.error ? <Alert variant="destructive">{state.error}</Alert> : null}
      {state.success ? <Alert>{state.success}</Alert> : null}
      <span className="flex flex-wrap items-center gap-3">
        <ImageInput
          name="image"
          accept="image/jpeg,image/png,image/webp"
          preview={{ shape: "wide", current: imageUrl }}
          className="text-sm file:me-3 file:min-h-11 file:rounded-xl file:border-0 file:bg-muted file:px-4 file:font-semibold"
        />
        {imageUrl ? (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="remove" className="size-5 accent-forest" /> حذف الصورة
          </label>
        ) : null}
      </span>
      <span className="text-xs text-muted-foreground">
        عريضة 1200×600 (هدية مغلّفة مع بطاقة)، اتركي جهة النص (اليمين) هادئة. منفصلة عن صور الأنماط. بلا صورة تظهر
        البطاقة بالنص فقط.
      </span>
      <Button type="submit" variant="outline" disabled={pending} className="self-start">
        {pending ? "جارٍ الحفظ…" : "حفظ الصورة"}
      </Button>
    </form>
  );
}
