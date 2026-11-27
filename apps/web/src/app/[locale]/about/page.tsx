import type { Metadata } from "next";
import { Clock, MapPin, Phone } from "lucide-react";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
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
 * «عن غصن» (D-160): العبارة، القصة، ماذا نقدّم (أقسام المتجر الحالية)، كيف نجهّز الهدية، والزيارة والتواصل.
 * العنوان والهاتف ورابط الخرائط من «الضبط» ← الإيصال، والمواعيد من «رسائل الطلبات»؛ قسم «زورونا» يختفي
 * حتى يُكتب العنوان.
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
  const steps = [t("about.step1"), t("about.step2"), t("about.step3")];
  const h2 = "font-display text-2xl font-bold md:text-[28px]";

  return (
    <div className="flex flex-col gap-10 pb-6 md:gap-14">
      <section className="bg-forest bg-[url('/brand/pattern-forest.svg')] bg-[length:260px] px-4 py-12 text-center text-ivory md:py-16">
        <h1 className="sr-only">{t("about.title")}</h1>
        <p className="font-display text-4xl leading-tight font-bold md:text-5xl">{t("home.tagline")}</p>
        <p className="mt-2 text-ivory/85">{t("home.secondary")}</p>
      </section>

      <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 md:gap-14 md:px-6">
        <section className="flex flex-col gap-3">
          <h2 className={h2}>{t("about.storyTitle")}</h2>
          <p className="text-[17px] leading-loose text-foreground/90">{t("about.story")}</p>
        </section>

        {categories.length ? (
          <section className="flex flex-col gap-4">
            <h2 className={h2}>{t("about.offerTitle")}</h2>
            <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
              {categories.map((c) => (
                <li key={c.slug}>
                  <Link
                    href={`/c/${c.slug}`}
                    className="flex flex-col items-center gap-2 rounded-xl border border-line bg-card p-3 text-center text-sm font-semibold transition-colors hover:border-sage active:bg-muted"
                  >
                    <span className="relative size-14 overflow-hidden rounded-full bg-muted">
                      {c.imageUrl ? (
                        <Image src={c.imageUrl} alt="" fill sizes="56px" className="object-cover" unoptimized />
                      ) : null}
                    </span>
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="flex flex-col gap-4">
          <h2 className={h2}>{t("about.howTitle")}</h2>
          <ol className="flex flex-col gap-3">
            {steps.map((s, i) => (
              <li key={s} className="flex items-center gap-3 rounded-xl border border-line bg-card p-4">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-forest text-sm font-bold text-ivory tabular-nums">
                  {i + 1}
                </span>
                {s}
              </li>
            ))}
          </ol>
        </section>

        {receipt.address ? (
          <section className="flex flex-col gap-4">
            <h2 className={h2}>{t("about.visitTitle")}</h2>
            <dl className="flex flex-col gap-3 rounded-xl border border-line bg-card p-4">
              <div className="flex items-start gap-3">
                <MapPin aria-hidden className="mt-1 size-5 shrink-0 text-gold" strokeWidth={1.8} />
                <div>
                  <dt className="text-sm text-muted-foreground">{t("about.address")}</dt>
                  <dd>{receipt.address}</dd>
                </div>
              </div>
              {hours ? (
                <div className="flex items-start gap-3">
                  <Clock aria-hidden className="mt-1 size-5 shrink-0 text-gold" strokeWidth={1.8} />
                  <div>
                    <dt className="text-sm text-muted-foreground">{t("about.hours")}</dt>
                    <dd>{hours}</dd>
                  </div>
                </div>
              ) : null}
              {receipt.phone ? (
                <div className="flex items-start gap-3">
                  <Phone aria-hidden className="mt-1 size-5 shrink-0 text-gold" strokeWidth={1.8} />
                  <div>
                    <dt className="text-sm text-muted-foreground">{t("about.phone")}</dt>
                    <dd dir="ltr" className="text-start tabular-nums">
                      {receipt.phone}
                    </dd>
                  </div>
                </div>
              ) : null}
            </dl>
            {receipt.mapsUrl ? (
              <a
                href={receipt.mapsUrl}
                target="_blank"
                rel="noreferrer"
                className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line bg-card px-4 font-semibold transition-colors hover:border-sage active:bg-muted"
              >
                <MapPin aria-hidden className="size-4" strokeWidth={1.8} /> {t("about.map")}
              </a>
            ) : null}
          </section>
        ) : null}

        <section className="flex flex-col items-center gap-4 rounded-2xl bg-muted px-4 py-8 text-center">
          <h2 className={h2}>{t("about.contactTitle")}</h2>
          {whatsapp ? (
            <a
              href={whatsapp}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-12 w-full max-w-xs items-center justify-center rounded-xl bg-primary px-5 font-bold text-primary-foreground transition-opacity active:opacity-80"
            >
              {t("about.whatsapp")}
            </a>
          ) : null}
          <SocialLinks
            hrefs={{
              instagram: socialLink("instagram", receipt.instagram),
              tiktok: socialLink("tiktok", receipt.tiktok),
              whatsapp: null,
            }}
            labels={{ instagram: t("footer.instagram"), tiktok: t("footer.tiktok"), whatsapp: t("footer.whatsapp") }}
            itemClassName="border border-line bg-card text-forest transition-colors hover:border-sage active:bg-muted"
          />
          <Link
            href="/products"
            className="flex min-h-11 items-center px-3 font-semibold text-forest transition-colors hover:text-gold"
          >
            {t("about.shop")}
          </Link>
        </section>
      </div>
    </div>
  );
}
