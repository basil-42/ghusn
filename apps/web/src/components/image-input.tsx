"use client";

import { useEffect, useState, type ChangeEvent, type InputHTMLAttributes } from "react";
import { MAX_UPLOAD_BYTES, shrinkImage } from "@/lib/client-image";

/** شكل مكان الصورة في المتجر — المعاينة تقصّها بنفس الشكل (D-102). */
export type PreviewShape = "circle" | "wide" | "photo" | "tall";

const SHAPES: Record<PreviewShape, string> = {
  circle: "size-20 rounded-full",
  wide: "aspect-[2/1] w-40 rounded-lg",
  photo: "aspect-[4/3] w-32 rounded-lg",
  tall: "aspect-[4/5] w-20 rounded-lg",
};

type ImageInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "onChange" | "multiple"> & {
  tooLargeMessage?: string;
  preparingMessage?: string;
  /** معاينة بشكل المكان: الصورة الحالية، ثم المختارة فور اختيارها. */
  preview?: { shape: PreviewShape; current?: string | null };
};

/**
 * حقل صورة واحدة داخل نموذج: يصغّر الصورة في المتصفح ويستبدلها في الحقل قبل الإرسال، ويمنع إرسال صورة
 * أكبر من الحد (وإلا يتجاوز الطلب حد الخادم وتسقط الصفحة بخطأ عام). أثناء التجهيز يمنع المتصفحُ الإرسال.
 */
export function ImageInput({
  tooLargeMessage = "الصورة أكبر من 10 ميغابايت.",
  preparingMessage = "جارٍ تجهيز الصورة…",
  preview,
  ...props
}: ImageInputProps) {
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => () => (picked ? URL.revokeObjectURL(picked) : undefined), [picked]);

  async function onChange(e: ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const file = input.files?.[0];
    setError(null);
    input.setCustomValidity("");
    setPicked(file && preview ? URL.createObjectURL(file) : null);
    if (!file) return;
    input.setCustomValidity(preparingMessage);
    const small = await shrinkImage(file);
    if (input.files?.[0] !== file) return; // اختيرت صورة أخرى أثناء التجهيز
    input.setCustomValidity("");
    if (small.size > MAX_UPLOAD_BYTES) {
      input.value = "";
      setPicked(null);
      setError(tooLargeMessage);
      return;
    }
    if (small !== file) {
      const list = new DataTransfer();
      list.items.add(small);
      input.files = list.files;
    }
  }

  const shown = picked ?? preview?.current ?? null;
  return (
    <>
      {preview ? (
        <span
          className={`relative block shrink-0 overflow-hidden border border-border bg-muted ${SHAPES[preview.shape]}`}
        >
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element -- معاينة محلية (blob) أو صورة صغيرة
            <img src={shown} alt="" className="size-full object-cover" />
          ) : null}
        </span>
      ) : null}
      <input type="file" {...props} onChange={onChange} />
      {error ? (
        <span role="alert" className="text-sm font-semibold text-danger">
          {error}
        </span>
      ) : null}
    </>
  );
}
