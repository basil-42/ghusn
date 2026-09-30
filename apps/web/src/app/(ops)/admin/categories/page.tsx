import type { Metadata } from "next";
import { prisma } from "@ghusn/db";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { roleCan } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { CategoryForm, NewCategoryForm } from "./forms";

export const metadata: Metadata = { title: "الأقسام | غصن" };

const pct = (d: { mul(n: number): { toString(): string } }) => d.mul(100).toString();

export default async function CategoriesPage() {
  const session = await requirePermission({ category: ["update"] });
  const canEditMargin = roleCan(session.user.role, { margin: ["update"] });
  const categories = await prisma.category.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { products: { where: { deletedAt: null } } } } },
  });

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-bold">الأقسام</h1>
        {canEditMargin ? (
          <p className="text-muted-foreground">
            الهامش نسبة من سعر البيع (D-23). النظام يقترح السعر بالهامش المستهدف، وينبّه إن نزل الهامش الفعلي تحت الحد
            الأدنى.
          </p>
        ) : null}
      </header>

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
            }}
          />
        ))}
      </div>
    </div>
  );
}
