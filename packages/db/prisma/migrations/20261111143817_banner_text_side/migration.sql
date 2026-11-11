-- CreateEnum
CREATE TYPE "BannerTextSide" AS ENUM ('RIGHT', 'LEFT');

-- AlterTable
ALTER TABLE "Banner" ADD COLUMN     "textSide" "BannerTextSide" NOT NULL DEFAULT 'RIGHT';
