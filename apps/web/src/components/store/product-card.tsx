import Image from "next/image";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { StoreProductCard } from "@/lib/storefront";
import { Price } from "./price";

export async function ProductCard({ product }: { product: StoreProductCard }) {
  const locale = await getLocale();
  const t = await getTranslations("product");
  return (
    <Link
      href={`/p/${product.id}`}
      className="group flex w-full flex-col overflow-hidden rounded-2xl border border-line bg-card transition-shadow hover:shadow-md"
    >
      <div className="relative aspect-square bg-muted">
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt={product.name}
            fill
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            unoptimized
          />
        ) : (
          <div className="flex size-full items-center justify-center">
            <Image src="/brand/mark-sage.svg" alt="" width={56} height={56} className="opacity-40" />
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <span className="text-xs text-muted-foreground">{product.category}</span>
        <span className="line-clamp-2 font-semibold">{product.name}</span>
        <span className="mt-auto pt-1 font-bold">
          {product.hasOptions ? (
            <span className="me-1 text-sm font-normal text-muted-foreground">{t("from")}</span>
          ) : null}
          <Price value={product.priceSdg} locale={locale} />
        </span>
      </div>
    </Link>
  );
}
