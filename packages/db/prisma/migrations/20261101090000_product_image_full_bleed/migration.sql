-- D-148: صورة بخلفية حقيقية تُعرض كاملة بلا منصة
ALTER TABLE "ProductImage" ADD COLUMN "fullBleed" BOOLEAN NOT NULL DEFAULT false;
