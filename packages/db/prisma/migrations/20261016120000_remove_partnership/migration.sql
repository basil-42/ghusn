-- الشراكة ورأس المال واسترداده خارج النظام (D-142): تُحذف كشوف الشركاء وجداولها وإشعاراتها.
-- إشعارات الكشوف وتفضيلاتها تُزال قبل تغيير النوع (وإلا يفشل التحويل)
DELETE FROM "Notification" WHERE "type" = 'PARTNER_STATEMENTS';
UPDATE "NotificationPreference" SET "pushTypes" = array_remove("pushTypes", 'PARTNER_STATEMENTS'::"NotificationType");

-- AlterEnum
BEGIN;
CREATE TYPE "NotificationType_new" AS ENUM ('ORDER_NEW', 'PAYMENT_PROOF', 'ORDER_ESCALATED', 'BANKAK_EXPIRING', 'LOW_STOCK', 'BATCH_EXPIRING', 'PRICE_SUGGESTIONS', 'DAILY_SUMMARY', 'STOCK_ADJUSTMENT', 'STOCK_ADJUSTED', 'STOCK_COUNT', 'SECURITY_ALERT');
ALTER TABLE "Notification" ALTER COLUMN "type" TYPE "NotificationType_new" USING ("type"::text::"NotificationType_new");
ALTER TABLE "NotificationPreference" ALTER COLUMN "pushTypes" TYPE "NotificationType_new"[] USING ("pushTypes"::text::"NotificationType_new"[]);
ALTER TYPE "NotificationType" RENAME TO "NotificationType_old";
ALTER TYPE "NotificationType_new" RENAME TO "NotificationType";
DROP TYPE "public"."NotificationType_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "PartnerStatement" DROP CONSTRAINT "PartnerStatement_issuedById_fkey";

-- DropForeignKey
ALTER TABLE "PartnerStatement" DROP CONSTRAINT "PartnerStatement_partnerId_fkey";

-- DropTable
DROP TABLE "Partner";

-- DropTable
DROP TABLE "PartnerStatement";

