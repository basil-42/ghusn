import { Truck } from "lucide-react";
import Image from "next/image";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getSeasonBanner, listStoreCategories } from "@/lib/storefront";
import { CartLink } from "./cart-link";
import { LanguageSwitch } from "./language-switch";
import { SearchBox } from "./search-box";

// «غصن + الرمز» بالعربي و«GHUSN + الرمز» بالإنجليزي (D-52، brand-identity §7)
const LOGO = {
  ar: { src: "/brand/logo-ar-mark-forest.svg", width: 70 },
  en: { src: "/brand/logo-en-mark-forest.svg", width: 98 },
} as const;

/**
 * الرأس — النموذج ب المعتمد (D-96): أبيض. الصف الأول: الشعار، البحث الواسع في الوسط، «تتبّع طلبك»
 * واللغة والسلة (أيقونات 18–20px بلا دوائر). الصف الثاني: الأقسام، ومناسبة الموسم بالذهبي، و«صمّم هديتك».
 * على الجوال: البحث بعرض كامل تحت الشعار، والأقسام تُسحب أفقياً.
 */
export async function StoreHeader() {
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("nav");
  const [categories, season] = await Promise.all([listStoreCategories(locale), getSeasonBanner(locale)]);
  const logo = LOGO[locale];
  return (
    <header className="border-b border-line bg-card">
      <div className="mx-auto max-w-[1240px] px-4 md:px-6">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 md:h-[68px] md:flex-nowrap md:py-0">
          <Link href="/" aria-label={t("home")} className="shrink-0">
            <Image src={logo.src} alt={locale === "ar" ? "غصن" : "GHUSN"} width={logo.width} height={36} priority />
          </Link>
          <SearchBox
            id="store-search"
            locale={locale}
            label={t("search")}
            placeholder={t("searchPlaceholder")}
            className="order-3 basis-full md:order-none md:mx-auto md:max-w-xl md:flex-1 md:basis-auto"
          />
          <div className="ms-auto flex shrink-0 items-center gap-0.5 md:ms-0">
            <Link
              href="/track"
              className="flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold hover:bg-muted"
            >
              <Truck aria-hidden className="size-[18px]" strokeWidth={1.8} />
              <span className="hidden sm:inline">{t("track")}</span>
            </Link>
            <Suspense fallback={<span className="size-11" />}>
              <LanguageSwitch />
            </Suspense>
            <CartLink />
          </div>
        </div>
        <nav
          aria-label={t("categories")}
          className="-mx-4 overflow-x-auto px-4 md:-mx-6 md:px-6 [scrollbar-width:none]"
        >
          <ul className="flex h-11 items-center gap-1 text-sm font-medium">
            {categories.map((c) => (
              <li key={c.slug} className="shrink-0">
                <Link
                  href={`/c/${c.slug}`}
                  className="block whitespace-nowrap rounded-lg px-3 leading-[44px] hover:bg-muted"
                >
                  {c.name}
                </Link>
              </li>
            ))}
            {season ? (
              <li className="shrink-0">
                <Link
                  href={`/occasion/${season.slug}`}
                  className="block whitespace-nowrap rounded-lg px-3 font-semibold leading-[44px] text-warning hover:bg-muted"
                >
                  {season.name}
                </Link>
              </li>
            ) : null}
            <li className="shrink-0">
              <Link href="/gift" className="block whitespace-nowrap rounded-lg px-3 leading-[44px] hover:bg-muted">
                {t("giftBuilder")}
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}
