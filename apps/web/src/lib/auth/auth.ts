import { prisma } from "@ghusn/db";
import { normalizePhone } from "@ghusn/core";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { admin, phoneNumber } from "better-auth/plugins";
import { ac, roles } from "./permissions";

const DAY = 60 * 60 * 24;

/**
 * إعداد تسجيل الدخول: رقم الهاتف + كلمة سر للموظفات (لا تسجيل ذاتي — المالك ينشئ الحسابات).
 * العملاء لاحقاً بـ OTP عبر واتساب (المرحلة 2).
 */
export const auth = betterAuth({
  appName: "Ghusn",
  baseURL: process.env.BETTER_AUTH_URL ?? process.env.APP_URL,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  // المعرّفات cuid() من قاعدة البيانات (D-61)
  advanced: { database: { generateId: false } },
  // الدخول بالبريد معطّل؛ الهاتف هو اسم الدخول الوحيد
  emailAndPassword: { enabled: false },
  session: {
    expiresIn: 7 * DAY,
    updateAge: DAY,
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    // حماية من تخمين كلمات السر: 5 محاولات دخول في الدقيقة لكل عنوان
    customRules: { "/sign-in/phone-number": { window: 60, max: 5 } },
  },
  plugins: [
    phoneNumber({
      // يُقبل الرقم فقط بصيغته الموحدة؛ التوحيد يحدث قبل الإرسال (normalizePhone)
      phoneNumberValidator: (value) => normalizePhone(value) === value,
      sendOTP: () => {
        // لا رسائل OTP للموظفات؛ تُفعَّل مع واتساب للعملاء في المرحلة 2
        throw new Error("OTP is not enabled");
      },
    }),
    admin({
      ac,
      roles,
      defaultRole: "STAFF",
      adminRoles: ["OWNER"],
      bannedUserMessage: "هذا الحساب موقوف. تواصلي مع المالك.",
    }),
    // يجب أن تكون الأخيرة: تكتب الكوكيز من Server Actions
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
