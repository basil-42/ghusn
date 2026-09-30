import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
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
