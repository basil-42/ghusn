import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** رؤوس حماية ثابتة لكل الردود (D-110). سياسة المحتوى وHSTS تُضاف للصفحات في proxy.ts. */
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  transpilePackages: ["@ghusn/db", "@ghusn/core"],
  serverExternalPackages: ["@prisma/client", "sharp", "pg-boss"],
  experimental: {
    // صورة واحدة لكل طلب (تُصغَّر في المتصفح أولاً)؛ الحد الأعلى 10MB + هامش multipart
    serverActions: { bodySizeLimit: "11mb" },
    proxyClientMaxBodySize: "11mb",
    // قالبان للجذر (التشغيل والمتجر) — صفحة 404 عامة للروابط غير الموجودة
    globalNotFound: true,
  },
};

export default withNextIntl(nextConfig);
