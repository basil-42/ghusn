import type { MetadataRoute } from "next";
import { listStoreCategories, listStoreOccasions, listStoreProducts } from "@/lib/storefront";
import { localePath, siteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

/** خريطة المتجر (D-93): الرئيسية والأقسام والمناسبات والمنتجات المتاحة، بالنسختين وروابط hreflang. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const [categories, occasions, products] = await Promise.all([
    listStoreCategories("ar"),
    listStoreOccasions("ar"),
    listStoreProducts("ar"),
  ]);
  // كل صفحة بالنسختين، وكل نسخة تشير للأخرى
  const entry = (path: string, opts: { lastModified?: Date; priority: number }) =>
    (["ar", "en"] as const).map((locale) => ({
      url: `${base}${localePath(locale, path)}`,
      lastModified: opts.lastModified,
      priority: opts.priority,
      alternates: { languages: { ar: `${base}${localePath("ar", path)}`, en: `${base}${localePath("en", path)}` } },
    }));
  return [
    ...entry("/", { priority: 1 }),
    ...entry("/products", { priority: 0.8 }),
    ...categories.flatMap((c) => entry(`/c/${c.slug}`, { priority: 0.8 })),
    ...occasions.flatMap((o) => entry(`/occasion/${o.slug}`, { priority: 0.7 })),
    ...products.flatMap((p) => entry(`/p/${p.id}`, { lastModified: p.createdAt, priority: 0.6 })),
  ];
}
