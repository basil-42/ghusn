import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ProductListing, parseSort } from "@/components/store/product-listing";
import type { Locale } from "@/i18n/routing";
import { listStoreProducts } from "@/lib/storefront";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "search" });
  // نتائج البحث لا تُفهرس
  return { title: t("title"), robots: { index: false, follow: true } };
}

/** البحث في المتجر: يتجاهل الهمزات والتشكيل (نفس بحث الإدارة)، ويشمل الأقسام والمناسبات. */
export default async function SearchPage({ params, searchParams }: Props) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  const sp = await searchParams;
  const q = (typeof sp.q === "string" ? sp.q : "").trim().slice(0, 80);
  const sort = parseSort(sp.sort);
  const t = await getTranslations("search");
  const products = q ? await listStoreProducts(locale, { q, sort }) : [];
  return (
    <ProductListing
      title={q ? t("resultsFor", { q }) : t("title")}
      pathname="/search"
      query={q ? { q } : {}}
      sort={sort}
      products={products}
      empty={q ? t("noResults") : t("prompt")}
    />
  );
}
