import type { Metadata } from "next";
import { ArrowLeft, ArrowRight, Clock, Gift, MapPin, Phone, Sparkles, Truck } from "lucide-react";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getMessageSettings, getReceiptSettings } from "@/lib/settings";
import { alternates, whatsappLink } from "@/lib/site";
import { listStoreCategories } from "@/lib/storefront";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "about" });
  return { title: t("title"), description: t("description"), alternates: alternates(locale, "/about") };
}

/**
 * «عن غصن» (D-162، يعدّل D-161): عرض واحد (1120px) وإيقاع واحد لكل الأقسام (سطر ذهبي، عنوان، نص).
 * افتتاحية خضراء بنقشة الهوية ورمز غصن الذهبي (الملف المعتمد كما هو)، بطاقة القيم فوق حافتها، القصة مع
 * ثلاث صور من الأقسام، شبكة الأقسام، رحلة الهدية، «زورونا» (خريطة Google إن ضُبطت + التفاصيل)، والخاتمة.
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
  const photos = categories.filter((c) => c.photoUrl).slice(0, 3);

  const wrap = "mx-auto w-full max-w-[1120px] px-5 md:px-10";
  const section = "py-16 md:py-[104px]";
  const eyebrow =
    "inline-flex items-center gap-2.5 text-[13px] font-semibold tracking-wide text-gold before:h-px before:w-6 before:bg-current";
  const h2 = "mt-3 font-display text-[32px] leading-tight font-bold text-balance text-forest md:text-[44px]";
  const btn =
    "inline-flex min-h-[50px] items-center justify-center gap-2 rounded-full px-6 text-[15px] font-semibold transition-[background-color,color,scale] duration-150 motion-safe:active:scale-[.97]";
  const values = [
    { Icon: Sparkles, title: t("about.value1Title"), text: t("about.value1") },
    { Icon: Gift, title: t("about.value2Title"), text: t("about.value2") },
    { Icon: Truck, title: t("about.value3Title"), text: t("about.value3") },
  ];
  const steps = [1, 2, 3] as const;
  const heroBg = "bg-forest bg-[url('/brand/pattern-forest.svg')] bg-[length:340px] bg-center";

  return (
    <div className="bg-background text-forest">
      {/* الافتتاحية */}
      <section
        className={`relative isolate overflow-hidden px-5 pt-[72px] pb-[132px] text-center text-ivory md:pt-28 md:pb-[168px] ${heroBg}`}
      >
        <span
          aria-hidden
          className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,color-mix(in_srgb,var(--color-forest)_55%,transparent),color-mix(in_srgb,var(--color-forest)_92%,transparent)_70%)]"
        />
        <Image
          src="/brand/mark-gold.svg"
          alt=""
          width={64}
          height={82}
          className="mx-auto mb-5 h-auto w-14 md:w-16"
          priority
        />
        <h1 className="mx-auto max-w-[12ch] font-display text-[46px] leading-[1.1] font-bold md:text-[76px]">
          {t("home.tagline")}
        </h1>
        <p className="mx-auto mt-4 max-w-[46ch] text-base leading-loose text-ivory/80 md:text-[19px]">
          {t("about.heroLine")}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/products" className={`${btn} bg-gold text-forest hover:bg-sand`}>
            {t("about.shop")}
          </Link>
          <Link href="/gift" className={`${btn} border border-ivory/50 text-ivory hover:bg-ivory/10`}>
            {t("about.giftCta")}
          </Link>
        </div>
      </section>

      {/* القيم */}
      <div className={`${wrap} relative z-10 -mt-24 md:-mt-[84px]`}>
        <ul className="grid rounded-[20px] bg-card shadow-[0_18px_50px_color-mix(in_srgb,var(--color-forest)_12%,transparent)] md:grid-cols-3">
          {values.map(({ Icon, title, text }) => (
            <li
              key={title}
              className="flex items-start gap-4 border-line p-5 not-first:border-t md:p-8 md:not-first:border-t-0 md:not-first:border-s"
            >
              <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-muted text-gold">
                <Icon aria-hidden className="size-[22px]" strokeWidth={1.7} />
              </span>
              <span>
                <b className="mb-1 block text-[17px]">{title}</b>
                <span className="text-[14.5px] leading-relaxed text-muted-foreground">{text}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* القصة */}
      <section className={section}>
        <div className={`${wrap} grid items-center gap-8 ${photos.length === 3 ? "md:grid-cols-2 md:gap-[72px]" : ""}`}>
          <div className={photos.length === 3 ? "" : "max-w-3xl"}>
            <span className={eyebrow}>{t("about.storyTitle")}</span>
            <h2 className={h2}>{t("about.storyLead")}</h2>
            <p className="mt-4 max-w-[52ch] text-base leading-loose text-foreground/80 md:text-lg">
              {t("about.story")}
            </p>
            <blockquote className="mt-7 rounded-2xl border-s-[3px] border-gold bg-card px-6 py-5 font-display text-[22px] leading-relaxed text-forest">
              «{t("about.storyQuote")}»
            </blockquote>
          </div>
          {photos.length === 3 ? (
            <div aria-hidden className="grid aspect-square grid-cols-[1.25fr_1fr] grid-rows-2 gap-3.5">
              {photos.map((c, i) => (
                <span
                  key={c.slug}
                  className={`relative overflow-hidden rounded-[18px] bg-muted ${i === 0 ? "row-span-2" : ""}`}
                >
                  <Image
                    src={c.photoUrl!}
                    alt=""
                    fill
                    sizes="(min-width: 768px) 320px, 50vw"
                    className="object-cover"
                    unoptimized
                  />
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      {/* الأقسام */}
      {categories.length ? (
        <section className={`${section} bg-card`}>
          <div className={wrap}>
            <div className="mb-8 flex flex-wrap items-end justify-between gap-5 md:mb-10">
              <div>
                <span className={eyebrow}>{t("about.worldLabel")}</span>
                <h2 className={h2}>{t("about.worldTitle")}</h2>
              </div>
              <Link
                href="/products"
                className="flex min-h-11 items-center gap-1.5 text-sm font-semibold text-forest transition-colors hover:text-gold"
              >
                {t("about.allProducts")} <Arrow aria-hidden className="size-4" />
              </Link>
            </div>
            <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-5 max-md:[&>li:last-child:nth-child(odd)]:col-span-2">
              {categories.map((c) => (
                <li key={c.slug}>
                  <Link
                    href={`/c/${c.slug}`}
                    className="group relative isolate block aspect-[4/3] overflow-hidden rounded-[18px] bg-muted text-ivory"
                  >
                    {c.photoUrl ? (
                      <Image
                        src={c.photoUrl}
                        alt=""
                        fill
                        sizes="(min-width: 768px) 360px, 50vw"
                        className="-z-20 object-cover transition-[scale] duration-500 motion-safe:group-hover:scale-105"
                        unoptimized
                      />
                    ) : null}
                    <span
                      aria-hidden
                      className="absolute inset-0 -z-10 bg-linear-to-t from-forest/80 to-transparent to-55%"
                    />
                    <span className="absolute inset-x-3 bottom-2.5 flex items-center justify-between font-semibold md:inset-x-5 md:bottom-4 md:text-lg">
                      {c.name}
                      <span
                        aria-hidden
                        className="hidden size-[34px] items-center justify-center rounded-full bg-ivory/20 md:flex"
                      >
                        <Arrow className="size-4" />
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {/* رحلة الهدية */}
      <section className={section}>
        <div className={wrap}>
          <div className="mb-10 text-center md:mb-12">
            <span className={eyebrow}>{t("about.journeyLabel")}</span>
            <h2 className={h2}>{t("about.journeyTitle")}</h2>
          </div>
          <ol className="relative grid gap-8 md:grid-cols-3 md:gap-6 md:before:absolute md:before:inset-x-[16.6%] md:before:top-7 md:before:h-px md:before:bg-[repeating-linear-gradient(to_left,var(--color-gold)_0_6px,transparent_6px_12px)]">
            {steps.map((n) => (
              <li key={n} className="relative px-3 text-center">
                <span className="relative mx-auto mb-5 flex size-14 items-center justify-center rounded-full bg-forest font-display text-2xl text-sand shadow-[0_0_0_8px_var(--color-background)]">
                  {n}
                </span>
                <b className="mb-2 block text-[19px]">{t(`about.step${n}Title`)}</b>
                <p className="mx-auto max-w-[30ch] leading-loose text-muted-foreground">{t(`about.step${n}`)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* زورونا */}
      {receipt.address ? (
        <section className="pb-16 md:pb-[104px]">
          <div className={wrap}>
            <div
              className={`grid overflow-hidden rounded-[22px] bg-card shadow-[0_1px_0_var(--color-line)] ${receipt.mapsEmbedUrl ? "md:grid-cols-[.9fr_1.1fr]" : ""}`}
            >
              <div className="flex flex-col p-6 md:p-11">
                <span className={eyebrow}>{t("about.visitTitle")}</span>
                <h2 className={h2}>{t("about.visitLead")}</h2>
                <dl className="mt-6 flex flex-col">
                  {[
                    { Icon: MapPin, label: t("about.address"), value: receipt.address, ltr: false },
                    ...(hours ? [{ Icon: Clock, label: t("about.hours"), value: hours, ltr: false }] : []),
                    ...(receipt.phone
                      ? [{ Icon: Phone, label: t("about.phone"), value: receipt.phone, ltr: true }]
                      : []),
                  ].map(({ Icon, label, value, ltr }) => (
                    <div key={label} className="flex items-start gap-3.5 border-t border-line py-4 last:border-b">
                      <Icon aria-hidden className="mt-1 size-5 shrink-0 text-gold" strokeWidth={1.8} />
                      <div>
                        <dt className="text-[12.5px] text-muted-foreground">{label}</dt>
                        <dd dir={ltr ? "ltr" : undefined} className="text-start font-medium tabular-nums">
                          {value}
                        </dd>
                      </div>
                    </div>
                  ))}
                </dl>
                <div className="mt-7 flex flex-wrap gap-3">
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
                  className="order-first h-[260px] w-full border-0 md:order-none md:h-full md:min-h-[420px]"
                />
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {/* الخاتمة: بطاقة فاتحة داخل العرض الموحّد — لا شريط أخضر ثانٍ فوق التذييل، والحسابات في التذييل */}
      <section className="pb-4 md:pb-8">
        <div className={wrap}>
          <div className="rounded-[24px] border border-line bg-card px-6 py-12 text-center md:px-12 md:py-16">
            <Image src="/brand/mark-sage.svg" alt="" width={40} height={51} className="mx-auto mb-4 h-auto w-9" />
            <h2 className="font-display text-[32px] leading-tight font-bold text-balance text-forest md:text-[44px]">
              {t("about.closeTitle")}
            </h2>
            <p className="mx-auto mt-3 max-w-[44ch] leading-loose text-muted-foreground">{t("about.closeText")}</p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Link href="/products" className={`${btn} bg-forest text-ivory hover:bg-forest/90`}>
                {t("about.shop")}
              </Link>
              <Link href="/gift" className={`${btn} border border-forest text-forest hover:bg-forest hover:text-ivory`}>
                {t("about.giftCta")}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
