"use client";

import { Check, Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

/** زر نسخ صغير (رقم الحساب، المبلغ) — مهم على الجوال قبل فتح تطبيق بنكك. */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const t = useTranslations("order");
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() =>
        navigator.clipboard
          ?.writeText(value)
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          })
          .catch(() => {})
      }
      aria-label={`${t("copy")} ${label}`}
      className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg border border-line bg-card px-2.5 text-xs font-semibold hover:bg-muted"
    >
      {copied ? <Check aria-hidden className="size-3.5 text-sage" /> : <Copy aria-hidden className="size-3.5" />}
      {copied ? t("copied") : t("copy")}
    </button>
  );
}
