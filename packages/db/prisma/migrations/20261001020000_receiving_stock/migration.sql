-- CreateEnum
CREATE TYPE "StockMovementKind" AS ENUM ('RECEIPT', 'REVALUATION');

-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN     "receivedAt" TIMESTAMP(3),
ADD COLUMN     "receivedById" TEXT;

-- AlterTable
ALTER TABLE "ShipmentLine" ADD COLUMN     "damagedQty" DECIMAL(12,3),
ADD COLUMN     "lossUsd" DECIMAL(18,2),
ADD COLUMN     "receivedQty" DECIMAL(12,3);

-- CreateTable
CREATE TABLE "StockLevel" (
    "variantId" TEXT NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "avgCostUsd" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockLevel_pkey" PRIMARY KEY ("variantId")
);

-- CreateTable
CREATE TABLE "StockBatch" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "shipmentLineId" TEXT,
    "qtyReceived" DECIMAL(12,3) NOT NULL,
    "qtyRemaining" DECIMAL(12,3) NOT NULL,
    "landedUnitUsd" DECIMAL(18,6) NOT NULL,
    "expiresAt" DATE,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "batchId" TEXT,
    "kind" "StockMovementKind" NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL,
    "unitCostUsd" DECIMAL(18,6),
    "valueUsd" DECIMAL(18,2) NOT NULL,
    "expenseUsd" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "qtyAfter" DECIMAL(12,3) NOT NULL,
    "avgCostAfterUsd" DECIMAL(18,6) NOT NULL,
    "shipmentId" TEXT,
    "shipmentCostId" TEXT,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockBatch_shipmentLineId_key" ON "StockBatch"("shipmentLineId");

-- CreateIndex
CREATE INDEX "StockBatch_variantId_expiresAt_idx" ON "StockBatch"("variantId", "expiresAt");

-- CreateIndex
CREATE INDEX "StockMovement_variantId_createdAt_idx" ON "StockMovement"("variantId", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_shipmentId_idx" ON "StockMovement"("shipmentId");

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLevel" ADD CONSTRAINT "StockLevel_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBatch" ADD CONSTRAINT "StockBatch_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBatch" ADD CONSTRAINT "StockBatch_shipmentLineId_fkey" FOREIGN KEY ("shipmentLineId") REFERENCES "ShipmentLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "StockBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_shipmentCostId_fkey" FOREIGN KEY ("shipmentCostId") REFERENCES "ShipmentCost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
