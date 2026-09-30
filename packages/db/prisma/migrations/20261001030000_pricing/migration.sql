-- CreateEnum
CREATE TYPE "PriceChangeReason" AS ENUM ('INITIAL', 'REVIEW_UP', 'REVIEW_DOWN', 'MANUAL');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "minMargin" DECIMAL(5,4),
ADD COLUMN     "targetMargin" DECIMAL(5,4);

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN     "priceSdg" DECIMAL(18,2);

-- CreateTable
CREATE TABLE "PriceHistory" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "oldPriceSdg" DECIMAL(18,2),
    "newPriceSdg" DECIMAL(18,2) NOT NULL,
    "sdgPerUsd" DECIMAL(18,6) NOT NULL,
    "avgCostUsd" DECIMAL(18,6) NOT NULL,
    "margin" DECIMAL(9,6),
    "reason" "PriceChangeReason" NOT NULL,
    "note" TEXT,
    "approvedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PriceHistory_variantId_createdAt_idx" ON "PriceHistory"("variantId", "createdAt");

-- AddForeignKey
ALTER TABLE "PriceHistory" ADD CONSTRAINT "PriceHistory_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceHistory" ADD CONSTRAINT "PriceHistory_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
