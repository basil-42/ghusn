import { getSessionCookie } from "better-auth/cookies";
import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";

const intl = createMiddleware(routing);

/** مسارات التشغيل (عربية دائماً، لا تمر بتوجيه اللغات). */
const PROTECTED = ["/admin", "/print", "/pos"];
const OPS = [...PROTECTED, "/login"];
const under = (pathname: string, base: string) => pathname === base || pathname.startsWith(`${base}/`);

/**
 * - الإدارة ونقطة البيع والطباعة: فحص متفائل — من لا يملك كوكي جلسة يُحوَّل لصفحة الدخول. ليس خط
 *   الدفاع الوحيد؛ الصفحات تتحقق من الجلسة فعلياً عبر lib/auth/session.ts.
 * - المتجر: توجيه اللغات (next-intl) — العربية بلا بادئة، والإنجليزية تحت /en.
 */
export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PROTECTED.some((base) => under(pathname, base))) {
    if (!getSessionCookie(request)) return NextResponse.redirect(new URL("/login", request.url));
    return NextResponse.next();
  }
  if (OPS.some((base) => under(pathname, base))) return NextResponse.next();
  return intl(request);
}

export const config = {
  // كل شيء عدا الـ API والملفات الثابتة والوسائط وملفات لها امتداد (sw.js، الصور…)
  matcher: ["/((?!api|_next|_vercel|media|brand|.*\\..*).*)"],
};
