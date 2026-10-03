import Image from "next/image";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { listStoreCategories } from "@/lib/storefront";
import { CartLink } from "./cart-link";
import { LanguageSwitch } from "./language-switch";
import { SearchBox } from "./search-box";

// رأس الصفحة: «غصن + الرمز» بالعربي و«GHUSN + الرمز» بالإنجليزي (D-52، brand-identity §7) بارتفاع 44px
const LOGO = {
  ar: { src: "/brand/logo-ar-mark-forest.svg", width: 86 },
  en: { src: "/brand/logo-en-mark-forest.svg", width: 120 },
} as const;

/**
 * الرأس (D-95): ثابت أعلى الصفحة بخلفية بيضاء. على الكمبيوتر صف واحد: الشعار، الأقسام، البحث، اللغة
 * والسلة. على الجوال: الشعار والأيقونات، ثم البحث بعرض كامل، ثم الأقسام شرائح تُسحب أفقياً.
 */
export async function StoreHeader() {
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("nav");
  const categories = await listStoreCategories(locale);
  const logo = LOGO[locale];
  const search = { locale, label: t("search"), placeholder: t("searchPlaceholder") };
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85">
      <div className="h-1 bg-sage" aria-hidden />
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5 md:gap-4 lg:gap-6">
        <Link href="/" aria-label={t("home")} className="shrink-0">
          <Image src={logo.src} alt={locale === "ar" ? "غصن" : "GHUSN"} width={logo.width} height={44} priority />
        </Link>
        {categories.length ? (
          <nav aria-label={t("categories")} className="hidden min-w-0 flex-1 lg:block">
            <ul className="flex items-center gap-1 overflow-hidden">
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
        ) : (
          <div className="hidden flex-1 lg:block" />
        )}
        {/* البحث في نفس الصف من عرض التابلت فما فوق؛ على الجوال صفه الخاص */}
        <SearchBox
          id="store-search"
          {...search}
          className="hidden max-w-md flex-1 md:flex lg:w-64 lg:flex-none xl:w-72"
        />
        <div className="ms-auto flex shrink-0 items-center gap-2 md:ms-0">
          <Suspense fallback={<span className="size-11" />}>
            <LanguageSwitch />
          </Suspense>
          <CartLink />
        </div>
      </div>
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 pb-2.5 lg:hidden">
        <SearchBox id="store-search-mobile" {...search} className="md:hidden" />
        {categories.length ? (
          <nav aria-label={t("categories")}>
            <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
              {categories.map((c) => (
                <li key={c.slug} className="shrink-0">
                  <Link
                    href={`/c/${c.slug}`}
                    className="flex min-h-10 items-center rounded-full border border-line bg-background px-4 text-sm font-semibold"
                  >
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
      </div>
    </header>
  );
}
