-- AlterTable
ALTER TABLE "Shift" ADD COLUMN     "closeSdgPerUsd" DECIMAL(18,6),
ADD COLUMN     "differenceUsd" DECIMAL(18,2);

-- CreateIndex
CREATE INDEX "Shift_closedAt_idx" ON "Shift"("closedAt");


-- الورديات المغلقة قبل هذا الترحيل: سعر الجنيه الساري لحظة الإغلاق (تحويل فعلي في نفس يوم
-- المحل أولاً، وإلا آخر سعر قبلها — مثل effectiveRate)، وفرق العدّ بالدولار
UPDATE "Shift" sh SET "closeSdgPerUsd" = (
  SELECT r."unitsPerUsd" FROM "ExchangeRate" r
   WHERE r."currencyCode" = 'SDG' AND r."effectiveAt" <= sh."closedAt"
   ORDER BY (r."source" = 'ACTUAL_TRANSFER'
             AND (r."effectiveAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Khartoum')::date
               = (sh."closedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Khartoum')::date) DESC,
            r."effectiveAt" DESC
   LIMIT 1)
WHERE sh."closedAt" IS NOT NULL;

UPDATE "Shift" SET "differenceUsd" = ROUND(("countedCashSdg" - "expectedCashSdg") / "closeSdgPerUsd", 2)
WHERE "closedAt" IS NOT NULL AND "closeSdgPerUsd" > 0
  AND "countedCashSdg" IS NOT NULL AND "expectedCashSdg" IS NOT NULL;
