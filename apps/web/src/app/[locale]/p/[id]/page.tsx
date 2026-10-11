import { dec } from "@ghusn/core";
import { Gift, MessageCircle, Truck, Wallet } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Gallery } from "@/components/store/gallery";
import { ProductCard } from "@/components/store/product-card";
import { ShareButton } from "@/components/store/share-button";
import { VariantPicker } from "@/components/store/variant-picker";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getReceiptSettings } from "@/lib/settings";
import {
  getProductShareInfo,
  getStoreProduct,
  listRelatedProducts,
  type ProductShareInfo,
  type StoreVariant,
} from "@/lib/storefront";
import { alternates, localePath, siteUrl, whatsappLink } from "@/lib/site";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ locale: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, id } = await params;
  const [p, share] = await Promise.all([
    getStoreProduct(locale as Locale, id),
    getProductShareInfo(locale as Locale, id),
  ]);
  if (!share) return {};
  // بطاقة المعاينة (D-126): الاسم والسعر في العنوان، وصورة غصن 1200×630 — تتجدد بتغيّر الاسم أو السعر أو الصورة
  const title = share.priceLabel ? `${share.name} — ${share.priceLabel}` : share.name;
  const description =
    p?.description?.slice(0, 160) ?? (locale === "en" ? "Gifts made to be remembered" : "هدايا تُصنع لتُذكر");
  const image = {
    url: `/api/v1/og/product/${share.id}?locale=${locale}&v=${share.version}`,
    width: 1200,
    height: 630,
    alt: share.name,
  };
  return {
    title,
    description,
    alternates: alternates(locale, `/p/${share.id}`),
    openGraph: { title, description, images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image.url] },
  };
}

