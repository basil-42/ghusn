import { ArrowLeft, ArrowRight, Gift, Truck, Wallet } from "lucide-react";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { HeroCarousel } from "@/components/store/hero-carousel";
import { ProductCard } from "@/components/store/product-card";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { listStoreBanners } from "@/lib/banners";
import { getSeasonBanner, listStoreCategories, listStoreOccasions, listStoreProducts } from "@/lib/storefront";

export const dynamic = "force-dynamic";

const grid = "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:gap-3.5 lg:grid-cols-4 xl:grid-cols-5";

/**
 * الرئيسية — النموذج ب المعتمد (D-96): بانر رئيسي وبجانبه بطاقتان (مناسبة الموسم، صمّم هديتك)، شريط
 * المزايا، الأقسام ثم المناسبات دوائر في صف، وصل حديثاً بخمسة منتجات في الصف، ثم منتجات المناسبة.
 */
export default async function StoreHome({ params }: { params: Promise<{ locale: string }> }) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  const t = await getTranslations("home");
  const [categories, latest, occasions, season, banners] = await Promise.all([
    listStoreCategories(locale),
    listStoreProducts(locale, { take: 10 }),
    listStoreOccasions(locale),
    getSeasonBanner(locale),
    listStoreBanners(locale),
  ]);
  // بطاقة المناسبة: مناسبة الموسم إن كانت مفعّلة، وإلا أول مناسبة فيها منتجات
  const featured = season ?? occasions[0] ?? null;
  const featuredProducts = featured ? await listStoreProducts(locale, { occasionSlug: featured.slug, take: 5 }) : [];
  const Arrow = locale === "ar" ? ArrowLeft : ArrowRight;
  const trust = [
    { icon: Truck, title: t("trustDelivery"), text: t("trustDeliveryText") },
    { icon: Wallet, title: t("trustPayment"), text: t("trustPaymentText") },
    { icon: Gift, title: t("trustWrap"), text: t("trustWrapText") },
  ];

  return (
    <div className="mx-auto flex max-w-[1240px] flex-col gap-10 px-4 md:px-6 pb-4 pt-5">
      <section className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        {banners.length ? (
          <div>
            <h1 className="sr-only">{t("tagline")}</h1>
            <HeroCarousel
              banners={banners}
              locale={locale}
              labels={{
                region: t("bannersLabel"),
                prev: t("bannerPrev"),
                next: t("bannerNext"),
                slide: t("bannerSlide", { n: "{n}", total: "{total}" }),
              }}
            />
          </div>
        ) : (
          // بلا بانر مفعّل (D-101): بانر الهوية
          <div className="grid overflow-hidden rounded-[14px] bg-forest text-ivory md:grid-cols-2">
            <div className="flex flex-col justify-center gap-3 p-6 md:p-9">
              <h1 className="font-display text-3xl font-bold leading-tight md:text-[42px]">{t("tagline")}</h1>
              <p className="text-[15px] leading-relaxed text-ivory/85">{t("intro")}</p>
              <Link
                href="/products"
                className="mt-1 inline-flex min-h-[46px] self-start items-center rounded-[10px] bg-ivory px-6 text-sm font-bold text-forest hover:bg-sand"
              >
                {t("shop")}
              </Link>
            </div>
            <div
              aria-hidden
              className="relative order-first min-h-48 bg-sage/25 bg-[url('/brand/pattern-sage.svg')] bg-[length:240px] md:order-none md:min-h-[340px]"
            />
          </div>
        )}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-1 lg:grid-rows-2">
          {featured ? (
            <Link
              href={`/occasion/${featured.slug}`}
              className={`relative isolate flex min-h-32 flex-col justify-end gap-0.5 overflow-hidden rounded-[14px] p-5 ${featured.coverUrl ? "bg-forest text-ivory" : "bg-sand text-forest"}`}
            >
              {featured.coverUrl ? (
                <>
                  <Image
                    src={featured.coverUrl}
                    alt=""
                    fill
                    sizes="(min-width: 1024px) 400px, 50vw"
                    className="-z-20 object-cover"
                    unoptimized
                  />
                  {/* الصورة كاملة وتدرج من الأسفل للنص (D-101) */}
                  <span
                    aria-hidden
                    className="absolute inset-0 -z-10 bg-linear-to-t from-forest/85 to-forest/10 to-70%"
                  />
                </>
              ) : null}
              <span className="relative text-[13px]">{season ? t("season") : t("occasionTile")}</span>
              <b className="relative font-display text-lg">{featured.name}</b>
              <span className="relative flex items-center gap-1 text-[13px]">
                {t("shopSeason")} <Arrow aria-hidden className="size-3.5" />
              </span>
            </Link>
          ) : null}
          <Link
            href="/gift"
            className={`flex min-h-32 flex-col justify-end gap-0.5 rounded-[14px] border border-line bg-card p-5 ${featured ? "" : "col-span-2 lg:col-span-1"}`}
          >
            <span className="text-[13px] text-muted-foreground">{t("giftTile")}</span>
            <b className="font-display text-lg">{t("giftTileTitle")}</b>
            <span className="flex items-center gap-1 text-[13px]">
              {t("giftTileText")} <Arrow aria-hidden className="size-3.5" />
            </span>
          </Link>
        </div>
      </section>

      <section aria-label={t("trustLabel")} className="-mt-4">
        <ul className="grid gap-3 rounded-xl border border-line bg-card px-4 py-3.5 sm:grid-cols-3">
          {trust.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex items-center gap-2">
              <Icon aria-hidden className="size-[18px] shrink-0 text-gold" strokeWidth={1.8} />
              <span className="min-w-0 text-[13px] font-semibold leading-tight">
                {title}
                <small className="block text-xs font-normal text-muted-foreground">{text}</small>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <CircleRow title={t("categories")} items={categories.map((c) => ({ ...c, href: `/c/${c.slug}` }))} />
      <CircleRow title={t("occasions")} items={occasions.map((o) => ({ ...o, href: `/occasion/${o.slug}` }))} />

      <ProductRow
        title={t("latest")}
        href={latest.length ? "/products" : undefined}
        more={t("viewAll")}
        products={latest}
        empty={t("empty")}
        Arrow={Arrow}
      />

      {featured && featuredProducts.length ? (
        <ProductRow
          title={featured.name}
          href={`/occasion/${featured.slug}`}
          more={t("viewAll")}
          products={featuredProducts}
          empty=""
          Arrow={Arrow}
        />
      ) : null}
    </div>
  );
}

