import { Archive } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { roleCan } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { listOccasionOptions } from "@/lib/occasions";
import {
  PRODUCT_TYPE_LABELS,
  READINESS_LABELS,
  STOCK_UNIT_LABELS,
  getProduct,
  listCategoryOptions,
  productReadiness,
} from "@/lib/catalog";
import { MAX_IMAGES_PER_PRODUCT, imageUrl } from "@/lib/product-images";
import { formatDateTime } from "@/lib/format";
import { plainNumber } from "@ghusn/core";
import { archiveProductAction } from "../actions";
import { ConfirmButton } from "../confirm-button";
import { ProductForm } from "../product-form";
import { PricingCard } from "../pricing-card";
import { ProductImages } from "../product-images";

export const metadata: Metadata = { title: "منتج | غصن" };

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const session = await requirePermission({ product: ["read"] });
  const [{ id }, { created }] = await Promise.all([params, searchParams]);
  const product = await getProduct(id);
  if (!product) notFound();
  const [categories, occasions] = await Promise.all([listCategoryOptions(product.categoryId), listOccasionOptions()]);

  const canEdit = roleCan(session.user.role, { product: ["update"] });
  const canArchive = roleCan(session.user.role, { product: ["delete"] });
  const missing = productReadiness({
    ...product,
    _count: { images: product.images.length, occasions: product.occasions.length },
  });

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-bold">{product.nameAr}</h1>
        <p className="text-sm text-muted-foreground">
          {product.category.nameAr} · آخر تعديل {formatDateTime(product.updatedAt)}
        </p>
      </header>

      {/* جاهزية المتجر (D-106): ما ينقص المنتج الظاهر في المتجر */}
      {missing?.length ? (
        <section
          aria-label="جاهزية المتجر"
          className="flex flex-wrap items-center gap-2 rounded-2xl border border-gold/40 bg-gold/10 p-4 text-sm"
        >
          <span className="font-semibold text-warning">ينقص هذا المنتج في المتجر:</span>
          {missing.map((k) => (
            <span key={k} className="rounded-full bg-card px-2.5 py-0.5 font-semibold text-warning">
              {READINESS_LABELS[k]}
            </span>
          ))}
        </section>
      ) : missing ? (
        <p className="rounded-2xl bg-sage/15 p-3 text-sm font-semibold text-forest">مكتمل للمتجر ✓</p>
      ) : null}

      <ProductImages
        productId={product.id}
        canEdit={canEdit}
        max={MAX_IMAGES_PER_PRODUCT}
        images={product.images.map((img) => ({
          id: img.id,
          thumbUrl: imageUrl(img.key, "thumb"),
          fullUrl: imageUrl(img.key, "full"),
        }))}
      />

      <ProductForm
        productId={product.id}
        categories={categories}
        occasions={occasions}
        typeLabels={PRODUCT_TYPE_LABELS}
        unitLabels={STOCK_UNIT_LABELS}
        canEdit={canEdit}
        notice={created ? "تمت إضافة المنتج." : undefined}
        initial={{
          nameAr: product.nameAr,
          nameEn: product.nameEn,
          descriptionAr: product.descriptionAr,
          descriptionEn: product.descriptionEn,
          categoryId: product.categoryId,
          type: product.type,
          unit: product.unit,
          trackExpiry: product.trackExpiry,
          isActive: product.isActive,
          isWebVisible: product.isWebVisible,
          occasionIds: product.occasions.map((o) => o.occasionId),
          lowStockQty: product.lowStockQty ? plainNumber(product.lowStockQty.toString()) : null,
          variants: product.variants.map((v) => ({
            key: v.id,
            id: v.id,
            sku: v.sku,
            barcode: v.barcode,
            size: v.size,
            color: v.color,
            volume: v.volume,
            isActive: v.isActive,
          })),
        }}
      />

      <PricingCard productId={product.id} role={session.user.role} />

      {canArchive ? (
        <form action={archiveProductAction} className="border-t border-border pt-6">
          <input type="hidden" name="productId" value={product.id} />
          <ConfirmButton message="أرشفة هذا المنتج؟ يختفي من القوائم ويبقى في السجلات.">
            <Archive aria-hidden /> أرشفة المنتج
          </ConfirmButton>
        </form>
      ) : null}
    </div>
  );
}
