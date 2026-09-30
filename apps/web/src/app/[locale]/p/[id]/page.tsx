import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Gallery } from "@/components/store/gallery";
import { VariantPicker } from "@/components/store/variant-picker";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getStoreProduct } from "@/lib/storefront";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ locale: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, id } = await params;
  const p = await getStoreProduct(locale as Locale, id);
  if (!p) return {};
  return {
    title: p.name,
    description: p.description?.slice(0, 160) ?? undefined,
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

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
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
