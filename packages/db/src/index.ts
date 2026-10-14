import { PrismaClient } from "@prisma/client";

// نسخة واحدة من الاتصال بقاعدة البيانات أثناء التطوير
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// تصدير بالاسم لا «export *»: ‏@prisma/client حزمة CommonJS، و«export *» منها يُنتج تحذير Turbopack
// «unexpected export *» في كل صفحة تستورد القاعدة. الأنواع (النماذج) تُصدَّر كلها كأنواع فقط (تُحذف عند البناء).
// نوع enum جديد في schema.prisma يُضاف هنا.
export {
  Prisma,
  PrismaClient,
  Role,
  RateSource,
  WalletAdjustmentKind,
  ProductType,
  StockUnit,
  SupplierEntryKind,
  ShipmentStatus,
  ShipmentCostKind,
  StockMovementKind,
  StockAdjustmentReason,
  StockAdjustmentStatus,
  StockCountScope,
  StockCountStatus,
  StockCountLineStatus,
  PriceChangeReason,
  PaymentMethod,
  ReturnReason,
  OrderStatus,
  OrderChannel,
  Fulfillment,
  DeliveryCity,
  OrderPaymentMethod,
  OrderMessageChannel,
  GiftPhotoDecision,
  BannerLink,
  NotificationType,
  NotificationPriority,
} from "@prisma/client";
export type * from "@prisma/client";
