import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { ProductCard } from "@/components/store/product-card";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getStoreCategory, listStoreProducts, type StoreSort } from "@/lib/storefront";

export const dynamic = "force-dynamic";

const SORTS: { value: StoreSort; key: "sortNewest" | "sortPriceAsc" | "sortPriceDesc" }[] = [
  { value: "newest", key: "sortNewest" },
  { value: "price-asc", key: "sortPriceAsc" },
  { value: "price-desc", key: "sortPriceDesc" },
];

type Props = {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const category = await getStoreCategory(locale as Locale, slug);
  return category ? { title: category.name } : {};
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { locale: l, slug } = await params;
  const locale = l as Locale;
  setRequestLocale(locale);
  const category = await getStoreCategory(locale, slug);
  if (!category) notFound();
  const { sort: s } = await searchParams;
  const sort = SORTS.find((x) => x.value === s)?.value ?? "newest";
  const t = await getTranslations("category");
  const products = await listStoreProducts(locale, { categorySlug: slug, sort });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl font-bold">{category.name}</h1>
          <p className="text-muted-foreground">{t("products", { count: products.length })}</p>
        </div>
        {products.length > 1 ? (
          <nav aria-label={t("sort")} className="flex flex-wrap gap-1">
            {SORTS.map((x) => (
              <Link
                key={x.value}
                href={{ pathname: `/c/${slug}`, query: x.value === "newest" ? {} : { sort: x.value } }}
                aria-current={x.value === sort ? "page" : undefined}
                className={`flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold ${
                  x.value === sort ? "border-forest bg-forest text-ivory" : "border-line bg-card hover:bg-muted"
                }`}
              >
                {t(x.key)}
              </Link>
            ))}
          </nav>
        ) : null}
      </header>
      {products.length ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {products.map((p) => (
            <li key={p.id} className="flex">
              <ProductCard product={p} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl border border-line bg-card p-6 text-muted-foreground">{t("empty")}</p>
      )}
    </div>
  );
}
