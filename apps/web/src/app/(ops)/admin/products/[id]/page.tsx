import { Archive } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { roleCan } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { PRODUCT_TYPE_LABELS, STOCK_UNIT_LABELS, getProduct, listCategoryOptions } from "@/lib/catalog";
import { MAX_IMAGES_PER_PRODUCT, imageUrl } from "@/lib/product-images";
import { formatDateTime } from "@/lib/format";
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
  const categories = await listCategoryOptions(product.categoryId);

  const canEdit = roleCan(session.user.role, { product: ["update"] });
  const canArchive = roleCan(session.user.role, { product: ["delete"] });

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-bold">{product.nameAr}</h1>
        <p className="text-sm text-muted-foreground">
          {product.category.nameAr} · آخر تعديل {formatDateTime(product.updatedAt)}
        </p>
      </header>

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
