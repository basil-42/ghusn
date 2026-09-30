-- CreateEnum
CREATE TYPE "WalletAdjustmentKind" AS ENUM ('OPENING', 'MANUAL');

-- AlterTable
ALTER TABLE "Shift" ADD COLUMN     "cashWalletId" TEXT;

-- CreateTable
CREATE TABLE "WalletTransfer" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "fromWalletId" TEXT NOT NULL,
    "fromAmount" DECIMAL(18,2) NOT NULL,
    "fromCurrencyCode" TEXT NOT NULL,
    "fromRate" DECIMAL(18,6) NOT NULL,
    "fromAmountUsd" DECIMAL(18,2) NOT NULL,
    "toWalletId" TEXT NOT NULL,
    "toAmount" DECIMAL(18,2) NOT NULL,
    "toCurrencyCode" TEXT NOT NULL,
    "toRate" DECIMAL(18,6) NOT NULL,
    "toAmountUsd" DECIMAL(18,2) NOT NULL,
    "feeAmount" DECIMAL(18,2),
    "rateId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidReason" TEXT,

    CONSTRAINT "WalletTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletAdjustment" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "kind" "WalletAdjustmentKind" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "rateUsed" DECIMAL(18,6) NOT NULL,
    "amountUsd" DECIMAL(18,2) NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidReason" TEXT,

    CONSTRAINT "WalletAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WalletTransfer_number_key" ON "WalletTransfer"("number");

-- CreateIndex
CREATE UNIQUE INDEX "WalletTransfer_rateId_key" ON "WalletTransfer"("rateId");

-- CreateIndex
CREATE INDEX "WalletTransfer_fromWalletId_occurredAt_idx" ON "WalletTransfer"("fromWalletId", "occurredAt");

-- CreateIndex
CREATE INDEX "WalletTransfer_toWalletId_occurredAt_idx" ON "WalletTransfer"("toWalletId", "occurredAt");

-- CreateIndex
CREATE INDEX "WalletAdjustment_walletId_occurredAt_idx" ON "WalletAdjustment"("walletId", "occurredAt");

-- AddForeignKey
ALTER TABLE "WalletTransfer" ADD CONSTRAINT "WalletTransfer_fromWalletId_fkey" FOREIGN KEY ("fromWalletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransfer" ADD CONSTRAINT "WalletTransfer_toWalletId_fkey" FOREIGN KEY ("toWalletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransfer" ADD CONSTRAINT "WalletTransfer_rateId_fkey" FOREIGN KEY ("rateId") REFERENCES "ExchangeRate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransfer" ADD CONSTRAINT "WalletTransfer_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransfer" ADD CONSTRAINT "WalletTransfer_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletAdjustment" ADD CONSTRAINT "WalletAdjustment_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletAdjustment" ADD CONSTRAINT "WalletAdjustment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletAdjustment" ADD CONSTRAINT "WalletAdjustment_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_cashWalletId_fkey" FOREIGN KEY ("cashWalletId") REFERENCES "Wallet"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- رصيد افتتاحي واحد ساري لكل محفظة (D-86)
CREATE UNIQUE INDEX "WalletAdjustment_one_opening_per_wallet" ON "WalletAdjustment"("walletId") WHERE "kind" = 'OPENING' AND "voidedAt" IS NULL;

-- الورديات المغلقة قبل هذا الترحيل: فرق العدّ يُنسب لمحفظة النقد (من الضبط، وإلا «صندوق المحل»)
UPDATE "Shift" SET "cashWalletId" = COALESCE(
  (SELECT w."id" FROM "Wallet" w WHERE w."id" = (SELECT s."value"->>'cashWalletId' FROM "Setting" s WHERE s."key" = 'pos')),
  (SELECT w."id" FROM "Wallet" w WHERE w."name" = 'صندوق المحل' AND w."currencyCode" = 'SDG' ORDER BY w."createdAt" LIMIT 1)
)
WHERE "closedAt" IS NOT NULL;