export default async function ProductPage({ params }: Props) {
  const { locale: l, id } = await params;
  const locale = l as Locale;
  setRequestLocale(locale);
  const product = await getStoreProduct(locale, id);
  if (!product) {
    // رابط مشارَك لمنتج نفد: صفحة «نفد حالياً» ومنتجات مشابهة بدل خطأ (D-126)
    const share = await getProductShareInfo(locale, id);
    if (!share) notFound();
    return <Unavailable locale={locale} product={share} />;
  }
  const [t, th, ts, related, receipt] = await Promise.all([
    getTranslations("product"),
    getTranslations("home"),
    getTranslations("share"),
    listRelatedProducts(locale, product),
    getReceiptSettings(),
  ]);

  // بيانات المنتج لـ Google (D-93): الاسم والصور والسعر بالجنيه والتوفر — المعروض متاح دائماً
  const prices = product.variants.map((v) => dec(v.priceSdg));
  const low = prices.reduce((a, b) => (b.lt(a) ? b : a));
  const high = prices.reduce((a, b) => (b.gt(a) ? b : a));
  const url = `${siteUrl()}${localePath(locale, `/p/${product.id}`)}`;
  const whatsapp = whatsappLink(receipt.whatsapp, t("whatsappText", { name: product.name, url }));
  const shareLabels = {
    share: ts("share"),
    whatsapp: ts("whatsapp"),
    copy: ts("copy"),
    copied: ts("copied"),
    facebook: ts("facebook"),
  };

  // جدول المواصفات: خيارات المتغيّرات المتاحة، ثم القسم والمناسبات
  const distinct = (pick: (v: StoreVariant) => string | null) =>
    [...new Set(product.variants.map(pick).filter((x): x is string => !!x))].join(" · ");
  const specs = [
    { label: t("volume"), value: distinct((v) => v.volume) },
    { label: t("size"), value: distinct((v) => v.size) },
    { label: t("color"), value: distinct((v) => v.color) },
    { label: t("category"), value: product.category.name },
    { label: t("occasions"), value: product.occasions.map((o) => o.name).join(" · ") },
  ].filter((row) => row.value);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description ?? undefined,
    image: product.images.map((i) => `${siteUrl()}${i.full}`),
    category: product.category.name,
    brand: { "@type": "Brand", name: locale === "ar" ? "غصن" : "GHUSN" },
    offers:
      prices.length > 1
        ? {
            "@type": "AggregateOffer",
            priceCurrency: "SDG",
            lowPrice: low.toFixed(0),
            highPrice: high.toFixed(0),
            offerCount: prices.length,
            availability: "https://schema.org/InStock",
            url,
          }
        : {
            "@type": "Offer",
            priceCurrency: "SDG",
            price: low.toFixed(0),
            availability: "https://schema.org/InStock",
            url,
          },
  };

  return (
    <div className="mx-auto flex max-w-[1240px] flex-col gap-6 px-4 md:px-6 py-8">
      <script
        type="application/ld+json"
        // نص من قاعدة البيانات: «<» يُهرَّب حتى لا يُغلق الوسم
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <nav aria-label={t("breadcrumb")} className="text-sm text-muted-foreground">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link href="/" className="hover:underline">
              {t("home")}
            </Link>
          </li>
          <li aria-hidden>›</li>
          <li>
            <Link href={`/c/${product.category.slug}`} className="hover:underline">
              {product.category.name}
            </Link>
          </li>
          <li aria-hidden>›</li>
          <li aria-current="page" className="font-semibold text-foreground">
            {product.name}
          </li>
        </ol>
      </nav>
      <div className="grid gap-6 md:grid-cols-[55fr_45fr] md:gap-8 lg:gap-12">
        <Gallery
          images={product.images}
          alt={product.name}
          labels={{
            empty: t("noImage"),
            zoom: t("zoom"),
            close: t("close"),
            prev: t("prevImage"),
            next: t("nextImage"),
            image: t("imageOf", { n: "{n}", total: "{total}" }),
          }}
        />
        <div className="flex min-w-0 flex-col gap-5">
          <div className="flex flex-col gap-1">
            <Link href={`/c/${product.category.slug}`} className="text-sm font-semibold text-gold hover:underline">
              {product.category.name}
            </Link>
            <div className="flex items-start justify-between gap-3">
              <h1 className="font-display text-3xl leading-tight font-bold md:text-4xl">{product.name}</h1>
              <ShareButton url={url} title={product.name} kind="product" labels={shareLabels} className="shrink-0" />
            </div>
          </div>
          <VariantPicker variants={product.variants} />
          {whatsapp ? (
            <a
              href={whatsapp}
              target="_blank"
              rel="noreferrer"
              data-umami-event="whatsapp_inquiry"
              className="flex min-h-12 items-center justify-center gap-2 rounded-xl border-[1.5px] border-forest bg-card px-4 font-semibold text-forest hover:bg-muted"
            >
              <MessageCircle aria-hidden className="size-5" />
              {t("askWhatsapp")}
            </a>
          ) : null}
          {/* رسوم التوصيل داخل سطر التوصيل نفسه — بلا ملاحظة مكررة تحته (D-103) */}
          <ul className="grid gap-3 rounded-2xl border border-line bg-card p-4 text-sm">
            {[
              { icon: Truck, title: th("trustDelivery"), text: t("deliveryLine") },
              { icon: Wallet, title: th("trustPayment"), text: th("trustPaymentText") },
              { icon: Gift, title: th("trustWrap"), text: th("trustWrapText") },
            ].map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex items-start gap-3 leading-relaxed">
                <Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-forest" />
                <span>
                  <span className="font-semibold">{title}</span> · <span className="text-muted-foreground">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <section
        aria-label={t("details")}
        className="grid gap-6 rounded-2xl border border-line bg-card p-5 md:grid-cols-2 md:gap-10 md:p-7"
      >
        {product.description ? (
          <div className="flex flex-col gap-2">
            <h2 className="font-display text-xl font-bold">{t("about")}</h2>
            <p className="leading-loose whitespace-pre-line text-foreground/85">{product.description}</p>
          </div>
        ) : null}
        <div className="flex flex-col gap-2">
          <h2 className="font-display text-xl font-bold">{t("specs")}</h2>
          <dl className="divide-y divide-line text-sm">
            {specs.map((row) => (
              <div key={row.label} className="grid grid-cols-[minmax(6rem,40%)_1fr] gap-3 py-2.5">
                <dt className="text-muted-foreground">{row.label}</dt>
                <dd className="font-semibold">{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {related.length ? (
        <section className="flex flex-col gap-4">
          <h2 className="font-display text-2xl font-bold">{t("related")}</h2>
          {/* الجوال: صف يُسحب أفقياً؛ الكمبيوتر: شبكة بخمسة أعمدة */}
          <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-5 lg:gap-3.5">
            {related.map((p) => (
              <li key={p.id} className="flex w-[46%] shrink-0 snap-start sm:w-auto">
                <ProductCard product={p} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/** المنتج المنشور الذي نفد (D-126): صورته واسمه و«نفد حالياً»، وسؤال على واتساب، ومنتجات مشابهة. */
async function Unavailable({ locale, product }: { locale: Locale; product: ProductShareInfo }) {
  const [t, related, receipt] = await Promise.all([
    getTranslations("product"),
    listRelatedProducts(locale, product, 10),
    getReceiptSettings(),
  ]);
  const url = `${siteUrl()}${localePath(locale, `/p/${product.id}`)}`;
  const whatsapp = whatsappLink(receipt.whatsapp, t("whatsappText", { name: product.name, url }));
  return (
    <div className="mx-auto flex max-w-[1240px] flex-col gap-8 px-4 py-8 md:px-6">
      <section className="grid items-center gap-6 rounded-2xl border border-line bg-card p-5 md:grid-cols-[minmax(0,320px)_1fr] md:p-7">
        {product.imageMedium ? (
          // eslint-disable-next-line @next/next/no-img-element -- صورة جاهزة بمقاس 800
          <img
            src={product.imageMedium}
            alt={product.name}
            className="aspect-square w-full rounded-xl object-cover opacity-80 grayscale-[35%]"
          />
        ) : null}
        <div className="flex flex-col items-start gap-3">
          <Link href={`/c/${product.category.slug}`} className="text-sm font-semibold text-gold hover:underline">
            {product.category.name}
          </Link>
          <h1 className="font-display text-3xl leading-tight font-bold">{product.name}</h1>
          <span className="rounded-full bg-muted px-3 py-1 text-sm font-semibold">{t("unavailableTitle")}</span>
          <p className="max-w-prose leading-relaxed text-muted-foreground">{t("unavailableText")}</p>
          {whatsapp ? (
            <a
              href={whatsapp}
              target="_blank"
              rel="noreferrer"
              data-umami-event="whatsapp_inquiry"
              className="flex min-h-12 items-center justify-center gap-2 rounded-xl border-[1.5px] border-forest bg-card px-4 font-semibold text-forest hover:bg-muted"
            >
              <MessageCircle aria-hidden className="size-5" />
              {t("askWhatsapp")}
            </a>
          ) : null}
        </div>
      </section>
      {related.length ? (
        <section className="flex flex-col gap-4">
          <h2 className="font-display text-2xl font-bold">{t("related")}</h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 lg:gap-3.5">
            {related.map((p) => (
              <li key={p.id} className="flex">
                <ProductCard product={p} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
