"use client";

import { useState, type ChangeEvent, type InputHTMLAttributes } from "react";
import { MAX_UPLOAD_BYTES, shrinkImage } from "@/lib/client-image";

type ImageInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "onChange" | "multiple"> & {
  tooLargeMessage?: string;
  preparingMessage?: string;
};

/**
 * حقل صورة واحدة داخل نموذج: يصغّر الصورة في المتصفح ويستبدلها في الحقل قبل الإرسال، ويمنع إرسال صورة
 * أكبر من الحد (وإلا يتجاوز الطلب حد الخادم وتسقط الصفحة بخطأ عام). أثناء التجهيز يمنع المتصفحُ الإرسال.
 */
export function ImageInput({
  tooLargeMessage = "الصورة أكبر من 10 ميغابايت.",
  preparingMessage = "جارٍ تجهيز الصورة…",
  ...props
}: ImageInputProps) {
  const [error, setError] = useState<string | null>(null);

  async function onChange(e: ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const file = input.files?.[0];
    setError(null);
    input.setCustomValidity("");
    if (!file) return;
    input.setCustomValidity(preparingMessage);
    const small = await shrinkImage(file);
    if (input.files?.[0] !== file) return; // اختيرت صورة أخرى أثناء التجهيز
    input.setCustomValidity("");
    if (small.size > MAX_UPLOAD_BYTES) {
      input.value = "";
      setError(tooLargeMessage);
      return;
    }
    if (small !== file) {
      const list = new DataTransfer();
      list.items.add(small);
      input.files = list.files;
    }
  }

  return (
    <>
      <input type="file" {...props} onChange={onChange} />
      {error ? (
        <span role="alert" className="text-sm font-semibold text-danger">
          {error}
        </span>
      ) : null}
    </>
  );
}
