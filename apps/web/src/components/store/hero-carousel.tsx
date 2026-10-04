"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import type { StoreBanner } from "@/lib/banners";

const INTERVAL_MS = 6000;

type Connection = { saveData?: boolean; effectiveType?: string };

/**
 * بانرات الرئيسية المتبدلة (D-101). الأداء على شبكات السودان:
 * - صورة البانر الأول فقط تُحمَّل مع الصفحة (أولوية عالية)؛ البقية بعد اكتمال تحميل الصفحة.
 * - وضع توفير البيانات أو اتصال 2G: لا تبديل تلقائي ولا تحميل مسبق (البانر يُحمَّل عند فتحه يدوياً).
 * - «تقليل الحركة» في الجهاز: بلا تبديل تلقائي. التبديل يتوقف في الخلفية وعند المرور أو التركيز.
 * - الجوال يأخذ صورة الجوال بمقاس 800px.
 */
export function HeroCarousel({
  banners,
  locale,
  labels,
}: {
  banners: StoreBanner[];
  locale: string;
  labels: { region: string; prev: string; next: string; slide: string };
}) {
  const [index, setIndex] = useState(0);
  const [loadRest, setLoadRest] = useState(false);
  const [autoplay, setAutoplay] = useState(false);
  const [paused, setPaused] = useState(false);
  const [hidden, setHidden] = useState(false);
  const touchX = useRef<number | null>(null);
  const count = banners.length;
  const rtl = locale === "ar";

  useEffect(() => {
    const c = (navigator as Navigator & { connection?: Connection }).connection;
    const lite = !!c?.saveData || /(^|-)2g$/.test(c?.effectiveType ?? "");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (lite) return;
    const start = () => {
      setLoadRest(true);
      setAutoplay(!reduce);
    };
    if (document.readyState === "complete") {
      start();
      return;
    }
    window.addEventListener("load", start, { once: true });
    return () => window.removeEventListener("load", start);
  }, []);

  useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    if (count < 2 || !autoplay || paused || hidden) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % count), INTERVAL_MS);
    return () => clearInterval(timer);
  }, [count, autoplay, paused, hidden]);

  const go = (n: number) => setIndex(((n % count) + count) % count);
  const Prev = rtl ? ChevronRight : ChevronLeft;
  const Next = rtl ? ChevronLeft : ChevronRight;

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label={labels.region}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onTouchStart={(e) => {
        touchX.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        const x0 = touchX.current;
        touchX.current = null;
        const x1 = e.changedTouches[0]?.clientX;
        if (x0 === null || x1 === undefined || count < 2) return;
        const dx = x1 - x0;
        // السحب باتجاه القراءة يعرض التالي
        if (Math.abs(dx) > 40) go(index + (dx > 0 === rtl ? 1 : -1));
      }}
      className="relative isolate h-[440px] overflow-hidden rounded-[14px] bg-forest text-ivory md:h-[360px]"
    >
      {banners.map((b, i) => {
        const active = i === index;
        const showImage = i === 0 || loadRest || active;
        return (
          <div
            key={b.id}
            role="group"
            aria-roledescription="slide"
            aria-label={labels.slide.replace("{n}", String(i + 1)).replace("{total}", String(count))}
            aria-hidden={!active}
            inert={!active}
            className={`absolute inset-0 flex items-end transition-opacity duration-700 motion-reduce:transition-none ${active ? "opacity-100" : "opacity-0"}`}
          >
            {showImage ? (
              <picture>
                <source media="(max-width: 767px)" srcSet={b.mobileSrc} />
                <img
                  src={b.desktopSrc}
                  alt=""
                  fetchPriority={i === 0 ? "high" : "low"}
                  loading={i === 0 ? "eager" : "lazy"}
                  decoding="async"
                  className="absolute inset-0 -z-20 size-full object-cover"
                />
              </picture>
            ) : null}
            {/* تدرج من جهة النص: يجعل الكلام مقروءاً فوق أي صورة */}
            <span
              aria-hidden
              className="absolute inset-0 -z-10 bg-linear-to-t from-forest/95 via-forest/70 via-40% to-transparent to-75% md:bg-linear-to-l md:from-forest/90 md:via-forest/70 md:to-70% ltr:md:bg-linear-to-r"
            />
            <div className="flex w-full flex-col items-start gap-2.5 px-5 pt-6 pb-12 md:max-w-[56%] md:px-9 md:pb-12">
              {b.badge ? (
                <span className="rounded-full border border-ivory/30 bg-ivory/15 px-2.5 py-0.5 text-xs font-semibold">
                  {b.badge}
                </span>
              ) : null}
              <h2 className="font-display text-3xl leading-tight font-bold text-balance md:text-[40px]">{b.title}</h2>
              {b.text ? <p className="text-[15px] leading-relaxed text-ivory/85">{b.text}</p> : null}
              <Link
                href={b.href}
                tabIndex={active ? undefined : -1}
                className="mt-1 inline-flex min-h-11 items-center rounded-[10px] bg-ivory px-6 text-sm font-bold text-forest after:absolute after:inset-0 hover:bg-sand"
              >
                {b.cta}
              </Link>
            </div>
          </div>
        );
      })}

      {count > 1 ? (
        <>
          <div className="absolute start-5 bottom-4 z-10 flex gap-1.5 md:start-9">
            {banners.map((b, i) => (
              <button
                key={b.id}
                type="button"
                aria-label={labels.slide.replace("{n}", String(i + 1)).replace("{total}", String(count))}
                aria-current={i === index}
                onClick={() => go(i)}
                className="group/dot flex h-6 items-center px-0.5"
              >
                <span
                  className={`block h-2 rounded-full transition-all ${i === index ? "w-6 bg-ivory" : "w-2 bg-ivory/45 group-hover/dot:bg-ivory/70"}`}
                />
              </button>
            ))}
          </div>
          <div className="absolute end-3.5 bottom-3 z-10 hidden gap-1.5 md:flex">
            <button
              type="button"
              aria-label={labels.prev}
              onClick={() => go(index - 1)}
              className="flex size-9 items-center justify-center rounded-full bg-card/85 text-forest hover:bg-card"
            >
              <Prev aria-hidden className="size-4" />
            </button>
            <button
              type="button"
              aria-label={labels.next}
              onClick={() => go(index + 1)}
              className="flex size-9 items-center justify-center rounded-full bg-card/85 text-forest hover:bg-card"
            >
              <Next aria-hidden className="size-4" />
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
