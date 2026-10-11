import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { ProductListing, parseSort } from "@/components/store/product-listing";
import type { Locale } from "@/i18n/routing";
import { ShareButton } from "@/components/store/share-button";
import { alternates, localePath, siteUrl } from "@/lib/site";
import { getOccasionShareInfo, getStoreOccasion, listStoreProducts } from "@/lib/storefront";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const [occasion, share] = await Promise.all([
    getStoreOccasion(locale as Locale, slug),
    getOccasionShareInfo(locale as Locale, slug),
  ]);
  if (!occasion || !share) return {};
  // بطاقة المعاينة (D-126): الغلاف والاسم بهوية غصن
  const image = {
    url: `/api/v1/og/occasion/${share.slug}?locale=${locale}&v=${share.version}`,
    width: 1200,
    height: 630,
    alt: occasion.name,
  };
  const description = occasion.description ?? undefined;
  return {
    title: occasion.name,
    description,
    alternates: alternates(locale, `/occasion/${slug}`),
    openGraph: { title: occasion.name, description, images: [image] },
    twitter: { card: "summary_large_image", title: occasion.name, description, images: [image.url] },
  };
}

/** صفحة مناسبة (D-92): منتجاتها المتاحة بترتيب. */
export default async function OccasionPage({ params, searchParams }: Props) {
  const { locale: l, slug } = await params;
  const locale = l as Locale;
  setRequestLocale(locale);
  const occasion = await getStoreOccasion(locale, slug);
  if (!occasion) notFound();
  const sort = parseSort((await searchParams).sort);
  const [t, ts] = await Promise.all([getTranslations("occasion"), getTranslations("share")]);
  const products = await listStoreProducts(locale, { occasionSlug: slug, sort });
  return (
    <ProductListing
      cover={occasion.coverUrl}
      title={occasion.name}
      subtitle={occasion.description}
      pathname={`/occasion/${slug}`}
      sort={sort}
      products={products}
      empty={t("empty")}
      action={
        <ShareButton
          url={`${siteUrl()}${localePath(locale, `/occasion/${slug}`)}`}
          title={occasion.name}
          kind="occasion"
          labels={{
            share: ts("share"),
            whatsapp: ts("whatsapp"),
            copy: ts("copy"),
            copied: ts("copied"),
            facebook: ts("facebook"),
          }}
        />
      }
    />
  );
}
