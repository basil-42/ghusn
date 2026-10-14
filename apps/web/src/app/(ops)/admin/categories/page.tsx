import type { Metadata } from "next";
import { prisma } from "@ghusn/db";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { roleCan } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { imageUrl } from "@/lib/product-images";
import { categoryAutoCovers } from "@/lib/storefront";
import { CategoryForm, NewCategoryForm } from "./forms";
import { PageHeader } from "@/components/admin/page-header";

export const metadata: Metadata = { title: "الأقسام | غصن" };

const pct = (d: { mul(n: number): { toString(): string } }) => d.mul(100).toString();

export default async function CategoriesPage() {
  const session = await requirePermission({ category: ["update"] });
  const canEditMargin = roleCan(session.user.role, { margin: ["update"] });
  const [categories, autoCovers] = await Promise.all([
    prisma.category.findMany({
      orderBy: { sortOrder: "asc" },
      include: { _count: { select: { products: { where: { deletedAt: null } } } } },
    }),
    categoryAutoCovers(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="الأقسام"
        description={
          canEditMargin
            ? "الهامش نسبة من سعر البيع (D-23). النظام يقترح السعر بالهامش المستهدف، وينبّه إن نزل الهامش الفعلي تحت الحد الأدنى."
            : "أقسام المتجر ونقطة البيع وترتيبها."
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>قسم جديد</CardTitle>
          <CardDescription>يبدأ بالهامش الافتراضي 40% والحد الأدنى 35%.</CardDescription>
        </CardHeader>
        <NewCategoryForm />
      </Card>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {categories.map((c) => (
          <CategoryForm
            key={c.id}
            canEditMargin={canEditMargin}
            category={{
              id: c.id,
              nameAr: c.nameAr,
              nameEn: c.nameEn,
              isActive: c.isActive,
              targetMarginPct: pct(c.targetMargin),
              minMarginPct: pct(c.minMargin),
              productCount: c._count.products,
              imageUrl: c.imageKey ? imageUrl(c.imageKey, "thumb") : null,
              fallbackUrl: autoCovers.get(c.id) ?? null,
            }}
          />
        ))}
      </div>
    </div>
  );
}
