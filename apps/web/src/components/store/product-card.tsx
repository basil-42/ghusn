import { Plus } from "lucide-react";
import Image from "next/image";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { stageBox, stageImg } from "@/lib/product-stage";
import type { StoreProductCard } from "@/lib/storefront";
import { Price } from "./price";
import { QuickAdd } from "./quick-add";

/**
 * بطاقة المنتج — النموذج ب (D-96): إطار وزوايا 12px، صورة مربعة، القسم، الاسم في سطرين، السعر وزر «+».
 * المنتج بخيارات (مقاس/حجم) يفتح صفحته بدل الإضافة المباشرة.
 */
export async function ProductCard({ product }: { product: StoreProductCard }) {
  const locale = await getLocale();
  const t = await getTranslations("product");
  return (
    <div className="group relative flex w-full flex-col overflow-hidden rounded-xl border border-line bg-card transition-shadow hover:shadow-md">
      <div className={`relative aspect-square ${stageBox(product.imageFull)}`}>
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt={product.name}
            fill
            sizes="(min-width: 1280px) 20vw, (min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
            className={`${stageImg(product.imageFull)} transition-transform duration-500 group-hover:scale-105`}
            unoptimized
          />
        ) : (
          <div className="flex size-full items-center justify-center">
            <Image src="/brand/mark-sage.svg" alt="" width={44} height={44} className="opacity-40" />
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <span className="text-xs text-muted-foreground">{product.category}</span>
        {/* الرابط يغطي البطاقة كلها؛ زر «+» فوقه */}
        <Link
          href={`/p/${product.id}`}
          className="line-clamp-2 min-h-[2.6rem] text-sm font-semibold leading-snug after:absolute after:inset-0"
        >
          {product.name}
        </Link>
        <div className="@container mt-auto flex items-end justify-between gap-2 pt-1.5">
          {/* السعر سطر واحد دائماً (D-157): «من» فوقه، والعملة أصغر، والخط يصغر مع عرض البطاقة على الشاشات
              الضيقة (360px) — فلا تنزل «ج.س» لسطر ثانٍ ولا يصل السعر لزر «+» حتى بسبعة أرقام */}
          <span className="flex min-w-0 flex-col pb-0.5 leading-tight">
            {product.hasOptions ? <span className="text-xs text-muted-foreground">{t("from")}</span> : null}
            <Price
              value={product.priceSdg}
              locale={locale}
              className={`whitespace-nowrap font-bold ${
                product.priceSdg.split(".")[0]!.length > 6 ? "text-[min(15px,9cqi)]" : "text-[min(15px,10.3cqi)]"
              }`}
              unitClassName="text-[0.78em] font-semibold"
            />
          </span>
          {product.hasOptions ? (
            <span
              aria-hidden
              className="pointer-events-none flex size-11 shrink-0 items-center justify-center rounded-[9px] bg-primary text-primary-foreground"
            >
              <Plus aria-hidden className="size-[18px]" strokeWidth={2} />
            </span>
          ) : (
            <QuickAdd variantId={product.defaultVariantId} name={product.name} />
          )}
        </div>
      </div>
    </div>
  );
}
