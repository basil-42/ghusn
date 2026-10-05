"use client";

import { ChevronLeft, ChevronRight, Expand, X } from "lucide-react";
import Image from "next/image";
import { useLocale } from "next-intl";
import { useEffect, useRef, useState, type TouchEvent } from "react";

export type GalleryImage = { full: string; medium: string; thumb: string; width: number; height: number };

export interface GalleryLabels {
  empty: string;
  zoom: string;
  close: string;
  prev: string;
  next: string;
  /** «صورة {n} من {total}» */
  image: string;
}

/** السحب أفقياً: باتجاه القراءة يعرض التالي. */
function useSwipe(onStep: (delta: number) => void, rtl: boolean) {
  const x = useRef<number | null>(null);
  return {
    onTouchStart: (e: TouchEvent) => {
      x.current = e.touches[0]?.clientX ?? null;
    },
    onTouchEnd: (e: TouchEvent) => {
      const x0 = x.current;
      x.current = null;
      const x1 = e.changedTouches[0]?.clientX;
      if (x0 === null || x1 === undefined) return;
      const dx = x1 - x0;
      if (Math.abs(dx) > 40) onStep(dx > 0 === rtl ? 1 : -1);
    },
  };
}

/**
 * صور المنتج (D-103): الصورة الكبيرة والمصغّرة عمودياً بجانبها على الكمبيوتر، ونقاط وسحب على الجوال.
 * الضغط على الصورة يفتح عارضاً بملء الشاشة (dialog أصلي: Esc للإغلاق، والتركيز يبقى داخله) بأسهم وسحب.
 */
export function Gallery({ images, alt, labels }: { images: GalleryImage[]; alt: string; labels: GalleryLabels }) {
  const rtl = useLocale() === "ar";
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const count = images.length;
  const go = (n: number) => setActive(((n % count) + count) % count);
  const swipe = useSwipe((d) => go(active + d), rtl);
  const many = count > 1;

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
    // الصفحة خلف العارض لا تتحرك
    document.documentElement.style.overflow = open ? "hidden" : "";
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, [open]);

  const current = images[active] ?? images[0];
  if (!current) {
    return (
      <div className="flex aspect-square items-center justify-center rounded-2xl bg-muted">
        <span className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
          <Image src="/brand/mark-sage.svg" alt="" width={72} height={72} className="opacity-40" />
          {labels.empty}
        </span>
      </div>
    );
  }
  const counter = (i: number) => labels.image.replace("{n}", String(i + 1)).replace("{total}", String(count));
  const Prev = rtl ? ChevronRight : ChevronLeft;
  const Next = rtl ? ChevronLeft : ChevronRight;
  const roundBtn =
    "flex size-11 items-center justify-center rounded-full bg-ivory/15 text-ivory hover:bg-ivory/25 focus-visible:outline-2 focus-visible:outline-ivory";

  return (
    <div className="flex min-w-0 flex-col gap-2.5 md:flex-row md:items-start md:gap-3">
      {many ? (
        <ul className="hidden shrink-0 flex-col gap-2.5 md:flex md:max-h-[560px] md:overflow-y-auto">
          {images.map((img, i) => (
            <li key={img.thumb}>
              <button
                type="button"
                onClick={() => setActive(i)}
                aria-label={counter(i)}
                aria-current={i === active}
                className={`relative block size-[72px] overflow-hidden rounded-[10px] border-2 bg-muted ${
                  i === active ? "border-forest" : "border-transparent opacity-80 hover:opacity-100"
                }`}
              >
                <Image src={img.thumb} alt="" fill sizes="72px" className="object-cover" unoptimized />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`${labels.zoom}: ${alt}`}
          {...(many ? swipe : {})}
          className="group relative block aspect-square w-full cursor-zoom-in overflow-hidden rounded-2xl bg-muted"
        >
          {/* الجوال يأخذ 800px أياً كانت كثافة الشاشة (نصف حجم 1200 تقريباً) — العارض بملء الشاشة يبقى بالكبيرة (D-105) */}
          <picture>
            <source media="(max-width: 767px)" srcSet={current.medium} />
            <img
              src={current.full}
              alt={alt}
              width={current.width}
              height={current.height}
              fetchPriority="high"
              decoding="async"
              className="absolute inset-0 size-full object-cover"
            />
          </picture>
          <span className="absolute end-3 bottom-3 flex items-center gap-1.5 rounded-full bg-card/90 px-3 py-1.5 text-xs font-semibold text-forest shadow-sm">
            <Expand aria-hidden className="size-3.5" />
            {labels.zoom}
          </span>
        </button>
        {many ? (
          <div className="flex justify-center gap-1 md:hidden">
            {images.map((img, i) => (
              <button
                key={img.thumb}
                type="button"
                onClick={() => setActive(i)}
                aria-label={counter(i)}
                aria-current={i === active}
                className="flex h-6 items-center px-0.5"
              >
                <span
                  className={`block h-1.5 rounded-full transition-all ${i === active ? "w-5 bg-forest" : "w-1.5 bg-line"}`}
                />
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <dialog
        ref={dialog}
        aria-label={alt}
        onClose={() => setOpen(false)}
        onKeyDown={(e) => {
          if (!many) return;
          if (e.key === "ArrowLeft") go(active + (rtl ? 1 : -1));
          if (e.key === "ArrowRight") go(active + (rtl ? -1 : 1));
        }}
        className="m-0 size-full max-h-none max-w-none bg-forest/95 p-0 text-ivory backdrop:bg-transparent open:flex"
      >
        {open ? (
          <div {...(many ? swipe : {})} className="relative flex size-full items-center justify-center p-4 md:p-16">
            <div className="relative aspect-square w-full max-w-[min(100%,85vh)]">
              <Image
                src={current.full}
                alt={`${alt} — ${counter(active)}`}
                fill
                sizes="(min-width: 768px) 85vh, 100vw"
                className="rounded-xl object-contain"
                unoptimized
              />
            </div>
            <button
              type="button"
              autoFocus
              onClick={() => setOpen(false)}
              aria-label={labels.close}
              className={`absolute end-4 top-4 ${roundBtn}`}
            >
              <X aria-hidden className="size-5" />
            </button>
            {many ? (
              <>
                <button
                  type="button"
                  onClick={() => go(active - 1)}
                  aria-label={labels.prev}
                  className={`absolute start-3 top-1/2 -translate-y-1/2 ${roundBtn}`}
                >
                  <Prev aria-hidden className="size-5" />
                </button>
                <button
                  type="button"
                  onClick={() => go(active + 1)}
                  aria-label={labels.next}
                  className={`absolute end-3 top-1/2 -translate-y-1/2 ${roundBtn}`}
                >
                  <Next aria-hidden className="size-5" />
                </button>
                <p
                  aria-live="polite"
                  dir="ltr"
                  className="absolute inset-x-0 bottom-5 text-center text-sm tabular-nums"
                >
                  {active + 1} / {count}
                </p>
              </>
            ) : null}
          </div>
        ) : null}
      </dialog>
    </div>
  );
}
