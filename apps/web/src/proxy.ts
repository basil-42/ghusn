import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * فحص متفائل: من لا يملك كوكي جلسة يُحوَّل لصفحة الدخول قبل تحميل لوحة الإدارة.
 * ليس خط الدفاع الوحيد — الصفحات تتحقق من الجلسة فعلياً عبر lib/auth/session.ts.
 */
export default function proxy(request: NextRequest) {
  if (!getSessionCookie(request)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
