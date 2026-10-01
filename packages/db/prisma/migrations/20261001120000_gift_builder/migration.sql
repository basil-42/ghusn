-- CreateEnum
CREATE TYPE "GiftPhotoDecision" AS ENUM ('APPROVED', 'CHANGES', 'AUTO_APPROVED', 'STAFF_APPROVED');

-- AlterEnum
ALTER TYPE "StockMovementKind" ADD VALUE 'CONSUMPTION';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "cardMessage" TEXT,
ADD COLUMN     "photoDueAt" TIMESTAMP(3),
ADD COLUMN     "wrapCostUsd" DECIMAL(18,2),
ADD COLUMN     "wrapName" TEXT,
ADD COLUMN     "wrapPriceSdg" DECIMAL(18,2),
ADD COLUMN     "wrapStyleId" TEXT;

-- CreateTable
CREATE TABLE "WrapStyle" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "descriptionAr" TEXT,
    "descriptionEn" TEXT,
    "priceSdg" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WrapStyle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WrapStyleMaterial" (
    "id" TEXT NOT NULL,
    "wrapStyleId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "WrapStyleMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiftPhoto" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "imageKey" TEXT NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decision" "GiftPhotoDecision",
    "decidedAt" TIMESTAMP(3),
    "feedback" TEXT,

    CONSTRAINT "GiftPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WrapStyle_code_key" ON "WrapStyle"("code");

-- CreateIndex
CREATE UNIQUE INDEX "WrapStyleMaterial_wrapStyleId_variantId_key" ON "WrapStyleMaterial"("wrapStyleId", "variantId");

-- CreateIndex
CREATE INDEX "GiftPhoto_orderId_createdAt_idx" ON "GiftPhoto"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_status_photoDueAt_idx" ON "Order"("status", "photoDueAt");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_wrapStyleId_fkey" FOREIGN KEY ("wrapStyleId") REFERENCES "WrapStyle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WrapStyleMaterial" ADD CONSTRAINT "WrapStyleMaterial_wrapStyleId_fkey" FOREIGN KEY ("wrapStyleId") REFERENCES "WrapStyle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WrapStyleMaterial" ADD CONSTRAINT "WrapStyleMaterial_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftPhoto" ADD CONSTRAINT "GiftPhoto_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftPhoto" ADD CONSTRAINT "GiftPhoto_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- أنماط التغليف الثلاثة (D-91) — غير مفعّلة حتى يُحدَّد السعر والمواد من الإدارة
INSERT INTO "WrapStyle" ("id", "code", "nameAr", "nameEn", "descriptionAr", "descriptionEn", "sortOrder", "updatedAt") VALUES
  ('wrapstyleghusn000000000001', 'GHUSN', 'غصن', 'Ghusn', 'كرافت كلاسيكي بشريط وغصن أخضر', 'Classic kraft with ribbon and a green sprig', 1, CURRENT_TIMESTAMP),
  ('wrapstylewaraqa00000000002', 'WARAQA', 'ورقة', 'Waraqa', 'ورق ساتان فاخر بشريط حريري', 'Luxury satin paper with a silk ribbon', 2, CURRENT_TIMESTAMP),
  ('wrapstyleshajara0000000003', 'SHAJARA', 'شجرة', 'Shajara', 'صندوق خشبي محفور بشعار غصن', 'Engraved wooden box with the Ghusn mark', 3, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
