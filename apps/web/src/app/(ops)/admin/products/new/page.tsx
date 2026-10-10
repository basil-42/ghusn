import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/session";
import { listOccasionOptions } from "@/lib/occasions";
import { PRODUCT_TYPE_LABELS, STOCK_UNIT_LABELS, listCategoryOptions } from "@/lib/catalog";
import { ProductForm } from "../product-form";
import { PageHeader } from "@/components/admin/page-header";

export const metadata: Metadata = { title: "إضافة منتج | غصن" };

export default async function NewProductPage() {
  await requirePermission({ product: ["create"] });
  const [categories, occasions] = await Promise.all([listCategoryOptions(), listOccasionOptions()]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="إضافة منتج"
        back={{ href: "/admin/products", label: "المنتجات" }}
        description="الاسم والقسم والسعر كافية للبدء — الصور والوصف يمكن إضافتها لاحقاً."
      />
      <ProductForm
        productId={null}
        categories={categories}
        occasions={occasions}
        typeLabels={PRODUCT_TYPE_LABELS}
        unitLabels={STOCK_UNIT_LABELS}
        canEdit
      />
    </div>
  );
}
