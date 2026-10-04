import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { StoreProductCard, StoreSort } from "@/lib/storefront";
import { ProductCard } from "./product-card";

export const SORTS: { value: StoreSort; key: "sortNewest" | "sortPriceAsc" | "sortPriceDesc" }[] = [
  { value: "newest", key: "sortNewest" },
  { value: "price-asc", key: "sortPriceAsc" },
  { value: "price-desc", key: "sortPriceDesc" },
];

export const parseSort = (s: unknown): StoreSort => SORTS.find((x) => x.value === s)?.value ?? "newest";

/** قائمة منتجات بترتيب (القسم، المناسبة، نتائج البحث). query تُحفظ مع الترتيب (مثل q للبحث). */
export async function ProductListing({
  title,
  subtitle,
  pathname,
  query = {},
  sort,
  products,
  empty,
}: {
  title: string;
  subtitle?: string | null;
  pathname: string;
  query?: Record<string, string>;
  sort: StoreSort;
  products: StoreProductCard[];
  empty: string;
}) {
  const t = await getTranslations("category");
  return (
    <div className="mx-auto flex max-w-[1240px] flex-col gap-6 px-4 md:px-6 py-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-4xl font-bold">{title}</h1>
          {subtitle ? <p className="max-w-2xl text-muted-foreground">{subtitle}</p> : null}
          <p className="text-muted-foreground">{t("products", { count: products.length })}</p>
        </div>
        {products.length > 1 ? (
          <nav aria-label={t("sort")} className="flex flex-wrap gap-1">
            {SORTS.map((x) => (
              <Link
                key={x.value}
                href={{ pathname, query: x.value === "newest" ? query : { ...query, sort: x.value } }}
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
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:gap-3.5 lg:grid-cols-4 xl:grid-cols-5">
          {products.map((p) => (
            <li key={p.id} className="flex">
              <ProductCard product={p} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl border border-line bg-card p-6 text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}
