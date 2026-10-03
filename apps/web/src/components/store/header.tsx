import { Search } from "lucide-react";
import Image from "next/image";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { listStoreCategories } from "@/lib/storefront";
import { CartLink } from "./cart-link";
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
        {/* البحث: نموذج GET عادي — يعمل دون JavaScript */}
        <form
          action={locale === "en" ? "/en/search" : "/search"}
          method="get"
          role="search"
          className="flex min-w-0 max-w-md flex-1 items-center rounded-full border border-line bg-card focus-within:border-forest"
        >
          <label htmlFor="store-search" className="sr-only">
            {t("search")}
          </label>
          <input
            id="store-search"
            name="q"
            type="search"
            maxLength={80}
            placeholder={t("searchPlaceholder")}
            className="min-h-11 w-full min-w-0 bg-transparent ps-4 text-sm outline-none"
          />
          <button type="submit" aria-label={t("search")} className="flex size-11 shrink-0 items-center justify-center">
            <Search aria-hidden className="size-5" />
          </button>
        </form>
        <div className="flex items-center gap-2">
          <Suspense fallback={<span className="size-11" />}>
            <LanguageSwitch />
          </Suspense>
          <CartLink />
        </div>
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
