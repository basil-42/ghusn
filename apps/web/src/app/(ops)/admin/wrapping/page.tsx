import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/session";
import { formatAmount } from "@/lib/format";
import { imageUrl } from "@/lib/product-images";
import { getStoreSettings } from "@/lib/settings";
import { listMaterialOptions, listWrapStylesForAdmin } from "@/lib/wrapping";
import { GiftTileForm } from "./gift-tile-form";
import { WrapStyleForm } from "./wrap-style-form";

export const metadata: Metadata = { title: "التغليف | غصن" };

/** أنماط التغليف في «صمّم هديتك» (D-91): السعر، والتفعيل، ووصفة المواد. */
export default async function WrappingPage() {
  await requirePermission({ settings: ["update"] });
  const [styles, materialOptions, store] = await Promise.all([
    listWrapStylesForAdmin(),
    listMaterialOptions(),
    getStoreSettings(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-bold">التغليف</h1>
        <p className="text-muted-foreground">
          النمط يظهر في المتجر عند تفعيله وتحديد سعره. المواد تُخصم من المخزون عند بدء تجهيز الطلب، وتكلفتها تدخل تكلفة
          الطلب.
        </p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>صورة بطاقة «صمّم هديتك» في الرئيسية</CardTitle>
          <CardDescription>تظهر بجانب البانرات وتفتح صفحة «صمّم هديتك».</CardDescription>
        </CardHeader>
        <GiftTileForm imageUrl={store.giftTileImageKey ? imageUrl(store.giftTileImageKey, "thumb") : null} />
      </Card>
      <div className="grid gap-4 xl:grid-cols-2">
        {styles.map((w) => (
          <Card key={w.id}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                «{w.nameAr}»
                <Badge variant={w.isActive ? "success" : "default"}>{w.isActive ? "ظاهر" : "غير مفعّل"}</Badge>
              </CardTitle>
              <CardDescription>
                تكلفة المواد الآن ≈ <bdi dir="ltr">${formatAmount(w.materialCostUsd)}</bdi> للهدية
                {w.materials.length
                  ? ` · المتوفر: ${w.materials.map((m) => `${m.name} ${formatAmount(m.stockQty, 0)}`).join("، ")}`
                  : ""}
              </CardDescription>
            </CardHeader>
            <WrapStyleForm
              initial={{
                id: w.id,
                nameAr: w.nameAr,
                nameEn: w.nameEn,
                descriptionAr: w.descriptionAr,
                descriptionEn: w.descriptionEn,
                priceSdg: w.priceSdg,
                isActive: w.isActive,
                imageUrl: w.imageUrl,
                materials: w.materials.map((m) => ({ variantId: m.variantId, qty: m.qty })),
              }}
              materialOptions={materialOptions}
            />
          </Card>
        ))}
      </div>
    </div>
  );
}
