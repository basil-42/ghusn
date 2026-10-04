-- بانرات الرئيسية (D-101) — إضافة فقط
CREATE TYPE "BannerLink" AS ENUM ('PRODUCTS', 'CATEGORY', 'OCCASION', 'PRODUCT', 'GIFT');

CREATE TABLE "Banner" (
    "id" TEXT NOT NULL,
    "titleAr" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "textAr" TEXT,
    "textEn" TEXT,
    "ctaAr" TEXT NOT NULL,
    "ctaEn" TEXT NOT NULL,
    "badgeAr" TEXT,
    "badgeEn" TEXT,
    "linkType" "BannerLink" NOT NULL DEFAULT 'PRODUCTS',
    "linkTarget" TEXT,
    "imageKey" TEXT NOT NULL,
    "mobileImageKey" TEXT,
    "startsOn" DATE,
    "endsOn" DATE,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Banner_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Banner_isActive_deletedAt_sortOrder_idx" ON "Banner"("isActive", "deletedAt", "sortOrder");

-- صورة الواجهة الحالية (الإعدادات) تصبح أول بانر بنص الهوية، فلا تضيع
INSERT INTO "Banner" ("id", "titleAr", "titleEn", "textAr", "textEn", "ctaAr", "ctaEn", "linkType", "imageKey", "sortOrder", "updatedAt")
SELECT 'banner_hero_migrated', 'هدايا تُصنع لتُذكر', 'Gifts made to be remembered',
       'ورود وعطور وساعات وتجميل ودباديب وشيلات، نغلّفها بعناية لتصل كما تتمنّاها.',
       'Flowers, perfumes, watches, cosmetics, teddy bears and shilas — wrapped with care to arrive just as you imagine.',
       'تسوّق الهدايا', 'Shop gifts', 'PRODUCTS', "value"->>'heroImageKey', 0, CURRENT_TIMESTAMP
FROM "Setting"
WHERE "key" = 'store' AND COALESCE("value"->>'heroImageKey', '') <> '';
