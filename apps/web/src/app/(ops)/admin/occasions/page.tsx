import { isBannerDay, shopDay } from "@ghusn/core";
import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/session";
import { listOccasionsForAdmin } from "@/lib/occasions";
import { imageUrl } from "@/lib/product-images";
import { OccasionForm } from "./occasion-form";

export const metadata: Metadata = { title: "المناسبات | غصن" };

/** المناسبات في المتجر (D-92): تُربط المنتجات بها من صفحة المنتج. */
export default async function OccasionsPage() {
  await requirePermission({ category: ["update"] });
  const occasions = await listOccasionsForAdmin();
  const today = shopDay(new Date());

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-bold">المناسبات</h1>
        <p className="text-muted-foreground">
          تظهر في المتجر في «تسوّق حسب المناسبة» إذا كان فيها منتج متوفر. اربطي المنتجات من صفحة كل منتج. بانر الموسم
          يظهر أعلى الرئيسية بين التاريخين (أول مناسبة بالترتيب إن تداخلت فترتان).
        </p>
      </header>
      <div className="grid gap-4 xl:grid-cols-2">
        {occasions.map((o) => (
          <Card key={o.id}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                {o.nameAr}
                <Badge variant={o.isActive ? "success" : "default"}>{o.isActive ? "ظاهرة" : "متوقفة"}</Badge>
                {isBannerDay(today, o.bannerStart || null, o.bannerEnd || null) ? (
                  <Badge variant="warning">البانر ظاهر الآن</Badge>
                ) : null}
              </CardTitle>
              <CardDescription>{o.products} منتج</CardDescription>
            </CardHeader>
            <OccasionForm
              initial={{
                ...o,
                imageUrl: o.imageKey ? imageUrl(o.imageKey, "thumb") : null,
                coverUrl: o.coverKey ? imageUrl(o.coverKey, "thumb") : null,
              }}
            />
          </Card>
        ))}
        <Card>
          <CardHeader>
            <CardTitle>مناسبة جديدة</CardTitle>
          </CardHeader>
          <OccasionForm
            initial={{
              id: null,
              slug: "",
              nameAr: "",
              nameEn: "",
              descriptionAr: "",
              descriptionEn: "",
              isActive: true,
              sortOrder: occasions.length + 1,
              bannerStart: "",
              bannerEnd: "",
              imageUrl: null,
              coverUrl: null,
            }}
          />
        </Card>
      </div>
    </div>
  );
}
