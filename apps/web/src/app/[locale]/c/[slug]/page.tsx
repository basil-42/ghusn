import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { ProductListing, parseSort } from "@/components/store/product-listing";
import type { Locale } from "@/i18n/routing";
import { alternates } from "@/lib/site";
import { getStoreCategory, listStoreProducts } from "@/lib/storefront";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const category = await getStoreCategory(locale as Locale, slug);
  return category ? { title: category.name, alternates: alternates(locale, `/c/${slug}`) } : {};
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { locale: l, slug } = await params;
  const locale = l as Locale;
  setRequestLocale(locale);
  const category = await getStoreCategory(locale, slug);
  if (!category) notFound();
  const sort = parseSort((await searchParams).sort);
  const t = await getTranslations("category");
  const products = await listStoreProducts(locale, { categorySlug: slug, sort });
  return (
    <ProductListing title={category.name} pathname={`/c/${slug}`} sort={sort} products={products} empty={t("empty")} />
  );
}
