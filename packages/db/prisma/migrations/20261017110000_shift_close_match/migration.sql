-- D-147: الإغلاق بإقرار «المبلغ مطابق» ومن أغلق الوردية
ALTER TABLE "Shift" ADD COLUMN "closedById" TEXT,
ADD COLUMN "closedAsMatch" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Shift" ADD CONSTRAINT "Shift_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
