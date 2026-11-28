-- CreateEnum
CREATE TYPE "WrapSize" AS ENUM ('SMALL', 'MEDIUM', 'LARGE', 'NONE');

-- CreateEnum
CREATE TYPE "WrapTier" AS ENUM ('REGULAR', 'PREMIUM');

-- CreateEnum
CREATE TYPE "CardTextColor" AS ENUM ('FOREST', 'IVORY', 'GOLD');

-- DropIndex
DROP INDEX "WrapStyleMaterial_wrapStyleId_variantId_key";

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "defaultWrapSize" "WrapSize" NOT NULL DEFAULT 'MEDIUM';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "cardDesignId" TEXT,
ADD COLUMN     "cardFrom" TEXT;

-- AlterTable
ALTER TABLE "OrderLine" ADD COLUMN     "wrapSize" "WrapSize",
ADD COLUMN     "wrapUnitPriceSdg" DECIMAL(18,2);

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "wrapSize" "WrapSize";

-- AlterTable
ALTER TABLE "WrapStyle" ADD COLUMN     "priceLargeSdg" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "priceMediumSdg" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "priceSmallSdg" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "tier" "WrapTier";

-- AlterTable
ALTER TABLE "WrapStyleMaterial" ADD COLUMN     "size" "WrapSize";

-- CreateTable
CREATE TABLE "CardDesign" (
    "id" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "imageKey" TEXT NOT NULL,
    "textColor" "CardTextColor" NOT NULL DEFAULT 'FOREST',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CardDesign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WrapStyle_tier_key" ON "WrapStyle"("tier");

-- CreateIndex
CREATE UNIQUE INDEX "WrapStyleMaterial_wrapStyleId_size_variantId_key" ON "WrapStyleMaterial"("wrapStyleId", "size", "variantId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_cardDesignId_fkey" FOREIGN KEY ("cardDesignId") REFERENCES "CardDesign"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- D-165: «عادي» و«فاخر» بدل الأنماط الثلاثة. يبدآن غير مفعّلين وبلا أسعار حتى تحددها المديرة
INSERT INTO "WrapStyle" ("id", "code", "tier", "nameAr", "nameEn", "descriptionAr", "descriptionEn", "sortOrder", "updatedAt") VALUES
  ('wrapstyleregular0000000004', 'REGULAR', 'REGULAR', 'تغليف عادي', 'Regular wrap', 'ورق تغليف يأخذ شكل القطعة، وشريط', 'Wrapping paper shaped to the piece, with a ribbon', 1, CURRENT_TIMESTAMP),
  ('wrapstylepremium0000000005', 'PREMIUM', 'PREMIUM', 'تغليف فاخر', 'Premium wrap', 'علبة صلبة وشريط ساتان', 'A rigid box with a satin ribbon', 2, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

-- الأنماط القديمة تُوقف (تبقى للطلبات السابقة)
UPDATE "WrapStyle" SET "isActive" = false WHERE "tier" IS NULL;

-- حجم التغليف الافتراضي للأقسام الأساسية (تُعدَّل من «الأقسام»)
UPDATE "Category" SET "defaultWrapSize" = 'SMALL' WHERE "slug" IN ('womens-perfumes', 'mens-perfumes', 'watches', 'beauty');
UPDATE "Category" SET "defaultWrapSize" = 'LARGE' WHERE "slug" = 'teddy-bears';
UPDATE "Category" SET "defaultWrapSize" = 'NONE' WHERE "slug" IN ('flowers', 'wrapping');
