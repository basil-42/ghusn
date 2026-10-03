import { Camera, Gift, Truck, Wallet } from "lucide-react";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ProductCard } from "@/components/store/product-card";
import { SectionHeader } from "@/components/store/section-header";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { imageUrl } from "@/lib/product-images";
import { getStoreSettings } from "@/lib/settings";
import { getSeasonBanner, listStoreCategories, listStoreOccasions, listStoreProducts } from "@/lib/storefront";

export const dynamic = "force-dynamic";

/** الرئيسية (D-95): بانر مقسوم (أو بانر الموسم)، شريط المزايا، الأقسام، المناسبات، وصل حديثاً. */
export default async function StoreHome({ params }: { params: Promise<{ locale: string }> }) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  const t = await getTranslations("home");
  const [categories, latest, occasions, season, settings] = await Promise.all([
    listStoreCategories(locale),
    listStoreProducts(locale, { take: 8 }),
    listStoreOccasions(locale),
    getSeasonBanner(locale),
    getStoreSettings(),
  ]);
  const heroImage = season?.imageUrl ?? (settings.heroImageKey ? imageUrl(settings.heroImageKey, "full") : null);
  const trust = [
    { icon: Truck, title: t("trustDelivery"), text: t("trustDeliveryText") },
    { icon: Wallet, title: t("trustPayment"), text: t("trustPaymentText") },
    { icon: Gift, title: t("trustWrap"), text: t("trustWrapText") },
    { icon: Camera, title: t("trustPhoto"), text: t("trustPhotoText") },
  ];

  return (
    <>
      {/* البانر (D-95): خلفية أخضر الغابة بعرض الشاشة، والنص والصورة داخل حاوية الصفحة نفسها —
          نفس محاذاة الرأس وبقية الأقسام في كل المتصفحات (بلا حسابات 100vw) */}
      <section className="bg-forest text-ivory">
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-10 md:grid-cols-2 md:py-14">
          <div className="flex flex-col items-start gap-5">
            {season ? (
              <span className="rounded-full bg-gold/20 px-3 py-1 text-sm font-semibold text-sand">{t("season")}</span>
            ) : (
              <Image src="/brand/mark-cream.svg" alt="" width={48} height={48} />
            )}
            <h1 className="font-display text-4xl font-bold leading-tight sm:text-5xl">
              {season ? season.name : t("tagline")}
            </h1>
            <p className="max-w-md text-lg text-ivory/85">{season?.description ?? t("intro")}</p>
            <Link
              href={season ? `/occasion/${season.slug}` : categories[0] ? `/c/${categories[0].slug}` : "/products"}
              className="inline-flex min-h-12 items-center rounded-xl bg-ivory px-6 font-semibold text-forest hover:bg-sand"
            >
              {season ? t("shopSeason") : t("shop")}
            </Link>
          </div>
          <div className="relative aspect-[4/3] overflow-hidden rounded-3xl bg-sage/30">
            {heroImage ? (
              <Image
                src={heroImage}
                alt=""
                fill
                priority
                sizes="(min-width: 1152px) 560px, (min-width: 768px) 50vw, 100vw"
                className="object-cover"
                unoptimized
              />
            ) : (
              <div aria-hidden className="absolute inset-0 bg-[url('/brand/pattern-sage.svg')] bg-[length:280px]" />
            )}
          </div>
        </div>
      </section>

      {/* المزايا — معلومات صحيحة من النظام (التوصيل، الدفع، التغليف، صورة الهدية) */}
      <section aria-label={t("trustLabel")} className="border-b border-line bg-card">
        <ul className="mx-auto grid max-w-6xl grid-cols-2 gap-4 px-4 py-5 md:grid-cols-4">
          {trust.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-forest">
                <Icon aria-hidden className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{title}</span>
                <span className="block text-xs text-muted-foreground">{text}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <div className="mx-auto flex max-w-6xl flex-col gap-14 px-4 py-12">
        {categories.length ? (
          <section className="flex flex-col gap-5">
            <SectionHeader title={t("categories")} locale={locale} />
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {categories.map((c) => (
                <li key={c.slug}>
                  <Link
                    href={`/c/${c.slug}`}
                    className="group relative flex aspect-[4/3] items-end overflow-hidden rounded-2xl bg-muted"
                  >
                    {c.imageUrl ? (
                      <Image
                        src={c.imageUrl}
                        alt=""
                        fill
                        sizes="(min-width: 1024px) 25vw, 50vw"
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                        unoptimized
                      />
                    ) : (
                      <span className="absolute inset-0 flex items-center justify-center">
                        <Image src="/brand/leaves-sage.svg" alt="" width={48} height={48} className="opacity-50" />
                      </span>
                    )}
                    <span className="relative m-2 rounded-xl bg-card/90 px-3 py-1.5 font-semibold backdrop-blur">
                      {c.name}
                      <span className="ms-2 text-xs font-normal text-muted-foreground tabular-nums">{c.count}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {occasions.length ? (
          <section className="flex flex-col gap-5">
            <SectionHeader title={t("occasions")} locale={locale} />
            <ul className="-mx-4 flex gap-5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
              {occasions.map((o) => (
                <li key={o.slug} className="shrink-0">
                  <Link href={`/occasion/${o.slug}`} className="group flex w-24 flex-col items-center gap-2 sm:w-28">
                    <span className="relative size-24 overflow-hidden rounded-full border-2 border-sand bg-muted sm:size-28">
                      {o.imageUrl ? (
                        <Image
                          src={o.imageUrl}
                          alt=""
                          fill
                          sizes="112px"
                          className="object-cover transition-transform duration-500 group-hover:scale-105"
                          unoptimized
                        />
                      ) : (
                        <span className="absolute inset-0 flex items-center justify-center">
                          <Image src="/brand/leaves-gold.svg" alt="" width={40} height={40} className="opacity-70" />
                        </span>
                      )}
                    </span>
                    <span className="text-center text-sm font-semibold">{o.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="flex flex-col gap-5">
          <SectionHeader
            title={t("latest")}
            href={latest.length ? "/products" : undefined}
            linkLabel={t("viewAll")}
            locale={locale}
          />
          {latest.length ? (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {latest.map((p) => (
                <li key={p.id} className="flex">
                  <ProductCard product={p} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-2xl border border-line bg-card p-6 text-muted-foreground">{t("empty")}</p>
          )}
        </section>
      </div>
    </>
  );
}
