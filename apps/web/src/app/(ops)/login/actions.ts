"use server";

import { normalizePhone } from "@ghusn/core";
import { APIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { recordLogin } from "@/lib/audit";
import { auth } from "@/lib/auth/auth";
import { SlidingWindowLimiter, clientIp } from "@/lib/rate-limit";

// حماية من تخمين كلمات السر: 5 محاولات في الدقيقة لكل عنوان، و10 محاولات فاشلة في 15 دقيقة لكل رقم
const perIp = new SlidingWindowLimiter(5, 60_000);
const perPhone = new SlidingWindowLimiter(10, 15 * 60_000);
const TOO_MANY = "محاولات كثيرة. انتظري قليلاً ثم حاولي مرة أخرى.";

export type LoginState = { error?: string; phone?: string };

const schema = z.object({
  phone: z.string().trim().min(1, "اكتبي رقم الهاتف"),
  password: z.string().min(1, "اكتبي كلمة السر"),
});

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const requestHeaders = await headers();
  const ip = clientIp(requestHeaders);
  if (perIp.isLimited(ip)) return { error: TOO_MANY, phone: String(formData.get("phone") ?? "") };
  perIp.hit(ip);

  const parsed = schema.safeParse(Object.fromEntries(formData));
  const phoneInput = String(formData.get("phone") ?? "");
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message, phone: phoneInput };
  }

  const phoneNumber = normalizePhone(parsed.data.phone);
  if (!phoneNumber) {
    return { error: "رقم الهاتف غير صحيح. مثال: 0912345678", phone: phoneInput };
  }

  if (perPhone.isLimited(phoneNumber)) return { error: TOO_MANY, phone: phoneInput };

  try {
    await auth.api.signInPhoneNumber({
      body: { phoneNumber, password: parsed.data.password, rememberMe: true },
      headers: requestHeaders,
    });
    perPhone.reset(phoneNumber);
    await recordLogin(phoneNumber, true);
  } catch (error) {
    if (error instanceof APIError) {
      perPhone.hit(phoneNumber);
      await recordLogin(
        phoneNumber,
        false,
        error.status === "FORBIDDEN"
          ? "حساب موقوف"
          : error.status === "TOO_MANY_REQUESTS"
            ? "محاولات كثيرة"
            : "كلمة سر خاطئة",
      );
      if (error.status === "TOO_MANY_REQUESTS") return { error: TOO_MANY, phone: phoneInput };
      if (error.status === "FORBIDDEN") {
        return { error: "هذا الحساب موقوف. تواصلي مع المالك.", phone: phoneInput };
      }
      // رسالة واحدة لرقم غير موجود أو كلمة سر خاطئة — لا نكشف أيهما
      return { error: "رقم الهاتف أو كلمة السر غير صحيحة.", phone: phoneInput };
    }
    throw error;
  }

  redirect("/admin");
}

export async function logout() {
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}
