import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ProductListing, parseSort } from "@/components/store/product-listing";
import type { Locale } from "@/i18n/routing";
import { alternates } from "@/lib/site";
import { listStoreProducts } from "@/lib/storefront";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "home" });
  return { title: t("allProducts"), alternates: alternates(locale, "/products") };
}

/** كل المنتجات المتاحة (من «عرض الكل» في الرئيسية). */
export default async function ProductsPage({ params, searchParams }: Props) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  const sort = parseSort((await searchParams).sort);
  const t = await getTranslations("home");
  const products = await listStoreProducts(locale, { sort });
  return (
    <ProductListing title={t("allProducts")} pathname="/products" sort={sort} products={products} empty={t("empty")} />
  );
}
