-- CreateEnum
CREATE TYPE "ReturnReason" AS ENUM ('SIZE', 'DEFECT', 'CHANGED_MIND', 'DAMAGED', 'WRONG_ITEM', 'OTHER');

-- AlterTable
ALTER TABLE "SaleReturn" ADD COLUMN     "reasonCode" "ReturnReason";
