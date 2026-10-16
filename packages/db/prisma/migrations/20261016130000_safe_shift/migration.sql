-- الخزنة والوردية (D-143): كل ما يدخل الخزنة أو يخرج منها يُنسب للوردية المفتوحة، والإلغاء بعد الإغلاق
-- يُنسب للوردية المفتوحة وقت الإلغاء. تكلفة الشحنة بلا محفظة = «دُفع من خارج المحل».

-- DropForeignKey
ALTER TABLE "ShipmentCost" DROP CONSTRAINT "ShipmentCost_walletId_fkey";

-- AlterTable
ALTER TABLE "CapitalContribution" ADD COLUMN     "shiftId" TEXT,
ADD COLUMN     "voidShiftId" TEXT;

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "voidShiftId" TEXT;

-- AlterTable
ALTER TABLE "ShipmentCost" ADD COLUMN     "shiftId" TEXT,
ADD COLUMN     "voidShiftId" TEXT,
ALTER COLUMN "walletId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "SupplierLedgerEntry" ADD COLUMN     "shiftId" TEXT,
ADD COLUMN     "voidShiftId" TEXT;

-- AlterTable
ALTER TABLE "WalletTransfer" ADD COLUMN     "shiftId" TEXT,
ADD COLUMN     "voidShiftId" TEXT;

-- CreateIndex
CREATE INDEX "CapitalContribution_shiftId_idx" ON "CapitalContribution"("shiftId");

-- CreateIndex
CREATE INDEX "CapitalContribution_voidShiftId_idx" ON "CapitalContribution"("voidShiftId");

-- CreateIndex
CREATE INDEX "Expense_voidShiftId_idx" ON "Expense"("voidShiftId");

-- CreateIndex
CREATE INDEX "ShipmentCost_shiftId_idx" ON "ShipmentCost"("shiftId");

-- CreateIndex
CREATE INDEX "ShipmentCost_voidShiftId_idx" ON "ShipmentCost"("voidShiftId");

-- CreateIndex
CREATE INDEX "SupplierLedgerEntry_shiftId_idx" ON "SupplierLedgerEntry"("shiftId");

-- CreateIndex
CREATE INDEX "SupplierLedgerEntry_voidShiftId_idx" ON "SupplierLedgerEntry"("voidShiftId");

-- CreateIndex
CREATE INDEX "WalletTransfer_shiftId_idx" ON "WalletTransfer"("shiftId");

-- CreateIndex
CREATE INDEX "WalletTransfer_voidShiftId_idx" ON "WalletTransfer"("voidShiftId");

-- AddForeignKey
ALTER TABLE "ShipmentCost" ADD CONSTRAINT "ShipmentCost_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- وردية واحدة مفتوحة للخزنة (D-143). إن كانت أكثر من وردية مفتوحة لحظة التحديث تبقى حتى تُغلق،
-- والتطبيق يمنع فتح وردية ثانية؛ الفهرس يُنشأ هنا فقط حين لا يتعارض مع ما هو قائم.
DO $$
BEGIN
  IF (SELECT count(*) FROM "Shift" WHERE "closedAt" IS NULL) <= 1 THEN
    CREATE UNIQUE INDEX "Shift_single_open" ON "Shift" ((true)) WHERE "closedAt" IS NULL;
  END IF;
END $$;
