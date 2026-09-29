-- الموردون وحساباتهم (رصيد افتتاحي، مشتريات، دفعات من المحافظ)
-- CreateEnum
CREATE TYPE "SupplierEntryKind" AS ENUM ('OPENING_BALANCE', 'PURCHASE', 'PAYMENT');

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "phone" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierLedgerEntry" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "kind" "SupplierEntryKind" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "rateUsed" DECIMAL(18,6) NOT NULL,
    "amountUsd" DECIMAL(18,2) NOT NULL,
    "walletId" TEXT,
    "paidAmount" DECIMAL(18,2),
    "paidCurrencyCode" TEXT,
    "paidRate" DECIMAL(18,6),
    "reference" TEXT,
    "dueDate" TIMESTAMP(3),
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidReason" TEXT,

    CONSTRAINT "SupplierLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupplierLedgerEntry_supplierId_occurredAt_idx" ON "SupplierLedgerEntry"("supplierId", "occurredAt");

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_currencyCode_fkey" FOREIGN KEY ("currencyCode") REFERENCES "Currency"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierLedgerEntry" ADD CONSTRAINT "SupplierLedgerEntry_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierLedgerEntry" ADD CONSTRAINT "SupplierLedgerEntry_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierLedgerEntry" ADD CONSTRAINT "SupplierLedgerEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierLedgerEntry" ADD CONSTRAINT "SupplierLedgerEntry_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

