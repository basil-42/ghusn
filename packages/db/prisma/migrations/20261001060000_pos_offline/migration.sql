-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "localNumber" TEXT,
ADD COLUMN     "offline" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reviewNote" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT,
ADD COLUMN     "syncedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Sale_localNumber_key" ON "Sale"("localNumber");

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

