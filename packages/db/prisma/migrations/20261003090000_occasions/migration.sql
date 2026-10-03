-- CreateTable
CREATE TABLE "Occasion" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "descriptionAr" TEXT,
    "descriptionEn" TEXT,
    "imageKey" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "bannerStart" TIMESTAMP(3),
    "bannerEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Occasion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductOccasion" (
    "productId" TEXT NOT NULL,
    "occasionId" TEXT NOT NULL,

    CONSTRAINT "ProductOccasion_pkey" PRIMARY KEY ("productId","occasionId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Occasion_slug_key" ON "Occasion"("slug");

-- CreateIndex
CREATE INDEX "Occasion_isActive_sortOrder_idx" ON "Occasion"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "ProductOccasion_occasionId_idx" ON "ProductOccasion"("occasionId");

-- AddForeignKey
ALTER TABLE "ProductOccasion" ADD CONSTRAINT "ProductOccasion_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductOccasion" ADD CONSTRAINT "ProductOccasion_occasionId_fkey" FOREIGN KEY ("occasionId") REFERENCES "Occasion"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- المناسبات الأولى (D-92) — تعدّلها المديرة من «المناسبات»
INSERT INTO "Occasion" ("id", "slug", "nameAr", "nameEn", "sortOrder", "updatedAt") VALUES
  ('occasionbirthday0000000001', 'birthday', 'عيد ميلاد', 'Birthday', 1, CURRENT_TIMESTAMP),
  ('occasionwedding00000000002', 'wedding', 'زواج وشيلة عروس', 'Wedding & Bride', 2, CURRENT_TIMESTAMP),
  ('occasiongraduation00000003', 'graduation', 'تخرج', 'Graduation', 3, CURRENT_TIMESTAMP),
  ('occasionnewborn00000000004', 'newborn', 'مولود', 'New Baby', 4, CURRENT_TIMESTAMP),
  ('occasionmothersday00000005', 'mothers-day', 'عيد الأم', 'Mother''s Day', 5, CURRENT_TIMESTAMP),
  ('occasionvalentines00000006', 'valentines', 'عيد الحب', 'Valentine''s Day', 6, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;
