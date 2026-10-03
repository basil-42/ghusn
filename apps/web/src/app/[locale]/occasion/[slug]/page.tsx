import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { ProductListing, parseSort } from "@/components/store/product-listing";
import type { Locale } from "@/i18n/routing";
import { alternates } from "@/lib/site";
import { getStoreOccasion, listStoreProducts } from "@/lib/storefront";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const occasion = await getStoreOccasion(locale as Locale, slug);
  return occasion
    ? {
        title: occasion.name,
        description: occasion.description ?? undefined,
        alternates: alternates(locale, `/occasion/${slug}`),
        openGraph: occasion.imageUrl ? { images: [occasion.imageUrl] } : undefined,
      }
    : {};
}

/** صفحة مناسبة (D-92): منتجاتها المتاحة بترتيب. */
export default async function OccasionPage({ params, searchParams }: Props) {
  const { locale: l, slug } = await params;
  const locale = l as Locale;
  setRequestLocale(locale);
  const occasion = await getStoreOccasion(locale, slug);
  if (!occasion) notFound();
  const sort = parseSort((await searchParams).sort);
  const t = await getTranslations("occasion");
  const products = await listStoreProducts(locale, { occasionSlug: slug, sort });
  return (
    <ProductListing
      title={occasion.name}
      subtitle={occasion.description}
      pathname={`/occasion/${slug}`}
      sort={sort}
      products={products}
      empty={t("empty")}
    />
  );
}