function ProductRow({
  title,
  href,
  more,
  products,
  empty,
  Arrow,
}: {
  title: string;
  href?: string;
  more: string;
  products: Awaited<ReturnType<typeof listStoreProducts>>;
  empty: string;
  Arrow: typeof ArrowLeft;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[22px] font-bold">{title}</h2>
        {href ? (
          <Link
            href={href}
            className="flex min-h-11 items-center gap-1 text-[13px] font-semibold text-warning hover:underline"
          >
            {more} <Arrow aria-hidden className="size-3.5" />
          </Link>
        ) : null}
      </div>
      {products.length ? (
        <ul className={grid}>
          {products.map((p) => (
            <li key={p.id} className="flex">
              <ProductCard product={p} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-line bg-card p-6 text-muted-foreground">{empty}</p>
      )}
    </section>
  );
}

/** صف دوائر (الأقسام، المناسبات): 8 في الصف على الكمبيوتر، ويُسحب أفقياً على الجوال. */
function CircleRow({
  title,
  items,
}: {
  title: string;
  items: { slug: string; name: string; imageUrl: string | null; href: string }[];
}) {
  if (!items.length) return null;
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-[22px] font-bold">{title}</h2>
      <ul className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:-mx-6 md:px-6 lg:mx-0 lg:grid lg:grid-cols-8 lg:px-0">
        {items.map((item) => (
          <li key={item.slug} className="w-[76px] shrink-0 lg:w-auto">
            <Link
              href={item.href}
              className="group flex flex-col items-center gap-2 text-center text-[13px] font-semibold"
            >
              <span className="relative size-[68px] overflow-hidden rounded-full border border-line bg-card lg:size-[84px]">
                {item.imageUrl ? (
                  <Image
                    src={item.imageUrl}
                    alt=""
                    fill
                    sizes="84px"
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                    unoptimized
                  />
                ) : (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <Image src="/brand/leaves-sage.svg" alt="" width={30} height={30} className="opacity-50" />
                  </span>
                )}
              </span>
              {item.name}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
