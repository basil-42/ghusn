import { getSessionCookie } from "better-auth/cookies";
import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";
import { pageSecurityHeaders } from "./lib/security-headers";

const intl = createMiddleware(routing);

/** مسارات التشغيل (عربية دائماً، لا تمر بتوجيه اللغات). */
const PROTECTED = ["/admin", "/print", "/pos"];
const OPS = [...PROTECTED, "/login"];
const under = (pathname: string, base: string) => pathname === base || pathname.startsWith(`${base}/`);

/**
 * - الإدارة ونقطة البيع والطباعة: فحص متفائل — من لا يملك كوكي جلسة يُحوَّل لصفحة الدخول. ليس خط
 *   الدفاع الوحيد؛ الصفحات تتحقق من الجلسة فعلياً عبر lib/auth/session.ts.
 * - المتجر: توجيه اللغات (next-intl) — العربية بلا بادئة، والإنجليزية تحت /en.
 * - كل الصفحات: رؤوس الحماية (D-110).
 */
export default function proxy(request: NextRequest) {
  return withSecurityHeaders(route(request));
}

function route(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  if (PROTECTED.some((base) => under(pathname, base))) {
    if (!getSessionCookie(request)) return NextResponse.redirect(new URL("/login", request.url));
    return NextResponse.next();
  }
  if (OPS.some((base) => under(pathname, base))) return NextResponse.next();
  return intl(request);
}

/** سياسة المحتوى وHSTS لكل صفحة (D-110) — تُحسب من البيئة عند التشغيل. */
function withSecurityHeaders(res: NextResponse): NextResponse {
  for (const [name, value] of pageSecurityHeaders()) res.headers.set(name, value);
  return res;
}

export const config = {
  // كل شيء عدا الـ API والملفات الثابتة والوسائط وملفات لها امتداد (sw.js، الصور…)
  matcher: ["/((?!api|_next|_vercel|media|brand|.*\\..*).*)"],
};
