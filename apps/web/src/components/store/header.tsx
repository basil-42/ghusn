import Image from "next/image";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { listStoreCategories } from "@/lib/storefront";
import { LanguageSwitch } from "./language-switch";

// رأس الصفحة: «غصن + الرمز» بالعربي و«GHUSN + الرمز» بالإنجليزي (D-52، brand-identity §7) بارتفاع 44px
const LOGO = {
  ar: { src: "/brand/logo-ar-mark-forest.svg", width: 86 },
  en: { src: "/brand/logo-en-mark-forest.svg", width: 120 },
} as const;

export async function StoreHeader() {
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("nav");
  const categories = await listStoreCategories(locale);
  const logo = LOGO[locale];
  return (
    <header className="border-b border-line bg-background">
      <div className="h-1.5 bg-sage" aria-hidden />
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" aria-label={t("home")} className="shrink-0">
          <Image src={logo.src} alt={locale === "ar" ? "غصن" : "GHUSN"} width={logo.width} height={44} priority />
        </Link>
        <Suspense fallback={<span className="size-11" />}>
          <LanguageSwitch />
        </Suspense>
      </div>
      {categories.length ? (
        <nav aria-label={t("categories")} className="mx-auto max-w-6xl px-4 pb-2">
          <ul className="flex gap-1 overflow-x-auto">
            {categories.map((c) => (
              <li key={c.slug} className="shrink-0">
                <Link
                  href={`/c/${c.slug}`}
                  className="flex min-h-11 items-center rounded-full px-3 text-sm font-semibold hover:bg-muted"
                >
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </header>
  );
}
