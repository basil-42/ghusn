"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

/** «نسخ للمندوب» (D-163): تفاصيل التوصيل في رسالة واحدة تُلصق في واتساب لشركة التوصيل. */
export function CourierCopy({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() =>
        navigator.clipboard
          ?.writeText(text)
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          })
          .catch(() => {})
      }
      className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-card px-4 font-semibold hover:bg-muted"
    >
      {copied ? <Check aria-hidden className="size-4 text-sage" /> : <Copy aria-hidden className="size-4" />}
      {copied ? "تم النسخ" : "نسخ للمندوب"}
    </button>
  );
}
