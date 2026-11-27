import type { Metadata } from "next";
import { ArrowLeft, ArrowRight, Clock, MapPin, Phone } from "lucide-react";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AboutArt } from "@/components/store/about-art";
import { SocialLinks } from "@/components/store/social-links";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getMessageSettings, getReceiptSettings } from "@/lib/settings";
import { alternates, socialLink, whatsappLink } from "@/lib/site";
import { listStoreCategories } from "@/lib/storefront";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "about" });
  return { title: t("title"), description: t("description"), alternates: alternates(locale, "/about") };
}

/**
 * «عن غصن» بتصميم تحريري (D-161، يعدّل D-160): افتتاحية مقسومة (عنوان كبير + لوحة هدايا)، شريط العبارتين
 * المتحرك، القصة باقتباس، «عالم غصن» بطاقات الأقسام تُسحب أفقياً، رحلة الهدية على الأخضر، «زورونا» مع خريطة
 * Google مضمّنة (إن ضُبط كود التضمين، تُحمَّل عند الوصول إليها)، وخاتمة بدعوة للتسوّق والحسابات.
 */
export default async function AboutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const [categories, receipt, messages] = await Promise.all([
    listStoreCategories(locale as Locale),
    getReceiptSettings(),
    getMessageSettings(),
  ]);
  const whatsapp = whatsappLink(receipt.whatsapp, t("footer.whatsappText"));
  const hours = locale === "en" ? messages.hoursEn || messages.hoursAr : messages.hoursAr;
  const Arrow = locale === "ar" ? ArrowLeft : ArrowRight;
  const label = "text-[13px] font-semibold tracking-wide text-muted-foreground";
  const h2 = "font-display text-[32px] leading-tight font-bold text-forest md:text-[42px]";
  const btn =
    "inline-flex min-h-12 items-center gap-2 rounded-full px-6 text-[15px] font-semibold transition-[background-color,color,scale] duration-150 motion-safe:active:scale-[.97]";
  const phrases = [t("home.secondary"), t("home.tagline")];
  const steps = [1, 2, 3] as const;

  return (
    <div className="bg-background text-foreground">
      {/* الافتتاحية */}
      <section className="mx-auto grid max-w-[1240px] md:min-h-[520px] md:grid-cols-[1.05fr_.95fr]">
        <div className="flex flex-col justify-center gap-5 px-5 py-8 md:gap-6 md:px-12 md:py-16">
          <span className="flex items-center gap-2.5 text-[13px] font-semibold tracking-wide text-gold">
            <span aria-hidden className="h-px w-7 bg-gold" />
            {t("about.kicker")}
          </span>
          <h1 className="font-display text-[44px] leading-[1.08] font-bold text-balance text-forest md:text-[72px]">
            {t("home.tagline")}
          </h1>
          <p className="max-w-[34ch] text-base leading-loose text-foreground/85 md:text-lg">{t("about.heroLine")}</p>
          <div className="flex flex-wrap gap-3">
            <Link href="/products" className={`${btn} bg-forest text-ivory hover:bg-forest/90`}>
              {t("about.shop")} <Arrow aria-hidden className="size-4" />
            </Link>
            <Link href="/gift" className={`${btn} border border-forest text-forest hover:bg-forest hover:text-ivory`}>
              {t("about.giftCta")}
            </Link>
          </div>
        </div>
        <div className="relative order-first aspect-[1/0.85] overflow-hidden md:order-none md:aspect-auto">
          <AboutArt className="absolute inset-0 size-full" />
        </div>
      </section>

      {/* الشريط المتحرك */}
      <div aria-hidden className="overflow-hidden bg-forest py-5 whitespace-nowrap text-ivory">
        <div className="about-marquee inline-flex gap-11 font-display text-[22px] motion-safe:animate-[about-marquee_38s_linear_infinite] md:text-[30px]">
          {Array.from({ length: 8 }, (_, i) => (
            <span key={i} className="inline-flex items-center gap-11">
              {phrases[i % 2]}
              <span className="inline-block h-3.5 w-2.5 rounded-[0_70%_0_70%] bg-gold" />
            </span>
          ))}
        </div>
      </div>

      {/* القصة */}
      <section className="mx-auto grid max-w-[1240px] gap-5 px-5 py-14 md:grid-cols-[.8fr_1.2fr] md:gap-14 md:px-12 md:py-24">
        <div>
          <span className={label}>{t("about.storyTitle")}</span>
          <p className="mt-2.5 font-display text-[30px] leading-snug text-forest md:text-[42px]">
            {t("about.storyLead")}
          </p>
        </div>
        <div className="flex max-w-[60ch] flex-col gap-5 text-[17px] leading-loose text-foreground/85">
          <p>{t("about.story")}</p>
          <blockquote className="border-s-[3px] border-gold ps-5 font-display text-[22px] leading-relaxed text-forest">
            «{t("about.storyQuote")}»
          </blockquote>
        </div>
      </section>

      {/* عالم غصن */}
      {categories.length ? (
        <section className="pb-14 md:pb-24">
          <div className="mx-auto flex max-w-[1240px] items-end justify-between gap-4 px-5 pb-5 md:px-12">
            <div>
              <span className={label}>{t("about.worldLabel")}</span>
              <h2 className={`${h2} mt-1.5`}>{t("about.worldTitle")}</h2>
            </div>
            <Link
              href="/products"
              className="flex min-h-11 shrink-0 items-center gap-1 text-sm font-semibold text-forest transition-colors hover:text-gold"
            >
              {t("about.allProducts")} <Arrow aria-hidden className="size-4" />
            </Link>
          </div>
          <ul className="mx-auto flex max-w-[1240px] snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-2 [scrollbar-width:none] md:gap-5 md:px-12">
            {categories.map((c) => (
              <li key={c.slug} className="w-[200px] shrink-0 snap-start md:w-[250px]">
                <Link href={`/c/${c.slug}`} className="group flex flex-col gap-2.5">
                  <span className="relative block aspect-[4/5] overflow-hidden rounded-2xl bg-sand/40 transition-transform duration-300 motion-safe:group-hover:-translate-y-1">
                    {c.imageUrl ? (
                      <Image src={c.imageUrl} alt="" fill sizes="250px" className="object-cover" unoptimized />
                    ) : null}
                  </span>
                  <b className="text-[17px] text-forest">{c.name}</b>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* رحلة الهدية */}
      <section className="bg-forest text-ivory">
        <div className="mx-auto grid max-w-[1240px] gap-6 px-5 py-14 md:grid-cols-[.8fr_1.2fr] md:gap-14 md:px-12 md:py-24">
          <div>
            <span className="text-[13px] font-semibold tracking-wide text-sand">{t("about.journeyLabel")}</span>
            <h2 className="mt-1.5 font-display text-[32px] leading-tight font-bold md:text-[42px]">
              {t("about.journeyTitle")}
            </h2>
            <p className="mt-3.5 max-w-[34ch] leading-loose text-ivory/75">{t("about.journeyIntro")}</p>
          </div>
          <ol className="flex flex-col">
            {steps.map((n) => (
              <li
                key={n}
                className="grid grid-cols-[56px_1fr] gap-4 border-t border-ivory/15 py-6 last:border-b md:grid-cols-[84px_1fr] md:gap-5"
              >
                <span aria-hidden className="font-display text-[42px] leading-none text-gold md:text-[56px]">
                  0{n}
                </span>
                <div>
                  <h3 className="mt-1 mb-1.5 text-xl font-semibold">{t(`about.step${n}Title`)}</h3>
                  <p className="leading-loose text-ivory/75">{t(`about.step${n}`)}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* زورونا */}
      {receipt.address ? (
        <section className="mx-auto max-w-[1240px] px-5 pt-14 md:px-12 md:pt-24">
          <div
            className={`grid overflow-hidden rounded-[22px] border border-line bg-card ${receipt.mapsEmbedUrl ? "md:grid-cols-[1.1fr_.9fr]" : ""}`}
          >
            <div className="flex flex-col gap-5 p-6 md:p-11">
              <div>
                <span className={label}>{t("about.visitTitle")}</span>
                <h2 className={`${h2} mt-1.5`}>{t("about.visitLead")}</h2>
              </div>
              <dl className="grid gap-4 sm:grid-cols-2">
                <div className="flex items-start gap-3">
                  <MapPin aria-hidden className="mt-1 size-5 shrink-0 text-gold" strokeWidth={1.8} />
                  <div>
                    <dt className="text-xs text-muted-foreground">{t("about.address")}</dt>
                    <dd className="font-medium">{receipt.address}</dd>
                  </div>
                </div>
                {hours ? (
                  <div className="flex items-start gap-3">
                    <Clock aria-hidden className="mt-1 size-5 shrink-0 text-gold" strokeWidth={1.8} />
                    <div>
                      <dt className="text-xs text-muted-foreground">{t("about.hours")}</dt>
                      <dd className="font-medium">{hours}</dd>
                    </div>
                  </div>
                ) : null}
                {receipt.phone ? (
                  <div className="flex items-start gap-3">
                    <Phone aria-hidden className="mt-1 size-5 shrink-0 text-gold" strokeWidth={1.8} />
                    <div>
                      <dt className="text-xs text-muted-foreground">{t("about.phone")}</dt>
                      <dd dir="ltr" className="text-start font-medium tabular-nums">
                        {receipt.phone}
                      </dd>
                    </div>
                  </div>
                ) : null}
              </dl>
              <div className="flex flex-wrap gap-3">
                {receipt.mapsUrl ? (
                  <a
                    href={receipt.mapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className={`${btn} bg-forest text-ivory hover:bg-forest/90`}
                  >
                    <MapPin aria-hidden className="size-4" strokeWidth={1.8} /> {t("about.map")}
                  </a>
                ) : null}
                {whatsapp ? (
                  <a
                    href={whatsapp}
                    target="_blank"
                    rel="noreferrer"
                    className={`${btn} border border-forest text-forest hover:bg-forest hover:text-ivory`}
                  >
                    {t("about.whatsapp")}
                  </a>
                ) : null}
              </div>
            </div>
            {receipt.mapsEmbedUrl ? (
              <iframe
                src={receipt.mapsEmbedUrl}
                title={t("about.mapTitle")}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="h-[280px] w-full border-0 md:h-full md:min-h-[360px]"
              />
            ) : null}
          </div>
        </section>
      ) : null}

      {/* الخاتمة */}
      <section className="mx-auto max-w-[1240px] px-5 py-14 md:px-12 md:py-24">
        <div className="relative flex flex-wrap items-center justify-between gap-7 overflow-hidden rounded-[26px] bg-sage px-6 py-9 text-ivory md:px-12 md:py-16">
          <svg
            aria-hidden
            viewBox="0 0 100 130"
            className="absolute -end-8 -bottom-12 w-32 opacity-15 md:-end-10 md:-bottom-16 md:w-64 md:opacity-20"
          >
            <path d="M50 5C80 30 85 80 50 125 15 80 20 30 50 5z" className="fill-ivory" />
          </svg>
          <div className="relative">
            <h2 className="max-w-[16ch] font-display text-[32px] leading-tight font-bold md:text-[50px]">
              {t("about.closeTitle")}
            </h2>
            <SocialLinks
              hrefs={{
                instagram: socialLink("instagram", receipt.instagram),
                tiktok: socialLink("tiktok", receipt.tiktok),
                whatsapp,
              }}
              labels={{ instagram: t("footer.instagram"), tiktok: t("footer.tiktok"), whatsapp: t("footer.whatsapp") }}
              className="mt-4"
              itemClassName="border border-ivory/45 text-ivory transition-colors hover:bg-ivory hover:text-sage"
            />
          </div>
          <Link href="/products" className={`${btn} relative bg-ivory text-forest hover:bg-white`}>
            {t("about.shop")} <Arrow aria-hidden className="size-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
