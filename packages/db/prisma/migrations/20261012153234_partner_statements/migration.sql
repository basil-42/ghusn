-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'PARTNER_STATEMENTS';

-- CreateTable
CREATE TABLE "Partner" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Partner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerStatement" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "shareUsd" DECIMAL(18,2) NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedById" TEXT,

    CONSTRAINT "PartnerStatement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PartnerStatement_partnerId_month_key" ON "PartnerStatement"("partnerId", "month");

-- AddForeignKey
ALTER TABLE "PartnerStatement" ADD CONSTRAINT "PartnerStatement_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerStatement" ADD CONSTRAINT "PartnerStatement_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
