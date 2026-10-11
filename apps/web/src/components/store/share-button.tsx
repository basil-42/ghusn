"use client";

import { Check, Copy, Share2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { track } from "./analytics";

export interface ShareLabels {
  share: string;
  whatsapp: string;
  copy: string;
  copied: string;
  facebook: string;
}

/** يضيف مصدر الزيارة للرابط (يظهر في القياس: كم زيارة جاءت من المشاركة). */
function withRef(url: string, ref: string) {
  const u = new URL(url);
  u.searchParams.set("ref", ref);
  return u.toString();
}

/**
 * زر المشاركة (D-126): على الجوال قائمة المشاركة الأصلية في الهاتف (واتساب، إنستغرام…)، وعلى الكمبيوتر
 * قائمة صغيرة: واتساب، نسخ الرابط، فيسبوك. معاينة الرابط نفسها من بيانات الصفحة (بطاقة غصن).
 */
export function ShareButton({
  url,
  title,
  kind,
  labels,
  variant = "icon",
  className,
}: {
  url: string;
  title: string;
  kind: "product" | "occasion" | "gift";
  labels: ShareLabels;
  variant?: "icon" | "label";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const link = withRef(url, "share");

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  async function onClick() {
    // قائمة الهاتف الأصلية على الأجهزة اللمسية؛ الكمبيوتر يفتح قائمتنا (قائمة ويندوز/ماك أقل فائدة هنا)
    const touch = window.matchMedia("(pointer: coarse)").matches;
    if (touch && typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url: link });
        track("share", { kind, method: "native" });
      } catch {
        // أُلغيت المشاركة — لا شيء
      }
      return;
    }
    setOpen((o) => !o);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      track("share", { kind, method: "copy" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt(labels.copy, link);
    }
  }

  const item =
    "flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-start text-sm font-semibold hover:bg-muted";
  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={onClick}
        aria-label={variant === "icon" ? labels.share : undefined}
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          "flex items-center justify-center gap-2 border border-line bg-card text-forest hover:bg-muted",
          variant === "icon" ? "size-11 rounded-xl" : "min-h-11 rounded-xl px-4 text-sm font-semibold",
        )}
      >
        <Share2 aria-hidden className="size-[1.15rem]" />
        {variant === "label" ? labels.share : null}
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute end-0 top-full z-30 mt-2 flex w-56 flex-col rounded-2xl border border-line bg-card p-1.5 shadow-lg"
        >
          <a
            role="menuitem"
            href={`https://wa.me/?text=${encodeURIComponent(`${title}\n${link}`)}`}
            target="_blank"
            rel="noreferrer"
            onClick={() => {
              track("share", { kind, method: "whatsapp" });
              setOpen(false);
            }}
            className={item}
          >
            {labels.whatsapp}
          </a>
          <button type="button" role="menuitem" onClick={copy} className={item}>
            {copied ? <Check aria-hidden className="size-4 text-sage" /> : <Copy aria-hidden className="size-4" />}
            {copied ? labels.copied : labels.copy}
          </button>
          <a
            role="menuitem"
            href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`}
            target="_blank"
            rel="noreferrer"
            onClick={() => {
              track("share", { kind, method: "facebook" });
              setOpen(false);
            }}
            className={item}
          >
            {labels.facebook}
          </a>
        </div>
      ) : null}
    </div>
  );
}
