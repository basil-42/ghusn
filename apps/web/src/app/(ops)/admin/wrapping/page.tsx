import type { Metadata } from "next";
import { CardFace } from "@/components/card-face";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/session";
import { formatAmount } from "@/lib/format";
import { imageUrl } from "@/lib/product-images";
import { getStoreSettings } from "@/lib/settings";
import { WRAP_SIZE_LABELS, listCardDesignsForAdmin, listMaterialOptions, listWrapTiersForAdmin } from "@/lib/wrapping";
import { CardDesignForm } from "./card-design-form";
import { GiftTileForm } from "./gift-tile-form";
import { WrapTierForm } from "./wrap-tier-form";
import { PageHeader } from "@/components/admin/page-header";

export const metadata: Metadata = { title: "التغليف | غصن" };

/** التغليف (D-165): «عادي» و«فاخر» بسعر لكل حجم ومواد لكل حجم، وأشكال بطاقات الإهداء. */
export default async function WrappingPage() {
  await requirePermission({ settings: ["update"] });
  const [tiers, materialOptions, designs, store] = await Promise.all([
    listWrapTiersForAdmin(),
    listMaterialOptions(),
    listCardDesignsForAdmin(),
    getStoreSettings(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="التغليف"
        description="العميل يختار بدون تغليف أو عادي أو فاخر، وكل قطعة تُغلّف بسعر حجمها. حجم القطعة من المنتج، أو من قسمه. المواد تُخصم عند بدء التجهيز."
      />
      <div className="grid gap-4 xl:grid-cols-2">
        {tiers.map((w) => (
          <Card key={w.id}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                «{w.nameAr}»
                <Badge variant={w.isActive ? "success" : "default"}>{w.isActive ? "ظاهر" : "غير مفعّل"}</Badge>
              </CardTitle>
              <CardDescription>
                تكلفة المواد الآن للقطعة ≈{" "}
                {(["SMALL", "MEDIUM", "LARGE"] as const).map((s, i) => (
                  <span key={s}>
                    {i ? " · " : ""}
                    {WRAP_SIZE_LABELS[s]} <bdi dir="ltr">${formatAmount(w.materialCostUsd[s])}</bdi>
                  </span>
                ))}
              </CardDescription>
            </CardHeader>
            <WrapTierForm
              initial={{
                id: w.id,
                nameAr: w.nameAr,
                nameEn: w.nameEn,
                descriptionAr: w.descriptionAr,
                descriptionEn: w.descriptionEn,
                prices: w.prices,
                isActive: w.isActive,
                imageUrl: w.imageUrl,
                materials: w.materials.map((m) => ({ size: m.size, variantId: m.variantId, qty: m.qty })),
              }}
              materialOptions={materialOptions}
            />
          </Card>
        ))}
      </div>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-lg font-bold">أشكال البطاقات</h2>
          <p className="text-sm text-muted-foreground">
            البطاقة مجانية. العميل يختار الشكل ويكتب رسالته و«من». قالب غصن متاح دائماً كأول شكل، والأشكال هنا تُضاف
            بعده.
          </p>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>قالب غصن (ثابت)</CardTitle>
              <CardDescription>عاجي برمز غصن الذهبي والعبارة في الأسفل.</CardDescription>
            </CardHeader>
            <CardFace
              message="كل عام وأنتِ بخير"
              from="غصن"
              design={null}
              className="w-[140px] rounded-md border border-border"
            />
          </Card>
          {designs.map((d) => (
            <Card key={d.id}>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  «{d.nameAr}»
                  <Badge variant={d.isActive ? "success" : "default"}>{d.isActive ? "ظاهر" : "موقوف"}</Badge>
                </CardTitle>
              </CardHeader>
              <div className="flex flex-wrap items-start gap-4">
                <CardFace
                  message="كل عام وأنتِ بخير"
                  from="غصن"
                  design={{ imageUrl: d.imageUrl, textColor: d.textColor }}
                  className="w-[140px] shrink-0 rounded-md border border-border"
                />
                <div className="min-w-64 flex-1">
                  <CardDesignForm initial={d} />
                </div>
              </div>
            </Card>
          ))}
          <Card>
            <CardHeader>
              <CardTitle>شكل جديد</CardTitle>
            </CardHeader>
            <CardDesignForm
              key={designs.length}
              initial={{
                id: null,
                nameAr: "",
                nameEn: "",
                textColor: "FOREST",
                isActive: true,
                sortOrder: designs.length + 1,
                imageUrl: null,
              }}
            />
          </Card>
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>صورة بطاقة «صمّم هديتك» في الرئيسية</CardTitle>
          <CardDescription>تظهر بجانب البانرات وتفتح صفحة «صمّم هديتك».</CardDescription>
        </CardHeader>
        <GiftTileForm imageUrl={store.giftTileImageKey ? imageUrl(store.giftTileImageKey, "thumb") : null} />
      </Card>
    </div>
  );
}
