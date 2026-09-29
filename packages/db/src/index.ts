import { PrismaClient } from "@prisma/client";

// نسخة واحدة من الاتصال بقاعدة البيانات أثناء التطوير
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export * from "@prisma/client";
