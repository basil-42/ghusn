"use client";

import { Menu, MessageCircle, Truck, X } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Suspense, useEffect, useRef, useSyncExternalStore, type TouchEvent } from "react";
import { Link } from "@/i18n/navigation";
import { LanguageSwitch } from "./language-switch";

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
      className={`flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-muted ${className}`}
    >
      <Menu aria-hidden className="size-[22px]" strokeWidth={1.8} />
    </button>
  );
}

type Item = { slug: string; name: string; imageUrl?: string | null };

export function MobileMenu({
  logo,
  categories,
  occasions,
  seasonSlug,
  whatsapp,
}: {
  logo: { src: string; width: number; alt: string };
  categories: Item[];
  occasions: Item[];
  /** مناسبة الموسم: تظهر بالذهبي أول المناسبات (كما في رأس الحاسوب) */
  seasonSlug: string | null;
  whatsapp: string | null;
}) {
  const t = useTranslations();
  const isOpen = useMenuOpen();
  const ref = useRef<HTMLDialogElement>(null);
  const touchX = useRef<number | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (isOpen && !d.open) {
      d.showModal();
      document.documentElement.style.overflow = "hidden";
    } else if (!isOpen && d.open) {
      d.close();
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

  const link = "flex min-h-11 items-center gap-3 px-4 text-[15px] hover:bg-muted";
  const sorted = seasonSlug
    ? [...occasions].sort((a, b) => Number(b.slug === seasonSlug) - Number(a.slug === seasonSlug))
    : occasions;

  return (
    <dialog
      ref={ref}
      aria-label={t("nav.menu")}
      onClose={() => {
        document.documentElement.style.overflow = "";
        setOpen(false);
      }}
      onClick={(e) => {
        // الضغط على الخلفية (خارج اللوحة) يغلقها؛ أي رابط داخلها يغلقها أيضاً
        if (e.target === e.currentTarget || (e.target as HTMLElement).closest("a")) close();
      }}
      onTouchStart={(e) => {
        touchX.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={onTouchEnd}
      className="fixed inset-y-0 start-0 end-auto m-0 h-dvh max-h-none w-[84%] max-w-sm bg-card p-0 text-foreground shadow-xl transition-transform duration-200 backdrop:bg-forest/45 motion-reduce:transition-none ltr:starting:open:-translate-x-full rtl:starting:open:translate-x-full md:hidden"
    >
      <div className="flex h-full flex-col pb-[env(safe-area-inset-bottom)]">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4 pt-[env(safe-area-inset-top)]">
          <Link href="/" aria-label={t("nav.home")}>
            <Image src={logo.src} alt={logo.alt} width={Math.round(logo.width * 0.85)} height={31} />
          </Link>
          <button
            type="button"
            aria-label={t("nav.close")}
            onClick={close}
            className="-me-2 flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-muted"
          >
            <X aria-hidden className="size-5" strokeWidth={1.8} />
          </button>
        </div>

        <nav aria-label={t("nav.categories")} className="flex-1 overflow-y-auto overscroll-contain py-2">
          <p className="px-4 pt-2 pb-1 text-xs font-semibold text-muted-foreground">{t("nav.categories")}</p>
          <ul>
            {categories.map((c) => (
              <li key={c.slug}>
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
            <li>
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
                {sorted.map((o) => (
                  <li key={o.slug}>
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
            <li>
              <Link href="/gift" className={`${link} font-semibold`}>
                {t("nav.giftBuilder")}
              </Link>
            </li>
          </ul>
        </nav>

        <div className="flex shrink-0 items-center gap-1 border-t border-line px-2 py-1">
          <Link
            href="/track"
            className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-semibold hover:bg-muted"
          >
            <Truck aria-hidden className="size-[18px]" strokeWidth={1.8} />
            {t("nav.track")}
          </Link>
          {whatsapp ? (
            <a
              href={whatsapp}
              target="_blank"
              rel="noreferrer"
              aria-label={t("footer.whatsapp")}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-muted"
            >
              <MessageCircle aria-hidden className="size-[18px]" strokeWidth={1.8} />
            </a>
          ) : null}
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
