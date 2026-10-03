import { dec } from "@ghusn/core";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Gallery } from "@/components/store/gallery";
import { VariantPicker } from "@/components/store/variant-picker";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getStoreProduct } from "@/lib/storefront";
import { alternates, localePath, siteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ locale: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, id } = await params;
  const p = await getStoreProduct(locale as Locale, id);
  if (!p) return {};
  return {
    title: p.name,
    description: p.description?.slice(0, 160) ?? undefined,
    alternates: alternates(locale, `/p/${p.id}`),
    openGraph: p.images[0] ? { images: [p.images[0].full] } : undefined,
  };
}

export default async function ProductPage({ params }: Props) {
  const { locale: l, id } = await params;
  const locale = l as Locale;
  setRequestLocale(locale);
  const product = await getStoreProduct(locale, id);
  if (!product) notFound();
  const t = await getTranslations("product");

  // بيانات المنتج لـ Google (D-93): الاسم والصور والسعر بالجنيه والتوفر — المعروض متاح دائماً
  const prices = product.variants.map((v) => dec(v.priceSdg));
  const low = prices.reduce((a, b) => (b.lt(a) ? b : a));
  const high = prices.reduce((a, b) => (b.gt(a) ? b : a));
  const url = `${siteUrl()}${localePath(locale, `/p/${product.id}`)}`;
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
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
      <script
        type="application/ld+json"
        // نص من قاعدة البيانات: «<» يُهرَّب حتى لا يُغلق الوسم
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <Link href={`/c/${product.category.slug}`} className="text-sm text-muted-foreground hover:underline">
        {t("backTo", { category: product.category.name })}
      </Link>
      <div className="grid gap-8 md:grid-cols-2">
        <Gallery images={product.images} alt={product.name} emptyLabel={t("noImage")} />
        <div className="flex flex-col gap-5">
          <h1 className="font-display text-4xl font-bold">{product.name}</h1>
          <VariantPicker variants={product.variants} />
          {product.description ? (
            <section className="flex flex-col gap-2">
              <h2 className="font-semibold">{t("description")}</h2>
              <p className="whitespace-pre-line leading-relaxed">{product.description}</p>
            </section>
          ) : null}
          <p className="text-sm text-muted-foreground">{t("deliveryNote")}</p>
        </div>
      </div>
    </div>
  );
}
