-- CreateEnum
CREATE TYPE "OrderMessageChannel" AS ENUM ('MANUAL', 'API');

-- CreateTable
CREATE TABLE "OrderMessageLog" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "channel" "OrderMessageChannel" NOT NULL DEFAULT 'MANUAL',
    "sentById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderMessageLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderMessageLog_orderId_createdAt_idx" ON "OrderMessageLog"("orderId", "createdAt");

-- AddForeignKey
ALTER TABLE "OrderMessageLog" ADD CONSTRAINT "OrderMessageLog_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderMessageLog" ADD CONSTRAINT "OrderMessageLog_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
