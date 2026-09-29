import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/session";
import { PRODUCT_TYPE_LABELS, STOCK_UNIT_LABELS, listCategoryOptions } from "@/lib/catalog";
import { ProductForm } from "../product-form";

export const metadata: Metadata = { title: "إضافة منتج | غصن" };

export default async function NewProductPage() {
  await requirePermission({ product: ["create"] });
  const categories = await listCategoryOptions();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-3xl font-bold">إضافة منتج</h1>
      <ProductForm
        productId={null}
        categories={categories}
        typeLabels={PRODUCT_TYPE_LABELS}
        unitLabels={STOCK_UNIT_LABELS}
        canEdit
      />
    </div>
  );
}
