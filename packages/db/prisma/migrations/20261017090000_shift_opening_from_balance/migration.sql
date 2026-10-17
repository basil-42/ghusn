-- D-146: الوردية تبدأ من رصيد الخزنة في النظام، مع عدّ اختياري عند الفتح
ALTER TABLE "Shift" ADD COLUMN "openingSystemSdg" DECIMAL(18,2),
ADD COLUMN "openingDiffUsd" DECIMAL(18,2),
ADD COLUMN "openingNote" TEXT;
