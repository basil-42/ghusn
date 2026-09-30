import Image from "next/image";
import type { Locale } from "@/i18n/routing";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ProductCard } from "@/components/store/product-card";
import { Link } from "@/i18n/navigation";
import { listStoreCategories, listStoreProducts } from "@/lib/storefront";

export const dynamic = "force-dynamic";

export default async function StoreHome({ params }: { params: Promise<{ locale: string }> }) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  const t = await getTranslations("home");
  const [categories, latest] = await Promise.all([listStoreCategories(locale), listStoreProducts(locale, { take: 8 })]);

  return (
    <>
      {/* البانر الرئيسي: داكن مع أوراق شفافة (brand-identity §7) */}
      <section className="relative overflow-hidden bg-forest text-ivory">
        <div
          aria-hidden
          className="absolute inset-0 bg-[url('/brand/pattern-sage.svg')] bg-[length:320px] opacity-15"
        />
        <div className="relative mx-auto flex max-w-6xl flex-col items-start gap-5 px-4 py-16 sm:py-24">
          <Image src="/brand/mark-cream.svg" alt="" width={56} height={56} />
          <h1 className="font-display text-4xl font-bold sm:text-6xl">{t("tagline")}</h1>
          <p className="max-w-xl text-lg text-ivory/90">{t("intro")}</p>
          <Link
            href={categories[0] ? `/c/${categories[0].slug}` : "/"}
            className="inline-flex min-h-12 items-center rounded-xl bg-ivory px-6 font-semibold text-forest hover:bg-sand"
          >
            {t("shop")}
          </Link>
        </div>
      </section>

      <div className="mx-auto flex max-w-6xl flex-col gap-12 px-4 py-12">
        {categories.length ? (
          <section className="flex flex-col gap-4">
            <h2 className="font-display text-3xl font-bold">{t("categories")}</h2>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {categories.map((c) => (
                <li key={c.slug}>
                  <Link
                    href={`/c/${c.slug}`}
                    className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-card"
                  >
                    <div className="relative aspect-[4/3] bg-muted">
                      {c.imageUrl ? (
                        <Image
                          src={c.imageUrl}
                          alt=""
                          fill
                          sizes="(min-width: 1024px) 20vw, (min-width: 640px) 33vw, 50vw"
                          className="object-cover transition-transform duration-500 group-hover:scale-105"
                          unoptimized
                        />
                      ) : (
                        <div className="flex size-full items-center justify-center">
                          <Image src="/brand/leaves-sage.svg" alt="" width={48} height={48} className="opacity-50" />
                        </div>
                      )}
                    </div>
                    <span className="p-3 font-semibold">{c.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="flex flex-col gap-4">
          <h2 className="font-display text-3xl font-bold">{t("latest")}</h2>
          {latest.length ? (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {latest.map((p) => (
                <li key={p.id} className="flex">
                  <ProductCard product={p} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-2xl border border-line bg-card p-6 text-muted-foreground">{t("empty")}</p>
          )}
        </section>
      </div>
    </>
  );
}
