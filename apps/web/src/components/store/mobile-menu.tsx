"use client";

import { Menu, Truck, X } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Suspense, useEffect, useRef, useSyncExternalStore, type TouchEvent } from "react";
import { Link } from "@/i18n/navigation";
import { LanguageSwitch } from "./language-switch";
import { PRESS, PRESS_ROW } from "./press";
import { SocialLinks } from "./social-links";

/*
 * قائمة الجوال (D-158): زر ☰ في الرأس وفي الشريط المختصر يفتح لوحة جانبية واحدة (<dialog> — يحبس
 * المؤشر داخلها ويُغلق بـ Esc ويجعل الصفحة خلفها غير قابلة للضغط). الحالة مشتركة بين الزرين.
 */
let open = false;
const listeners = new Set<() => void>();
function setOpen(v: boolean) {
  if (open === v) return;
  open = v;
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
const useMenuOpen = () =>
  useSyncExternalStore(
    subscribe,
    () => open,
    () => false,
  );

export function MenuButton({ className = "" }: { className?: string }) {
  const t = useTranslations("nav");
  const isOpen = useMenuOpen();
  return (
    <button
      type="button"
      aria-label={t("menu")}
      aria-haspopup="dialog"
      aria-expanded={isOpen}
      onClick={() => setOpen(true)}
      className={`flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-muted ${PRESS} ${className}`}
    >
      <Menu aria-hidden className="size-[22px]" strokeWidth={1.8} />
    </button>
  );
}

type Item = { slug: string; name: string; imageUrl?: string | null };

/** ظهور عناصر القائمة واحداً بعد الآخر عند كل فتح (الحركة تبدأ حين يظهر الـ dialog، D-158) */
const RISE = "motion-safe:animate-[menu-rise_300ms_ease-out_both]";
const rise = (i: number) => ({ animationDelay: `${Math.min(i, 10) * 25}ms` });

/** مدة انزلاق اللوحة (فتحاً وإغلاقاً) — تطابق duration-[260ms] في الـ dialog */
const CLOSE_MS = 260;

export function MobileMenu({
  logo,
  categories,
  occasions,
  seasonSlug,
  whatsapp,
  instagram,
  tiktok,
}: {
  logo: { src: string; width: number; alt: string };
  categories: Item[];
  occasions: Item[];
  /** مناسبة الموسم: تظهر بالذهبي أول المناسبات (كما في رأس الحاسوب) */
  seasonSlug: string | null;
  whatsapp: string | null;
  instagram: string | null;
  tiktok: string | null;
}) {
  const t = useTranslations();
  const isOpen = useMenuOpen();
  const ref = useRef<HTMLDialogElement>(null);
  const touchX = useRef<number | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (isOpen && !d.open) {
      delete d.dataset.closing;
      d.showModal();
      // المتصفح يضع المؤشر على أول رابط (الشعار) فيظهر حوله إطار أزرق؛ نضعه على القائمة نفسها بلا إطار —
      // ومن يتنقّل بلوحة المفاتيح يرى إطار التركيز من أول Tab
      d.querySelector<HTMLElement>("[data-menu-start]")?.focus({ preventScroll: true });
      document.documentElement.style.overflow = "hidden";
      return;
    }
    if (!isOpen && d.open) {
      // إغلاق ناعم: اللوحة تنزلق خارجاً والخلفية تتلاشى، ثم يُغلق الـ dialog
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      d.dataset.closing = "";
      const timer = window.setTimeout(() => d.close(), reduce ? 0 : CLOSE_MS);
      return () => window.clearTimeout(timer);
    }
  }, [isOpen]);

  const close = () => setOpen(false);
  const rtl = () => document.documentElement.dir === "rtl";
  const onTouchEnd = (e: TouchEvent) => {
    const x0 = touchX.current;
    touchX.current = null;
    const x1 = e.changedTouches[0]?.clientX;
    if (x0 === null || x1 === undefined) return;
    // السحب نحو جهة البداية (حافة اللوحة) يغلقها
    const dx = x1 - x0;
    if (rtl() ? dx > 60 : dx < -60) close();
  };

  const link = `flex min-h-11 items-center gap-3 px-4 text-[15px] outline-none hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sage ${PRESS_ROW}`;
  const sorted = seasonSlug
    ? [...occasions].sort((a, b) => Number(b.slug === seasonSlug) - Number(a.slug === seasonSlug))
    : occasions;

  return (
    <dialog
      ref={ref}
      aria-label={t("nav.menu")}
      onClose={(e) => {
        delete e.currentTarget.dataset.closing;
        document.documentElement.style.overflow = "";
        setOpen(false);
      }}
      onCancel={(e) => {
        // Esc: نفس الإغلاق الناعم بدل الإغلاق الفوري
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        // الضغط على الخلفية (خارج اللوحة) يغلقها؛ أي رابط داخلها يغلقها أيضاً
        if (e.target === e.currentTarget || (e.target as HTMLElement).closest("a")) close();
      }}
      onTouchStart={(e) => {
        touchX.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={onTouchEnd}
      className="fixed inset-y-0 start-0 end-auto m-0 h-dvh max-h-none w-[84%] max-w-sm bg-card p-0 text-foreground shadow-xl transition-transform duration-[260ms] ease-[cubic-bezier(.32,.72,0,1)] backdrop:bg-forest/45 backdrop:transition-opacity backdrop:duration-[260ms] motion-reduce:transition-none motion-reduce:backdrop:transition-none ltr:starting:open:-translate-x-full rtl:starting:open:translate-x-full starting:open:backdrop:opacity-0 ltr:data-closing:-translate-x-full rtl:data-closing:translate-x-full data-closing:backdrop:opacity-0 md:hidden"
    >
      <div className="flex h-full flex-col pb-[env(safe-area-inset-bottom)]">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4 pt-[env(safe-area-inset-top)]">
          <Link
            href="/"
            aria-label={t("nav.home")}
            className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-sage"
          >
            <Image src={logo.src} alt={logo.alt} width={Math.round(logo.width * 0.85)} height={31} />
          </Link>
          <button
            type="button"
            aria-label={t("nav.close")}
            onClick={close}
            className={`-me-2 flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-muted ${PRESS}`}
          >
            <X aria-hidden className="size-5" strokeWidth={1.8} />
          </button>
        </div>

        <nav
          aria-label={t("nav.categories")}
          data-menu-start
          tabIndex={-1}
          className="flex-1 overflow-y-auto overscroll-contain py-2 outline-none"
        >
          <p className="px-4 pt-2 pb-1 text-xs font-semibold text-muted-foreground">{t("nav.categories")}</p>
          <ul>
            {categories.map((c, i) => (
              <li key={c.slug} className={RISE} style={rise(i)}>
                <Link href={`/c/${c.slug}`} className={link}>
                  <span className="relative size-8 shrink-0 overflow-hidden rounded-full bg-muted">
                    {c.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- مصغّرة WebP جاهزة من /media
                      <img src={c.imageUrl} alt="" loading="lazy" className="size-full object-cover" />
                    ) : null}
                  </span>
                  {c.name}
                </Link>
              </li>
            ))}
            <li className={RISE} style={rise(categories.length)}>
              <Link href="/products" className={`${link} text-sm text-muted-foreground`}>
                {t("home.allProducts")}
              </Link>
            </li>
          </ul>

          {sorted.length ? (
            <>
              <p className="mt-2 border-t border-line px-4 pt-4 pb-1 text-xs font-semibold text-muted-foreground">
                {t("footer.occasions")}
              </p>
              <ul>
                {sorted.map((o, i) => (
                  <li key={o.slug} className={RISE} style={rise(categories.length + 1 + i)}>
                    <Link
                      href={`/occasion/${o.slug}`}
                      className={`${link} ${o.slug === seasonSlug ? "font-semibold text-warning" : ""}`}
                    >
                      {o.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          <ul className="mt-2 border-t border-line pt-2">
            <li className={RISE} style={rise(categories.length + 1 + sorted.length)}>
              <Link href="/gift" className={`${link} font-semibold`}>
                {t("nav.giftBuilder")}
              </Link>
            </li>
            <li className={RISE} style={rise(categories.length + 2 + sorted.length)}>
              <Link href="/about" className={link}>
                {t("footer.about")}
              </Link>
            </li>
          </ul>
        </nav>

        <div className="flex shrink-0 items-center gap-1 border-t border-line px-2 py-1">
          <Link
            href="/track"
            className={`flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-semibold hover:bg-muted ${PRESS}`}
          >
            <Truck aria-hidden className="size-[18px]" strokeWidth={1.8} />
            {t("nav.track")}
          </Link>
          <SocialLinks
            hrefs={{ instagram, tiktok, whatsapp }}
            labels={{ instagram: t("footer.instagram"), tiktok: t("footer.tiktok"), whatsapp: t("footer.whatsapp") }}
            className="gap-0"
            itemClassName={`rounded-lg hover:bg-muted ${PRESS}`}
          />
          <span className="ms-auto">
            <Suspense fallback={<span className="block size-11" />}>
              <LanguageSwitch />
            </Suspense>
          </span>
        </div>
      </div>
    </dialog>
  );
}
