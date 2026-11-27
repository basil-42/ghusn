import { Truck } from "lucide-react";
import Image from "next/image";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getReceiptSettings } from "@/lib/settings";
import { socialLink, whatsappLink } from "@/lib/site";
import { getSeasonBanner, listStoreCategories, listStoreOccasions } from "@/lib/storefront";
import { CartLink } from "./cart-link";
import { CompactBar } from "./compact-bar";
import { LanguageSwitch } from "./language-switch";
import { MenuButton, MobileMenu } from "./mobile-menu";
import { PRESS } from "./press";
import { SearchBox } from "./search-box";

// «غصن + الرمز» بالعربي و«GHUSN + الرمز» بالإنجليزي (D-52، brand-identity §7)
const LOGO = {
  ar: { src: "/brand/logo-ar-mark-forest.svg", width: 70 },
  en: { src: "/brand/logo-en-mark-forest.svg", width: 98 },
} as const;

/**
 * الرأس — النموذج ب المعتمد (D-96): أبيض. الصف الأول: الشعار، البحث الواسع في الوسط، «تتبّع طلبك»
 * واللغة والسلة (أيقونات 18–20px بلا دوائر). الصف الثاني: الأقسام، ومناسبة الموسم بالذهبي، و«صمّم هديتك».
 * على الجوال: ☰ والشعار ثم «تتبّع طلبك» والسلة، والبحث بعرض كامل تحتها؛ الأقسام والمناسبات واللغة في
 * القائمة الجانبية (D-158) بدل صف الأقسام. وحين يخرج الرأس من الشاشة يظهر شريط مختصر ثابت (D-157).
 */
export async function StoreHeader() {
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("nav");
  const tf = await getTranslations("footer");
  const [categories, season, occasions, receipt] = await Promise.all([
    listStoreCategories(locale),
    getSeasonBanner(locale),
    listStoreOccasions(locale),
    getReceiptSettings(),
  ]);
  const logo = LOGO[locale];
  const logoProps = { ...logo, alt: locale === "ar" ? "غصن" : "GHUSN" };
  return (
    <>
      <header id="store-header" className="border-b border-line bg-card">
        <div className="mx-auto max-w-[1240px] px-4 md:px-6">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 md:h-[68px] md:flex-nowrap md:py-0">
            <div className="flex shrink-0 items-center gap-1">
              <MenuButton className="-ms-2 md:hidden" />
              <Link href="/" aria-label={t("home")} className="shrink-0">
                <Image src={logo.src} alt={logoProps.alt} width={logo.width} height={36} priority />
              </Link>
            </div>
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
                className={`flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold hover:bg-muted ${PRESS}`}
              >
                <Truck aria-hidden className="size-[18px]" strokeWidth={1.8} />
                <span className="hidden sm:inline">{t("track")}</span>
              </Link>
              {/* اللغة على الجوال في القائمة (D-158) */}
              <span className="hidden md:block">
                <Suspense fallback={<span className="block size-11" />}>
                  <LanguageSwitch />
                </Suspense>
              </span>
              <CartLink />
            </div>
          </div>
          <nav
            aria-label={t("categories")}
            className="-mx-6 hidden overflow-x-auto px-6 md:block [scrollbar-width:none]"
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
      <CompactBar
        headerId="store-header"
        searchId="store-search"
        logo={logoProps}
        labels={{ home: t("home"), search: t("search") }}
      />
      <MobileMenu
        logo={logoProps}
        categories={categories}
        occasions={occasions}
        seasonSlug={season?.slug ?? null}
        whatsapp={whatsappLink(receipt.whatsapp, tf("whatsappText"))}
        instagram={socialLink("instagram", receipt.instagram)}
        tiktok={socialLink("tiktok", receipt.tiktok)}
      />
    </>
  );
}
