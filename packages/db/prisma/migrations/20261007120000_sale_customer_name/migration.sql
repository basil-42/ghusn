-- AlterTable
ALTER TABLE "Sale" ADD COLUMN "customerName" TEXT;

-- الفواتير السابقة: أفضل ما لدينا هو اسم العميل الحالي
UPDATE "Sale" s SET "customerName" = c."name" FROM "Customer" c WHERE s."customerId" = c."id";
